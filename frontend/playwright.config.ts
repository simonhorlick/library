import { defineConfig, devices } from "@playwright/test";

/** See https://playwright.dev/docs/test-configuration. */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",

  use: {
    baseURL: "http://localhost:4173",
    // trace: 'on-first-retry',
    // screenshot: 'only-on-failure',

    // Increase timeouts for service worker operations
    actionTimeout: 10000,
    navigationTimeout: 10000,
  },

  // Increase global timeout for service worker tests
  timeout: 30000,

  projects: [
    // Setup project - runs first to authenticate
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use the authenticated state for all tests
        storageState: ".auth/user.json",
      },
      dependencies: ["setup"],
    },
    // Unauthenticated tests (login flow testing)
    {
      name: "chromium-no-auth",
      testMatch: /.*login\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // No storageState - starts fresh
      },
    },
  ],

  webServer: {
    command: "npm run preview",
    port: 4173,
    stdout: "pipe",
    reuseExistingServer: !process.env.CI,
  },
});
