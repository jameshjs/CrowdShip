/**
 * Demo setup.
 *   pnpm seed                 # create a fresh demo room (provider from CODING_AGENT_PROVIDER) and print URLs
 *   pnpm seed --backup        # also create a separate mock room and run one full, labeled demo round to completion
 */
import { approveForDevelopment, castVote, closeDb, closeVoting, completeRound, createRoom, db, joinRoom, listProposals, releasePreview, startVoting, submitFeedback, submitPreviewReview, updateAgentSession } from "@crowdship/db";
import { MockCodingAgentProvider } from "@crowdship/integrations";
import { randomUUID } from "node:crypto";
import { drain } from "../apps/worker/src/runner";

const PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:3000";
const provider = (process.env.CODING_AGENT_PROVIDER ?? "mock") as "mock" | "devin" | "claude_code_action";
const common = {
  organizerId: "organizer",
  projectName: "Harbour Café",
  description: "Order-ahead app for a little café. Tell us what it should do next.",
  githubRepository: process.env.DEMO_GITHUB_REPOSITORY ?? "johntestrun123-bot/crowdship-demo-cafe",
  productionUrl: process.env.DEMO_PRODUCTION_URL || undefined,
  maxAcuPerSession: 10,
  loadDemoSeed: true,
};

const urls = (code: string) =>
  `  organizer: ${PUBLIC_URL}/admin/${code}\n  live:      ${PUBLIC_URL}/room/${code}/live\n  join:      ${PUBLIC_URL}/join/${code}`;

async function backupRound() {
  const room = await createRoom({ ...common, projectName: "Harbour Café (backup demo)", agentProvider: "mock" });
  const people = [];
  for (const n of ["Ava", "Ben", "Chen", "Dara", "Eli"]) people.push((await joinRoom(room, randomUUID(), n)).participant);
  await submitFeedback(room, people[0]!, { type: "feature", text: "I'm vegan, please let me filter the menu" });
  await submitFeedback(room, people[1]!, { type: "bug", text: "The done counter is wrong after I uncheck a task" });
  const ids = (await listProposals(room.id)).filter((p) => p.status === "approved").map((p) => p.id);
  const progress = (await listProposals(room.id)).find((p) => p.title === "Dietary filters")!;
  const round = await startVoting(room, ids, 120);
  for (const [i, p] of people.entries()) await castVote(room, p.id, round.id, i < 4 ? progress.id : ids[1]!);
  await closeVoting(room);
  const { session } = await approveForDevelopment(room, "seed");
  const deps = { provider: () => new MockCodingAgentProvider(100), github: () => null };
  for (let i = 0; i < 30; i++) {
    await db()`update jobs set run_at = now() where status = 'queued'`;
    await db()`update verification_results set created_at = created_at - interval '5 seconds' where agent_session_id = ${session.id}`;
    await drain(["coding-agent", "session-monitor", "verification"], deps);
    const [r] = await db()<{ status: string }[]>`select status from voting_rounds where id = ${round.id}`;
    if (r!.status === "review_ready") break;
    await new Promise((res) => setTimeout(res, 300));
  }
  await updateAgentSession(session.id, { preview_url: process.env.DEMO_PREVIEW_URL || "https://example.com/preview-not-configured" });
  await releasePreview(room, session.id, null);
  for (const [i, p] of people.entries()) await submitPreviewReview(room, p.id, progress.id, i < 4 ? "yes" : "needs_improvement", i === 4 ? "Add a dairy-free filter too" : "");
  await completeRound(room);
  return room.code;
}

const room = await createRoom({ ...common, agentProvider: provider });
console.log(`Demo room ${room.code} (${provider})\n${urls(room.code)}`);
if (process.argv.includes("--backup")) {
  const code = await backupRound();
  console.log(`\nBackup room ${code} (mock, one completed round, labeled demo mode)\n${urls(code)}`);
}
await closeDb();
