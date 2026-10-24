import { db, enqueue } from "@crowdship/db";
import { verifyWebhookSignature } from "@crowdship/integrations";

/**
 * GitHub webhook (pull_request, check_run, check_suite, deployment_status).
 * Signature-verified. It never trusts payload state; it only nudges the worker
 * to re-poll GitHub for the affected agent session. Polling remains the source of truth.
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 503 });
  const body = await req.text();
  if (!verifyWebhookSignature(secret, body, req.headers.get("x-hub-signature-256"))) {
    return new Response("bad signature", { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "";
  const delivery = req.headers.get("x-github-delivery") ?? crypto.randomUUID();
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const repo: string | undefined = payload.repository?.full_name;
  if (!repo) return Response.json({ ok: true, ignored: "no repository" });

  const prNumbers: number[] = [];
  const shas: string[] = [];
  if (event === "pull_request" && payload.pull_request) prNumbers.push(payload.pull_request.number);
  if (event === "check_run") shas.push(payload.check_run?.head_sha);
  if (event === "check_suite") shas.push(payload.check_suite?.head_sha);
  if (event === "deployment_status") shas.push(payload.deployment?.sha);

  const sessions = await db()<{ id: string; pr_head_sha: string | null; provider_session_id: string | null }[]>`
    select s.id, s.pr_head_sha, s.provider_session_id from agent_sessions s
    join rooms r on r.id = s.room_id join projects p on p.id = r.project_id
    where lower(p.github_repository) = lower(${repo}) and s.state not in ('failed', 'cancelled')
      and (s.pr_number = any(${prNumbers}) or s.pr_head_sha = any(${shas.filter(Boolean)}))`;

  for (const s of sessions) {
    if (s.pr_head_sha) {
      await enqueue("verification", { agentSessionId: s.id, sha: s.pr_head_sha, oneShot: true }, { idempotencyKey: `wh:${delivery}:${s.id}`, maxAttempts: 200 });
    }
  }
  return Response.json({ ok: true, matched: sessions.length });
}
