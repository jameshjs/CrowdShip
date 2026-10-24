import { assertTransition, BROADCAST_EVENTS, type RoundStatus } from "@crowdship/shared";
import { db, type Sql } from "./client";
import { AppError, badRequest, conflict, notFound } from "./errors";
import { enqueue } from "./jobs";
import { activity, broadcast, stateChanged } from "./realtime";

export interface RoundRow {
  id: string;
  room_id: string;
  number: number;
  status: RoundStatus;
  started_at: Date | null;
  ends_at: Date | null;
  closed_at: Date | null;
  winning_proposal_id: string | null;
  created_at: Date;
}

type RoomRef = { id: string; code: string };

/** The single non-terminal round for a room, or the latest one if all are terminal. */
export async function currentRound(roomId: string, sql: Sql = db()): Promise<RoundRow | null> {
  const [r] = await sql<RoundRow[]>`
    select * from voting_rounds where room_id = ${roomId}
    order by (status in ('completed','failed','cancelled')) asc, number desc limit 1`;
  return r ?? null;
}

async function lockOpenRound(sql: Sql, roomId: string): Promise<RoundRow> {
  const [r] = await sql<RoundRow[]>`
    select * from voting_rounds where room_id = ${roomId}
      and status not in ('completed','failed','cancelled')
    for update`;
  if (!r) throw notFound("Open round");
  return r;
}

async function transition(sql: Sql, round: RoundRow, to: RoundStatus, extra: Partial<Record<"started_at" | "ends_at" | "closed_at" | "winning_proposal_id", unknown>> = {}) {
  assertTransition(round.status, to);
  const fields = { status: to, ...extra };
  await sql`update voting_rounds set ${sql(fields as Record<string, unknown> as never)} where id = ${round.id}`;
}

export async function voteTallies(roundId: string, sql: Sql = db()) {
  return sql<{ proposal_id: string; votes: number }[]>`
    select rp.proposal_id, count(v.id)::int as votes
    from round_proposals rp left join votes v on v.round_id = rp.round_id and v.proposal_id = rp.proposal_id
    where rp.round_id = ${roundId}
    group by rp.proposal_id`;
}

export async function startVoting(room: RoomRef, proposalIds: string[], durationSeconds: number): Promise<RoundRow> {
  if (!proposalIds.length) throw badRequest("Pick at least one approved proposal");
  if (durationSeconds < 15 || durationSeconds > 3600) throw badRequest("Duration must be 15s–60min");
  return db().begin(async (sql) => {
    const round = await lockOpenRound(sql, room.id);
    const eligible = await sql<{ id: string; title: string }[]>`
      select id, title from proposals where room_id = ${room.id} and id = any(${proposalIds}) and status = 'approved'`;
    if (eligible.length !== new Set(proposalIds).size) throw badRequest("Only organizer-approved proposals can be voted on");
    const endsAt = new Date(Date.now() + durationSeconds * 1000);
    await transition(sql, round, "voting", { started_at: new Date(), ends_at: endsAt, closed_at: null, winning_proposal_id: null });
    await sql`delete from round_proposals where round_id = ${round.id} and not (proposal_id = any(${proposalIds}))`;
    for (const p of eligible) {
      await sql`insert into round_proposals (round_id, proposal_id) values (${round.id}, ${p.id}) on conflict do nothing`;
    }
    await enqueue("round-timer", { roundId: round.id, roomId: room.id }, {
      idempotencyKey: `close:${round.id}:${endsAt.getTime()}`,
      runAt: endsAt,
      sql,
    });
    await activity(sql, room, "voting_started", { roundNumber: round.number, proposals: eligible.length, endsAt: endsAt.toISOString() });
    return { ...round, status: "voting", ends_at: endsAt };
  });
}

/**
 * Cast or change a vote. The round row is share-locked so a concurrent close
 * cannot interleave; the time check uses the database clock; the
 * (round_id, participant_id) unique constraint guarantees one ballot.
 */
