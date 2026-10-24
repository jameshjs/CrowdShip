import { db } from "./client";

/** Structured log line + persisted metric row. Never throws. */
export async function recordMetric(
  name: string,
  value: { ms?: number; num?: number },
  labels: Record<string, string | number | boolean> = {},
  roomId?: string,
): Promise<void> {
  console.log(JSON.stringify({ level: "info", metric: name, ...value, ...labels, roomId, at: new Date().toISOString() }));
  try {
    await db()`insert into metrics (room_id, name, value_ms, value_num, labels)
      values (${roomId ?? null}, ${name}, ${value.ms ?? null}, ${value.num ?? null}, ${db().json(labels)})`;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "metric write failed", name, err: String(err) }));
  }
}

export async function audit(
  roomId: string | null,
  actor: string,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db()`insert into audit_log (room_id, actor, action, details) values (${roomId}, ${actor}, ${action}, ${db().json(details as never)})`;
}
