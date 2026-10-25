import { afterAll, describe, expect, it } from "vitest";
import { createRoomInput, feedbackInput } from "@crowdship/shared";
import {
  approveForDevelopment, buildResultsReport, castVote, closeDb, closeVoting, createRoom, currentRound, db,
  getPublicRoomState, listFeedbackForAdmin, publishResults, requireBuildRoom, startVoting, submitFeedback,
  createOrganizerProposal,
} from "@crowdship/db";
import { makeParticipants } from "./helpers";

afterAll(closeDb);

async function feedbackRoom() {
  const input = createRoomInput.parse({ mode: "feedback", projectName: "Example.com review", productionUrl: "https://example.com" });
  return createRoom({ ...input, organizerId: "test-organizer" });
}

describe("feedback-only rooms (any website, no agent)", () => {
  it("validates by mode: build needs a repo, feedback needs a website and never gets a repo", () => {
    expect(createRoomInput.safeParse({ mode: "build", projectName: "x", agentProvider: "mock" }).success).toBe(false);
    expect(createRoomInput.safeParse({ mode: "feedback", projectName: "x" }).success).toBe(false);
    const ok = createRoomInput.parse({ mode: "feedback", projectName: "x", productionUrl: "https://example.com", githubRepository: "a/b", agentProvider: "devin" });
    expect(ok.githubRepository).toBeUndefined();
    expect(ok.agentProvider).toBe("mock");
    expect(ok.loadDemoSeed).toBe(false);
  });

  it("runs feedback → vote → published results, with no agent and a report", async () => {
    const room = await feedbackRoom();
    expect(room.mode).toBe("feedback");
    expect(room.github_repository).toBeNull();
    const state = await getPublicRoomState(room.code);
    expect(state.room.mode).toBe("feedback");
    expect(state.room.demoMode).toBe(false);

    const [a, b, c] = await makeParticipants(room, 3);
    await submitFeedback(room, a!, feedbackInput.parse({ type: "bug", text: "Checkout button does nothing", location: "checkout page" }));
    const [fb] = await listFeedbackForAdmin(room.id);
    expect(fb!.element_label).toBe("On the site: checkout page");

    const fixId = await createOrganizerProposal(room, { title: "Fix the checkout button", description: "", requirements: [], acceptanceCriteria: [], complexity: "small" });
    const darkId = await createOrganizerProposal(room, { title: "Dark mode", description: "", requirements: [], acceptanceCriteria: [], complexity: "small" });
    await db()`update proposals set status = 'approved' where id in ${db()([fixId, darkId])}`;
    await db()`insert into proposal_feedback (proposal_id, feedback_id) values (${fixId}, ${fb!.id})`;
    const round = await startVoting(room, [fixId, darkId], 60);
    await castVote(room, a!.id, round.id, fixId);
    await castVote(room, b!.id, round.id, fixId);
    await castVote(room, c!.id, round.id, darkId);
    await closeVoting(room);

    await expect(approveForDevelopment(room, "organizer")).rejects.toThrow(/feedback-only/);
    expect(() => requireBuildRoom(room)).toThrow(/feedback-only/);

    await publishResults(room);
    const next = await currentRound(room.id);
    expect(next!.number).toBe(2);
    expect(next!.status).toBe("collecting");
    const after = await getPublicRoomState(room.code);
    expect(after.history[0]).toMatchObject({ roundNumber: 1, title: "Fix the checkout button", status: "completed" });
    expect(after.activity.some((x) => x.type === "results_published")).toBe(true);

    const report = await buildResultsReport(room.id);
    expect(report.round!.number).toBe(1);
    expect(report.ranked.map((r) => [r.title, r.votes, r.winner])).toEqual([["Fix the checkout button", 2, true], ["Dark mode", 1, false]]);
    expect(report.ranked[0]!.quotes[0]).toMatchObject({ text: "Checkout button does nothing", where: "On the site: checkout page" });
  });

  it("build rooms cannot publish results instead of shipping", async () => {
    const room = await createRoom({ organizerId: "t", projectName: "b", description: "", githubRepository: "example/demo", agentProvider: "mock", maxAcuPerSession: 5, loadDemoSeed: false });
    await expect(publishResults(room)).rejects.toThrow(/feedback-only/);
  });
});
