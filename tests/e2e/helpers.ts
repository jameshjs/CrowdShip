import { request, type APIRequestContext } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ORGANIZER_PASSWORD ?? "crowdship-local";

// Log in once per test process: the login endpoint is rate limited (10 per 5 min per IP).
let session: Awaited<ReturnType<APIRequestContext["storageState"]>> | null = null;

export async function organizer(): Promise<APIRequestContext> {
  if (session) return request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE }, storageState: session });
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
  const res = await ctx.post("/api/admin/login", { data: { password: PASSWORD } });
  if (!res.ok()) throw new Error(`organizer login failed: ${res.status()}`);
  session = await ctx.storageState();
  return ctx;
}

export async function createRoom(org: APIRequestContext, provider = "mock"): Promise<string> {
  const res = await org.post("/api/admin/rooms", {
    data: { projectName: "E2E Board", githubRepository: "example/demo", agentProvider: provider, loadDemoSeed: true },
  });
  return (await res.json()).code;
}

export async function act(org: APIRequestContext, code: string, body: Record<string, unknown>) {
  const res = await org.post(`/api/admin/rooms/${code}/action`, { data: body });
  const json = await res.json();
  if (!res.ok()) throw new Error(`${body.type}: ${json.message}`);
  return json;
}

export async function adminState(org: APIRequestContext, code: string) {
  return (await org.get(`/api/admin/rooms/${code}`)).json();
}
