/**
 * Load test: N simulated participants join, submit feedback and vote concurrently,
 * while N Realtime subscribers measure broadcast delivery latency.
 *
 *   pnpm load-test            # 50 participants against http://localhost:3000
 *   N=100 BASE=https://... ORGANIZER_PASSWORD=... pnpm load-test
 *
 * Prints measured numbers only; nothing is estimated.
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3000";
const N = Number(process.env.N ?? 50);
const PASSWORD = process.env.ORGANIZER_PASSWORD ?? "crowdship-local";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

class Session {
  cookies = new Map<string, string>();
  async req(path: string, body?: unknown): Promise<{ status: number; json: any; ms: number }> {
    const t0 = performance.now();
    const res = await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: BASE,
        "Content-Type": "application/json",
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const [k, v] = kv!.split("=");
      this.cookies.set(k!, v!);
    }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, ms: performance.now() - t0 };
  }
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? NaN;
  return { n: s.length, p50: Math.round(q(0.5)), p95: Math.round(q(0.95)), max: Math.round(s.at(-1) ?? NaN) };
}

async function main() {
  const org = new Session();
  if ((await org.req("/api/admin/login", { password: PASSWORD })).status !== 200) throw new Error("organizer login failed");
  const { json: room } = await org.req("/api/admin/rooms", { projectName: `Load test ${N}`, githubRepository: "example/demo", agentProvider: "mock", loadDemoSeed: true });
  const code = room.code as string;
  console.log(`room ${code}, ${N} participants, ${BASE}`);

  const people = Array.from({ length: N }, () => new Session());

  // 1. Join concurrently.
  const t0 = performance.now();
  const joins = await Promise.all(people.map((p, i) => p.req(`/api/rooms/${code}/join`, { nickname: `Load ${i}` })));
  const joinWall = performance.now() - t0;
  const joinErrors = joins.filter((r) => r.status !== 200);

  // 2. Realtime subscribers (one per participant) measuring delivery latency.
  const latencies: number[] = [];
  let subscribed = 0;
  const clients = ANON
    ? await Promise.all(
        people.map(async (p) => {
          const { json } = await p.req(`/api/rooms/${code}/realtime-token`);
          const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
          await sb.realtime.setAuth(json.token);
          const ch = sb.channel(`room:${code}`, { config: { private: true } });
          ch.on("broadcast", { event: "votes" }, ({ payload }) => latencies.push(Date.now() - (payload.sentAt as number)));
          await new Promise<void>((resolve) => ch.subscribe((s) => (s === "SUBSCRIBED" ? (subscribed++, resolve()) : undefined)));
          return sb;
        }),
      )
    : [];

  // 3. Feedback concurrently.
  const ideas = ["dark mode please", "sort tasks by date", "show a progress bar", "keyboard shortcuts", "categories for tasks"];
  const fb = await Promise.all(people.map((p, i) => p.req(`/api/rooms/${code}/feedback`, { type: "feature", text: ideas[i % ideas.length] })));

  // 4. Voting: everyone votes at once, then half change their vote.
  const { json: admin } = await org.req(`/api/admin/rooms/${code}`);
  const ids = admin.proposals.filter((p: any) => p.status === "approved").map((p: any) => p.id);
  await org.req(`/api/admin/rooms/${code}/action`, { type: "start_voting", proposalIds: ids, durationSeconds: 300 });
  const { json: st } = await people[0]!.req(`/api/rooms/${code}/state`);
  const roundId = st.round.id;
  const v0 = performance.now();
  const votes = await Promise.all(people.map((p, i) => p.req(`/api/rooms/${code}/vote`, { roundId, proposalId: ids[i % ids.length] })));
  const changes = await Promise.all(people.slice(0, N / 2).map((p) => p.req(`/api/rooms/${code}/vote`, { roundId, proposalId: ids[0] })));
  const voteWall = performance.now() - v0;
  await new Promise((r) => setTimeout(r, 1500));

  const { json: after } = await org.req(`/api/admin/rooms/${code}`);
  const totalVotes = Object.values(after.tallies as Record<string, number>).reduce((a, b) => a + b, 0);

  const report = {
    base: BASE,
    participants: N,
    join: { ...stats(joins.map((r) => r.ms)), wallMs: Math.round(joinWall), errors: joinErrors.length },
    feedback: { ...stats(fb.map((r) => r.ms)), errors: fb.filter((r) => r.status !== 200).length, statuses: [...new Set(fb.map((r) => r.status))] },
    votes: {
      ...stats([...votes, ...changes].map((r) => r.ms)),
      requests: votes.length + changes.length,
      wallMs: Math.round(voteWall),
      throughputPerSec: Math.round(((votes.length + changes.length) / voteWall) * 1000),
      errors: [...votes, ...changes].filter((r) => r.status !== 200).length,
      ballotsInDb: totalVotes,
      ballotsExpected: N,
    },
    realtime: ANON ? { subscribers: subscribed, deliveries: latencies.length, ...stats(latencies) } : "skipped (NEXT_PUBLIC_SUPABASE_ANON_KEY not set)",
  };
  console.log(JSON.stringify(report, null, 2));
  await Promise.all(clients.map((c) => c.removeAllChannels()));
  process.exit(totalVotes === N ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
