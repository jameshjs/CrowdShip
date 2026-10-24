import { getAgentSession, getRoomById, latestVerification, recordMetric, recordPullRequest, recordVerification, rescheduleJob, updateAgentSession, db, type Job } from "@crowdship/db";
import { REQUIRED_CHECKS, type CheckStatus } from "@crowdship/shared";
import { log } from "../log";
import type { Deps } from "../providers";

const POLL_MS = Number(process.env.VERIFY_POLL_MS ?? 15_000);
const DISPATCH_CI_AFTER_MS = 60_000;
const PENDING_TIMEOUT_MS = 20 * 60_000;
const CI_WORKFLOW = process.env.CI_WORKFLOW ?? "ci.yml";

/** Simulated checks for mock rooms without a real PR: typecheck at 3s, unit at 6s, e2e at 9s. */
function simulatedChecks(elapsedMs: number) {
  const at = { typecheck: 3000, unit: 6000, e2e: 9000 } as Record<string, number>;
  const checks = REQUIRED_CHECKS.map((name) => ({ name, status: (elapsedMs >= at[name]! ? "pass" : "pending") as CheckStatus }));
  const all = (names: string[]) => (names.every((n) => checks.find((c) => c.name === n)!.status === "pass") ? "pass" : "pending") as CheckStatus;
  return { ciStatus: all(["typecheck"]), testStatus: all(["unit", "e2e"]), checks };
}

/**
 * Independent verification of the PR's current head SHA. A change is only
 * marked verified when every required check passed on that exact commit.
 */
export async function handleVerification(job: Job<{ agentSessionId: string; sha: string; oneShot?: boolean }>, deps: Deps): Promise<"done" | "rescheduled"> {
  // Webhook nudges are one-shot; the primary per-SHA job owns the polling loop.
  const again = async (ms: number): Promise<"done" | "rescheduled"> => {
    if (job.payload.oneShot) return "done";
    await rescheduleJob(job.id, ms);
    return "rescheduled";
  };
  const s = await getAgentSession(job.payload.agentSessionId);
  if (s.pr_head_sha !== job.payload.sha || ["failed", "cancelled"].includes(s.state)) return "done";
  const room = await getRoomById(s.room_id);
  const v = await latestVerification(s.id, job.payload.sha);
  const started = v?.created_at.getTime() ?? Date.now();

  if (v?.simulated) {
    const result = simulatedChecks(Date.now() - started);
    const { final } = await recordVerification(room, s.id, job.payload.sha, result);
    if (final) {
      void recordMetric("verification_duration", { ms: Date.now() - started }, { result: "pass", simulated: true }, room.id);
      return "done";
    }
    return again(1000);
  }

  const gh = deps.github();
  if (!gh || !s.pr_number) {
    await recordVerification(room, s.id, job.payload.sha, {
      ciStatus: "unavailable", testStatus: "unavailable",
      checks: REQUIRED_CHECKS.map((name) => ({ name, status: "unavailable" as const })),
    });
    return "done";
  }

  // Track the current head: a new push restarts verification on the new SHA.
  const pr = await gh.getPull(room.github_repository, s.pr_number);
  if (pr.headSha !== job.payload.sha) {
    await recordPullRequest(room, s.id, { number: pr.number, url: pr.url, headSha: pr.headSha });
    return "done";
  }

  let summary = await gh.getChecks(room.github_repository, pr.headSha);

  // PRs opened with the Actions GITHUB_TOKEN don't trigger pull_request workflows; run CI explicitly.
  if (!summary.anyFound && !v?.ci_dispatched_at && Date.now() - started > DISPATCH_CI_AFTER_MS) {
    try {
      await gh.dispatchWorkflow(room.github_repository, CI_WORKFLOW, pr.headRef);
      await db()`update verification_results set ci_dispatched_at = now() where agent_session_id = ${s.id} and commit_sha = ${pr.headSha}`;
      log("info", "dispatched CI for PR head", { pr: pr.number, ref: pr.headRef });
    } catch (err) {
      log("warn", "CI dispatch failed", { err: (err as Error).message });
    }
  }

  if (!s.preview_url) {
    const preview = await gh.previewUrl(room.github_repository, pr.headSha).catch(() => null);
    if (preview) await updateAgentSession(s.id, { preview_url: preview });
  }

  const timedOut = Date.now() - started > PENDING_TIMEOUT_MS;
  if (timedOut) {
    // Required checks that never reported are "unavailable", which is never treated as passing.
    const checks = summary.checks.map((c) => ({ ...c, status: (c.status === "pending" ? "unavailable" : c.status) as CheckStatus }));
    const fix = (x: CheckStatus): CheckStatus => (x === "pending" ? "unavailable" : x);
    summary = { ...summary, checks, ciStatus: fix(summary.ciStatus), testStatus: fix(summary.testStatus) };
  }

  const { final, stale } = await recordVerification(room, s.id, pr.headSha, summary);
  if (stale) return "done";
  if (final) {
    const passed = summary.ciStatus === "pass" && summary.testStatus === "pass";
    void recordMetric("verification_duration", { ms: Date.now() - started }, { result: passed ? "pass" : "fail" }, room.id);
    void recordMetric("change_verified", { num: passed ? 1 : 0 }, { provider: s.provider }, room.id);
    // Keep watching for new pushes while the agent session is still alive.
    if (["running", "pr_opened"].includes(s.state)) {
      return again(POLL_MS * 2);
    }
    return "done";
  }
  return again(POLL_MS);
}
