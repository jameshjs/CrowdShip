import { BROADCAST_EVENTS } from "@crowdship/shared";
import type { Sql } from "./client";

export const roomTopic = (code: string) => `room:${code}`;

type BroadcastEvent = (typeof BROADCAST_EVENTS)[keyof typeof BROADCAST_EVENTS];

/**
 * Queue a broadcast hint for the room's private topic. Written in the same
 * transaction as the state change (a rolled-back change emits nothing) and
 * sent, coalesced, by the worker's flusher (see flushOutbox).
 * Payloads must be public-safe.
 */
export async function broadcast(sql: Sql, roomCode: string, event: BroadcastEvent, payload: Record<string, unknown>): Promise<void> {
  await sql`insert into realtime_outbox (topic, event, payload) values (${roomTopic(roomCode)}, ${event}, ${sql.json(payload as never)})`;
}

/**
 * Drain the outbox: one realtime.send per (topic, event[, round]) no matter how many
 * changes were queued. Vote tallies are recomputed at send time so they are current.
 * Returns the number of messages sent.
 */
export async function flushOutbox(sql: Sql): Promise<number> {
  const groups = await sql<{ topic: string; event: string; round_id: string | null; n: number; first_ms: number }[]>`
    with drained as (delete from realtime_outbox returning topic, event, payload, created_at)
    select topic, event, payload ->> 'roundId' as round_id, count(*)::int as n,
      (extract(epoch from min(created_at)) * 1000)::float8 as first_ms
    from drained group by 1, 2, 3`;
  for (const g of groups) {
    // sentAt = when the earliest coalesced change was committed, so client latency is end-to-end.
    let payload: Record<string, unknown> = { coalesced: g.n, sentAt: Math.round(g.first_ms), flushedAt: Date.now() };
    if (g.event === BROADCAST_EVENTS.votes && g.round_id) {
      const rows = await sql<{ proposal_id: string; votes: number }[]>`
        select rp.proposal_id, count(v.id)::int as votes from round_proposals rp
        left join votes v on v.round_id = rp.round_id and v.proposal_id = rp.proposal_id
        where rp.round_id = ${g.round_id} group by rp.proposal_id`;
      payload = { ...payload, roundId: g.round_id, tallies: Object.fromEntries(rows.map((r) => [r.proposal_id, r.votes])) };
    }
    await sql`select realtime.send(${sql.json(payload as never)}::jsonb, ${g.event}, ${g.topic}, true)`;
  }
  return groups.length;
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
  await broadcast(sql, room.code, BROADCAST_EVENTS.activity, { id: row!.id, type });
}

export async function stateChanged(sql: Sql, roomCode: string, reason: string): Promise<void> {
  await broadcast(sql, roomCode, BROADCAST_EVENTS.stateChanged, { reason });
}
