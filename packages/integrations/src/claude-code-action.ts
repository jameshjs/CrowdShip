import { DefiniteFailure, ProviderConfigError, UncertainOutcome, type AgentSession, type CodingAgentProvider, type CodingTask } from "./agents";
import { GitHubClient } from "./github";

/**
 * Runs Claude Code inside GitHub Actions (anthropics/claude-code-action) in the demo repo.
 * CrowdShip dispatches .github/workflows/<CLAUDE_CODE_WORKFLOW> with the task; the workflow
 * sets run-name to include the CrowdShip tag so runs can be reconciled by tag.
 * Session id format: "gha-<runId>".
 */
export class ClaudeCodeActionProvider implements CodingAgentProvider {
  readonly name = "claude_code_action" as const;
  constructor(
    private repo: string,
    private gh = new GitHubClient(),
    private workflow = process.env.CLAUDE_CODE_WORKFLOW ?? "crowdship-agent.yml",
    private defaultBranch = "main",
  ) {}

  async createSession(task: CodingTask): Promise<AgentSession> {
    const since = new Date(Date.now() - 60_000);
    try {
      await this.gh.dispatchWorkflow(this.repo, this.workflow, this.defaultBranch, {
        crowdship_tag: task.idempotencyTag,
        branch: task.branch,
        issue_number: String(task.issueNumber ?? ""),
        task: task.prompt.slice(0, 60_000),
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      const msg = `Workflow dispatch failed${status ? ` (${status})` : ""}: ${(err as Error).message}`;
      if (status === 401 || status === 403 || status === 404 || status === 422) throw new ProviderConfigError(msg);
      if (status && status < 500) throw new DefiniteFailure(msg);
      throw new UncertainOutcome(msg);
    }
    // The dispatch API returns no run id; poll briefly for the run carrying our tag.
    for (let i = 0; i < 10; i++) {
      const found = await this.findRun(task.idempotencyTag, since);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 3000));
    }
    // Dispatch accepted but run not visible yet; the monitor will reconcile by tag.
    throw new UncertainOutcome("Workflow dispatched; run not visible yet");
  }

  private async findRun(tag: string, since?: Date): Promise<AgentSession | null> {
    const runs = await this.gh.listWorkflowRuns(this.repo, this.workflow, since);
    const run = runs.find((r) => (r.display_title ?? r.name ?? "").includes(tag));
    return run ? this.toSession(run) : null;
  }

  private toSession(run: { id: number; html_url: string; status: string | null; conclusion: string | null }): AgentSession {
    let status: AgentSession["status"] = "running";
    if (run.status === "queued" || run.status === "waiting" || run.status === "pending" || run.status === "requested") status = "starting";
    else if (run.status === "completed") status = run.conclusion === "success" ? "finished" : "failed";
    return {
      providerSessionId: `gha-${run.id}`,
      url: run.html_url,
      status,
      detail: run.status === "completed" ? `workflow ${run.conclusion}` : `workflow ${run.status}`,
      pullRequestUrls: [], // discovered by branch via GitHub in the monitor
      simulated: false,
    };
  }

  async getSession(sessionId: string): Promise<AgentSession> {
    const id = Number(sessionId.replace(/^gha-/, ""));
    if (!Number.isFinite(id)) throw new ProviderConfigError(`Bad workflow session id ${sessionId}`);
    return this.toSession(await this.gh.getWorkflowRun(this.repo, id));
  }

  async findSessionByTag(tag: string): Promise<AgentSession | null> {
    return this.findRun(tag, new Date(Date.now() - 24 * 3600_000));
  }
}
