import { BROADCAST_EVENTS } from "@crowdship/shared";
import type { Sql } from "./client";

export const roomTopic = (code: string) => `room:${code}`;

/**
 * Broadcast on the room's private topic using Postgres-side realtime.send().
 * Called inside the same transaction as the state change, so a rolled-back
 * change never emits an event. Payloads must be public-safe.
 */
export async function broadcast(
  sql: Sql,
  roomCode: string,
  event: (typeof BROADCAST_EVENTS)[keyof typeof BROADCAST_EVENTS],
  payload: Record<string, unknown>,
): Promise<void> {
  await sql`select realtime.send(${sql.json({ ...payload, sentAt: Date.now() } as never)}::jsonb, ${event}, ${roomTopic(roomCode)}, true)`;
}

/** Record a public activity event and notify clients that canonical state changed. */
export async function activity(
  sql: Sql,
  room: { id: string; code: string },
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const [row] = await sql<{ id: string; created_at: Date }[]>`
    insert into activity_events (room_id, event_type, public_payload)
    values (${room.id}, ${type}, ${sql.json(payload as never)})
    returning id, created_at`;
  await broadcast(sql, room.code, BROADCAST_EVENTS.activity, {
    id: row!.id,
    type,
    payload,
    createdAt: row!.created_at.toISOString(),
  });
}

export async function stateChanged(sql: Sql, roomCode: string, reason: string): Promise<void> {
  await broadcast(sql, roomCode, BROADCAST_EVENTS.stateChanged, { reason });
}
