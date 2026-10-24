import { db } from "./client";
import { tooMany } from "./errors";

/** Fixed-window counter stored in Postgres. Throws 429 when the limit is exceeded. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const sql = db();
  const [row] = await sql<{ count: number }[]>`
    insert into rate_limits (key, window_start, count)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`;
  if (row!.count > limit) throw tooMany();
}

export async function pruneRateLimits(): Promise<void> {
  await db()`delete from rate_limits where window_start < now() - interval '1 hour'`;
}
