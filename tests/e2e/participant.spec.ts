import { expect, test } from "@playwright/test";
import { act, adminState, createRoom, organizer } from "./helpers";

test("participant joins through the QR URL and keeps their identity after refresh", async ({ page }) => {
  const org = await organizer();
  const code = await createRoom(org);
  const t0 = Date.now();
  await page.goto(`/join/${code}`);
  await page.getByTestId("nickname-input").fill("Ada");
  await page.getByTestId("join-button").click();
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
  await expect(page.getByText("Hi Ada")).toBeVisible();
  const joinMs = Date.now() - t0;
  test.info().annotations.push({ type: "time_to_join_ms", description: String(joinMs) });
  expect(joinMs).toBeLessThan(10_000);

  await page.reload();
  await expect(page.getByText("Hi Ada")).toBeVisible();
  await page.goto(`/join/${code}`);
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`)); // already joined: no second identity
  const s = await adminState(org, code);
  expect(s.feedback).toHaveLength(0);
});

test("feedback is submitted in two taps and other participants see it live", async ({ browser }) => {
  const org = await organizer();
  const code = await createRoom(org);
  const a = await browser.newPage();
  const b = await browser.newPage();
  for (const [p, name] of [[a, "Alice"], [b, "Bob"]] as const) {
    await p.goto(`/join/${code}`);
    await p.getByTestId("nickname-input").fill(name);
    await p.getByTestId("join-button").click();
    await expect(p).toHaveURL(new RegExp(`/room/${code}$`));
  }
  await expect(b.getByTestId("activity-feed")).toBeVisible(); // "Latest" on Home

  // Two taps for praise: tile, then send.
  await a.getByTestId("tab-feedback").click();
  await a.getByTestId("quick-praise").click();
  await a.getByTestId("feedback-submit").click();
  await expect(a.getByTestId("feedback-sent")).toBeVisible();

  await a.getByTestId("quick-feature").click();
  await expect(a.getByTestId("feedback-submit")).toBeDisabled(); // ideas need words
  await a.getByTestId("feedback-text").fill("Please add a night theme");
  await a.getByTestId("feedback-submit").click();
  await expect(a.getByTestId("feedback-sent")).toBeVisible();

  // Bob sees it without reloading.
  await expect(b.getByTestId("activity-feed")).toContainText("Alice suggested: \"Please add a night theme\"");

  // And the live dashboard reflects the count.
  const live = await browser.newPage();
  await live.goto(`/room/${code}/live`);
  await expect(live.getByTestId("live-feedback")).toHaveText("2");
});

test("voting: cast, change, live counts, and rejection after close", async ({ browser }) => {
  const org = await organizer();
  const code = await createRoom(org);
  const s = await adminState(org, code);
  const ids = s.proposals.filter((p: { status: string }) => p.status === "approved").map((p: { id: string }) => p.id);
  await act(org, code, { type: "start_voting", proposalIds: ids, durationSeconds: 120 });

  const voter = await browser.newPage();
  await voter.goto(`/join/${code}`);
  await voter.getByTestId("join-button").click();
  await voter.getByTestId("tab-vote").click();
  const live = await browser.newPage();
  await live.goto(`/room/${code}/live`);

  const cards = voter.getByTestId("vote-card");
  await expect(cards).toHaveCount(ids.length);
  await cards.nth(0).click();
  await expect(cards.nth(0).getByTestId("my-vote")).toBeVisible();
  await expect(cards.nth(0).getByTestId("vote-count")).toHaveText("1");

  await cards.nth(1).click(); // change vote
  await expect(cards.nth(1).getByTestId("my-vote")).toBeVisible();
  await expect(cards.nth(0).getByTestId("vote-count")).toHaveText("0");
  await expect(cards.nth(1).getByTestId("vote-count")).toHaveText("1");
  const after = await adminState(org, code);
  expect(Object.values(after.tallies).reduce((n: number, v) => n + (v as number), 0)).toBe(1);

  await act(org, code, { type: "close_voting" });
  // Server rejects late votes; the optimistic UI rolls back.
  const res = await voter.request.post(`/api/rooms/${code}/vote`, {
    data: { roundId: after.round.id, proposalId: ids[2] },
    headers: { Origin: new URL(voter.url()).origin },
  });
  expect(res.status()).toBe(409);
});

test("a participant cannot perform organizer actions or launch an agent", async ({ page }) => {
  const org = await organizer();
  const code = await createRoom(org);
  await page.goto(`/join/${code}`);
  await page.getByTestId("join-button").click();
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
  const origin = new URL(page.url()).origin;
  for (const type of ["approve_development", "start_voting", "close_voting"]) {
    const res = await page.request.post(`/api/admin/rooms/${code}/action`, { data: { type }, headers: { Origin: origin } });
    expect(res.status()).toBe(401);
  }
  const adminPage = await page.request.get(`/api/admin/rooms/${code}`);
  expect(adminPage.status()).toBe(401);
  // Cross-site requests with the participant's cookie are blocked.
  const csrf = await page.request.post(`/api/rooms/${code}/feedback`, { data: { type: "bug", text: "csrf test" }, headers: { Origin: "https://evil.example" } });
  expect(csrf.status()).toBe(403);
});

test("home page room-code form lands on the room's join page on the same host", async ({ page, baseURL }) => {
  const code = await createRoom(await organizer());
  await page.goto("/");
  await page.getByLabel("Room code").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page).toHaveURL(`${baseURL}/join/${code}`); // relative redirect: never the server's internal host
  await expect(page.getByTestId("join-button")).toBeVisible();
});
