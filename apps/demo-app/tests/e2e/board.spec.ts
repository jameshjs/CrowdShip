import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("shows the seeded tasks and counts", async ({ page }) => {
  await expect(page.getByTestId("task-item")).toHaveCount(3);
  await expect(page.getByTestId("total-count")).toHaveText("3");
  await expect(page.getByTestId("remaining-count")).toHaveText("3");
});

test("adds a task", async ({ page }) => {
  await page.getByTestId("new-task-input").fill("Grab coffee");
  await page.getByTestId("add-task-button").click();
  await expect(page.getByTestId("task-item")).toHaveCount(4);
  await expect(page.getByTestId("total-count")).toHaveText("4");
});

test("completes a task", async ({ page }) => {
  await page.getByTestId("task-checkbox").first().check();
  await expect(page.getByTestId("completed-count")).toHaveText("1");
  await expect(page.getByTestId("remaining-count")).toHaveText("2");
});

test("tasks persist across reloads", async ({ page }) => {
  await page.getByTestId("new-task-input").fill("Persist me");
  await page.getByTestId("add-task-button").click();
  await page.reload();
  await expect(page.getByText("Persist me")).toBeVisible();
});
