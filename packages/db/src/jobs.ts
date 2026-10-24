import type { QueueName } from "@crowdship/shared";
import { db, type Sql } from "./client";

export interface Job<P = Record<string, unknown>> {
  id: string;
  queue: QueueName;
  payload: P;
  status: "queued" | "running" | "succeeded" | "failed" | "dead";
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  last_error: string | null;
  run_at: Date;
  created_at: Date;
}

/** Thrown by handlers for failures that must not be retried. */
export class PermanentJobError extends Error {}

/** Enqueue a job. With an idempotency key, duplicates are silently dropped. Returns the job id, or null if deduplicated. */
export async function enqueue(
  queue: QueueName,
  payload: Record<string, unknown>,
  opts: { idempotencyKey?: string; runAt?: Date; maxAttempts?: number; sql?: Sql } = {},
): Promise<string | null> {
  const sql = opts.sql ?? db();
  const rows = await sql<{ id: string }[]>`
    insert into jobs (queue, payload, idempotency_key, run_at, max_attempts)
    values (${queue}, ${sql.json(payload as never)}, ${opts.idempotencyKey ?? null}, ${opts.runAt ?? new Date()}, ${opts.maxAttempts ?? 5})
    on conflict (idempotency_key) do nothing
    returning id`;
  return rows[0]?.id ?? null;
}

/** Atomically claim the next ready job from the given queues (skipping paused queues). */
export async function claimJob(queues: readonly QueueName[], workerId: string): Promise<Job | null> {
  const sql = db();
  const rows = await sql<Job[]>`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId},
      attempts = attempts + 1, updated_at = now()
    where id = (
      select j.id from jobs j
      where j.status = 'queued' and j.run_at <= now()
        and j.queue = any(${queues as string[]})
        and not exists (select 1 from worker_controls c where c.queue = j.queue and c.paused)
      order by j.run_at
      for update skip locked
      limit 1
    )
    returning *`;
  return rows[0] ?? null;
}

export async function completeJob(id: string): Promise<void> {
  await db()`update jobs set status = 'succeeded', locked_at = null, updated_at = now() where id = ${id}`;
}

/** Exponential backoff: 5s, 10s, 20s ... capped at 5 minutes. */
export function backoffMs(attempts: number): number {
  return Math.min(5000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);
}

export async function failJob(job: Job, err: unknown): Promise<"retry" | "dead"> {
  const message = err instanceof Error ? err.message : String(err);
  const permanent = err instanceof PermanentJobError;
  const dead = permanent || job.attempts >= job.max_attempts;
  await db()`
    update jobs set
      status = ${dead ? "dead" : "queued"},
      last_error = ${message.slice(0, 2000)},
      run_at = ${dead ? new Date() : new Date(Date.now() + backoffMs(job.attempts))},
      locked_at = null, locked_by = null, updated_at = now()
    where id = ${job.id}`;
  return dead ? "dead" : "retry";
}

/** Reschedule a polling job without counting it as a failure. */
export async function rescheduleJob(id: string, delayMs: number): Promise<void> {
  await db()`
    update jobs set status = 'queued', run_at = ${new Date(Date.now() + delayMs)},
      attempts = greatest(attempts - 1, 0), locked_at = null, locked_by = null, updated_at = now()
    where id = ${id}`;
}

/** Return jobs stuck in 'running' (worker crashed) to the queue. */
export async function recoverStaleJobs(olderThanSeconds = 120): Promise<number> {
  const rows = await db()`
    update jobs set status = 'queued', locked_at = null, locked_by = null, updated_at = now()
    where status = 'running' and locked_at < now() - make_interval(secs => ${olderThanSeconds})
    returning id`;
  return rows.length;
}

export async function setQueuePaused(queue: QueueName, paused: boolean): Promise<void> {
  await db()`update worker_controls set paused = ${paused}, updated_at = now() where queue = ${queue}`;
}

export async function listQueues() {
  return db()<{ queue: QueueName; paused: boolean; queued: number; running: number; dead: number }[]>`
    select c.queue, c.paused,
      count(j.*) filter (where j.status = 'queued')::int as queued,
      count(j.*) filter (where j.status = 'running')::int as running,
      count(j.*) filter (where j.status = 'dead')::int as dead
    from worker_controls c left join jobs j on j.queue = c.queue
    group by c.queue, c.paused order by c.queue`;
}

export async function listDeadJobs(limit = 20) {
  return db()<Job[]>`select * from jobs where status = 'dead' order by updated_at desc limit ${limit}`;
}

export async function retryDeadJob(id: string): Promise<void> {
  await db()`update jobs set status = 'queued', attempts = 0, run_at = now(), updated_at = now() where id = ${id} and status = 'dead'`;
}
