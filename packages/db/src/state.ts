import type { PublicActivity, PublicAgentSession, PublicProposal, PublicRoomState } from "@crowdship/shared";
import { db } from "./client";
import { latestVerification, previewReviewSummary, type AgentSessionRow } from "./agents";
import { getRoomByCode } from "./rooms";
import { currentRound, voteTallies } from "./rounds";
import { listProposals } from "./proposals";

export function toPublicAgent(s: AgentSessionRow, v: Awaited<ReturnType<typeof latestVerification>>): PublicAgentSession {
  return {
    id: s.id,
    proposalId: s.proposal_id,
    provider: s.provider,
    state: s.state,
    statusDetail: s.status_detail,
    error: s.error ? s.error.slice(0, 300) : null,
    providerUrl: s.provider_url,
    issueUrl: s.github_issue_url,
    prUrl: s.pr_url,
    prNumber: s.pr_number,
    headSha: s.pr_head_sha,
    previewUrl: s.preview_released ? s.preview_url : null,
    previewReleased: s.preview_released,
    launchedAt: s.launched_at?.toISOString() ?? null,
    prOpenedAt: s.pr_opened_at?.toISOString() ?? null,
    completedAt: s.completed_at?.toISOString() ?? null,
    verification: v
      ? {
          commitSha: v.commit_sha,
          ciStatus: v.ci_status,
          testStatus: v.test_status,
          checks: v.checks_json.map((c) => ({ name: c.name, status: c.status })),
          verifiedAt: v.verified_at?.toISOString() ?? null,
          simulated: v.simulated,
        }
      : null,
  };
}

/** Canonical, public-safe snapshot of a room. Clients reload this on connect/reconnect and on every broadcast hint. */
export async function getPublicRoomState(code: string): Promise<PublicRoomState> {
  const sql = db();
  const room = await getRoomByCode(code);
  const [round, proposals, stats, activity, history] = await Promise.all([
    currentRound(room.id),
    listProposals(room.id),
    sql<{ participants: number; feedback: number }[]>`
      select (select count(*)::int from participants where room_id = ${room.id}) as participants,
             (select count(*)::int from feedback where room_id = ${room.id} and moderation <> 'hidden') as feedback`,
    sql<{ id: string; event_type: string; public_payload: Record<string, unknown>; created_at: Date }[]>`
      select id, event_type, public_payload, created_at from activity_events
      where room_id = ${room.id} and not hidden order by created_at desc limit 40`,
    sql<{ number: number; title: string; status: PublicRoomState["history"][number]["status"]; pr_url: string | null }[]>`
      select r.number, p.title, r.status, (select s.pr_url from agent_sessions s where s.proposal_id = p.id order by s.created_at desc limit 1) as pr_url
      from voting_rounds r join proposals p on p.id = r.winning_proposal_id
      where r.room_id = ${room.id} order by r.number desc limit 20`,
  ]);

  const roundProposalIds = round
    ? (await sql<{ proposal_id: string }[]>`select proposal_id from round_proposals where round_id = ${round.id}`).map((r) => r.proposal_id)
    : [];
  const tallies = round && roundProposalIds.length ? await voteTallies(round.id) : [];
  const tallyMap = new Map(tallies.map((t) => [t.proposal_id, t.votes]));

  const publicProposals: PublicProposal[] = proposals
    .filter((p) => p.status !== "rejected" && p.status !== "suggested")
    .map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      requirements: p.requirements_json,
      acceptanceCriteria: p.acceptance_criteria_json,
      complexity: p.complexity,
      status: p.status,
      supporters: p.supporters,
      votes: tallyMap.get(p.id) ?? 0,
    }));

  let agent: PublicAgentSession | null = null;
  let reviews = { yes: 0, no: 0, needs_improvement: 0 };
  if (round?.winning_proposal_id) {
    const [s] = await sql<AgentSessionRow[]>`
      select * from agent_sessions where proposal_id = ${round.winning_proposal_id} order by created_at desc limit 1`;
    if (s) agent = toPublicAgent(s, await latestVerification(s.id, s.pr_head_sha));
    reviews = await previewReviewSummary(round.winning_proposal_id);
  }
  const credits = round?.winning_proposal_id ? await winnerCredits(round.winning_proposal_id) : null;

  return {
    room: {
      code: room.code,
      status: room.status,
      projectName: room.project_name,
      description: room.project_description,
      repository: room.github_repository,
      productionUrl: room.production_url,
      provider: room.agent_provider,
      demoMode: room.agent_provider === "mock",
    },
    stats: {
      participants: stats[0]!.participants,
      feedback: stats[0]!.feedback,
      proposals: proposals.filter((p) => !["rejected", "archived"].includes(p.status)).length,
    },
    round: round
      ? {
          id: round.id,
          number: round.number,
          status: round.status,
          startedAt: round.started_at?.toISOString() ?? null,
          endsAt: round.ends_at?.toISOString() ?? null,
          closedAt: round.closed_at?.toISOString() ?? null,
          winningProposalId: round.winning_proposal_id,
          proposalIds: roundProposalIds,
        }
      : null,
    proposals: publicProposals,
    agent,
    activity: activity.map<PublicActivity>((a) => ({
      id: a.id,
      type: a.event_type,
      payload: a.public_payload,
      createdAt: a.created_at.toISOString(),
    })),
    reviews,
    credits,
    history: history.map((h) => ({ roundNumber: h.number, title: h.title, status: h.status, prUrl: h.pr_url })),
    serverTime: new Date().toISOString(),
  };
}

/** Distinct participants whose visible feedback was merged into a proposal, earliest first. */
export async function winnerCredits(proposalId: string, limit = 8): Promise<{ names: string[]; total: number } | null> {
  const rows = await db()<{ participant_id: string; nickname: string }[]>`
    select pa.id as participant_id, pa.nickname, min(f.created_at) as first_at
    from proposal_feedback pf
    join feedback f on f.id = pf.feedback_id and f.moderation = 'visible'
    join participants pa on pa.id = f.participant_id
    where pf.proposal_id = ${proposalId}
    group by pa.id, pa.nickname
    order by first_at`;
  if (!rows.length) return null;
  return { names: rows.slice(0, limit).map((r) => r.nickname), total: rows.length };
}

/** Whether this participant has visible feedback merged into the proposal. */
export async function contributedTo(proposalId: string, participantId: string): Promise<boolean> {
  const [row] = await db()`
    select 1 from proposal_feedback pf join feedback f on f.id = pf.feedback_id
    where pf.proposal_id = ${proposalId} and f.participant_id = ${participantId} and f.moderation = 'visible' limit 1`;
  return Boolean(row);
}
