import { defineConfig, devices } from '@playwright/test'

// HE-1 e2e harness — chromium-only (plan scope; webkit/firefox would multiply
// maintenance for a portfolio showpiece with no matching acceptance criterion).
//
// The webServer boots `npm run dev` on a PINNED port so baseURL is stable and
// a stray dev server never collides (--strictPort fails fast instead of
// silently hopping to 5174). reuseExistingServer lets a developer's running
// `npm run dev` be reused locally; a CI run (CI=1) always starts its own.
export default defineConfig({
  testDir: './tests/e2e',
  // e2e lives outside vitest's include (src/**/*.test.*), so the two runners
  // never pick up each other's specs: `npm test` stays unit-only.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
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
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
