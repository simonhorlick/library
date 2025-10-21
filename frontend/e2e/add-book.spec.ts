import { test, expect } from "@playwright/test";

test.describe("Add New Book Page", () => {
  test("should display form elements correctly", async ({ page }) => {
    // Note: This is a basic test structure
    // In a real environment, you'd need to handle authentication first

    await page.goto("/books/new");

    // Check that the form elements are present
    await expect(page.locator("h1")).toContainText("Add New Book");
    await expect(page.locator('input[id="isbn"]')).toBeVisible();
    await expect(page.locator('input[id="title"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText(
      "Add Book"
    );
    await expect(page.locator('button[type="button"]')).toContainText("Cancel");
  });

  test("should show validation error for empty fields", async ({ page }) => {
    await page.goto("/books/new");

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show error modal
    await expect(page.locator("text=Error Creating Book")).toBeVisible();
    await expect(
      page.locator("text=Both ISBN and title are required")
    ).toBeVisible();
  });

  test("should navigate back to books list on cancel", async ({ page }) => {
    await page.goto("/books/new");

    // Mock the navigation
    await page.click('button[type="button"]');

    // Should navigate to /books/
    await expect(page.url()).toContain("/books/");
  });
});
