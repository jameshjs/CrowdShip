import { z } from "zod";
import { DefiniteFailure, ProviderConfigError, UncertainOutcome, type AgentSession, type CodingAgentProvider, type CodingTask } from "./agents";

// Devin API v3 — https://docs.devin.ai/api-reference/v3 (schemas verified against v3-openapi.json, 2026-10-24)
const sessionSchema = z.object({
  session_id: z.string(),
  url: z.string(),
  status: z.enum(["new", "claimed", "running", "exit", "error", "suspended", "resuming"]),
  status_detail: z.string().nullable().optional(),
  tags: z.array(z.string()),
  acus_consumed: z.number(),
  pull_requests: z.array(z.object({ pr_url: z.string(), pr_state: z.string().nullable() })),
  title: z.string().nullable().optional(),
});
type DevinSession = z.infer<typeof sessionSchema>;

const listSchema = z.object({ items: z.array(sessionSchema), has_next_page: z.boolean().optional() });

const BLOCKING_DETAILS = new Set(["waiting_for_user", "waiting_for_approval"]);
const LIMIT_DETAILS = new Set([
  "usage_limit_exceeded", "out_of_credits", "out_of_quota", "no_quota_allocation", "payment_declined",
  "org_usage_limit_exceeded", "user_usage_limit_exceeded", "total_session_limit_exceeded", "contract_expired",
]);

export function mapDevinSession(s: DevinSession): AgentSession {
  const detail = s.status_detail ?? null;
  let status: AgentSession["status"];
  if (s.status === "error" || detail === "error") status = "failed";
  else if (detail && LIMIT_DETAILS.has(detail)) status = s.pull_requests.length ? "finished" : "failed";
  else if (s.status === "exit" || detail === "finished") status = "finished";
  else if (detail && BLOCKING_DETAILS.has(detail)) status = s.pull_requests.length ? "finished" : "blocked";
  else if (s.status === "suspended") status = s.pull_requests.length ? "finished" : "blocked";
  else if (s.status === "new" || s.status === "claimed" || s.status === "resuming") status = "starting";
  else status = "running";
  const label = detail ? detail.replace(/_/g, " ") : s.status;
  return {
    providerSessionId: s.session_id,
    url: s.url,
    status,
    detail: `${label} · ${s.acus_consumed.toFixed(1)} ACUs`,
    pullRequestUrls: s.pull_requests.map((p) => p.pr_url),
    simulated: false,
  };
}

export class DevinProvider implements CodingAgentProvider {
  readonly name = "devin" as const;
  private base: string;
  constructor(
    private apiKey = process.env.DEVIN_API_KEY,
    private orgId = process.env.DEVIN_ORG_ID,
    base = process.env.DEVIN_API_BASE ?? "https://api.devin.ai",
    private fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey || !orgId) throw new ProviderConfigError("DEVIN_API_KEY and DEVIN_ORG_ID must be set for Devin rooms");
    this.base = base.replace(/\/$/, "");
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/v3/organizations/${encodeURIComponent(this.orgId!)}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      // Network error/timeout: for POST we cannot know whether the session was created.
      const msg = `Devin API unreachable: ${err instanceof Error ? err.message : String(err)}`;
      throw method === "POST" ? new UncertainOutcome(msg) : new Error(msg);
    }
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 300);
      try {
        const pd = JSON.parse(text) as { title?: string; detail?: string };
        detail = [pd.title, pd.detail].filter(Boolean).join(": ") || detail;
      } catch {}
      const msg = `Devin API ${res.status}: ${detail}`;
      if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 422) throw new ProviderConfigError(msg);
      if (method === "POST" && res.status >= 500) throw new UncertainOutcome(msg);
      // 429 / 409 on POST: request rejected, no session was created.
      if (method === "POST") throw new DefiniteFailure(msg);
      throw new Error(msg);
    }
    return text ? JSON.parse(text) : {};
  }

  async createSession(task: CodingTask): Promise<AgentSession> {
    const json = await this.request("POST", "/sessions", {
      prompt: task.prompt,
      title: `CrowdShip: ${task.title}`.slice(0, 120),
      repos: [task.repository],
      tags: ["crowdship", task.idempotencyTag],
      max_acu_limit: task.maxAcu,
    });
    return mapDevinSession(sessionSchema.parse(json));
  }

  async getSession(sessionId: string): Promise<AgentSession> {
    return mapDevinSession(sessionSchema.parse(await this.request("GET", `/sessions/${encodeURIComponent(sessionId)}`)));
  }

  async findSessionByTag(tag: string): Promise<AgentSession | null> {
    const qs = new URLSearchParams({ tags: tag, first: "5" });
    const json = listSchema.parse(await this.request("GET", `/sessions?${qs}`));
    const match = json.items.find((s) => s.tags.includes(tag));
    return match ? mapDevinSession(match) : null;
  }
}
