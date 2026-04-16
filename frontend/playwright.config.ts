import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for swe-ai-platform frontend E2E tests.
 *
 * Tests run against a real backend stack (data-api + agent-service).
 * globalSetup seeds the required projects/plans/tasks and writes browser
 * auth state to e2e/fixtures/.auth.json so every test starts authenticated.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: "http://localhost:5173",
    storageState: "./e2e/fixtures/.auth.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "bunx vite",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
