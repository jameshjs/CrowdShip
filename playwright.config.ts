import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running CrowdShip stack (web on :3000 + worker + local Supabase).
 * Start them with `pnpm dev` and `pnpm worker` first; the full mock flow needs the worker.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["iPhone 15"], browserName: "chromium" } }],
});
