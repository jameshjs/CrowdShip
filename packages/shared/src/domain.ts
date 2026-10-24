export const FEEDBACK_TYPES = ["bug", "feature", "general", "praise", "confusing"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const COMPLEXITIES = ["small", "medium", "large", "unknown"] as const;
export type Complexity = (typeof COMPLEXITIES)[number];

export const PROPOSAL_STATUSES = [
  "suggested", "approved", "rejected", "selected", "developing",
  "verifying", "review_ready", "completed", "failed", "archived",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const ROUND_STATUSES = [
  "collecting", "triaging", "voting", "selected", "developing",
  "verifying", "review_ready", "completed", "failed", "cancelled",
] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const AGENT_PROVIDERS = ["mock", "devin", "claude_code_action"] as const;
export type AgentProviderName = (typeof AGENT_PROVIDERS)[number];

export const AGENT_STATES = [
  "queued", "launching", "running", "pr_opened", "finished", "failed", "cancelled", "needs_reconcile",
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const CHECK_STATUSES = ["pending", "pass", "fail", "unavailable"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const PREVIEW_RATINGS = ["yes", "no", "needs_improvement"] as const;
export type PreviewRating = (typeof PREVIEW_RATINGS)[number];

export const QUEUES = ["feedback-triage", "coding-agent", "session-monitor", "verification", "round-timer"] as const;
export type QueueName = (typeof QUEUES)[number];

/** Checks that must all pass on the PR head SHA for a change to be REVIEW_READY. */
export const REQUIRED_CHECKS = ["typecheck", "unit", "e2e"] as const;

export const PROVIDER_LABELS: Record<AgentProviderName, string> = {
  mock: "Mock agent (demo mode)",
  devin: "Devin",
  claude_code_action: "Claude Code",
};
