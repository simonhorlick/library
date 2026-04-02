import { test, expect } from "@playwright/test";

test.describe("Add New Book Page", () => {
  test("should display form elements correctly", async ({ page }) => {
    await page.goto("/books/new");

    // Check that the form elements are present.
    await expect(page.locator('input[id="isbn"]')).toBeVisible();
    await expect(page.locator('input[id="title"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText(
      "Add Book",
    );
  });

  test("should show validation error for empty fields", async ({ page }) => {
    await page.goto("/books/new");

    // Submit the empty form to trigger valibot field-level validation.
    await page.click('button[type="submit"]');

    // The isbn and title fields both have minLength(1), so submitting empty
    // values should produce per-field error messages rendered next to each
    // input.
    const isbnError = page.locator('input[id="isbn"]').locator("..");
    await expect(isbnError).toContainText("Invalid length");

    const titleError = page.locator('input[id="title"]').locator("..");
    await expect(titleError).toContainText("Invalid length");
  });
});
