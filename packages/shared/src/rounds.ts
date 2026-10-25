import type { RoundStatus } from "./domain";

/** Allowed round transitions. Anything not listed is rejected server-side. */
export const ROUND_TRANSITIONS: Record<RoundStatus, readonly RoundStatus[]> = {
  collecting: ["triaging", "voting", "cancelled"],
  triaging: ["collecting", "voting", "cancelled"],
  voting: ["selected", "collecting", "cancelled"],
  selected: ["developing", "voting", "cancelled"],
  developing: ["verifying", "failed", "cancelled"],
  verifying: ["review_ready", "developing", "failed", "cancelled"],
  review_ready: ["completed", "verifying", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  return ROUND_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RoundStatus, to: RoundStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export class InvalidTransitionError extends Error {
  constructor(public from: RoundStatus, public to: RoundStatus) {
    super(`Round cannot move from ${from} to ${to}`);
  }
}

export const TERMINAL_ROUND_STATUSES: readonly RoundStatus[] = ["completed", "failed", "cancelled"];

/** The six public pipeline stages shown on the live dashboard. */
export const PIPELINE_STAGES = [
  { key: "ideas", label: "Ideas received" },
  { key: "triage", label: "AI triage" },
  { key: "vote", label: "Community vote" },
  { key: "coding", label: "Agent coding" },
  { key: "ci", label: "CI verification" },
  { key: "review", label: "Ready for review" },
] as const;
export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];

export function pipelineStageFor(status: RoundStatus | null): PipelineStageKey {
  switch (status) {
    case null:
    case "collecting":
      return "ideas";
    case "triaging":
      return "triage";
    case "voting":
    case "selected":
      return "vote";
    case "developing":
      return "coding";
    case "verifying":
      return "ci";
    case "review_ready":
    case "completed":
      return "review";
    case "failed":
    case "cancelled":
      return "ideas";
  }
}

/** Participant-friendly progress: four plain steps instead of the six-stage engineering pipeline. */
export function journeyStep(status: RoundStatus | null, previewReleased: boolean): { index: number; done: boolean } {
  switch (status) {
    case "voting":
    case "selected":
      return { index: 1, done: false };
    case "developing":
    case "verifying":
      return { index: 2, done: false };
    case "review_ready":
      return previewReleased ? { index: 3, done: false } : { index: 2, done: false };
    case "completed":
      return { index: 3, done: true };
    default:
      return { index: 0, done: false };
  }
}
