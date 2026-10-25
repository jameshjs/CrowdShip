import { afterAll, describe, expect, it } from "vitest";
import { feedbackInput } from "@crowdship/shared";
import { closeDb, listFeedbackForAdmin, submitFeedback } from "@crowdship/db";
import { makeParticipants, makeRoom } from "./helpers";

afterAll(closeDb);

const circle = {
  x: 20, y: 300, w: 160, h: 90, pageW: 390, pageH: 1400,
  points: [[20, 340], [100, 300], [180, 345], [100, 390.4]] as [number, number][],
};

describe("circle-an-area feedback", () => {
  it("stores the circled region with the feedback for the organizer", async () => {
    const room = await makeRoom();
    const [p] = await makeParticipants(room, 1);
    const input = feedbackInput.parse({
      type: "general",
      text: "This part is hard to read",
      pageUrl: "/",
      elementIdentifier: "area: testid:counts",
      elementLabel: "Circled area: 2 of 4 done",
      region: circle,
    });
    await submitFeedback(room, p!, input);
    const [row] = await listFeedbackForAdmin(room.id);
    expect(row!.region).toMatchObject({ x: 20, y: 300, w: 160, h: 90, pageW: 390, pageH: 1400 });
    expect(row!.region!.points.at(-1)).toEqual([100, 390]); // rounded to whole pixels
    expect(row!.element_label).toBe("Circled area: 2 of 4 done");
  });

  it("rejects malformed or oversized regions", () => {
    const base = { type: "general", text: "hello there" };
    expect(feedbackInput.safeParse({ ...base, region: { ...circle, points: [[1, 1], [2, 2]] } }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...base, region: { ...circle, points: Array.from({ length: 65 }, (_, i) => [i, i]) } }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...base, region: { ...circle, x: -5 } }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...base, region: { ...circle, pageW: Number.POSITIVE_INFINITY } }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...base, region: circle }).success).toBe(true);
  });
});
