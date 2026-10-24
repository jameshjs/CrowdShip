import { createHmac, timingSafeEqual } from "node:crypto";
import { Octokit } from "@octokit/rest";
import { REQUIRED_CHECKS, type CheckStatus } from "@crowdship/shared";

export function splitRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`Invalid repository "${repo}"`);
  return { owner, repo: name };
}

/** Parse a PR URL and confirm it belongs to the approved repository. */
export function parsePullUrl(url: string, approvedRepo: string): number | null {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
  if (!m) return null;
  if (`${m[1]}/${m[2]}`.toLowerCase() !== approvedRepo.toLowerCase()) return null;
  return Number(m[3]);
}

export function verifyWebhookSignature(secret: string, payload: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`);
  const given = Buffer.from(signatureHeader);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export interface PullInfo {
  number: number;
  url: string;
  headSha: string;
  headRef: string;
  draft: boolean;
  state: "open" | "closed";
  merged: boolean;
  repoFullName: string;
}

export interface CheckSummary {
  ciStatus: CheckStatus;
  testStatus: CheckStatus;
  checks: { name: string; status: CheckStatus; url?: string }[];
  anyFound: boolean;
}

/** Map GitHub check runs for a commit onto CrowdShip's required checks. Missing required checks are pending. */
export function summarizeChecks(
  runs: { name: string; status: string; conclusion: string | null; html_url?: string | null }[],
  required: readonly string[] = REQUIRED_CHECKS,
): CheckSummary {
  const checks = required.map((name) => {
    // Matches "unit" and also matrix/job-prefixed names such as "ci / unit".
    const candidates = runs.filter((r) => r.name === name || r.name.endsWith(` / ${name}`) || r.name.endsWith(`(${name})`));
    const run = candidates.sort((a, b) => Number(b.status === "completed") - Number(a.status === "completed"))[0];
    let status: CheckStatus = "pending";
    if (run && run.status === "completed") {
      status = run.conclusion === "success" ? "pass" : run.conclusion === "skipped" || run.conclusion === "neutral" ? "unavailable" : "fail";
    }
    return { name, status, url: run?.html_url ?? undefined };
  });
  const by = (n: string) => checks.find((c) => c.name === n)?.status ?? "pending";
  const combine = (xs: CheckStatus[]): CheckStatus =>
    xs.some((s) => s === "fail") ? "fail" : xs.some((s) => s === "unavailable") ? "unavailable" : xs.every((s) => s === "pass") ? "pass" : "pending";
  return {
    ciStatus: combine([by("typecheck")]),
    testStatus: combine([by("unit"), by("e2e")]),
    checks,
    anyFound: runs.length > 0,
  };
}

export class GitHubClient {
  readonly octokit: Octokit;
  constructor(token = process.env.GITHUB_TOKEN) {
    if (!token) throw new Error("GITHUB_TOKEN is not set");
    this.octokit = new Octokit({ auth: token, userAgent: "crowdship" });
  }

  async createIssue(repo: string, title: string, body: string): Promise<{ number: number; url: string }> {
    const { data } = await this.octokit.issues.create({ ...splitRepo(repo), title, body, labels: ["crowdship"] }).catch(async (err) => {
      // Label may not exist / no permission to create labels: retry without.
      if (err?.status === 422) return this.octokit.issues.create({ ...splitRepo(repo), title, body });
      throw err;
    });
    return { number: data.number, url: data.html_url };
  }

  async getPull(repo: string, number: number): Promise<PullInfo> {
    const { data } = await this.octokit.pulls.get({ ...splitRepo(repo), pull_number: number });
    return {
      number: data.number,
      url: data.html_url,
      headSha: data.head.sha,
      headRef: data.head.ref,
      draft: Boolean(data.draft),
      state: data.state as "open" | "closed",
      merged: Boolean(data.merged),
      repoFullName: data.base.repo.full_name,
    };
  }

  /** Discover a PR by branch name or by the CrowdShip tag / issue reference in its body. */
  async findPull(repo: string, opts: { branch?: string; tag?: string; issueNumber?: number | null }): Promise<PullInfo | null> {
    const { owner, repo: name } = splitRepo(repo);
    if (opts.branch) {
      const { data } = await this.octokit.pulls.list({ owner, repo: name, head: `${owner}:${opts.branch}`, state: "open" });
      if (data[0]) return this.getPull(repo, data[0].number);
    }
    const { data } = await this.octokit.pulls.list({ owner, repo: name, state: "open", sort: "created", direction: "desc", per_page: 30 });
    const hit = data.find(
      (p) =>
        (opts.tag && (p.body ?? "").includes(opts.tag)) ||
        (opts.issueNumber && new RegExp(`(closes|fixes|resolves)\\s+#${opts.issueNumber}\\b`, "i").test(p.body ?? "")),
    );
    return hit ? this.getPull(repo, hit.number) : null;
  }

  async getChecks(repo: string, sha: string): Promise<CheckSummary> {
    const { data } = await this.octokit.checks.listForRef({ ...splitRepo(repo), ref: sha, per_page: 100, filter: "latest" });
    return summarizeChecks(data.check_runs);
  }

  /** Latest successful deployment URL for a commit (e.g. a Vercel preview). */
  async previewUrl(repo: string, sha: string): Promise<string | null> {
    const { owner, repo: name } = splitRepo(repo);
    const { data: deployments } = await this.octokit.repos.listDeployments({ owner, repo: name, sha, per_page: 10 });
    for (const d of deployments) {
      if (/production/i.test(d.environment)) continue;
      const { data: statuses } = await this.octokit.repos.listDeploymentStatuses({ owner, repo: name, deployment_id: d.id, per_page: 5 });
      const ok = statuses.find((s) => s.state === "success" && (s.environment_url || s.target_url));
      if (ok) return (ok.environment_url || ok.target_url) ?? null;
    }
    return null;
  }

  async dispatchWorkflow(repo: string, workflow: string, ref: string, inputs: Record<string, string> = {}): Promise<void> {
    await this.octokit.actions.createWorkflowDispatch({ ...splitRepo(repo), workflow_id: workflow, ref, inputs });
  }

  async listWorkflowRuns(repo: string, workflow: string, createdAfter?: Date) {
    const { data } = await this.octokit.actions.listWorkflowRuns({
      ...splitRepo(repo),
      workflow_id: workflow,
      per_page: 20,
      ...(createdAfter ? { created: `>=${createdAfter.toISOString().slice(0, 19)}Z` } : {}),
    });
    return data.workflow_runs;
  }

  async getWorkflowRun(repo: string, runId: number) {
    const { data } = await this.octokit.actions.getWorkflowRun({ ...splitRepo(repo), run_id: runId });
    return data;
  }
}
