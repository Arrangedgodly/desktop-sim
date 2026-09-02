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
| `npm run test:e2e` | Playwright chromium suite (`tests/e2e/**/*.spec.ts`) — boots `npm run dev` on port 5180 itself | real browser |

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
- **test** (Vitest, 954 cases today) — pure logic and store/component seams:
  FS ops, schema/migrations, persistence + recovery, WM z-order/geometry,
  app registry, perf instrumentation, WM host components. Node by default;
  files needing a DOM opt in with a `// @vitest-environment jsdom` docblock and
  `fake-indexeddb` provides IndexedDB.
- **perf** — `tsc --noEmit && vite build`, then asserts the committed budgets
  (total JS gz ≤ 250 KB, main chunk gz ≤ 120 KB, fonts raw ≤ 150 KB, CSS gz
  ≤ 40 KB) against `dist/`; exits non-zero on breach.
- **test:e2e** (Playwright, chromium, 101 specs today) — the full functional
  suite against the real app in a real browser: boot, desktop, drag/resize
  fps, taskbar, keyboard journey, every app, resilience, edges, notice, the
  DD-2 accessibility gates — plus the TH-2 perf/soak gates, which ride the
  PRODUCTION build via their own `vite preview` server (see "Perf e2e"
  below).
  `playwright.config.ts` starts the dev server on
  `http://localhost:5180` (`--strictPort`, reused if already running locally),
  keeps traces/screenshots only on failure (`test-results/`, gitignored), and
  the runner itself is excluded from `npm test`.

## Accessibility gates (DD-2)

`tests/e2e/a11y.spec.ts` carries the audit in two halves:

- **Axe surfaces** — axe-core (a devDependency, never in the bundle; its
  script source is read via `createRequire` and injected into the page —
  `addScriptTag` works because the DEV CSP carries the documented
  'unsafe-inline' relaxation; the shipped strict CSP never sees any of this)
  over 15 surfaces: boot POST, desktop, explorer, notepad clean + guard,
  viewer, settings seated + armed, atlas index + plate, about, the 390px
  notice, an open ground menu, the destructive confirm row, and the injected
  module-fault card. Gate: ZERO critical/serious findings; every
  moderate/minor finding is printed (`[axe] …`) for the production log's
  disposition table. The boot scan installs axe as an init script (CDP,
  pre-app, CSP-free) and scans the POST tableau inside its ~1.3s window —
  freezing the clock does NOT work there (axe's own scheduler rides page
  timers).
- **Checklist gates** — focus-visible beams on every interactive family
  (ground, icons, taskbar pull + LEDs, plate swatches, guard cover),
  focus traps (notepad guard strip — a REAL DD-2 fix, the alertdialog now
  traps Tab — and the ground menu), reduced-motion coverage of every
  authored moment via computed animation/transition durations (caret blink,
  guard rail slide, about stamp, atlas page turn, icon-trail + window
  shimmer pseudo-elements), 200% zoom operability (1024×576 desktop — the
  phone gate owns every logical width below 1024 by design — and 195×422
  notice), and a screen-reader smoke expressed as DOM/ARIA assertions
  (roles, names, idref resolution) — the honest headless proxy, documented
  as such in the production log.

`tests/e2e/boot.spec.ts` holds the two boot-contract a11y gates: the
static-POST spec (durable via a MutationObserver + `__BOOT_TIMELINE`, never
by polling the transient POST DOM) and the reduced-motion-follow seam spec
(follow=OFF demands the RESUME flash; follow=ON holds still). The observers
watch `document` — NOT `document.documentElement`, which does not exist when
an init script runs (an observe(null) throw kills the observer silently;
found the hard way, see the DD-2 log).

## Growing the matrix

- New unit tests: colocate as `src/**/*.test.ts(x)`.
- New e2e specs: `tests/e2e/<area>.spec.ts`, target stable seams
  (`data-*` attributes, ARIA roles), never pixel/CSS details. UI-2 grows the
  boot spec (≤2s boot-to-desktop from `window.__BOOT_TIMELINE`, skip,
  return-visit short-circuit); IM-4b/IM-5 add drag specs; UI-7 adds the phone
  viewport case.
- First run on a machine: `npx playwright install chromium` once
  (`npx playwright install --with-deps chromium` on fresh Linux CI images).

## The demo fixture (TH-2)

