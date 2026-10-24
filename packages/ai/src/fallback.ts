import type { TriagedProposal } from "@crowdship/shared";
import { clusterKey, concepts, similarity } from "./text";
import { AUTO_MERGE_THRESHOLD, REVIEW_THRESHOLD, type TriageFeedback, type TriagePlan, type TriageTarget } from "./types";

const TEMPLATES: Record<string, Omit<TriagedProposal, "missingDetails">> = {
  darkmode: {
    title: "Implement dark mode",
    category: "feature",
    description: "Add a dark theme to the app.",
    requirements: ["Provide a light/dark toggle", "Persist user preference", "Respect system preference by default"],
    acceptanceCriteria: ["Users can change themes", "Preference survives refresh", "Text remains readable"],
    complexity: "small",
  },
  sort: {
    title: "Sort tasks",
    category: "feature",
    description: "Let people reorder the task list.",
    requirements: ["Offer sort options (newest, oldest, A–Z)", "Keep the chosen order while adding tasks"],
    acceptanceCriteria: ["Selecting a sort reorders the list immediately"],
    complexity: "small",
  },
  progress: {
    title: "Show a progress bar",
    category: "feature",
    description: "Show how much of the board is complete.",
    requirements: ["Show completed / total as a bar and percentage", "Update live when tasks change"],
    acceptanceCriteria: ["With 4 tasks and 1 done the bar shows 25%"],
    complexity: "small",
  },
  category: {
    title: "Task categories",
    category: "feature",
    description: "Tag tasks with a category and filter by it.",
    requirements: ["Choose a category for a task", "Filter the list by category"],
    acceptanceCriteria: ["Filtering shows only matching tasks"],
    complexity: "medium",
  },
  shortcut: {
    title: "Keyboard shortcuts",
    category: "feature",
    description: "Add keyboard shortcuts for common actions.",
    requirements: ["Shortcut to focus the new-task input", "Shortcut help panel"],
    acceptanceCriteria: ["Pressing the shortcut focuses the input"],
    complexity: "small",
  },
  counter: {
    title: "Fix the completed-task counter",
    category: "bug",
    description: "The task counts shown on the board do not match the actual tasks.",
    requirements: ["Counts must always reflect the current task list", "Unchecking a task decrements the completed count"],
    acceptanceCriteria: ["Complete then un-complete a task: the completed count returns to its previous value"],
    complexity: "small",
  },
};

function titleFromText(text: string, type: TriageFeedback["type"]): string {
  const t = text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  const short = t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
  const cap = short.charAt(0).toUpperCase() + short.slice(1);
  return type === "bug" ? `Fix: ${cap}` : cap || "Untitled suggestion";
}

/** Build a canonical proposal from one or more similar feedback items without an LLM. */
export function templateProposal(items: TriageFeedback[]): TriagedProposal {
  const joined = items.map((i) => i.text).join(" ");
  const c = [...concepts(joined)];
  const isBug = items.some((i) => i.type === "bug");
  const key = isBug && c.includes("counter") ? "counter" : c.find((x) => TEMPLATES[x]);
  const element = items.find((i) => i.elementLabel)?.elementLabel;
  if (key && TEMPLATES[key]) return { ...TEMPLATES[key]!, missingDetails: [] };

  const first = items[0]!;
  const missing: string[] = [];
  if (first.text.trim().split(/\s+/).length < 5) missing.push("More detail on the expected behavior");
  if (isBug && !element) missing.push("Which part of the screen is affected");
  return {
    title: titleFromText(first.text, first.type),
    category: isBug ? "bug" : first.type === "confusing" ? "ux" : "feature",
    description: items.map((i) => i.text.trim()).filter(Boolean).slice(0, 3).join(" / ").slice(0, 600),
    requirements: isBug
      ? [`Reproduce: ${first.text.trim()}${element ? ` (on "${element}")` : ""}`, "Identify and fix the root cause", "Add a regression test"]
      : items.map((i) => i.text.trim()).filter(Boolean).slice(0, 4),
    acceptanceCriteria: isBug ? ["The reported problem no longer occurs", "A test covers the scenario"] : ["The requested behavior works as described"],
    missingDetails: missing,
    complexity: "medium",
  };
}

export function deterministicTriage(feedback: TriageFeedback[], targets: TriageTarget[]): TriagePlan {
  const plan: TriagePlan = { attach: [], create: [], ignore: [], provider: "deterministic" };
  const attachMap = new Map<string, { feedbackIds: string[]; confidence: number }>();
  const clusters: { items: TriageFeedback[]; key: string; confidence: number; reviewOf?: string }[] = [];

  for (const f of feedback) {
    if (f.type === "praise" && concepts(f.text).size === 0) {
      plan.ignore.push(f.id);
      continue;
    }
    const text = [f.text, f.elementLabel].filter(Boolean).join(" ");
    const key = clusterKey(text);

    // 1. Match existing proposals.
    let best: { id: string; title: string; score: number } | null = null;
    for (const t of targets) {
      const score = t.normalizedKey && t.normalizedKey === key && key.startsWith("c:") ? 0.9 : similarity(text, `${t.title} ${t.description}`);
      if (!best || score > best.score) best = { id: t.id, title: t.title, score };
    }
    if (best && best.score >= AUTO_MERGE_THRESHOLD) {
      const entry = attachMap.get(best.id) ?? { feedbackIds: [], confidence: 1 };
      entry.feedbackIds.push(f.id);
      entry.confidence = Math.min(entry.confidence, best.score);
      attachMap.set(best.id, entry);
      continue;
    }

    // 2. Match other new feedback in this batch.
    const sibling = clusters.find((c) => c.key === key && key.startsWith("c:")) ??
      clusters.find((c) => similarity(text, c.items.map((i) => i.text).join(" ")) >= AUTO_MERGE_THRESHOLD);
    if (sibling) {
      sibling.items.push(f);
      continue;
    }
    clusters.push({
      items: [f],
      key,
      confidence: 1,
      reviewOf: best && best.score >= REVIEW_THRESHOLD ? best.title : undefined,
    });
  }

  for (const [proposalId, v] of attachMap) plan.attach.push({ proposalId, ...v });
  for (const c of clusters) {
    const proposal = templateProposal(c.items);
    if (c.reviewOf) proposal.missingDetails = [...proposal.missingDetails, `Possibly a duplicate of "${c.reviewOf}"`].slice(0, 6);
    plan.create.push({
      proposal,
      feedbackIds: c.items.map((i) => i.id),
      confidence: c.reviewOf ? 0.5 : 0.8,
      needsReview: Boolean(c.reviewOf),
      normalizedKey: c.key,
    });
  }
  return plan;
}