export async function castVote(room: RoomRef, participantId: string, roundId: string, proposalId: string) {
  return db().begin(async (sql) => {
    const [round] = await sql<RoundRow[]>`
      select * from voting_rounds where id = ${roundId} and room_id = ${room.id} for share`;
    if (!round) throw notFound("Round");
    const [open] = await sql<{ open: boolean }[]>`select (${round.status} = 'voting' and ${round.ends_at} > now()) as open`;
    if (!open!.open) throw conflict("voting_closed", "Voting is closed for this round");
    const [eligible] = await sql`select 1 from round_proposals where round_id = ${roundId} and proposal_id = ${proposalId}`;
    if (!eligible) throw badRequest("That proposal isn't on this ballot");

    const [vote] = await sql<{ id: string; changed: boolean }[]>`
      insert into votes (round_id, proposal_id, participant_id) values (${roundId}, ${proposalId}, ${participantId})
      on conflict (round_id, participant_id) do update
        set proposal_id = excluded.proposal_id, updated_at = now()
      returning id, (xmax <> 0) as changed`;
    const tallies = await voteTallies(roundId, sql);
    if (!vote!.changed) {
      const [who] = await sql<{ nickname: string; moderation_ok: boolean }[]>`select nickname, true as moderation_ok from participants where id = ${participantId}`;
      const [p] = await sql<{ title: string }[]>`select title from proposals where id = ${proposalId}`;
      await sql`insert into activity_events (room_id, event_type, public_payload)
        values (${room.id}, 'vote_cast', ${sql.json({ nickname: who?.nickname ?? "Someone", title: p?.title ?? "" })})`;
    }
    await broadcast(sql, room.code, BROADCAST_EVENTS.votes, { roundId });
    return { voteId: vote!.id, changed: vote!.changed, tallies };
  });
}

export async function myVote(roundId: string, participantId: string): Promise<string | null> {
  const [v] = await db()<{ proposal_id: string }[]>`
    select proposal_id from votes where round_id = ${roundId} and participant_id = ${participantId}`;
  return v?.proposal_id ?? null;
}

/** Close voting. A clear winner is recorded; a tie or zero votes leaves the winner for the organizer. */
export async function closeVoting(room: RoomRef, opts: { onlyIfExpired?: boolean; roundId?: string } = {}) {
  return db().begin(async (sql) => {
    const round = await lockOpenRound(sql, room.id);
    if (opts.roundId && round.id !== opts.roundId) return null;
    if (round.status !== "voting") {
      if (opts.onlyIfExpired) return null;
      throw conflict("not_voting", "Round is not in voting");
    }
    if (opts.onlyIfExpired) {
      const [exp] = await sql<{ expired: boolean }[]>`select ${round.ends_at} <= now() as expired`;
      if (!exp!.expired) return null;
    }
    const tallies = (await voteTallies(round.id, sql)).sort((a, b) => b.votes - a.votes);
    const top = tallies[0];
    const tied = tallies.filter((t) => top && t.votes === top.votes);
    const winner = top && top.votes > 0 && tied.length === 1 ? top.proposal_id : null;
    await transition(sql, round, "selected", { closed_at: new Date(), winning_proposal_id: winner });
    if (winner) {
      await sql`update proposals set status = 'selected', updated_at = now() where id = ${winner}`;
      const [p] = await sql<{ title: string }[]>`select title from proposals where id = ${winner}`;
      await activity(sql, room, "voting_closed", { roundNumber: round.number, winnerId: winner, title: p!.title, votes: top!.votes });
    } else {
      await activity(sql, room, "voting_closed", { roundNumber: round.number, winnerId: null, tie: Boolean(top && top.votes > 0 && tied.length > 1) });
    }
    return { winner, tallies };
  });
}

/** Organizer picks the winner when voting tied or nobody voted. */
export async function chooseWinner(room: RoomRef, proposalId: string): Promise<void> {
  await db().begin(async (sql) => {
    const round = await lockOpenRound(sql, room.id);
    if (round.status !== "selected") throw conflict("not_selected", "Close voting first");
    if (round.winning_proposal_id) throw conflict("has_winner", "This round already has a winner");
    const tallies = (await voteTallies(round.id, sql)).sort((a, b) => b.votes - a.votes);
    const topVotes = tallies[0]?.votes ?? 0;
    const allowed = tallies.filter((t) => t.votes === topVotes).map((t) => t.proposal_id);
    if (!allowed.includes(proposalId)) throw badRequest("Pick one of the tied leaders");
    await sql`update voting_rounds set winning_proposal_id = ${proposalId} where id = ${round.id}`;
    await sql`update proposals set status = 'selected', updated_at = now() where id = ${proposalId}`;
    const [p] = await sql<{ title: string }[]>`select title from proposals where id = ${proposalId}`;
    await activity(sql, room, "winner_chosen", { roundNumber: round.number, winnerId: proposalId, title: p!.title });
  });
}

