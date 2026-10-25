import { createHash } from "node:crypto";
import {
  activity, db, failAgentSession, getAgentSession, getRoomById, requireBuildRoom, recordMetric, recordPullRequest, rescheduleJob,
  stateChanged, updateAgentSession, type Job,
} from "@crowdship/db";
import { parsePullUrl } from "@crowdship/integrations";
import { log } from "../log";
import type { Deps } from "../providers";
import { branchFor } from "./coding-agent";

const POLL_MS = Number(process.env.AGENT_POLL_MS ?? 10_000);
const MOCK_POLL_MS = 2_000;
const MAX_SESSION_MS = 3 * 3600_000;
const NO_PR_AFTER_FINISH_MS = 5 * 60_000;

/** Poll the provider for status; discover and validate the PR; hand off to verification. */
export async function handleMonitor(job: Job<{ agentSessionId: string }>, deps: Deps): Promise<"done" | "rescheduled"> {
  const s = await getAgentSession(job.payload.agentSessionId);
  if (["failed", "cancelled"].includes(s.state)) return "done";
  const room = requireBuildRoom(await getRoomById(s.room_id));
  const poll = s.provider === "mock" ? MOCK_POLL_MS : POLL_MS;
  if (!s.provider_session_id) {
    // Launch is still being reconciled by the coding-agent queue.
    await rescheduleJob(job.id, poll);
    return "rescheduled";
  }

  const provider = deps.provider(s.provider, room.github_repository);
  const sess = await provider.getSession(s.provider_session_id);

  // One display string per poll; blocked sessions say so explicitly (no flip-flopping between wordings).
  const detail = sess.status === "blocked" ? `Waiting for input on ${s.provider} (${sess.detail})` : sess.detail;
  if (detail && detail !== s.status_detail) {
    await updateAgentSession(s.id, { status_detail: detail, provider_url: sess.url ?? s.provider_url });
    // Mock steps and coarse status changes go to the public feed; ACU ticks only refresh state.
    const coarse = (x: string | null) => (x ?? "").split(" · ")[0];
    if (coarse(detail) !== coarse(s.status_detail)) {
      await activity(db(), room, "agent_progress", { provider: s.provider, detail: coarse(detail), demoMode: sess.simulated });
    } else {
      await stateChanged(db(), room.code, "agent");
    }
  }

  if (sess.status === "failed") {
    await failAgentSession(room, s.id, `${s.provider} session ended with an error (${sess.detail ?? "no detail"})`);
    return "done";
  }

  // PR discovery: provider-reported URLs first, GitHub search as fallback.
  if (!s.pr_number) {
    let prNumber: number | null = null;
    let simulatedPr = false;
    for (const url of sess.pullRequestUrls) {
      if (url.startsWith("mock://")) {
        simulatedPr = true;
        break;
      }
      const n = parsePullUrl(url, room.github_repository);
      if (n) {
        prNumber = n;
        break;
      }
      log("warn", "ignoring PR outside the approved repository", { url, repo: room.github_repository });
    }
    const gh = deps.github();
    if (!prNumber && !simulatedPr && gh && s.provider !== "mock") {
      const found = await gh.findPull(room.github_repository, { branch: branchFor(s), tag: s.idempotency_tag, issueNumber: s.github_issue_number });
      if (found) prNumber = found.number;
    }
    if (simulatedPr) {
      const fakeSha = createHash("sha1").update(s.id).digest("hex");
      await recordPullRequest(room, s.id, { number: 0, url: null, headSha: fakeSha, simulated: true });
      void recordMetric("time_to_pr", { ms: Date.now() - (s.launched_at?.getTime() ?? Date.now()) }, { provider: s.provider, simulated: true }, room.id);
    } else if (prNumber) {
      if (!gh) throw new Error("GITHUB_TOKEN is required to verify the PR");
      const pr = await gh.getPull(room.github_repository, prNumber);
      if (pr.repoFullName.toLowerCase() !== room.github_repository.toLowerCase()) {
        log("warn", "PR base repo mismatch", { pr: pr.url });
      } else {
        await recordPullRequest(room, s.id, { number: pr.number, url: pr.url, headSha: pr.headSha });
        void recordMetric("time_to_pr", { ms: Date.now() - (s.launched_at?.getTime() ?? Date.now()) }, { provider: s.provider }, room.id);
      }
    }
  }

  const fresh = await getAgentSession(s.id);
  if (sess.status === "finished") {
    if (fresh.pr_number != null) {
      if (fresh.state !== "finished") {
        await updateAgentSession(s.id, { state: "finished" });
        void recordMetric("agent_session_duration", { ms: Date.now() - (s.launched_at?.getTime() ?? Date.now()) }, { provider: s.provider }, room.id);
        await stateChanged(db(), room.code, "agent");
      }
      return "done";
    }
    if (Date.now() - s.updated_at.getTime() > NO_PR_AFTER_FINISH_MS) {
      await failAgentSession(room, s.id, "Agent finished without opening a pull request in the approved repository");
      return "done";
    }
  }
  if (s.launched_at && Date.now() - s.launched_at.getTime() > MAX_SESSION_MS && !fresh.pr_number) {
    await failAgentSession(room, s.id, "Agent session timed out without a pull request");
    return "done";
  }
  await rescheduleJob(job.id, poll);
  return "rescheduled";
}
