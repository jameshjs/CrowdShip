import { expect, test } from "@playwright/test";

test("browse the menu, build an order, and check out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Harbour Café" })).toBeVisible();
  await expect(page.getByTestId("checkout")).toBeDisabled();

  await page.getByTestId("category-bakery").click();
  await expect(page.getByTestId("menu-item-croissant")).toBeVisible();
  await expect(page.getByTestId("menu-item-flat-white")).toHaveCount(0);
  await page.getByTestId("add-croissant").click();

  await page.getByTestId("category-coffee").click();
  await page.getByTestId("add-oat-latte").click();
  await page.getByTestId("inc-oat-latte").click();
  await expect(page.getByTestId("qty-oat-latte")).toHaveText("2");
  await expect(page.getByTestId("cart-count")).toHaveText("3 items");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$13.75");
  await expect(page.getByTestId("cart-total")).toHaveText("$14.85");

  await page.getByTestId("dec-oat-latte").click();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$8.75");

  await page.getByTestId("checkout").click();
  await expect(page.getByTestId("order-confirmation")).toContainText("placed");
  await expect(page.getByTestId("cart-count")).toHaveText("0 items");
});
