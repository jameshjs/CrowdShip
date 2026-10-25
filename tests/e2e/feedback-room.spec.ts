import { expect, test } from "@playwright/test";
import { act, adminState, organizer } from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test("feedback-only room for a site you don't own: feedback → vote → published results + report", async ({ browser }) => {
  const org = await organizer();
  const orgPage = await (await browser.newContext({ storageState: await org.storageState() })).newPage();

  // Organizer creates a feedback-only session through the UI.
  await orgPage.goto("/admin");
  await orgPage.getByTestId("mode-feedback").click();
  await expect(orgPage.getByText("Approved GitHub repository")).toBeHidden();
  await orgPage.getByTestId("create-name").fill("Example.com review");
  await orgPage.getByTestId("create-url").fill("https://example.com/");
  await orgPage.getByTestId("create-room").click();
  await expect(orgPage).toHaveURL(/\/admin\/[A-Z0-9]+$/);
  const code = orgPage.url().split("/").pop()!;
  await expect(orgPage.getByText("Feedback only")).toBeVisible();
  await expect(orgPage.getByTestId("report-panel")).toBeVisible();

  // Participant: plain link to the external site (no CrowdShip token), feedback with a location.
  const phone = await browser.newPage();
  await phone.goto(`/join/${code}`);
  await phone.getByTestId("join-button").click();
  await expect(phone.getByText("What would make this site better?")).toBeVisible();
  const popup = phone.waitForEvent("popup");
  await phone.getByRole("button", { name: "Open the website" }).click();
  const site = await popup;
  expect(site.url()).toBe("https://example.com/"); // never ?cs_room / #cs_token for sites we don't own
  await site.close();

  await phone.getByTestId("tab-feedback").click();
  await phone.getByTestId("quick-bug").click();
  await phone.getByTestId("feedback-text").fill("The More information link is hard to find");
  await phone.getByTestId("feedback-location").fill("home page");
  await phone.getByTestId("feedback-submit").click();
  await expect(phone.getByTestId("feedback-sent")).toBeVisible();

  // Organizer turns it into a proposal, runs a vote, publishes results.
  await act(org, code, { type: "proposal_create", data: { title: "Make the info link easier to find", description: "", requirements: [], acceptanceCriteria: [], complexity: "small" } });
  const s = await adminState(org, code);
  const feedbackItem = s.feedback.find((f: { text: string }) => f.text.startsWith("The More information"));
  expect(feedbackItem.element_label).toBe("On the site: home page");
  const proposal = s.proposals.find((p: { title: string }) => p.title === "Make the info link easier to find");
  await act(org, code, { type: "proposal_status", proposalId: proposal.id, status: "approved" });
  await act(org, code, { type: "attach_feedback", feedbackIds: [feedbackItem.id], proposalId: proposal.id });
  await act(org, code, { type: "start_voting", proposalIds: [proposal.id], durationSeconds: 60 });
  await phone.getByTestId("tab-vote").click();
  const voted = phone.waitForResponse((r) => r.url().endsWith("/vote") && r.ok());
  await phone.locator(`[data-testid="vote-card"][data-proposal-id="${proposal.id}"]`).click();
  await voted;
  await act(org, code, { type: "close_voting" });

  const live = await browser.newPage();
  await live.goto(`/room/${code}/live`);
  await expect(live.getByTestId("live-results")).toContainText("Make the info link easier to find");

  await orgPage.reload();
  await expect(orgPage.getByTestId("approve-development")).toHaveCount(0);
  await orgPage.getByTestId("publish-results").click();
  await expect.poll(async () => (await adminState(org, code)).round.number).toBe(2);

  await phone.getByTestId("tab-home").click();
  await expect(phone.getByTestId("last-result")).toContainText("Make the info link easier to find");
  await expect(live.getByText("R1 · Make the info link easier to find · Completed")).toBeVisible();

  // Report: Markdown and CSV, organizer only.
  const md = await org.get(`/api/admin/rooms/${code}/report?format=md`);
  expect(md.headers()["content-type"]).toContain("text/markdown");
  const body = await md.text();
  expect(body).toContain("Make the info link easier to find (top pick)");
  expect(body).toContain("On the site: home page");
  const csv = await (await org.get(`/api/admin/rooms/${code}/report?format=csv`)).text();
  expect(csv.split("\r\n")[0]).toBe('"rank","proposal","votes","swipe_likes","swipe_dislikes","supporters","top_pick","description","requirements","quotes"');
  expect((await phone.request.get(`${BASE}/api/admin/rooms/${code}/report`)).status()).toBe(401);
});
