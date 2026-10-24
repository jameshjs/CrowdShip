import { claimJob, completeJob, failJob, PermanentJobError, type Job } from "@crowdship/db";
import type { QueueName } from "@crowdship/shared";
import { handleCodingAgent, onCodingAgentDead } from "./handlers/coding-agent";
import { handleMonitor } from "./handlers/monitor";
import { handleRoundTimer } from "./handlers/round-timer";
import { handleTriage } from "./handlers/triage";
import { handleVerification } from "./handlers/verification";
import { log } from "./log";
import type { Deps } from "./providers";

type Outcome = "done" | "rescheduled" | "retry" | void;

export async function dispatch(job: Job, deps: Deps): Promise<Outcome> {
  switch (job.queue) {
    case "feedback-triage":
      return handleTriage(job as Job<{ roomId: string; manual?: boolean }>);
    case "round-timer":
      return handleRoundTimer(job as Job<{ roomId: string; roundId: string }>);
    case "coding-agent":
      return handleCodingAgent(job as Job<{ agentSessionId: string }>, deps);
    case "session-monitor":
      return handleMonitor(job as Job<{ agentSessionId: string }>, deps);
    case "verification":
      return handleVerification(job as Job<{ agentSessionId: string; sha: string; oneShot?: boolean }>, deps);
  }
}

/** Claim and run one job. Returns false if no job was available. */
export async function runOnce(queues: readonly QueueName[], workerId: string, deps: Deps): Promise<boolean> {
  const job = await claimJob(queues, workerId);
  if (!job) return false;
  const started = performance.now();
  try {
    const outcome = await dispatch(job, deps);
    // "rescheduled" handlers already put the job back in the queue.
    if (outcome !== "rescheduled") await completeJob(job.id);
    log("debug", "job ok", { queue: job.queue, id: job.id, outcome: outcome ?? "done", ms: Math.round(performance.now() - started) });
  } catch (err) {
    const result = await failJob(job, err);
    log(result === "dead" ? "error" : "warn", "job failed", {
      queue: job.queue, id: job.id, attempt: job.attempts, result, err: (err as Error).message, permanent: err instanceof PermanentJobError,
    });
    if (result === "dead" && job.queue === "coding-agent") {
      await onCodingAgentDead({ ...job, last_error: (err as Error).message } as Job<{ agentSessionId: string }>).catch((e) =>
        log("error", "dead-letter hook failed", { err: String(e) }),
      );
    }
  }
  return true;
}

/** Run until there is no ready work (used by tests and the demo script). */
export async function drain(queues: readonly QueueName[], deps: Deps, max = 200): Promise<number> {
  let n = 0;
  while (n < max && (await runOnce(queues, "drain", deps))) n++;
  return n;
}
