# Testing — the check matrix

One repo, two runners, five gates. The unit runner (Vitest) and the browser
runner (Playwright) own disjoint spec globs, so they never pick up each other's
tests.

## Commands

| Command | What runs | Where |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` over app + scripts + tests + all configs | node |
| `npm run lint` | ESLint over the repo | node |
| `npm run test` | Vitest unit/component suite (`src/**/*.test.{ts,tsx}`) | node (jsdom where opted in per-file) |
| `npm run perf` | Build + size-budget gate (`scripts/perf/run-perf.ts`) — includes a full `tsc --noEmit && vite build` | node, reads `dist/` |
| `npm run test:e2e` | Playwright chromium suite (`tests/e2e/**/*.spec.ts`) — boots `npm run dev` on port 5173 itself | real browser |

- **`npm run check`** = `typecheck && lint && test && perf` — the fast local/CI
  gate. Everything in it is deterministic and needs no browser.
- **Full matrix (CI-ready single command):**
  `npm run check && npm run test:e2e`
  e2e is kept out of `check` because it carries a browser-binary dependency
  (`npx playwright install chromium`) and boots a dev server; a CI lane runs
  the one-liner above and needs nothing else.

## What each gate covers

- **typecheck** — strict TS across the whole program, including the e2e specs
  and config files (so a typo in a selector assertion fails before the browser
  ever launches).
- **lint** — ESLint recommended + react-hooks/react-refresh rules.
- **test** (Vitest, 271 cases today) — pure logic and store/component seams:
  FS ops, schema/migrations, persistence + recovery, WM z-order/geometry,
  app registry, perf instrumentation, WM host components. Node by default;
  files needing a DOM opt in with a `// @vitest-environment jsdom` docblock and
  `fake-indexeddb` provides IndexedDB.
- **perf** — `tsc --noEmit && vite build`, then asserts the committed budgets
  (total JS gz ≤ 250 KB, main chunk gz ≤ 120 KB, fonts raw ≤ 150 KB, CSS gz
  ≤ 40 KB) against `dist/`; exits non-zero on breach.
- **test:e2e** (Playwright, chromium) — the boot smoke skeleton against the
  real app in a real browser: app loads → window host mounts → demo module
  window opens (registry + title bar render) → TH-1's `window.__BOOT_TIMELINE`
  seam exists after load. `playwright.config.ts` starts the dev server on
  `http://localhost:5173` (`--strictPort`, reused if already running locally),
  keeps traces/screenshots only on failure (`test-results/`, gitignored), and
  the runner itself is excluded from `npm test`.

## Growing the matrix

- New unit tests: colocate as `src/**/*.test.ts(x)`.
- New e2e specs: `tests/e2e/<area>.spec.ts`, target stable seams
  (`data-*` attributes, ARIA roles), never pixel/CSS details. UI-2 grows the
  boot spec (≤2s boot-to-desktop from `window.__BOOT_TIMELINE`, skip,
  return-visit short-circuit); IM-4b/IM-5 add drag specs; UI-7 adds the phone
  viewport case.
- First run on a machine: `npx playwright install chromium` once
  (`npx playwright install --with-deps chromium` on fresh Linux CI images).
