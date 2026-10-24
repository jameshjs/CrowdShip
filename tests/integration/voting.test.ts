import { afterAll, describe, expect, it } from "vitest";
import { castVote, closeDb, closeVoting, db, myVote, voteTallies, AppError, chooseWinner, currentRound } from "@crowdship/db";
import { makeParticipants, makeRoom, openVoting } from "./helpers";

afterAll(closeDb);

describe("voting engine", () => {
  it("lets a participant cast a vote", async () => {
    const room = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    const { round, proposalIds } = await openVoting(room);
    await castVote(room, p!.id, round.id, proposalIds[0]!);
    expect(await myVote(round.id, p!.id)).toBe(proposalIds[0]);
  });

  it("lets a participant change their vote without adding a ballot", async () => {
    const room = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    const { round, proposalIds } = await openVoting(room);
    await castVote(room, p!.id, round.id, proposalIds[0]!);
    const res = await castVote(room, p!.id, round.id, proposalIds[1]!);
    expect(res.changed).toBe(true);
    const tallies = await voteTallies(round.id);
    expect(tallies.reduce((n, t) => n + t.votes, 0)).toBe(1);
    expect(await myVote(round.id, p!.id)).toBe(proposalIds[1]);
  });

  it("collapses concurrent duplicate requests into one ballot", async () => {
    const room = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    const { round, proposalIds } = await openVoting(room);
    await Promise.all(Array.from({ length: 20 }, (_, i) => castVote(room, p!.id, round.id, proposalIds[i % 2]!)));
    const [row] = await db()<{ n: number }[]>`select count(*)::int as n from votes where round_id = ${round.id}`;
    expect(row!.n).toBe(1);
  });

  it("counts concurrent votes from many participants exactly", async () => {
    const room = await makeRoom();
    const people = await makeParticipants(room, 40);
    const { round, proposalIds } = await openVoting(room);
    await Promise.all(people.map((p, i) => castVote(room, p.id, round.id, proposalIds[i % 3]!)));
    const tallies = await voteTallies(round.id);
    expect(tallies.reduce((n, t) => n + t.votes, 0)).toBe(40);
  });

  it("database rejects a second ballot row directly", async () => {
    const room = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    const { round, proposalIds } = await openVoting(room);
    await db()`insert into votes (round_id, proposal_id, participant_id) values (${round.id}, ${proposalIds[0]!}, ${p!.id})`;
    await expect(
      db()`insert into votes (round_id, proposal_id, participant_id) values (${round.id}, ${proposalIds[1]!}, ${p!.id})`,
    ).rejects.toThrow(/duplicate key/);
  });

  it("rejects votes after the round closes", async () => {
    const room = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    const { round, proposalIds } = await openVoting(room);
    await closeVoting(room);
    await expect(castVote(room, p!.id, round.id, proposalIds[0]!)).rejects.toMatchObject({ code: "voting_closed" });
  });

  it("rejects votes after ends_at even before the round is closed", async () => {
    const room = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    const { round, proposalIds } = await openVoting(room);
    await db()`update voting_rounds set ends_at = now() - interval '1 second' where id = ${round.id}`;
    await expect(castVote(room, p!.id, round.id, proposalIds[0]!)).rejects.toBeInstanceOf(AppError);
  });

  it("rejects votes for proposals not on the ballot", async () => {
    const room = await makeRoom();
    const other = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    const { round } = await openVoting(room);
    const [foreign] = await db()<{ id: string }[]>`select id from proposals where room_id = ${other.id} limit 1`;
    await expect(castVote(room, p!.id, round.id, foreign!.id)).rejects.toMatchObject({ status: 400 });
  });

  it("picks the clear winner and leaves ties to the organizer", async () => {
    const room = await makeRoom();
    const people = await makeParticipants(room, 3);
    const { round, proposalIds } = await openVoting(room);
    await castVote(room, people[0]!.id, round.id, proposalIds[0]!);
    await castVote(room, people[1]!.id, round.id, proposalIds[1]!);
    const res = await closeVoting(room);
    expect(res!.winner).toBeNull();
    await expect(chooseWinner(room, proposalIds[2]!)).rejects.toMatchObject({ status: 400 });
    await chooseWinner(room, proposalIds[1]!);
    expect((await currentRound(room.id))!.winning_proposal_id).toBe(proposalIds[1]);
  });
});
