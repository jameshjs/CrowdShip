import type { FeedbackType, TriagedProposal } from "@crowdship/shared";

export interface TriageFeedback {
  id: string;
  type: FeedbackType;
  text: string;
  elementLabel?: string | null;
  pageUrl?: string | null;
}

export interface TriageTarget {
  id: string;
  title: string;
  description: string;
  normalizedKey?: string | null;
}

export interface TriagePlan {
  attach: { proposalId: string; feedbackIds: string[]; confidence: number }[];
  create: { proposal: TriagedProposal; feedbackIds: string[]; confidence: number; needsReview: boolean; normalizedKey: string }[];
  /** Feedback that needs no proposal (e.g. bare praise). Marked triaged. */
  ignore: string[];
  provider: "anthropic" | "openai" | "deterministic";
}

/** Confidence at or above which feedback is merged into an existing proposal without review. */
export const AUTO_MERGE_THRESHOLD = 0.6;
/** Below auto-merge but above this, a new proposal is created and flagged as a possible duplicate. */
export const REVIEW_THRESHOLD = 0.35;
