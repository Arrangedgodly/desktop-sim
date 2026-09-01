import { defineConfig } from 'vitest/config'

// IM-2: minimal headless config for the store-layer unit tests (node environment —
// the stores are React-free). IM-4a: include extended to component tests; those
// opt into jsdom with a `// @vitest-environment jsdom` docblock so store tests
// keep the cheap node default. HE-1 owns extending this into the full harness
// (+ Playwright); kept separate from vite.config.ts so the build path stays
// exactly as IM-1 shipped it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
