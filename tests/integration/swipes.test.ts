import { afterAll, describe, expect, it } from "vitest";
import { approvalScore } from "@crowdship/shared";
import { buildResultsReport, closeDb, currentRound, getPublicRoomState, listProposals, mySwipes, recordSwipe, startVoting, submitFeedback } from "@crowdship/db";
import { db } from "@crowdship/db";
import { makeParticipants, makeRoom } from "./helpers";

afterAll(closeDb);

describe("swipe deck", () => {
  it("records one changeable swipe per person per idea, and closes when the final vote starts", async () => {
    const room = await makeRoom();
    const [a, b, c] = await makeParticipants(room, 3);
    const round = (await currentRound(room.id))!;
    const [p1, p2] = (await listProposals(room.id)).filter((p) => p.status === "approved");

    await recordSwipe(room, a!.id, round.id, p1!.id, true);
    await recordSwipe(room, b!.id, round.id, p1!.id, true);
    await recordSwipe(room, c!.id, round.id, p1!.id, false);
    await recordSwipe(room, a!.id, round.id, p2!.id, false);
    await recordSwipe(room, a!.id, round.id, p2!.id, true); // changed mind: still one row

    const state = await getPublicRoomState(room.code);
    expect(state.proposals.find((p) => p.id === p1!.id)!.approval).toEqual({ likes: 2, dislikes: 1 });
    expect(state.proposals.find((p) => p.id === p2!.id)!.approval).toEqual({ likes: 1, dislikes: 0 });
    expect(await mySwipes(round.id, a!.id)).toEqual({ [p1!.id]: true, [p2!.id]: true });

    await startVoting(room, [p1!.id, p2!.id], 60);
    await expect(recordSwipe(room, a!.id, round.id, p1!.id, false)).rejects.toThrow(/closed/i);

    const report = await buildResultsReport(room.id);
    expect(report.ranked.find((r) => r.title === p1!.title)).toMatchObject({ likes: 2, dislikes: 1 });
  });

  it("rejects ideas that aren't approved", async () => {
    const room = await makeRoom();
    const [a] = await makeParticipants(room, 1);
    const round = (await currentRound(room.id))!;
    const [p] = await listProposals(room.id);
    await db()`update proposals set status = 'suggested' where id = ${p!.id}`;
    await expect(recordSwipe(room, a!.id, round.id, p!.id, true)).rejects.toThrow(/deck/);
  });

  it("ranks with a prior so a single like doesn't beat a strong record", () => {
    expect(approvalScore({ likes: 9, dislikes: 1 })).toBeGreaterThan(approvalScore({ likes: 1, dislikes: 0 }));
    expect(approvalScore({ likes: 0, dislikes: 0 })).toBe(0.5);
  });

  it("exposes where an idea applies from its feedback's circled region", async () => {
    const room = await makeRoom();
    const [a] = await makeParticipants(room, 1);
    const [p] = (await listProposals(room.id)).filter((x) => x.status === "approved");
    const fb = await submitFeedback(room, a!, {
      type: "general", text: "This bit is cramped", pageUrl: "/", elementLabel: "Circled area: Add a task",
      region: { x: 10, y: 200, w: 300, h: 80, pageW: 390, pageH: 900, points: [[10, 200], [310, 200], [310, 280], [10, 280]] },
    });
    await db()`insert into proposal_feedback (proposal_id, feedback_id) values (${p!.id}, ${fb.id})`;
    const state = await getPublicRoomState(room.code);
    expect(state.proposals.find((x) => x.id === p!.id)!.location).toMatchObject({ pageUrl: "/", label: "Circled area: Add a task", region: { y: 200, pageW: 390 } });
  });
});
