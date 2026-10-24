import {
  activity, casAgentState, db, enqueue, failAgentSession, getAgentSession, getProposal, getRoomById, PermanentJobError,
  recordMetric, updateAgentSession, type AgentSessionRow, type Job, type RoomRow,
} from "@crowdship/db";
import { buildTaskPrompt, DefiniteFailure, ProviderConfigError, UncertainOutcome, type AgentSession, type CodingTask } from "@crowdship/integrations";
import { log } from "../log";
import type { Deps } from "../providers";

/** How long to wait after an uncertain create before concluding (via reconciliation) that nothing started. */
const RECONCILE_GRACE_MS = 90_000;

export function branchFor(s: AgentSessionRow): string {
  return `crowdship/${s.idempotency_tag}`;
}

async function buildTask(room: RoomRow, s: AgentSessionRow): Promise<CodingTask> {
  const p = await getProposal(room.id, s.proposal_id);
  const prompt =
    s.task_prompt ??
    buildTaskPrompt({
      repository: room.github_repository,
      issueNumber: s.github_issue_number,
      title: p.title,
      description: p.description,
      requirements: p.requirements_json,
      acceptanceCriteria: p.acceptance_criteria_json,
      branch: branchFor(s),
      tag: s.idempotency_tag,
    });
  return {
    agentSessionId: s.id,
    idempotencyTag: s.idempotency_tag,
    repository: room.github_repository,
    issueNumber: s.github_issue_number,
    issueUrl: s.github_issue_url,
    title: p.title,
    prompt,
    maxAcu: room.max_acu_per_session,
    branch: branchFor(s),
  };
}

/** Create the GitHub issue once. Real providers require GitHub; mock rooms skip it. */
async function ensureIssue(deps: Deps, room: RoomRow, s: AgentSessionRow): Promise<AgentSessionRow> {
  if (s.github_issue_number || s.provider === "mock") return s;
  const gh = deps.github();
  if (!gh) throw new ProviderConfigError("GITHUB_TOKEN is not set; cannot create the GitHub issue for a real agent run");
  const p = await getProposal(room.id, s.proposal_id);
  const body = [
    p.description,
    "",
    "### Requirements",
    ...p.requirements_json.map((r) => `- ${r}`),
    "",
    "### Acceptance criteria",
    ...p.acceptance_criteria_json.map((r) => `- [ ] ${r}`),
    "",
    `_Chosen by audience vote in CrowdShip room ${room.code} and approved by the organizer._`,
    `CrowdShip: ${s.idempotency_tag}`,
  ].join("\n");
  // Idempotency: if a previous attempt created the issue but crashed before saving, find it by tag.
  const existing = await gh.octokit.search
    .issuesAndPullRequests({ q: `repo:${room.github_repository} is:issue "${s.idempotency_tag}" in:body` })
    .then((r) => r.data.items[0])
    .catch(() => undefined);
  const issue = existing ? { number: existing.number, url: existing.html_url } : await gh.createIssue(room.github_repository, p.title, body);
  const updated = await updateAgentSession(s.id, { github_issue_number: issue.number, github_issue_url: issue.url });
  await activity(db(), room, "issue_created", { issueNumber: issue.number });
  return updated;
}

async function markLaunched(room: RoomRow, s: AgentSessionRow, sess: AgentSession) {
  await updateAgentSession(s.id, {
    state: "running",
    provider_session_id: sess.providerSessionId,
    provider_url: sess.url,
    status_detail: sess.detail,
    launched_at: s.launched_at ?? new Date(),
    error: null,
  });
  await activity(db(), room, "agent_launched", { provider: s.provider, demoMode: sess.simulated });
  await enqueue("session-monitor", { agentSessionId: s.id }, { idempotencyKey: `monitor:${s.id}`, maxAttempts: 10_000 });
  void recordMetric("agent_launch", { num: 1 }, { provider: s.provider }, room.id);
}

/**
 * Launch a coding agent session for an approved proposal. Idempotent:
 * - queued -> launching (CAS) -> running
 * - an uncertain create leaves the session in needs_reconcile; the next attempt
 *   looks the session up by tag before ever calling create again.
 */
export async function handleCodingAgent(job: Job<{ agentSessionId: string }>, deps: Deps): Promise<"done" | "retry"> {
  let s = await getAgentSession(job.payload.agentSessionId);
  const room = await getRoomById(s.room_id);
  if (!["queued", "launching", "needs_reconcile"].includes(s.state)) return "done";
  if (room.agent_paused) throw new Error("Agent launches are paused for this room");

  let provider;
  try {
    provider = deps.provider(s.provider, room.github_repository);
  } catch (err) {
    await failAgentSession(room, s.id, (err as Error).message);
    throw new PermanentJobError((err as Error).message);
  }

  // Reconcile any previous attempt whose outcome we don't know.
  if (s.state === "launching" || s.state === "needs_reconcile") {
    const task = await buildTask(room, s);
    const found = await provider.findSessionByTag(s.idempotency_tag, task).catch((e: Error) => {
      log("warn", "reconcile lookup failed", { err: e.message, id: s.id });
      return undefined;
    });
    if (found) {
      log("info", "reconciled existing provider session", { id: s.id, providerSessionId: found.providerSessionId });
      await markLaunched(room, s, found);
      return "done";
    }
    const since = Date.now() - s.updated_at.getTime();
    if (found === undefined || since < RECONCILE_GRACE_MS) {
      await updateAgentSession(s.id, { state: "needs_reconcile", status_detail: "Checking whether the previous launch started" });
      throw new Error("Launch outcome uncertain; reconciling before any retry");
    }
    // Reconciliation found nothing after the grace period: safe to create.
    await casAgentState(s.id, ["launching", "needs_reconcile"], "queued", { status_detail: "Retrying launch" });
    s = await getAgentSession(s.id);
  }

  try {
    s = await ensureIssue(deps, room, s);
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      await failAgentSession(room, s.id, err.message);
      throw new PermanentJobError(err.message);
    }
    throw err;
  }

  const task = await buildTask(room, s);
  if (!s.task_prompt) await updateAgentSession(s.id, { task_prompt: task.prompt });
  if (!(await casAgentState(s.id, ["queued"], "launching", { status_detail: `Starting ${s.provider} session` }))) return "done";

  try {
    const sess = await provider.createSession(task);
    await markLaunched(room, s, sess);
    return "done";
  } catch (err) {
    const msg = (err as Error).message;
    if (err instanceof ProviderConfigError) {
      await failAgentSession(room, s.id, msg);
      throw new PermanentJobError(msg);
    }
    if (err instanceof DefiniteFailure) {
      await casAgentState(s.id, ["launching"], "queued", { status_detail: `Launch rejected, will retry: ${msg.slice(0, 120)}` });
      throw err;
    }
    // UncertainOutcome or unknown error: do NOT blindly retry create.
    await casAgentState(s.id, ["launching"], "needs_reconcile", { status_detail: "Launch outcome uncertain; reconciling" });
    throw err instanceof UncertainOutcome ? err : new UncertainOutcome(msg);
  }
}

/** Called when a coding-agent job exhausts retries: surface an accurate failure. */
export async function onCodingAgentDead(job: Job<{ agentSessionId: string }>) {
  const s = await getAgentSession(job.payload.agentSessionId);
  if (["failed", "cancelled", "running", "pr_opened", "finished"].includes(s.state)) return;
  const room = await getRoomById(s.room_id);
  await failAgentSession(room, s.id, `Launch failed after ${job.attempts} attempts: ${job.last_error ?? "unknown error"}`);
}
