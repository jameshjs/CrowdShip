import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveForDevelopment, castVote, closeDb, closeVoting, completeRound, currentRound, db, getAgentSession, getPublicRoomState,
  previewReviewSummary, releasePreview, submitPreviewReview, updateAgentSession, type RoomRow,
} from "@crowdship/db";
import {
  MockCodingAgentProvider, UncertainOutcome, summarizeChecks, type AgentSession, type CodingAgentProvider, type CodingTask, type GitHubClient,
} from "@crowdship/integrations";
import { drain } from "../../apps/worker/src/runner";
import type { Deps } from "../../apps/worker/src/providers";
import { makeParticipants, makeRoom, openVoting } from "./helpers";

afterAll(closeDb);

const ALL_QUEUES = ["coding-agent", "session-monitor", "verification", "round-timer", "feedback-triage"] as const;

/** Make every queued job due now and run until idle. Simulates time passing for polling jobs. */
async function tick(deps: Deps, times = 1) {
  for (let i = 0; i < times; i++) {
    await db()`update jobs set run_at = now() where status = 'queued'`;
    await drain(ALL_QUEUES, deps);
  }
}

beforeEach(async () => {
  // Isolate from earlier tests' leftover polling jobs (test database only).
  await db()`update jobs set status = 'dead' where status in ('queued','running')`;
});

async function roomWithWinner(provider: RoomRow["agent_provider"] = "mock", repo = "example/demo") {
  const room = await makeRoom({ agentProvider: provider, githubRepository: repo });
  const people = await makeParticipants(room, 3);
  const { round, proposalIds } = await openVoting(room);
  for (const p of people) await castVote(room, p.id, round.id, proposalIds[0]!);
  await closeVoting(room);
  return { room, people, winnerId: proposalIds[0]! };
}

class FakeProvider implements CodingAgentProvider {
  readonly name = "devin" as const;
  creates = 0;
  next: AgentSession["status"] = "running";
  prUrls: string[] = [];
  failFirstCreateUncertain = false;
  reconcileFinds = false;
  async createSession(task: CodingTask): Promise<AgentSession> {
    this.creates++;
    if (this.failFirstCreateUncertain && this.creates === 1) throw new UncertainOutcome("timeout");
    return this.session(task.idempotencyTag);
  }
  async getSession(id: string): Promise<AgentSession> {
    return this.session(id);
  }
  async findSessionByTag(tag: string): Promise<AgentSession | null> {
    return this.reconcileFinds ? this.session(tag) : null;
  }
  private session(id: string): AgentSession {
    return { providerSessionId: `devin-${id}`, url: "https://app.devin.ai/sessions/x", status: this.next, detail: this.next, pullRequestUrls: this.prUrls, simulated: false };
  }
}

function fakeGithub(opts: { headSha: () => string; conclusion: () => string | null }): GitHubClient {
  return {
    createIssue: async () => ({ number: 7, url: "https://github.com/example/demo/issues/7" }),
    octokit: { search: { issuesAndPullRequests: async () => ({ data: { items: [] } }) } },
    getPull: async (_repo: string, n: number) => ({
      number: n, url: `https://github.com/example/demo/pull/${n}`, headSha: opts.headSha(), headRef: "crowdship/x",
      draft: true, state: "open", merged: false, repoFullName: "example/demo",
    }),
    findPull: async () => null,
    getChecks: async () => {
      const c = opts.conclusion();
      return summarizeChecks(["typecheck", "unit", "e2e"].map((name) => ({ name, status: c ? "completed" : "in_progress", conclusion: c })));
    },
    previewUrl: async () => "https://demo-git-crowdship.vercel.app",
    dispatchWorkflow: async () => {},
  } as unknown as GitHubClient;
}

