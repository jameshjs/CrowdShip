import { describe, expect, it } from "vitest";
import { deterministicTriage, planFromLlm, similarity, type TriageFeedback } from "@crowdship/ai";
import { moderate, canTransition, pipelineStageFor } from "@crowdship/shared";

const fb = (id: string, text: string, type: TriageFeedback["type"] = "feature"): TriageFeedback => ({ id, text, type });

describe("deterministic triage", () => {
  it("clusters the dark mode trio into one proposal", () => {
    const plan = deterministicTriage(
      [fb("1", "We need dark mode."), fb("2", "Can you change the white background?"), fb("3", "I want to use the app at night.")],
      [],
    );
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]!.feedbackIds.sort()).toEqual(["1", "2", "3"]);
    expect(plan.create[0]!.proposal.title).toBe("Implement dark mode");
    expect(plan.create[0]!.proposal.requirements).toContain("Persist user preference");
  });

  it("keeps unrelated suggestions apart", () => {
    const plan = deterministicTriage([fb("1", "Add dark mode"), fb("2", "Let me sort tasks alphabetically"), fb("3", "Keyboard shortcuts would be great")], []);
    expect(plan.create).toHaveLength(3);
  });

  it("attaches to an existing proposal with high confidence", () => {
    const plan = deterministicTriage([fb("1", "please add a night theme")], [
      { id: "p-dark", title: "Implement dark mode", description: "Add a dark theme", normalizedKey: "c:darkmode" },
    ]);
    expect(plan.attach).toEqual([{ proposalId: "p-dark", feedbackIds: ["1"], confidence: 0.9 }]);
    expect(plan.create).toHaveLength(0);
  });

  it("does not auto-merge uncertain matches; flags them for review", () => {
    const plan = deterministicTriage([fb("1", "progress tracking for categories of work")], [
      { id: "p", title: "Task categories", description: "Tag tasks with a category", normalizedKey: "c:category" },
    ]);
    expect(plan.attach).toHaveLength(0);
    expect(plan.create[0]!.needsReview).toBe(true);
  });

  it("ignores bare praise and turns bugs into reproduction checklists", () => {
    const plan = deterministicTriage([fb("1", "love it!", "praise"), fb("2", "Clicking save on the profile page crashes", "bug")], []);
    expect(plan.ignore).toEqual(["1"]);
    expect(plan.create[0]!.proposal.category).toBe("bug");
    expect(plan.create[0]!.proposal.requirements[0]).toMatch(/^Reproduce:/);
  });

  it("maps the controlled counter bug to the counter fix template", () => {
    const plan = deterministicTriage([fb("1", "The completed count is wrong after I uncheck a task", "bug")], []);
    expect(plan.create[0]!.proposal.title).toBe("Fix the completed-task counter");
  });

  it("café demo: groups dietary requests and maps the cart bug to its fix", () => {
    const plan = deterministicTriage(
      [fb("1", "Can I filter for vegan options?"), fb("2", "Need a gluten free filter please"), fb("3", "Show me dairy-free drinks"),
       fb("4", "Removing an item from the cart doesn't lower the total", "bug")],
      [],
    );
    const diet = plan.create.find((c) => c.proposal.title === "Dietary filters");
    expect(diet?.feedbackIds.sort()).toEqual(["1", "2", "3"]);
    expect(plan.create.find((c) => c.feedbackIds.includes("4"))!.proposal.title).toBe("Fix the cart total after removing an item");
    const total = deterministicTriage([fb("5", "I removed the croissant but the total didn't go down", "bug")], []);
    expect(total.create[0]!.proposal.title).toBe("Fix the cart total after removing an item");
    // Circled feedback arrives as "general" but still reads as a bug
    const circled = deterministicTriage([{ ...fb("6", "I removed the croissant but the total didn't go down", "general"), elementLabel: "Circled area: Subtotal, Tax, Total" }], []);
    expect(circled.create[0]!.proposal.title).toBe("Fix the cart total after removing an item");
    // A non-bug never gets a bug template
    expect(deterministicTriage([fb("7", "Show the total number of tasks")], []).create[0]!.proposal.title).not.toMatch(/^Fix/);
    // "filter" alone no longer reads as task categories when a dietary word is present
    expect(plan.create.some((c) => c.proposal.title === "Task categories")).toBe(false);
  });

  it("similarity is symmetric and bounded", () => {
    const a = "dark mode please", b = "night theme";
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a));
    expect(similarity(a, b)).toBeLessThanOrEqual(1);
    expect(similarity("", b)).toBe(0);
  });
});

describe("LLM plan validation", () => {
  const feedback = [fb("u1", "dark mode"), fb("u2", "night theme"), fb("u3", "sort list")];
  const fAlias = new Map([["f1", "u1"], ["f2", "u2"], ["f3", "u3"]]);
  const pAlias = new Map([["p1", "P-EXISTING"]]);

  it("drops invented ids, enforces review threshold, and routes leftovers to the fallback", () => {
    const plan = planFromLlm(
      {
        fAlias, pAlias,
        raw: {
          groups: [
            { feedbackIds: ["f1", "f2", "f99"], existingProposalId: "p1", confidence: 0.4, proposal: null },
          ],
          ignored: [],
        },
      },
      feedback,
      [{ id: "P-EXISTING", title: "Implement dark mode", description: "" }],
      "anthropic",
    );
    // Low confidence: not attached, created separately and flagged.
    expect(plan.attach).toHaveLength(0);
    expect(plan.create[0]!.needsReview).toBe(true);
    expect(plan.create[0]!.feedbackIds).toEqual(["u1", "u2"]);
    // f3 was skipped by the model and must not be lost.
    expect(plan.create.some((c) => c.feedbackIds.includes("u3"))).toBe(true);
  });
});

describe("shared rules", () => {
  it("moderation holds profanity and links", () => {
    expect(moderate("great app").ok).toBe(true);
    expect(moderate("this is sh1t").ok).toBe(false);
    expect(moderate("visit http://spam.example").ok).toBe(false);
  });
  it("round state machine forbids skipping verification", () => {
    expect(canTransition("developing", "review_ready")).toBe(false);
    expect(canTransition("verifying", "review_ready")).toBe(true);
    expect(canTransition("completed", "voting")).toBe(false);
    expect(pipelineStageFor("verifying")).toBe("ci");
  });
});

describe("regressions", () => {
  it("'change the white background' joins dark mode", () => {
    const plan = deterministicTriage([fb("1", "Can you change the white background?")], [
      { id: "p-dark", title: "Implement dark mode", description: "Add a dark theme to the task board.", normalizedKey: "c:darkmode" },
    ]);
    expect(plan.attach[0]?.proposalId).toBe("p-dark");
  });
});
