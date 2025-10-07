import { expect, test } from "@playwright/test";

test.describe("Verifying Auth Middleware", () => {
  test("should load root page successfully", async ({ page, request }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Library/);
  });
  test("should load login page successfully", async ({ page, request }) => {
    await page.goto("/auth/login");
    await expect(page).toHaveURL(/https:\/\/dev-s8y8lvri.us.auth0.com.*/);
  });
});