describe("agent pipeline", () => {
  it("runs the complete flow with the mock provider and labels it simulated", async () => {
    const { room, people, winnerId } = await roomWithWinner("mock");
    let now = Date.now();
    const mock = new MockCodingAgentProvider(1, null, () => now);
    const deps: Deps = { provider: () => mock, github: () => null };

    const { session } = await approveForDevelopment(room, "organizer");
    await tick(deps);
    expect((await getAgentSession(session.id)).state).toBe("running");
    expect((await currentRound(room.id))!.status).toBe("developing");

    now += 40_000; // agent finishes, simulated PR
    await tick(deps);
    let s = await getAgentSession(session.id);
    expect(s.pr_number).toBe(0);
    expect(s.pr_url).toBeNull();
    expect((await currentRound(room.id))!.status).toBe("verifying");

    await db()`update verification_results set created_at = now() - interval '1 minute' where agent_session_id = ${session.id}`;
    await tick(deps, 2);
    expect((await currentRound(room.id))!.status).toBe("review_ready");

    const state = await getPublicRoomState(room.code);
    expect(state.room.demoMode).toBe(true);
    expect(state.agent!.verification!.simulated).toBe(true);
    expect(state.agent!.verification!.ciStatus).toBe("pass");

    await updateAgentSession(session.id, { preview_url: "https://preview.example.com" });
    await releasePreview(room, session.id, null);
    await submitPreviewReview(room, people[0]!.id, winnerId, "yes", "nice");
    await submitPreviewReview(room, people[1]!.id, winnerId, "needs_improvement", "");
    await submitPreviewReview(room, people[0]!.id, winnerId, "no", "changed my mind");
    expect(await previewReviewSummary(winnerId)).toEqual({ yes: 0, no: 1, needs_improvement: 1 });

    await completeRound(room);
    s = await getAgentSession(session.id);
    expect(s.completed_at).not.toBeNull();
    const after = await getPublicRoomState(room.code);
    expect(after.round!.number).toBe(2);
    expect(after.history[0]!.status).toBe("completed");
  });

  it("starts only one agent session and one job for an approved proposal", async () => {
    const { room } = await roomWithWinner();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => approveForDevelopment(room, "organizer")));
    const ids = new Set(results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ session: { id: string } }>).value.session.id));
    expect(ids.size).toBe(1);
    const [{ n }] = (await db()<{ n: number }[]>`
      select count(*)::int as n from jobs where queue = 'coding-agent' and payload ->> 'agentSessionId' = ${[...ids][0]!}`) as [{ n: number }];
    expect(n).toBe(1);
    const [{ sessions }] = (await db()<{ sessions: number }[]>`select count(*)::int as sessions from agent_sessions where room_id = ${room.id}`) as [{ sessions: number }];
    expect(sessions).toBe(1);
  });

  it("a failed agent session never shows as completed", async () => {
    const { room } = await roomWithWinner("mock");
    let now = Date.now();
    const mock = new MockCodingAgentProvider(1, null, () => now, () => true);
    const deps: Deps = { provider: () => mock, github: () => null };
    const { session } = await approveForDevelopment(room, "organizer");
    await tick(deps);
    now += 15_000;
    await tick(deps);
    const s = await getAgentSession(session.id);
    expect(s.state).toBe("failed");
    expect(s.completed_at).toBeNull();
    expect((await currentRound(room.id))!.status).toBe("developing");
    await expect(completeRound(room)).rejects.toMatchObject({ code: "not_review_ready" });
    const state = await getPublicRoomState(room.code);
    expect(state.agent!.state).toBe("failed");
    expect(state.activity.some((a) => a.type === "agent_failed")).toBe(true);
  });

  it("a PR with failing checks is not verified and its preview cannot be released", async () => {
    const { room } = await roomWithWinner("devin");
    const fake = new FakeProvider();
    fake.prUrls = ["https://github.com/example/demo/pull/42"];
    let conclusion: string | null = null;
    const deps: Deps = { provider: () => fake, github: () => fakeGithub({ headSha: () => "a".repeat(40), conclusion: () => conclusion }) };
    const { session } = await approveForDevelopment(room, "organizer");
    await tick(deps, 2);
    let s = await getAgentSession(session.id);
    expect(s.github_issue_number).toBe(7);
    expect(s.pr_number).toBe(42);
    expect((await currentRound(room.id))!.status).toBe("verifying");

    conclusion = "failure";
    await tick(deps);
    const state = await getPublicRoomState(room.code);
    expect(state.agent!.verification!.ciStatus).toBe("fail");
    expect(state.agent!.verification!.verifiedAt).toBeNull();
    expect((await currentRound(room.id))!.status).toBe("verifying");
    await expect(releasePreview(room, session.id, "https://p.example.com")).rejects.toMatchObject({ code: "not_verified" });
    s = await getAgentSession(session.id);
    expect(s.preview_released).toBe(false);
  });

  it("ignores PRs outside the approved repository", async () => {
    const { room } = await roomWithWinner("devin");
    const fake = new FakeProvider();
    fake.prUrls = ["https://github.com/attacker/other/pull/1"];
    const deps: Deps = { provider: () => fake, github: () => fakeGithub({ headSha: () => "b".repeat(40), conclusion: () => "success" }) };
    const { session } = await approveForDevelopment(room, "organizer");
    await tick(deps, 2);
    expect((await getAgentSession(session.id)).pr_number).toBeNull();
  });

  it("a new head commit resets verification to the new SHA", async () => {
    const { room } = await roomWithWinner("devin");
    const fake = new FakeProvider();
    fake.prUrls = ["https://github.com/example/demo/pull/5"];
    let sha = "c".repeat(40);
    let conclusion: string | null = "success";
    const deps: Deps = { provider: () => fake, github: () => fakeGithub({ headSha: () => sha, conclusion: () => conclusion }) };
    await approveForDevelopment(room, "organizer");
    await tick(deps, 3);
    expect((await currentRound(room.id))!.status).toBe("review_ready");
    sha = "d".repeat(40);
    conclusion = null;
    // review_ready -> verifying on new push requires the PR to be re-polled; trigger verification of the old sha.
    await db()`insert into jobs (queue, payload) select 'verification', jsonb_build_object('agentSessionId', id, 'sha', ${"c".repeat(40)}::text) from agent_sessions where room_id = ${room.id}`;
    await tick(deps, 2);
    const state = await getPublicRoomState(room.code);
    expect(state.agent!.headSha).toBe(sha);
    expect(state.agent!.verification!.ciStatus).toBe("pending");
    expect((await currentRound(room.id))!.status).toBe("verifying");
  });

  it("reconciles an uncertain launch instead of creating a duplicate session", async () => {
    const { room } = await roomWithWinner("devin");
    const fake = new FakeProvider();
    fake.failFirstCreateUncertain = true;
    const deps: Deps = { provider: () => fake, github: () => fakeGithub({ headSha: () => "e".repeat(40), conclusion: () => null }) };
    const { session } = await approveForDevelopment(room, "organizer");
    await tick(deps);
    expect((await getAgentSession(session.id)).state).toBe("needs_reconcile");
    fake.reconcileFinds = true; // the session did start on the provider side
    await tick(deps);
    expect(fake.creates).toBe(1);
    expect((await getAgentSession(session.id)).state).toBe("running");
  });

  it("never falls back to mock when a real provider is misconfigured", async () => {
    const { room } = await roomWithWinner("devin");
    const deps: Deps = {
      provider: () => {
        throw new Error("DEVIN_API_KEY and DEVIN_ORG_ID must be set for Devin rooms");
      },
      github: () => null,
    };
    const { session } = await approveForDevelopment(room, "organizer");
    await tick(deps);
    const s = await getAgentSession(session.id);
    expect(s.state).toBe("failed");
    expect(s.error).toMatch(/DEVIN_API_KEY/);
    expect(s.provider).toBe("devin");
  });

  it("preview feedback is attributed to the correct proposal and requires a released preview", async () => {
    const { room, people, winnerId } = await roomWithWinner("mock");
    await expect(submitPreviewReview(room, people[0]!.id, winnerId, "yes", "")).rejects.toMatchObject({ code: "no_preview" });
    const [other] = await db()<{ id: string }[]>`select id from proposals where room_id = ${room.id} and id <> ${winnerId} limit 1`;
    await expect(submitPreviewReview(room, people[0]!.id, other!.id, "yes", "")).rejects.toMatchObject({ code: "no_preview" });
  });
});