The IM-3 demo module (`src/apps/demo/`) is a **test-only fixture** — it left
the shipped fleet in TH-2 (`src/apps/index.ts` registers exactly the six
reserved apps; `src/apps/apps.test.ts` gates the list; the production build
emits no demo chunk). Specs that want a cheap multi-instance module reach it
through the registry's public seam, never through the startup array:

- **Unit specs** import it directly: `import { demoApp } from '../apps/demo'`
  then `registerApp(demoApp)` / `registerApps([demoApp])` — see
  `settings.test.tsx` (reset closes its two foreign windows) and
  `notepad.test.tsx` (the late text-declaring rival that must LOSE the
  first-declaration routing tiebreak).
- **e2e specs** call `registerDemoModule(page)` (`tests/e2e/e2e-helpers.ts`):
  a page-context dynamic import of the dev-server modules
  (`/src/apps/demo/index.ts` + the registry barrel) — the same real-store
  import pattern the UI-4 wallpaper spec and the HU-2 probes use. Consumers:
  `taskbar.spec` (multi-instance LEDs), `resilience.spec` (the fault
  subject), `interactions.spec` (the drag/resize probe windows).

## Perf e2e (TH-2)

`tests/e2e/perf.spec.ts` and `tests/e2e/soak.spec.ts` run against the
**production build**, not the dev server: `startPreviewServer()`
(`e2e-helpers.ts`) serves `vite preview` on `127.0.0.1:5181` (bound IPv4
deliberately — vite preview's default `[::1]`-only listen is unreachable from
Node's IPv4-first fetch) and builds first when `dist/` is missing or stale
relative to `src/`, so a fresh `npm run perf`/`npm run build` output is reused
as-is.

- **Boot median** (`test.slow()`): 5 fresh-context first visits under CDP
  4x CPU throttle + fast 3G (150ms RTT, 1.6 Mbps down / 750 kbps up);
  asserts the median `desktop-ready` milestone ≤3s. The unthrottled ≤2s gate
  stays in `boot.spec.ts`.
- **Render cost** (unthrottled): explorer open + scroll, notepad + 100 typed
  chars, viewer to the 400% clamp — asserts ZERO `longtask` entries (≥50ms is
  the spec's own floor) after arming the collector post-desktop-ready.
- **Soak**: open all six shipped apps + close them all, ×5; GC then sample
  CDP DOM counters (`nodes` — detached nodes survive GC and count),
  `Performance.getMetrics` JSHeapUsedSize, and the live document tree;
  generous bounds (nodes ≤ first+1,000 and ≤2x; live tree ±25%; heap
  ≤ first+24 MB) that catch leaks, not allocator noise.

## Fault injection (HU-1)

The resilience surfaces (per-window MODULE FAULT card, OS-level CONSOLE FAULT
plate, storage notice card) are tested by FAULTING the real graph — there is
no fault-specific UI anywhere; the hooks only make real modules fail.

**Dev/test hooks** — `src/platform/app-registry/fault-injection.tsx`:

- `armAppFault(appId, 'render')` — the app's content throws during render.
- `armAppFault(appId, 'chunk')` — the app's lazy load rejects with the
  browser's real network-shaped `TypeError` (same Suspense → lazy-rejection →
  boundary path as a genuine failed transfer).
- `disarmAppFault(appId)` / `clearInjectedFaults()` — e2e disarms before
  pressing the card's Reload module; unit tests clear between cases.

**How they are reached** (both, deliberately, never ship in prod):

1. **Unit tests** import the module directly (`fault-injection.test.tsx`).
2. **e2e** visits `/?injectFaults=1`: the bootstrap in `fault-seam.tsx` loads
   the hooks chunk and exposes `window.__holdFaults = { arm, disarm, clear }`
   for `page.evaluate`. The seam itself (`renderFault(appId)`) is the only
   shipped code — a few always-null bytes unless a renderer is installed.

**Prod guarantee:** the bootstrap is gated on `import.meta.env.DEV`; Vite
replaces that with `false` in a production build, rollup dead-code-eliminates
the dynamic `import()`, and the fault-injection chunk is **not emitted into
`dist/` at all** (verified after every HU-1-adjacent build by grepping
`dist/` for `__holdFaults` / `fault-injection` — both must return nothing).

**Honest failure paths that need no hooks at all** (used by
`tests/e2e/resilience.spec.ts`):

- A REAL chunk-load failure: `page.route('**/apps/<id>/<Surface>*', route =>
  route.abort())` — a genuine network fault, no code hook involved.
- A REAL storage recovery: corrupt the IndexedDB state envelope directly
  (`indexedDB.open('desktop-sim')` → put garbage at `desktop-sim/state`) and
  reload — MF-2's boot recovery path surfaces the ARCHIVE RECOVERED notice.
- The QUOTA notice cannot be forced honestly in a real browser (storage quota
  is not fakable without lying) — it is unit-level only, driving MF-2's real
  `useStorageStatusStore` surfaces (`storage-notices.test.tsx`). The OS-level
  CONSOLE FAULT plate likewise has no honest real-browser shell-fault seam —
  it is unit-level with the real `resetDesktop` seam mocked
  (`ConsoleFaultBoundary.test.tsx`).

## Edge hardening (HU-2)

Every recorded edge case carries its own named test block — greppable by the
`HU-2 (x)` prefix, colocated with the module that owns the edge:

| Edge | Unit home | e2e home |
| --- | --- | --- |
| (a) close-request/veto seam | `wm-store.test` + `WindowHost.test` (✕/Esc veto) + `registry.test` (`appCloseGuardFor`) + `notepad.test` (dirty vetoes, clean/unmounted default to close) | `edges.spec` gate 1 — the ✕ interposes the notepad strip, clean ✕ closes |
| (b) launch-rebind + draft persistence | `wm-store.test` (`rebindWindow`/`setWindowAppState`) + `notepad.test` (draft rides the record, reload restores the SAME draft, accession rebinds + dedupes, saved-draft reload binds) + `validate.test` carries `appState` | `edges.spec` gate 5 — untitled draft survives reload, naming rebinds, reopen dedupes |
| (c) empty folders | `explorer.test` (static empty state, delete-last-child live swap, ground menu still offered) | covered by AP-1's existing explorer specs |
| (d) long names | per-surface: `explorer.test` (card/row/crumb title + CSS clamp law), `notepad.test`, `viewer.test`, `DesktopSurface.test` (icon), `TaskbarRail.test` (LED label law + clamp) | `edges.spec` gate 4 — icon clamp + title attrs + title-bar ellipsis + LED clamp, real Chromium computed styles |
| (e) delete-open-file | pre-existing + verified: `notepad.test` (SPECIMEN REMOVED incl. restored-after-death), `viewer.test` (PLATE REMOVED), `explorer.test` (deleted-drawer → hold fallback) | covered by AP-2/AP-3 specs |
| (f) offscreen recovery | `geometry.test` (`viewportRecovery`) + `WindowHost.test` (hydrate commits the clamp, minimized included, on-screen untouched) | `edges.spec` gate 3 — envelope patched offscreen at the real IDB boundary, reload clamps, first drag stays in view |
| (g) reload mid-op | `autosave.test` (pagehide flush pinned pre-HU-2 + interrupted-move whole-or-stale consistency across both instants) | notepad/viewer reload specs (the 1500ms/700ms settle windows) |
| (h) rename-while-open | `notepad.test` + `viewer.test` (header + WM title follow) + `registry.test` (`titleForLaunch`) | `edges.spec` gate 2 — external desktop rename lands in header + title bar after rail restore |
| (i) rapid double-open | `wm-store.test` + `registry.test` (25-race bursts: same file → 1, two files → 2, singleton → 1, launcher → N) | the dblclick/Enter races share the same store seam (unit-pinned) |
| (j) storage disabled | `boot-flag.test` (throwing/absent localStorage) + `persistence.test` (lockdown boot: both stores failing → read-only in-memory session, honest notice; adapter-construction guard) | HU-1's resilience spec covers the real corrupted-IDB path; no honest real-browser localStorage-lockdown seam — unit-level against the real boot, reasoned as for quota |

**One e2e-methodology note (recorded for the next worker):** a dev server left
running across source edits serves the module graph with HMR-invalidated
`?t=` URLs — a spec's clean-URL `import('/src/...')` then mints a SECOND store
instance and store-driven specs fail in ways that look like product defects
(this run's first e2e pass: 8 failures, all environmental). Kill port 5180 and
re-run before believing a failure of that shape. `edges.spec` avoids the
pattern entirely: its offscreen gate patches the persisted envelope at the raw
IndexedDB boundary (the resilience-spec precedent).
