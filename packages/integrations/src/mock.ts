import type { AgentSession, CodingAgentProvider, CodingTask } from "./agents";

/**
 * Simulated coding agent for demo mode. It never claims to be Devin: every
 * session it returns has simulated=true and the UI shows a "Demo mode" badge.
 *
 * State is derived from the launch time encoded in the session id, so it
 * survives worker restarts. If MOCK_PR_URL points at a real, pre-built PR
 * (e.g. the progress-bar backup PR), that PR is "discovered" and verified
 * against real GitHub checks; otherwise verification is simulated too.
 */
export const MOCK_STEPS = [
  { at: 0, detail: "Simulated: reading the codebase" },
  { at: 6, detail: "Simulated: planning the change" },
  { at: 12, detail: "Simulated: editing src/ and adding tests" },
  { at: 20, detail: "Simulated: running typecheck and tests" },
  { at: 26, detail: "Simulated: opening draft PR" },
] as const;

export class MockCodingAgentProvider implements CodingAgentProvider {
  readonly name = "mock" as const;
  constructor(
    private speed = Number(process.env.MOCK_AGENT_SPEED ?? 1),
    private prUrl = process.env.MOCK_PR_URL || null,
    private now: () => number = Date.now,
    private failWhen: (sessionId: string) => boolean = () => false,
  ) {}

  async createSession(task: CodingTask): Promise<AgentSession> {
    return this.state(`mock-${this.now()}-${task.idempotencyTag}`);
  }

  async getSession(sessionId: string): Promise<AgentSession> {
    return this.state(sessionId);
  }

  async findSessionByTag(): Promise<AgentSession | null> {
    return null; // mock create never has an uncertain outcome
  }

  private state(id: string): AgentSession {
    const started = Number(id.split("-")[1]);
    const elapsed = ((this.now() - started) / 1000) * this.speed;
    const step = [...MOCK_STEPS].reverse().find((s) => elapsed >= s.at)!;
    if (this.failWhen(id) && elapsed >= 12) {
      return { providerSessionId: id, url: null, status: "failed", detail: "Simulated failure", pullRequestUrls: [], simulated: true };
    }
    const done = elapsed >= 32;
    return {
      providerSessionId: id,
      url: null,
      status: done ? "finished" : "running",
      detail: done ? "Simulated: finished" : step.detail,
      pullRequestUrls: done ? [this.prUrl ?? `mock://pull/${id}`] : [],
      simulated: true,
    };
  }
}
