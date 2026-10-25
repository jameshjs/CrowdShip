import { describe, expect, it } from "vitest";
import { creditLine, journeyStep } from "@crowdship/shared";

describe("creditLine", () => {
  it("names everyone when there are few, and summarizes the rest", () => {
    expect(creditLine({ names: ["Maya"], total: 1 })).toBe("Maya");
    expect(creditLine({ names: ["Maya", "Ada"], total: 2 })).toBe("Maya and Ada");
    expect(creditLine({ names: ["Maya", "Ada", "Lee"], total: 3 })).toBe("Maya, Ada and Lee");
    expect(creditLine({ names: ["Maya", "Ada", "Lee", "Kai"], total: 4 })).toBe("Maya, Ada and 2 others");
    expect(creditLine({ names: ["Maya", "Ada", "Lee"], total: 9 }, 3)).toBe("Maya, Ada, Lee and 6 others");
    expect(creditLine({ names: ["Maya", "Ada", "Lee", "Kai"], total: 4 }, 3)).toBe("Maya, Ada, Lee and Kai");
  });
});

describe("journeyStep", () => {
  it("maps round states to the four participant steps", () => {
    expect(journeyStep(null, false)).toEqual({ index: 0, done: false });
    expect(journeyStep("voting", false).index).toBe(1);
    expect(journeyStep("developing", false).index).toBe(2);
    expect(journeyStep("review_ready", false).index).toBe(2);
    expect(journeyStep("review_ready", true).index).toBe(3);
    expect(journeyStep("completed", true)).toEqual({ index: 3, done: true });
  });
});
