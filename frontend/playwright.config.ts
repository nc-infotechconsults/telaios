import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for swe-ai-platform frontend E2E tests.
 *
 * Tests run against the Vite dev server in demo mode (VITE_DEMO_MODE=true),
 * so no backend services are required — all API calls return hardcoded
 * mock data from src/demo/data.ts.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: "http://localhost:5173",
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
    command: "bunx vite --mode demo",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
