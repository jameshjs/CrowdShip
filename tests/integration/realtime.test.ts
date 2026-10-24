import { afterAll, describe, expect, it } from "vitest";
import { castVote, closeDb, db, flushOutbox, submitFeedback } from "@crowdship/db";
import { makeParticipants, makeRoom, openVoting } from "./helpers";

afterAll(closeDb);

describe("realtime broadcasts", () => {
  it("coalesces many votes into one tally broadcast per flush", async () => {
    const room = await makeRoom();
    const people = await makeParticipants(room, 30);
    const { round, proposalIds } = await openVoting(room);
    await flushOutbox(db());
    await db()`delete from realtime.messages`;
    await Promise.all(people.map((p, i) => castVote(room, p.id, round.id, proposalIds[i % 2]!)));
    await flushOutbox(db());
    const sent = await db()<{ event: string; payload: { tallies?: Record<string, number> } }[]>`
      select event, payload from realtime.messages where topic = ${"room:" + room.code}`;
    const votes = sent.filter((m) => m.event === "votes");
    expect(votes).toHaveLength(1);
    expect(Object.values(votes[0]!.payload.tallies!).reduce((a, b) => a + b, 0)).toBe(30);
  });

  it("public broadcasts never contain guest session ids, prompts or tokens", async () => {
    const room = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    await db()`delete from realtime.messages`;
    await submitFeedback(room, p!, { type: "feature", text: "my token is ghp_abc123 please" });
    await flushOutbox(db());
    const all = await db()<{ payload: unknown }[]>`select payload from realtime.messages`;
    const text = JSON.stringify(all);
    expect(text).not.toContain(p!.guest_session_id);
    expect(text).not.toContain("ghp_abc123"); // broadcasts are hints; content is fetched via the API
    const [ev] = await db()<{ public_payload: Record<string, unknown> }[]>`
      select public_payload from activity_events where room_id = ${room.id} and event_type = 'feedback_submitted'`;
    expect(Object.keys(ev!.public_payload).sort()).toEqual(["elementLabel", "feedbackId", "feedbackType", "held", "nickname", "text"]);
  });
});
