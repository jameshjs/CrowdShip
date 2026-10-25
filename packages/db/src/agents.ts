import { isAllowedPreviewUrl, type AgentProviderName, type AgentState, type CheckStatus, type PreviewRating } from "@crowdship/shared";
import { db, type Sql } from "./client";
import { badRequest, conflict, notFound } from "./errors";
import { enqueue } from "./jobs";
import { activity, stateChanged } from "./realtime";
import { advanceRound, type RoundRow } from "./rounds";

export interface AgentSessionRow {
  id: string;
  proposal_id: string;
  round_id: string | null;
  room_id: string;
  provider: AgentProviderName;
  provider_session_id: string | null;
  provider_url: string | null;
  idempotency_tag: string;
  state: AgentState;
  status_detail: string | null;
  error: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_head_sha: string | null;
  preview_url: string | null;
  preview_released: boolean;
  task_prompt: string | null;
  launched_at: Date | null;
  pr_opened_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface VerificationRow {
  id: string;
  agent_session_id: string;
  commit_sha: string;
  test_status: CheckStatus;
  ci_status: CheckStatus;
  checks_json: { name: string; status: CheckStatus; url?: string }[];
  simulated: boolean;
  ci_dispatched_at: Date | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

type RoomRef = { id: string; code: string };
const ACTIVE_STATES: AgentState[] = ["queued", "launching", "running", "needs_reconcile"];

export async function getAgentSession(id: string, sql: Sql = db()): Promise<AgentSessionRow> {
  const [s] = await sql<AgentSessionRow[]>`select * from agent_sessions where id = ${id}`;
  if (!s) throw notFound("Agent session");
  return s;
}

export async function latestAgentSessionForProposal(proposalId: string): Promise<AgentSessionRow | null> {
  const [s] = await db()<AgentSessionRow[]>`
    select * from agent_sessions where proposal_id = ${proposalId} order by created_at desc limit 1`;
  return s ?? null;
}

/**
 * Organizer approves the selected winner for development. Creates exactly one
 * agent session (partial unique index) and one launch job (idempotency key).
 * Double-clicks and concurrent requests collapse to the same session.
 */
export async function approveForDevelopment(room: RoomRef & { agent_provider: AgentProviderName }, actor: string) {
  return db().begin(async (sql) => {
    const [round] = await sql<RoundRow[]>`
      select * from voting_rounds where room_id = ${room.id} and status not in ('completed','failed','cancelled') for update`;
    if (!round) throw notFound("Open round");
    if (!round.winning_proposal_id) throw conflict("no_winner", "This round has no winner yet");
    if (!["selected", "developing"].includes(round.status)) {
      throw conflict("bad_state", `Round is ${round.status}; only a selected round can start development`);
    }

    const [roomRow] = await sql<{ agent_paused: boolean; max_sessions_total: number }[]>`
      select agent_paused, max_sessions_total from rooms where id = ${room.id} for update`;
    if (roomRow!.agent_paused) throw conflict("paused", "Agent launches are paused for this room");

    const existing = await sql<AgentSessionRow[]>`
      select * from agent_sessions where proposal_id = ${round.winning_proposal_id} and state not in ('failed','cancelled')`;
    if (existing[0]) return { session: existing[0], created: false };

    const [activeElsewhere] = await sql`
      select 1 from agent_sessions where room_id = ${room.id} and state = any(${ACTIVE_STATES})`;
    if (activeElsewhere) throw conflict("agent_busy", "Another agent session is already active");

    const [usage] = await sql<{ used: number }[]>`
      select count(*)::int as used from agent_sessions where room_id = ${room.id} and provider <> 'mock'`;
    const used = usage!.used;
    if (room.agent_provider !== "mock" && used >= roomRow!.max_sessions_total) {
      throw conflict("budget", `Session budget reached (${roomRow!.max_sessions_total}); raise it in settings`);
    }

    const [session] = await sql<AgentSessionRow[]>`
      insert into agent_sessions (proposal_id, round_id, room_id, provider, idempotency_tag, state, status_detail)
      values (${round.winning_proposal_id}, ${round.id}, ${room.id}, ${room.agent_provider},
        ${"cs-" + crypto.randomUUID()}, 'queued', 'Waiting for worker')
      returning *`;
    await enqueue("coding-agent", { agentSessionId: session!.id }, {
      idempotencyKey: `launch:${session!.id}`,
      maxAttempts: 3,
      sql,
    });
    if (round.status === "selected") {
      await sql`update voting_rounds set status = 'developing' where id = ${round.id}`;
    }
    await sql`update proposals set status = 'developing', updated_at = now() where id = ${round.winning_proposal_id}`;
    const [p] = await sql<{ title: string }[]>`select title from proposals where id = ${round.winning_proposal_id}`;
    await activity(sql, room, "agent_queued", {
      title: p!.title,
      provider: room.agent_provider,
      demoMode: room.agent_provider === "mock",
      approvedBy: "organizer",
    });
    void actor;
    return { session: session!, created: true };
  });
}

export async function updateAgentSession(
  id: string,
  patch: Partial<Pick<AgentSessionRow,
    "state" | "status_detail" | "error" | "provider_session_id" | "provider_url" | "github_issue_number" |
    "github_issue_url" | "pr_number" | "pr_url" | "pr_head_sha" | "preview_url" | "task_prompt" |
    "launched_at" | "pr_opened_at" | "completed_at">>,
  sql: Sql = db(),
): Promise<AgentSessionRow> {
  const [s] = await sql<AgentSessionRow[]>`
    update agent_sessions set ${sql({ ...patch, updated_at: new Date() } as never)} where id = ${id} returning *`;
  if (!s) throw notFound("Agent session");
  return s;
}

/** Compare-and-set state transition; returns false if the session moved on already. */
export async function casAgentState(id: string, from: AgentState[], to: AgentState, patch: Parameters<typeof updateAgentSession>[1] = {}, sql: Sql = db()): Promise<boolean> {
  const rows = await sql`
    update agent_sessions set ${sql({ ...patch, state: to, updated_at: new Date() } as never)}
    where id = ${id} and state = any(${from}) returning id`;
  return rows.length > 0;
}

/** Mark an agent session failed. Never shown as completed; round stays developing so the organizer can retry. */
export async function failAgentSession(room: RoomRef, id: string, error: string): Promise<void> {
  await db().begin(async (sql) => {
    const s = await getAgentSession(id, sql);
    if (["failed", "cancelled"].includes(s.state)) return;
    await updateAgentSession(id, { state: "failed", error: error.slice(0, 1000), status_detail: "Failed" }, sql);
    await sql`update proposals set status = 'selected', updated_at = now() where id = ${s.proposal_id} and status = 'developing'`;
    await activity(sql, room, "agent_failed", { provider: s.provider, error: publicError(error) });
  });
}

/** Strip anything resembling a credential before it reaches the public feed. */
export function publicError(error: string): string {
  return error
    .replace(/(bearer\s+|token[=:]\s*|key[=:]\s*)\S+/gi, "$1[redacted]")
    .replace(/\b(gh[pousr]_|github_pat_|sk-|cog_|apk_)[A-Za-z0-9_\-]+/g, "[redacted]")
    .slice(0, 200);
}

export async function cancelAgentSession(room: RoomRef, id: string): Promise<void> {
  await db().begin(async (sql) => {
    const s = await getAgentSession(id, sql);
    if (s.room_id !== room.id) throw notFound("Agent session");
    if (["failed", "cancelled", "finished"].includes(s.state)) throw badRequest(`Session is already ${s.state}`);
    await updateAgentSession(id, { state: "cancelled", status_detail: "Cancelled by organizer" }, sql);
    await sql`update jobs set status = 'dead', last_error = 'cancelled' where status = 'queued' and payload ->> 'agentSessionId' = ${id}`;
    await sql`update proposals set status = 'selected', updated_at = now() where id = ${s.proposal_id} and status in ('developing','verifying')`;
    await activity(sql, room, "agent_cancelled", { provider: s.provider });
  });
}

/** Record that a PR was found and validated. Moves round to verifying and schedules verification. */
export async function recordPullRequest(
  room: RoomRef,
  sessionId: string,
  pr: { number: number; url: string | null; headSha: string; previewUrl?: string | null; simulated?: boolean },
): Promise<void> {
  await db().begin(async (sql) => {
    const s = await getAgentSession(sessionId, sql);
    if (s.pr_number === pr.number && s.pr_head_sha === pr.headSha) return;
    const first = s.pr_number == null;
    await updateAgentSession(sessionId, {
      state: ["failed", "cancelled"].includes(s.state) ? s.state : "pr_opened",
      pr_number: pr.number,
      pr_url: pr.url,
      pr_head_sha: pr.headSha,
      pr_opened_at: s.pr_opened_at ?? new Date(),
      preview_url: pr.previewUrl ?? s.preview_url,
      status_detail: "Draft PR opened",
    }, sql);
    await sql`
      insert into verification_results (agent_session_id, commit_sha, simulated) values (${sessionId}, ${pr.headSha}, ${pr.simulated ?? false})
      on conflict (agent_session_id, commit_sha) do nothing`;
    await sql`update proposals set status = 'verifying', updated_at = now() where id = ${s.proposal_id} and status in ('developing','review_ready','verifying')`;
    // A new head SHA always goes back to verifying: previous green checks do not carry over.
    await advanceRound(sql, room.id, "verifying", s.proposal_id);
    await enqueue("verification", { agentSessionId: sessionId, sha: pr.headSha }, {
      idempotencyKey: `verify:${sessionId}:${pr.headSha}`,
      maxAttempts: 200,
      sql,
    });
    await activity(sql, room, first ? "pr_opened" : "pr_updated", {
      prNumber: pr.number,
      prUrl: pr.url,
      sha: pr.headSha.slice(0, 7),
      provider: s.provider,
      simulated: pr.simulated ?? false,
    });
  });
}

/** Persist a verification snapshot for the PR's current head; advance to review_ready only when all required checks pass. */
export async function recordVerification(
  room: RoomRef,
  sessionId: string,
  sha: string,
  result: { ciStatus: CheckStatus; testStatus: CheckStatus; checks: { name: string; status: CheckStatus; url?: string }[] },
): Promise<{ final: boolean; stale: boolean }> {
  return db().begin(async (sql) => {
    const s = await getAgentSession(sessionId, sql);
    if (s.pr_head_sha !== sha) return { final: true, stale: true };
    const [prev] = await sql<VerificationRow[]>`
      select * from verification_results where agent_session_id = ${sessionId} and commit_sha = ${sha} for update`;
    const passed = result.ciStatus === "pass" && result.testStatus === "pass";
    const final = result.ciStatus !== "pending" && result.testStatus !== "pending";
    await sql`
      insert into verification_results (agent_session_id, commit_sha, ci_status, test_status, checks_json, verified_at)
      values (${sessionId}, ${sha}, ${result.ciStatus}, ${result.testStatus}, ${sql.json(result.checks as never)}, ${passed ? new Date() : null})
      on conflict (agent_session_id, commit_sha) do update set
        ci_status = excluded.ci_status, test_status = excluded.test_status,
        checks_json = excluded.checks_json, verified_at = excluded.verified_at, updated_at = now()`;
    const changed = !prev || prev.ci_status !== result.ciStatus || prev.test_status !== result.testStatus ||
      JSON.stringify(prev.checks_json) !== JSON.stringify(result.checks);
    if (passed) {
      await sql`update proposals set status = 'review_ready', updated_at = now() where id = ${s.proposal_id}`;
      await advanceRound(sql, room.id, "review_ready", s.proposal_id);
    }
    if (changed) {
      if (final) {
        await activity(sql, room, passed ? "verification_passed" : "verification_failed", {
          prNumber: s.pr_number,
          simulated: prev?.simulated ?? false,
          sha: sha.slice(0, 7),
          checks: result.checks.map((c) => ({ name: c.name, status: c.status })),
        });
      } else {
        await stateChanged(sql, room.code, "verification");
      }
    }
    return { final, stale: false };
  });
}

export async function latestVerification(sessionId: string, sha: string | null): Promise<VerificationRow | null> {
  if (!sha) return null;
  const [v] = await db()<VerificationRow[]>`
    select * from verification_results where agent_session_id = ${sessionId} and commit_sha = ${sha}`;
  return v ?? null;
}

export async function releasePreview(room: RoomRef, sessionId: string, previewUrl: string | null): Promise<void> {
  await db().begin(async (sql) => {
    const s = await getAgentSession(sessionId, sql);
    if (s.room_id !== room.id) throw notFound("Agent session");
    const [v] = await sql<VerificationRow[]>`
      select * from verification_results where agent_session_id = ${sessionId} and commit_sha = ${s.pr_head_sha}`;
    if (!v || v.ci_status !== "pass" || v.test_status !== "pass") {
      throw conflict("not_verified", "Preview can only be released after all required checks pass on the current commit");
    }
    const url = previewUrl ?? s.preview_url;
    if (!url) throw badRequest("No preview URL yet. Paste the preview deployment URL.");
    if (!isAllowedPreviewUrl(url)) throw badRequest("Preview URL must be https (or http://localhost for local testing)");
    await updateAgentSession(sessionId, { preview_url: url, status_detail: "Preview released to testers" }, sql);
    await sql`update agent_sessions set preview_released = true where id = ${sessionId}`;
    await activity(sql, room, "preview_released", { prNumber: s.pr_number });
  });
}

export async function submitPreviewReview(
  room: RoomRef,
  participantId: string,
  proposalId: string,
  rating: PreviewRating,
  comment: string,
): Promise<void> {
  await db().begin(async (sql) => {
    const [s] = await sql<AgentSessionRow[]>`
      select * from agent_sessions where proposal_id = ${proposalId} and room_id = ${room.id}
        and preview_released and state not in ('failed','cancelled')
      order by created_at desc limit 1`;
    if (!s) throw conflict("no_preview", "There's no preview to rate for this proposal yet");
    await sql`
      insert into preview_reviews (proposal_id, agent_session_id, participant_id, rating, comment)
      values (${proposalId}, ${s.id}, ${participantId}, ${rating}, ${comment})
      on conflict (proposal_id, participant_id) do update set rating = excluded.rating, comment = excluded.comment,
        agent_session_id = excluded.agent_session_id, created_at = now()`;
    await activity(sql, room, "preview_rated", { rating });
  });
}

export async function previewReviewSummary(proposalId: string) {
  const rows = await db()<{ rating: PreviewRating; n: number }[]>`
    select rating, count(*)::int as n from preview_reviews where proposal_id = ${proposalId} group by rating`;
  const out = { yes: 0, no: 0, needs_improvement: 0 };
  for (const r of rows) out[r.rating] = r.n;
  return out;
}

export async function listPreviewReviews(proposalId: string) {
  return db()<{ rating: PreviewRating; comment: string; nickname: string; created_at: Date }[]>`
    select r.rating, r.comment, p.nickname, r.created_at from preview_reviews r
    join participants p on p.id = r.participant_id where r.proposal_id = ${proposalId}
    order by r.created_at desc`;
}