/** Reopen voting on a closed (selected, not yet approved) round. Votes are kept. */
export async function reopenVoting(room: RoomRef, durationSeconds: number): Promise<void> {
  await db().begin(async (sql) => {
    const round = await lockOpenRound(sql, room.id);
    if (round.status !== "selected") throw conflict("not_selected", "Only a closed, unapproved round can be reopened");
    if (round.winning_proposal_id) {
      await sql`update proposals set status = 'approved', updated_at = now() where id = ${round.winning_proposal_id}`;
    }
    const endsAt = new Date(Date.now() + durationSeconds * 1000);
    await transition(sql, round, "voting", { ends_at: endsAt, closed_at: null, winning_proposal_id: null });
    await enqueue("round-timer", { roundId: round.id, roomId: room.id }, { idempotencyKey: `close:${round.id}:${endsAt.getTime()}`, runAt: endsAt, sql });
    await activity(sql, room, "voting_reopened", { roundNumber: round.number, endsAt: endsAt.toISOString() });
  });
}

/** Cancel the current round and open a fresh collecting round. */
export async function cancelRound(room: RoomRef): Promise<void> {
  await db().begin(async (sql) => {
    const round = await lockOpenRound(sql, room.id);
    const [active] = await sql`
      select 1 from agent_sessions where room_id = ${room.id} and state in ('launching','running','needs_reconcile')`;
    if (active) throw conflict("agent_active", "An agent session is still running; cancel it first");
    await transition(sql, round, "cancelled", { closed_at: round.closed_at ?? new Date() });
    await sql`
      update proposals set status = 'approved', updated_at = now()
      where id = ${round.winning_proposal_id} and status in ('selected','developing','verifying','review_ready')`;
    await openNextRound(sql, room.id, round.number);
    await activity(sql, room, "round_cancelled", { roundNumber: round.number });
  });
}

export async function failRound(room: RoomRef): Promise<void> {
  await db().begin(async (sql) => {
    const round = await lockOpenRound(sql, room.id);
    await transition(sql, round, "failed", { closed_at: round.closed_at ?? new Date() });
    await sql`update proposals set status = 'failed', updated_at = now() where id = ${round.winning_proposal_id}`;
    await openNextRound(sql, room.id, round.number);
    await activity(sql, room, "round_failed", { roundNumber: round.number });
  });
}

/** Organizer confirms the release/preview milestone. */
export async function completeRound(room: RoomRef): Promise<void> {
  await db().begin(async (sql) => {
    const round = await lockOpenRound(sql, room.id);
    if (round.status !== "review_ready") throw conflict("not_review_ready", "Only a verified, review-ready change can be completed");
    await transition(sql, round, "completed", { closed_at: new Date() });
    await sql`update proposals set status = 'completed', updated_at = now() where id = ${round.winning_proposal_id}`;
    await sql`update agent_sessions set completed_at = coalesce(completed_at, now()) where proposal_id = ${round.winning_proposal_id} and state not in ('failed','cancelled')`;
    await openNextRound(sql, room.id, round.number);
    const [p] = await sql<{ title: string }[]>`select title from proposals where id = ${round.winning_proposal_id}`;
    await activity(sql, room, "round_completed", { roundNumber: round.number, title: p?.title ?? null });
  });
}

async function openNextRound(sql: Sql, roomId: string, lastNumber: number) {
  await sql`insert into voting_rounds (room_id, number, status) values (${roomId}, ${lastNumber + 1}, 'collecting')`;
}

/** Move the open round between pipeline states (used by agent/verification flow). */
export async function advanceRound(sql: Sql, roomId: string, to: RoundStatus, expectedProposalId?: string): Promise<boolean> {
  const [round] = await sql<RoundRow[]>`
    select * from voting_rounds where room_id = ${roomId} and status not in ('completed','failed','cancelled') for update`;
  if (!round) return false;
  if (expectedProposalId && round.winning_proposal_id !== expectedProposalId) return false;
  if (round.status === to) return true;
  try {
    await transition(sql, round, to);
    return true;
  } catch (err) {
    if (err instanceof AppError) throw err;
    return false;
  }
}

export async function setTriaging(room: RoomRef, on: boolean): Promise<void> {
  await db().begin(async (sql) => {
    const round = await lockOpenRound(sql, room.id);
    if (on && round.status === "collecting") await transition(sql, round, "triaging");
    else if (!on && round.status === "triaging") await transition(sql, round, "collecting");
    else return;
    await stateChanged(sql, room.code, "round");
  });
}
