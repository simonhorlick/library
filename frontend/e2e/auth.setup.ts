import { test as setup, expect } from "@playwright/test";

const authFile = ".auth/user.json";

setup("authenticate", async ({ page, context }) => {
  // Navigate to login page
  await page.goto("/auth/login");
  await page.waitForLoadState("domcontentloaded");

  // Wait for Auth0 login page
  await page.waitForURL(/.*auth0\.com.*/);

  // Fill in Auth0 login form
  await page.getByLabel("Email address").fill(process.env.TEST_USER_EMAIL!);

  // Click Continue to proceed to password screen (or submit if combined form)
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Wait a moment for navigation or password field to appear
  await page.waitForTimeout(1000);

  // Fill password - try textbox role first, fallback to label
  const passwordField = page
    .getByRole("textbox", { name: "Password" })
    .or(page.getByLabel("Password", { exact: true }));
  await passwordField.fill(process.env.TEST_USER_PASSWORD!);

  // Click Continue/Login button
  await page.getByRole("button", { name: /^Continue$|^Log in$/ }).click();

  // After Auth0 authenticates, the browser is redirected through
  // /auth/callback (which exchanges the code for a token and stores it) and
  // then on to /books/. The callback redirect is transient so we wait for the
  // final destination instead.
  await page.waitForURL(/\/books/, { timeout: 15000 });

  // Verify we can access the books page (not redirected back to login)
  await expect(page).toHaveURL(/.*\/books.*/);

  // Save authentication state
  await context.storageState({ path: authFile });
});
