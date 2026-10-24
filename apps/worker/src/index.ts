import { hostname } from "node:os";
import { closeDb, db, flushOutbox, pruneRateLimits, recoverStaleJobs } from "@crowdship/db";
import { QUEUES, type QueueName } from "@crowdship/shared";
import { configuredTriageProvider } from "@crowdship/ai";
import { log } from "./log";
import { realDeps } from "./providers";
import { runOnce } from "./runner";

const workerId = `${hostname()}-${process.pid}`;
let stopping = false;
const inflight = new Set<Promise<unknown>>();

/** Bounded concurrency per queue group. Coding-agent launches are serialized. */
const LANES: { queues: QueueName[]; concurrency: number }[] = [
  { queues: ["coding-agent"], concurrency: 1 },
  { queues: ["round-timer", "session-monitor", "verification"], concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) },
  { queues: ["feedback-triage"], concurrency: 2 },
];

async function lane(queues: QueueName[], index: number) {
  let idle = 250;
  while (!stopping) {
    try {
      const p = runOnce(queues, `${workerId}#${queues[0]}-${index}`, realDeps);
      inflight.add(p);
      const worked = await p.finally(() => inflight.delete(p));
      idle = worked ? 0 : Math.min(idle * 2 || 250, 1000);
    } catch (err) {
      log("error", "lane error", { err: String(err) });
      idle = 2000;
    }
    if (idle) await new Promise((r) => setTimeout(r, idle));
  }
}

async function main() {
  log("info", "worker starting", { workerId, queues: QUEUES, triage: configuredTriageProvider(), defaultProvider: process.env.CODING_AGENT_PROVIDER ?? "mock" });
  const recovered = await recoverStaleJobs(120);
  if (recovered) log("warn", "recovered stale jobs after restart", { recovered });
  const housekeeping = setInterval(async () => {
    try {
      const n = await recoverStaleJobs(120);
      if (n) log("warn", "recovered stale jobs", { n });
      await pruneRateLimits();
    } catch (err) {
      log("error", "housekeeping failed", { err: String(err) });
    }
  }, 30_000);

  // Realtime flusher: coalesced broadcast hints, ~3/s per room per event type at most.
  const FLUSH_MS = Number(process.env.REALTIME_FLUSH_MS ?? 300);
  const flusher = (async () => {
    while (!stopping) {
      try {
        await flushOutbox(db());
      } catch (err) {
        log("error", "realtime flush failed", { err: String(err) });
      }
      await new Promise((r) => setTimeout(r, FLUSH_MS));
    }
  })();

  const lanes = LANES.flatMap((l) => Array.from({ length: l.concurrency }, (_, i) => lane(l.queues, i)));

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("info", "worker stopping", { signal, inflight: inflight.size });
    clearInterval(housekeeping);
    await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, 15_000))]);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  await Promise.all([...lanes, flusher]);
}

main().catch((err) => {
  log("error", "worker crashed", { err: String(err), stack: (err as Error).stack });
  process.exit(1);
});
