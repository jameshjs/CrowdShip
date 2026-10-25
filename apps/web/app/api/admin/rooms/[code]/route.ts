import {
  currentRound, db, latestAgentSessionForProposal, latestVerification, listDeadJobs, listFeedbackForAdmin,
  listPreviewReviews, listProposals, listQueues, voteTallies, toPublicAgent,
} from "@crowdship/db";
import { route } from "@/lib/api";
import { requireRoomOrganizer } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

export const dynamic = "force-dynamic";

/** Organizer-only room view: includes held feedback, suggested proposals, queue health and audit trail. */
export const GET = route<RoomCtx>(async (_req, ctx) => {
  const { room } = await requireRoomOrganizer(await roomCode(ctx));
  const round = await currentRound(room.id);
  const [feedback, proposals, queues, deadJobs, tallies, auditLog, sessions] = await Promise.all([
    listFeedbackForAdmin(room.id),
    listProposals(room.id),
    listQueues(),
    listDeadJobs(),
    round ? voteTallies(round.id) : Promise.resolve([]),
    db()`select actor, action, details, created_at from audit_log where room_id = ${room.id} order by created_at desc limit 30`,
    db()`select id, proposal_id, provider, state, error, created_at from agent_sessions where room_id = ${room.id} order by created_at desc limit 10`,
  ]);
  const winner = round?.winning_proposal_id ?? null;
  const agentRow = winner ? await latestAgentSessionForProposal(winner) : null;
  const agent = agentRow
    ? {
        ...toPublicAgent(agentRow, await latestVerification(agentRow.id, agentRow.pr_head_sha)),
        previewUrl: agentRow.preview_url,
        githubIssueNumber: agentRow.github_issue_number,
        providerSessionId: agentRow.provider_session_id,
      }
    : null;
  return {
    room: {
      code: room.code,
      projectName: room.project_name,
      repository: room.github_repository,
      mode: room.mode,
      productionUrl: room.production_url,
      provider: room.agent_provider,
      maxAcuPerSession: room.max_acu_per_session,
      maxSessionsTotal: room.max_sessions_total,
      agentPaused: room.agent_paused,
    },
    round,
    roundProposalIds: round
      ? (await db()<{ proposal_id: string }[]>`select proposal_id from round_proposals where round_id = ${round.id}`).map((r) => r.proposal_id)
      : [],
    tallies: Object.fromEntries(tallies.map((t) => [t.proposal_id, t.votes])),
    feedback,
    proposals,
    agent,
    sessions,
    reviews: winner ? await listPreviewReviews(winner) : [],
    queues,
    deadJobs: deadJobs.map((j) => ({ id: j.id, queue: j.queue, attempts: j.attempts, lastError: j.last_error, createdAt: j.created_at })),
    audit: auditLog,
  };
});
