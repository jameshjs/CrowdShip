import { BROADCAST_EVENTS } from "@crowdship/shared";
import { db, type Sql } from "./client";
import { badRequest, conflict, notFound } from "./errors";
import { broadcast } from "./realtime";

type RoomRef = { id: string; code: string };

/** Swipes are open while the round collects ideas (before the final vote). Re-swiping changes your answer. */
export async function recordSwipe(room: RoomRef, participantId: string, roundId: string, proposalId: string, liked: boolean) {
  return db().begin(async (sql) => {
    const [round] = await sql<{ status: string }[]>`
      select status from voting_rounds where id = ${roundId} and room_id = ${room.id} for share`;
    if (!round) throw notFound("Round");
    if (round.status !== "collecting" && round.status !== "triaging") throw conflict("swipes_closed", "Swiping is closed: the final vote has started");
    const [p] = await sql`select 1 from proposals where id = ${proposalId} and room_id = ${room.id} and status = 'approved'`;
    if (!p) throw badRequest("That idea isn't in the deck");
    await sql`
      insert into swipes (round_id, proposal_id, participant_id, liked) values (${roundId}, ${proposalId}, ${participantId}, ${liked})
      on conflict (round_id, proposal_id, participant_id) do update set liked = excluded.liked, updated_at = now()`;
    await broadcast(sql, room.code, BROADCAST_EVENTS.votes, { roundId });
    return swipeTallies(roundId, sql);
  });
}

export async function swipeTallies(roundId: string, sql: Sql = db()) {
  return sql<{ proposal_id: string; likes: number; dislikes: number }[]>`
    select proposal_id, count(*) filter (where liked)::int as likes, count(*) filter (where not liked)::int as dislikes
    from swipes where round_id = ${roundId} group by proposal_id`;
}

export async function mySwipes(roundId: string, participantId: string): Promise<Record<string, boolean>> {
  const rows = await db()<{ proposal_id: string; liked: boolean }[]>`
    select proposal_id, liked from swipes where round_id = ${roundId} and participant_id = ${participantId}`;
  return Object.fromEntries(rows.map((r) => [r.proposal_id, r.liked]));
}
