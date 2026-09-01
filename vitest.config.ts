import { defineConfig } from 'vitest/config'

// IM-2: minimal headless config for the store-layer unit tests (node environment —
// the stores are React-free). HE-1 owns extending this into the full harness
// (jsdom + component/e2e cases); kept separate from vite.config.ts so the build
// path stays exactly as IM-1 shipped it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
