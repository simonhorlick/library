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

  // Wait for redirect back to app after successful login
  // First we should land on /auth/callback
  await page.waitForURL(/auth\/callback.*/, {
    timeout: 5000,
  });

  // Wait for localStorage to have the token (which means auth succeeded)
  // The LoginCallback component will set the token before redirecting
  await page.waitForFunction(
    () => {
      const token = localStorage.getItem("token");
      return token !== null && token !== "";
    },
    { timeout: 10000 },
  );

  // Give React a moment to process the auth state change
  await page.waitForTimeout(1000);

  // Now try to navigate to the books page to verify auth works
  await page.goto("http://localhost:5173/books", {
    waitUntil: "domcontentloaded",
    timeout: 10000,
  });

  // Verify we can access the books page (not redirected back to login)
  await expect(page).toHaveURL(/.*\/books.*/);

  // Save authentication state
  await context.storageState({ path: authFile });
});
