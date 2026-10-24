import { describe, expect, it } from "vitest";
import { addTask, countsFor, toggleTask, updateCounts } from "./tasks";

describe("tasks", () => {
  it("adds trimmed tasks and ignores blanks", () => {
    const t = addTask(addTask([], "  hello "), "   ");
    expect(t).toHaveLength(1);
    expect(t[0]!.title).toBe("hello");
  });

  it("toggles completion", () => {
    const t = addTask([], "a");
    expect(toggleTask(t, t[0]!.id)[0]!.done).toBe(true);
  });

  it("counts tasks", () => {
    const t = toggleTask(addTask(addTask([], "a"), "b"), addTask([], "a")[0]!.id);
    expect(countsFor(t).total).toBe(2);
  });

  it("updates counters when tasks are added and completed", () => {
    let c = { total: 0, completed: 0, remaining: 0 };
    c = updateCounts(c, { type: "added" });
    c = updateCounts(c, { type: "toggled", nowDone: true });
    expect(c).toEqual({ total: 1, completed: 1, remaining: 0 });
  });
});
