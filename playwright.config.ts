import { defineConfig, devices } from '@playwright/test'

// HE-1 e2e harness — chromium-only (plan scope; webkit/firefox would multiply
// maintenance for a portfolio showpiece with no matching acceptance criterion).
//
// The webServer boots `npm run dev` on a PINNED, distinctive port so baseURL is
// stable and no other project's default-port dev server can ever be latched by
// reuseExistingServer (IM-4b environmental finding: a foreign app squatting
// 5173 made every spec fail at its first selector). --strictPort fails fast
// instead of silently hopping; 5180 is deliberately NOT a Vite default.
// reuseExistingServer stays on for a developer's own running server on THIS
// port; a CI run (CI=1) always starts its own.
const PORT = 5180

export default defineConfig({
  testDir: './tests/e2e',
  // e2e lives outside vitest's include (src/**/*.test.*), so the two runners
  // never pick up each other's specs: `npm test` stays unit-only.
  fullyParallel: true,
  // workers: 1 (IM-4b environmental finding): the boot specs' POST-timing
  // assertions (UI-2's ~300ms typing/settle races) flake when parallel
  // chromium workers churn the shared dev server during those windows — a
  // different boot test each run, at 5 workers AND at 2 (even with a retry).
  // Every serial run has been green; the 14-spec suite still lands well under
  // a minute, and the IM-4b fps probe gets an uncontended frame clock.
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // One retry for FAILED tests only — belt-and-braces against a residual
  // POST-timing wobble on loaded machines (a real regression fails twice and
  // stays red). Local matches what CI already did.
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
