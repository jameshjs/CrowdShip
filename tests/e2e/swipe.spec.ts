import { expect, test } from "@playwright/test";
import { act, adminState, createRoom, organizer } from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test("swipe deck: swipe ideas, see where they apply, organizer gets the top 3 pre-selected", async ({ browser }) => {
  const org = await organizer();
  const code = await (async () => {
    const res = await org.post("/api/admin/rooms", { data: { projectName: "Swipe board", githubRepository: "example/demo", productionUrl: BASE, agentProvider: "mock", loadDemoSeed: true } });
    return (await res.json()).code as string;
  })();
  let s = await adminState(org, code);
  const approved = s.proposals.filter((p: { status: string }) => p.status === "approved");
  expect(approved.length).toBe(5);

  // Give one idea a circled location (as if from the widget), so its card shows a live preview.
  const phone = await browser.newPage();
  await phone.goto(`/join/${code}`);
  await phone.getByTestId("join-button").click();
  await expect(phone.getByTestId("home-swipe")).toContainText("Swipe ideas (5)");
  const fb = await phone.request.post(`${BASE}/api/rooms/${code}/feedback`, { headers: { Origin: BASE }, data: {
    type: "general", text: "Make this headline smaller", pageUrl: "/", elementLabel: "Circled area: hero heading",
    region: { x: 20, y: 120, w: 340, h: 140, pageW: 390, pageH: 1200, points: [[20, 120], [360, 120], [360, 260], [20, 260]] },
  } });
  const { id: feedbackId } = await fb.json();
  // Put that idea at the front of the deck: every other idea gets a swipe from someone else first.
  const target = approved[0];
  await act(org, code, { type: "attach_feedback", feedbackIds: [feedbackId], proposalId: target.id });
  const others = await browser.newContext();
  const other = await others.newPage();
  await other.goto(`/join/${code}`);
  await other.getByTestId("join-button").click();
  await expect(other).toHaveURL(new RegExp(`/room/${code}$`)); // joined: guest cookie is set
  const round = (await adminState(org, code)).round;
  for (const p of approved.slice(1)) {
    const r = await other.request.post(`${BASE}/api/rooms/${code}/swipe`, { headers: { Origin: BASE }, data: { roundId: round.id, proposalId: p.id, liked: p.id !== approved[4].id } });
    expect(r.ok()).toBe(true);
  }

  await phone.getByTestId("home-swipe").click();
  const card = phone.getByTestId("swipe-card");
  await expect(card).toHaveAttribute("data-proposal-id", target.id);
  await expect(card.getByTestId("location-frame")).toBeVisible();
  await expect(card.getByTestId("location-frame")).toContainText("hero heading");
  await expect(phone.getByTestId("deck-progress")).toHaveText("0/5");

  // Swipe by dragging right, then with buttons for the rest.
  const box = (await card.boundingBox())!;
  await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await phone.mouse.down();
  await phone.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2, { steps: 8 });
  await phone.mouse.up();
  await expect(phone.getByTestId("deck-progress")).toHaveText("1/5");
  for (const liked of [true, false, true, false]) {
    const saved = phone.waitForResponse((r) => r.url().endsWith("/swipe") && r.ok());
    await phone.getByTestId(liked ? "swipe-yes" : "swipe-no").click();
    await saved;
  }
  await expect(phone.getByTestId("swipe-summary")).toBeVisible();

  // Changed my mind on the target idea: tap to flip it to "no".
  const flipped = phone.waitForResponse((r) => r.url().endsWith("/swipe") && r.ok());
  await phone.locator(`[data-testid="swipe-flip"][data-proposal-id="${target.id}"]`).click();
  await flipped;

  // The last answer can land a moment after the UI updates: wait for the server to settle.
  await expect.poll(async () => (await adminState(org, code)).approvals[target.id]).toEqual({ likes: 0, dislikes: 1 });
  s = await adminState(org, code);
  const total = Object.values(s.approvals as Record<string, { likes: number; dislikes: number }>).reduce((n, a) => n + a.likes + a.dislikes, 0);
  expect(total).toBe(9); // 4 from the other participant + 5 from this one

  // Organizer: top 3 by approval are pre-ticked for the final vote, with approval shown.
  const console_ = await (await browser.newContext({ storageState: await org.storageState() })).newPage();
  await console_.goto(`/admin/${code}`);
  await expect(console_.getByTestId("start-voting")).toHaveText(/Start voting \(3\)/);
  await expect(console_.getByTestId("approval").first()).toContainText("▲");

  // Live screen ranks by crowd approval before the vote.
  const live = await browser.newPage();
  await live.goto(`/room/${code}/live`);
  await expect(live.getByText("Crowd approval")).toBeVisible();
  await expect(live.getByTestId("swipe-arena").getByTestId("approval-meter").first()).toBeVisible();

  // Once the final vote starts, swiping is closed and the Vote tab shows the ballot.
  await console_.getByTestId("start-voting").click();
  await expect.poll(async () => (await adminState(org, code)).round.status).toBe("voting");
  const late = await phone.request.post(`${BASE}/api/rooms/${code}/swipe`, { headers: { Origin: BASE }, data: { roundId: round.id, proposalId: target.id, liked: true } });
  expect(late.status()).toBe(409);
  await phone.reload();
  await expect(phone.getByTestId("vote-card").first()).toBeVisible();
});
