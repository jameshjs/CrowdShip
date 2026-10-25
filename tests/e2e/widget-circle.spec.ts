import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { adminState, createRoom, organizer } from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Stand-in for the app under test, served on an allowed widget origin (WIDGET_ALLOWED_ORIGINS).
const APP = "http://localhost:5173";

const PAGE = `<!doctype html><meta name="viewport" content="width=device-width">
  <body style="margin:0;font-family:sans-serif">
    <main style="padding:8px 0 400px">
      <h1 data-testid="title" style="margin:24px">Event tasks</h1>
      <p data-testid="counts" style="margin:24px;padding:16px;background:#eee">2 of 4 done</p>
    </main>
    <script src="${BASE}/widget.js"></script>
  </body>`;

// A real local server (not page.route): Chrome only lets loopback pages load scripts from localhost.
let server: Server | null = null;
test.beforeAll(async () => {
  const s = createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(PAGE));
  server = await new Promise<Server | null>((resolve) => {
    s.once("error", () => resolve(null)); // port taken, e.g. by the demo app's dev server
    s.listen(5173, "localhost", () => resolve(s));
  });
});
test.afterAll(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

test("participant circles an area in the widget and the organizer sees the region", async ({ page }) => {
  test.skip(!server, "Port 5173 is in use (stop the demo app's dev server to run this test)");
  const org = await organizer();
  const code = await createRoom(org);
  await page.goto(`/join/${code}`);
  await page.getByTestId("nickname-input").fill("Cara");
  await page.getByTestId("join-button").click();
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
  const { token } = await (await page.request.post(`/api/rooms/${code}/widget-token`, { headers: { Origin: BASE } })).json();

  await page.goto(`${APP}/?cs_room=${code}&cs_api=${encodeURIComponent(BASE)}#cs_token=${token}`);

  await page.getByTestId("crowdship-fab").click();
  await page.getByTestId("crowdship-circle").click();
  const box = (await page.getByTestId("counts").boundingBox())!;
  const draw = page.getByTestId("crowdship-draw");
  await expect(draw).toBeVisible();

  // Draw a loop around the counts paragraph.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = box.width / 2 + 10;
  const ry = box.height / 2 + 14;
  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  for (let a = 0; a <= Math.PI * 2; a += Math.PI / 12) await page.mouse.move(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  await page.mouse.up();

  await expect(page.getByText("What about this area?")).toBeVisible();
  await page.getByTestId("crowdship-text").fill("This counter is hard to read");
  await page.getByTestId("crowdship-send").click();
  await expect(page.getByText("Thanks! Sent to CrowdShip.")).toBeVisible();

  const s = await adminState(org, code);
  const f = s.feedback.find((x: { text: string }) => x.text === "This counter is hard to read");
  expect(f.type).toBe("general");
  expect(f.element_label).toContain("2 of 4 done");
  expect(f.element_label).not.toContain("Event tasks"); // page wrappers around the circle are not "inside" it
  expect(f.region.points.length).toBeGreaterThanOrEqual(3);
  expect(f.region.y).toBeLessThanOrEqual(Math.round(box.y));
  expect(f.region.y + f.region.h).toBeGreaterThanOrEqual(Math.round(box.y + box.height));
});
