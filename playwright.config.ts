import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests (Playwright). Targets PLAYWRIGHT_BASE_URL (a running app
 * — local `next dev`/`next start`, or a deployed preview URL). Run with
 * `npm run e2e`. Kept out of the unit-test (vitest) and required-CI path so a
 * browser/runtime dependency never gates merges; wire into a dedicated CI job
 * with Postgres + a built app when you want it gating.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
