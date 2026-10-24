export interface CodingTask {
  /** CrowdShip agent session id. */
  agentSessionId: string;
  /** Unique tag attached to the provider session; used to reconcile uncertain launches. */
  idempotencyTag: string;
  repository: string;
  issueNumber: number | null;
  issueUrl: string | null;
  title: string;
  prompt: string;
  maxAcu: number;
  /** Branch the agent should push to (providers that honor it). */
  branch: string;
}

export type AgentRunStatus = "starting" | "running" | "blocked" | "finished" | "failed";

export interface AgentSession {
  providerSessionId: string;
  url: string | null;
  status: AgentRunStatus;
  detail: string | null;
  pullRequestUrls: string[];
  simulated: boolean;
}

export interface CodingAgentProvider {
  readonly name: "devin" | "claude_code_action" | "mock";
  createSession(task: CodingTask): Promise<AgentSession>;
  getSession(sessionId: string): Promise<AgentSession>;
  /** Find a session previously created with this tag (reconciliation after an uncertain create). */
  findSessionByTag(tag: string, task: CodingTask): Promise<AgentSession | null>;
}

/** Errors where we know the create call did NOT start a session (safe to retry). */
export class DefiniteFailure extends Error {}
/** Errors where the provider may or may not have started a session (must reconcile before retrying). */
export class UncertainOutcome extends Error {}
/** Non-retryable configuration/permission problems. */
export class ProviderConfigError extends Error {}

