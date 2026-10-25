import { expect, test } from "@playwright/test";
import { act, adminState, createRoom, organizer } from "./helpers";

test("complete flow in labeled demo mode: feedback → vote → agent → PR → checks → preview → rating", async ({ browser }) => {
  test.setTimeout(180_000);
  const org = await organizer();
  const code = await createRoom(org, "mock");
  const live = await browser.newPage();
  await live.goto(`/room/${code}/live`);
  await expect(live.getByText("Demo mode: simulated agent")).toBeVisible();

  const user = await browser.newPage();
  await user.goto(`/join/${code}`);
  await user.getByTestId("join-button").click();
  await user.getByTestId("tab-feedback").click();
  await user.getByTestId("quick-feature").click();
  await user.getByTestId("feedback-text").fill("Show a progress bar of how much is done");
  await user.getByTestId("feedback-submit").click();
  await expect(user.getByTestId("feedback-sent")).toBeVisible();

  const s = await adminState(org, code);
  const progress = s.proposals.find((p: { title: string }) => p.title === "Show a progress bar");
  await act(org, code, { type: "start_voting", proposalIds: s.proposals.filter((p: { status: string }) => p.status === "approved").map((p: { id: string }) => p.id), durationSeconds: 60 });
  await user.getByTestId("tab-vote").click();
  const voted = user.waitForResponse((r) => r.url().endsWith("/vote") && r.ok());
  await user.locator(`[data-proposal-id="${progress.id}"]`).click();
  await voted; // the badge is optimistic; wait for the server to accept the ballot
  await expect(user.locator(`[data-proposal-id="${progress.id}"]`).getByTestId("my-vote")).toBeVisible();
  await act(org, code, { type: "close_voting" });
  await expect(live.getByText("Winner", { exact: true })).toBeVisible();

  const approved = await act(org, code, { type: "approve_development" });
  const again = await act(org, code, { type: "approve_development" });
  expect(again.agentSessionId).toBe(approved.agentSessionId); // idempotent approval

  await expect(live.getByTestId("live-agent-state")).toContainText("Coding", { timeout: 20_000 });
  await expect(live.getByText("Simulated pull request")).toBeVisible({ timeout: 90_000 });
  await expect.poll(async () => (await adminState(org, code)).round.status, { timeout: 60_000 }).toBe("review_ready");
  await expect(live.getByText("(simulated checks)")).toBeVisible();

  await act(org, code, { type: "set_preview_url", agentSessionId: approved.agentSessionId, previewUrl: "https://example.com/preview" });
  await act(org, code, { type: "release_preview", agentSessionId: approved.agentSessionId });
  // The climax: every phone gets the "it's live" moment, the projector shows the shipped banner.
  await expect(user.getByTestId("ship-moment")).toBeVisible({ timeout: 15_000 });
  await expect(user.getByTestId("ship-credit")).toBeVisible();
  await expect(live.getByTestId("live-shipped")).toBeVisible();
  await user.getByTestId("ship-rate").click();
  await expect(user.getByTestId("ship-moment")).toBeHidden();
  await expect(user.getByTestId("preview-review")).toBeVisible({ timeout: 15_000 });
  await user.getByTestId("rate-yes").click({ timeout: 10_000 });
  await expect(user.getByText("Thanks, your rating is saved.")).toBeVisible();
  await expect.poll(async () => (await adminState(org, code)).reviews.length).toBe(1);

  await act(org, code, { type: "complete_round" });
  await expect(live.getByText("R1 · Show a progress bar · Completed")).toBeVisible();
});
