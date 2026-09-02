# Federated Build Sessions — Terminal · Paint · DAW

**COM-2 deliverable.** Three ready-to-paste session prompts, one per federated
app decided at the town hall (decision #6: Terminal, Paint, basic DAW — each
built in its own future session against this platform, without forking it).
Each prompt below is **self-contained**: a fresh session with no prior context
needs nothing but this repo and the one prompt block.

The platform side of every prompt is the same deal, from
[docs/APP-CONTRACT.md](APP-CONTRACT.md): *the platform is not yours to build
and not yours to edit.* An app is one folder (`src/apps/<id>/`) plus one line
in `src/apps/index.ts`. Everything else — window chrome, focus, drag, taskbar,
persistence, boot, fault isolation — is already built and already tested.

## How to start a session

1. Open a **new** agent session with its working directory at this repository
   (`desktop-sim/`). Nothing from any prior session carries over.
2. Paste **one** prompt block below — verbatim, from its opening line to its
   final line — as the first message.
3. The session runs its own pipeline starting at plan-it-out (scoping is
   already settled inside the prompt). Stay available for its review gates and
   for the hard questions it is instructed to surface rather than decide.
4. One app per session. The three are independent; order does not matter.
   Expect each session to end with its own plan, implementation, tests, and a
   green `npm run check && npm run test:e2e`.
5. Before pasting, make sure the working tree is clean
   (`git status --porcelain` — the only expected untracked entries are the
   documented `.impeccable/` and `PRODUCT.md`) so the session's commits stay
   honest.

What you should see at the end of each session: a new module in the launcher,
opening in a real window, honoring the world (The Survey Archive), adding zero
bytes of platform edits, and passing every existing gate plus its own new
tests.

## The three apps at a glance

| Session | App id | Shipped name (suggested) | World lane | Instance model |
| --- | --- | --- | --- | --- |
| 1 | `terminal` | Catalog Terminal | a PHOSPHOR WELL app (amber, B612 Mono, scanlines) | singleton |
| 2 | `paint` | Plate Painter | a SPECIMEN PLATE app (parchment + ink) | multi-instance, one window per plate/draft |
| 3 | `daw` | Survey Sequencer | a CONSOLE INSTRUMENT RACK (hardware toggles, well grid) | singleton |

Baseline headroom the sessions inherit (production build, post COM-1):
total JS ≈ 114.1 / 250 KB gz, main chunk ≈ 88.0 / 120 KB gz. A lazy app
surface costs main nothing beyond its small manifest + icon.

---

## Session 1 — TERMINAL

```text
You are running the $ultron-supreme pipeline in the repository at
/Users/arrangedgodly/Documents/Projects/desktop-sim (cwd). You are building
ONE federated app: a Terminal for the HOLD/OS desktop simulator.

PIPELINE SHAPE: start at plan-it-out. Assembly and scoping are ALREADY
SETTLED — this prompt is the approved town-hall equivalent; do not re-run
assembly, do not re-open scope. Then run your own production lane
(production-supreme) with your own task breakdown, and finish with your own
verification pass. Task cap 20 dispatched tasks per run applies; this app is
small (2–4 tasks).

READ FIRST, in this order, before planning anything:
1. docs/APP-CONTRACT.md — the entire interface between your app and the
   platform. The TypeScript types are the contract; the code decides.
2. docs/ultron/design-brief.md — the world law (The Survey Archive). Its
   "Direction contract blocks" are law. Note well: amber phosphor lives ONLY
   inside recessed display wells; brass only at hardware touchpoints;
   parchment is the content surface for text-heavy reading; oxide red is
   warnings/destructive ONLY.
3. README.md, section "Add your own app".
4. docs/KEYBOARD.md — the keyboard map your app joins.
5. docs/TESTING.md — the check matrix you must keep green.
6. src/apps/notepad/ — the freshest full-contract reference app (lazy mount,
   FS commits, dirty guard, appState draft persistence, rebind on save).

THE PRODUCT (one paragraph). A Catalog Terminal: a believable amber-phosphor
shell sitting over the SAME living archive the whole desktop runs on. Every
command reads or mutates the real in-browser filesystem — ls shows what is
really in the drawer, mkdir puts a real specimen on the desktop, cat prints
what the notepad would edit, and the signature `accession` command walks the
whole specimen catalog with its accession codes. It is the power-user moment
of the portfolio: the visitor who types `help`, grins, and starts poking the
archive from a command line — and everything they do persists across reloads
because it is the same store underneath. Target user: the portfolio visitor
(recruiter or engineering peer) exploring the exhibit, plus the author
extending the platform later.

NON-GOALS (fixed): NOT a real shell — no eval, no Function constructor, no
dynamic code execution of any kind (HARD RULE, see acceptance). No pipes,
redirection, scripting, variables, or process model. No network access. No
tabs or split panes. No theming. No platform changes of any kind.

WORLD LAW for this app: the terminal is a PHOSPHOR WELL app — the one app
that is ALL display well and no parchment. Window content = a recessed well
(deepest ground), amber monochrome text, B612 Mono, subtle scanlines built
from cheap repeating CSS gradients (never canvases, never filters). Follow
the existing primitives: .well / .scanlines / .bevel-* / .engraved in
src/styles/global.css, tokens from src/styles/tokens.css (--phosphor,
--phosphor-bright, --phosphor-dim, --phosphor-glow, --well-ground,
--font-mono). ALL ink from tokens — no raw hex anywhere in your CSS (repo
convention, grep-tested elsewhere; do the same to yourself). Reduced motion
is honored (the caret blink collapses under prefers-reduced-motion; no
scroll or flicker effects). The command line prompt must read in-world and
carry the current directory (exact wording is yours; accession codes are the
right vocabulary).

CONTRACT LAW: zero platform edits are expected. Platform-owned (a diff on
any of these at the end of your session = failure): src/platform/**,
src/lib/**, src/styles/**, src/main.tsx, index.html, vite.config.ts,
package.json. Your entire app lives in src/apps/terminal/. If the contract
cannot express something you need — STOP and surface it to the user with the
specific seam; that is a HALT, not something you work around by forking.
Sanctioned edits beyond your folder, all app-side:
- ONE manifest line in src/apps/index.ts, inserted immediately BEFORE the
  settingsApp line (keeps the launcher's stable order: notepad stays the
  first item — that floor is e2e-pinned — and Console Settings keeps the
  closing run).
- src/apps/apps.test.ts pins the shipped fleet (exact id order + "every id
  is reserved"). Your id is NOT one of the platform's six reserved ids —
  update this test honestly to the new fleet (the established "honest
  unfreeze" pattern: keep its intent — no demo, every reserved id still
  ships, every mount retryableLazy, order still pinned — now including
  'terminal').
- docs/KEYBOARD.md: add your app's keys to the "Inside apps" table.
- Your own tests (colocated *.test.ts(x)) and your own e2e specs under
  tests/e2e/.

REPO FACTS (verified; rely on them):
- React 19 + TypeScript strict + Vite; Zustand v5. Static bundle, no
  backend, no network. Node ^20.19.0 || >=22.12.0.
- The manifest: id 'terminal' (kebab-case, matches APP_ID_PATTERN; NOT a
  reserved id — that is fine, registration is the standard path), name
  (suggested in-world: "Catalog Terminal"), a render-only SVG icon
  component, mount = retryableLazy(() => import('./TerminalSurface')) from
  src/platform/app-registry/lazy-mount.tsx (default-export the surface!),
  singleton: true (one terminal window ever; re-open raises + focuses it),
  defaultGeometry {w, h} to taste. Do NOT declare acceptedFileTypes.
- Filesystem access: pure ops from src/lib/fs (findNode, listChildren,
  pathOf, createNode, renameNode, moveNode, deleteNode) applied through the
  store's ONLY mutation seam:
  useFSStore.getState().commit(op(useFSStore.getState().fs, ...)).
  Ops throw typed FSError — catch before committing and render the error
  in-world. Read src/apps/notepad/NotepadSurface.tsx for the living pattern;
  src/lib/fs/types.ts for node shapes (kind folder|text|image|app-link,
  accession codes DRW-/SPC-/PLT-/MOD-####, root id 'root').
- Persistence is automatic: commits to the FS store ride the debounced
  IndexedDB envelope (reload restores everything). Per-window session state
  (cwd + command history) should ride the WM window record via
  setWindowAppState(windowId, payload) — structured-clone-safe payload,
  validate defensively on read (it crossed the persistence boundary). The
  notepad's draft pattern (src/apps/notepad/notepad-model.ts) is the
  reference.
- Close/focus your window: useWMStore.getState().closeWindow(windowId).
  Esc inside your window: apps get FIRST claim (docs/KEYBOARD.md Esc
  precedence) — claim it to clear the current input line, document it in
  KEYBOARD.md.
- Sounds (optional, tasteful): playCue('menu-select') from src/lib/audio on
  command commit. playCue is the only sanctioned cue boundary; it no-ops
  while the console is muted (soundsEnabled defaults to false in the
  settings store). NEVER touch src/lib/audio itself.
- Keyboard: the input line owns its typing keys (the OS input-field law);
  pull focus into the line on window open (the notepad-sheet precedent);
  Up/Down walk command history. Global chords F6 / Alt+Esc are not yours.
- Testing matrix: npm run check (typecheck + lint + vitest + perf) and
  npm run test:e2e (Playwright chromium; first run on a machine needs
  `npx playwright install chromium` once; it boots its own dev server on
  port 5180 — if specs fail weirdly after source edits, kill the stale
  server on 5180 and re-run; documented in docs/TESTING.md). Budgets the
  perf gate enforces: total JS ≤ 250 KB gz, main chunk ≤ 120 KB gz, fonts
  ≤ 150 KB raw, CSS ≤ 40 KB gz. Baseline ~114.1 / ~88.0 KB gz. Your surface
  ships as its own lazy chunk; main may grow only by your manifest + icon
  (keep it tiny).
- The strict CSP in index.html allows no off-origin anything; the privacy
  e2e audits the production build for external requests. Everything you do
  is local by construction — keep it that way.
- Session artifacts (your plan, log, state) go under docs/ultron/sessions/
  (create it; e.g. terminal-plan.md). NEVER edit the platform records in
  docs/ultron/ (plan.md, production-log.md, state.md, town-hall.md,
  design-brief.md) — they are frozen history. design-brief.md is read-only
  law.
- Commit per completed task, message prefixed with the app (e.g.
  "terminal: shell surface + fs ops"). Never commit unrelated changes.

APP SPEC:
- Commands (the floor — refine wording, not scope): help, clear, pwd,
  ls [path], cd <path>, cat <file> (text specimens; refuse others
  in-world), mkdir <name>, touch <name> (creates a text specimen), rm <name>
  (deletes a specimen or an EMPTY drawer; a non-empty drawer is refused with
  guidance unless the user passes an explicit recursive form you define,
  e.g. rm -r <drawer>), and the signature command: accession — with no
  argument, list the catalog (every node's accession code, kind and name,
  catalog order; make it the delightful one — columns, dot leaders, the
  archive's own vocabulary); with an argument (a code or a name), show that
  one specimen's full label record. Optional stretch (cut freely): open
  <name> routing through the registry's openApp with the node's real launch
  context; Tab completion of sibling names.
- Command history: Up/Down navigates; history persists in the window's
  appState so a reload restores the same session (cwd + history).
- HARD RULE — not a real eval: unknown or malformed input is an in-world
  refusal line, nothing more. No eval, no new Function, no import() of user
  input, no URL/script execution. A visitor typing eval("...") or
  backtick payloads gets the same polite refusal as "flurb".
- Architecture discipline (match the fleet): a pure, DOM-free model module
  (command parser + executor over the real ops, cwd/path resolution, history
  ring) unit-tested without React; a thin surface. Ops state transforms are
  pure; the surface commits them.
- Accessibility floor: the well is a log region (aria-live off or polite —
  your call, document it), the input line is a real text input with an
  in-world label, focus-visible rides the global beam, and the full window
  is operable keyboard-only (it is keyboard-FIRST).

ACCEPTANCE CRITERIA (plan.md style — verifiable, no vibes):
Outcome: Catalog Terminal registered under id 'terminal', singleton, lazy
own chunk; a phosphor-well shell over the real FS with the command floor
above, session persistence, zero platform edits.
Files: src/apps/terminal/**, one line in src/apps/index.ts, fleet pin in
src/apps/apps.test.ts, one row in docs/KEYBOARD.md, tests + e2e specs.
Acceptance:
1. Manifest: id 'terminal', singleton: true, retryableLazy mount; re-open
   from the launcher raises + focuses the one window (e2e).
2. Every floor command works against the REAL store — unit tests over the
   pure executor for each command incl. error paths (name collision, not
   found, cd into a specimen refused, rm non-empty drawer refused); e2e:
   mkdir a drawer from the terminal → its icon is on the desktop; cat a
   seeded text specimen prints its content; rm removes it; reload → both
   changes persisted (made from the terminal or gone, exactly as
   commanded).
3. `accession` lists the live catalog from the store (unit: matches
   listChildren/seed content; e2e: visible output contains real accession
   codes from the seed).
4. History + cwd survive reload via the window's appState (e2e: run
   commands, reload, cwd + Up-arrow history restored; malformed stored
   appState degrades safely — unit).
5. No-eval hard rule: source grep over src/apps/terminal for eval(, new
   Function, import( on user input comes back clean BY CONSTRUCTION, plus a
   unit test asserting eval-shaped input is refused as an unknown command.
6. Visual law: phosphor ink confined to the well treatment; B612 Mono
   throughout; scanlines present; zero raw hex in your CSS (grep test);
   reduced-motion collapses the caret.
7. Gates: npm run check green incl. perf budgets (TerminalSurface is its
   own lazy chunk; main growth ≤ ~1 KB gz); npm run test:e2e green, zero
   retries; launcher order intact (notepad still the first item).
8. Zero platform diffs: git diff over src/platform, src/lib, src/styles,
   src/main.tsx, index.html, vite.config.ts, package.json is EMPTY.
Validate: the commands above; verification pass records evidence in your
session log under docs/ultron/sessions/.
Size: small–medium.

When you hit a genuine decision the prompt did not settle (exact prompt
string, output formatting, stretch commands), decide it in-world, record it
in your session log, and keep moving. When you hit a CONTRACT gap, stop and
surface it — that is the one halt.
```

---

## Session 2 — PAINT

```text
You are running the $ultron-supreme pipeline in the repository at
/Users/arrangedgodly/Documents/Projects/desktop-sim (cwd). You are building
ONE federated app: a Paint app for the HOLD/OS desktop simulator.

PIPELINE SHAPE: start at plan-it-out. Assembly and scoping are ALREADY
SETTLED — this prompt is the approved town-hall equivalent; do not re-run
assembly, do not re-open scope. Then run your own production lane
(production-supreme) with your own task breakdown, and finish with your own
verification pass. Task cap 20 dispatched tasks per run applies; this app is
small–medium (3–5 tasks).

READ FIRST, in this order, before planning anything:
1. docs/APP-CONTRACT.md — the entire interface between your app and the
   platform. The TypeScript types are the contract; the code decides.
2. docs/ultron/design-brief.md — the world law (The Survey Archive). Its
   "Direction contract blocks" are law: amber phosphor lives ONLY inside
   recessed display wells; parchment is the content surface; brass only at
   hardware touchpoints; oxide red is warnings/destructive only.
3. README.md, section "Add your own app".
4. docs/KEYBOARD.md — the keyboard map your app joins.
5. docs/TESTING.md — the check matrix you must keep green.
6. src/apps/notepad/ — the reference app for save-into-the-catalog (name
   offered inline on first save, FSError collision refusal, dirty guard,
   rebind) and src/apps/image-viewer/ for how plates are read.

THE PRODUCT (one paragraph). A Plate Painter: a specimen-plate studio where
the visitor draws with ink on a parchment plate — brush, eraser, flood fill,
discrete sizes, and a palette drawn from the archive's own colors plus a
custom picker. Saving ACCESSIONS the work into the living catalog as a real
image specimen: the plate appears on the desktop, opens in the Plate Viewer
like any archive plate, survives reload, and reopens in the painter for
further work. A PNG export takes the plate home. Target user: the portfolio
visitor (recruiter or engineering peer) who plays for ninety seconds and
leaves having CREATED something in the exhibit — the strongest memory the
site can make.

NON-GOALS (fixed): no layers, no shape/text tools, no selection or
transforms, no zoom/rotate, no animation or GIF export, no image IMPORT (no
file picking — drawing only), no pressure-sensitivity beyond what pointer
events give for free, no collaboration. The paint app does NOT take over the
desktop's image double-click route (the Plate Viewer owns it; see contract
facts). No platform changes of any kind.

WORLD LAW for this app: the canvas is a SPECIMEN PLATE — a parchment working
surface (the design brief's duality: dark console chrome outside, light
parchment content surface inside). Your toolbar is console chrome: engraved
Chakra Petch legends, bevels, B612 Mono digits for the size readout; the
plate itself reads as parchment with ink. Pigment is pigment: the palette
OFFERS the token colors as paints (--parchment inks, --oxide, --brass tones)
but the artwork is paint on parchment — no phosphor GLOW inside the artwork
(lamps and glow stay in wells, and there need be no lamps here at all).
Brass appears only if you draw a hardware touchpoint (a tool toggle bat) —
never as ornament. Oxide is reserved for the destructive Clear control
(two-step or a confirm strip — the settings guard vocabulary). Reduced
motion: there is no required motion; do not add any beyond focus/control
feedback. ALL chrome ink from tokens in src/styles/tokens.css — no raw hex
in your CSS (grep-test yourself, the repo convention); primitives live in
src/styles/global.css.

CONTRACT LAW: zero platform edits are expected. Platform-owned (a diff on
any of these at the end of your session = failure): src/platform/**,
src/lib/**, src/styles/**, src/main.tsx, index.html, vite.config.ts,
package.json. Your entire app lives in src/apps/paint/. If the contract
cannot express something you need — STOP and surface it to the user with the
specific seam; that is a HALT, not something you work around by forking.
Sanctioned edits beyond your folder, all app-side:
- ONE manifest line in src/apps/index.ts, inserted immediately BEFORE the
  settingsApp line (keeps the launcher's stable order: notepad stays the
  first item — that floor is e2e-pinned — and Console Settings keeps the
  closing run).
- src/apps/apps.test.ts pins the shipped fleet (exact id order + "every id
  is reserved"). Your id is NOT one of the platform's six reserved ids —
  update this test honestly to the new fleet (the established "honest
  unfreeze" pattern: keep its intent — no demo, every reserved id still
  ships, every mount retryableLazy, order still pinned — now including
  'paint').
- docs/KEYBOARD.md: add your app's keys to the "Inside apps" table.
- Your own tests (colocated *.test.ts(x)) and your own e2e specs under
  tests/e2e/.

REPO FACTS (verified; rely on them):
- React 19 + TypeScript strict + Vite; Zustand v5. Static bundle, no
  backend, no network. Node ^20.19.0 || >=22.12.0.
- The manifest: id 'paint' (kebab-case; NOT a reserved id — that is fine),
  name (suggested in-world: "Plate Painter"), a render-only SVG icon,
  mount = retryableLazy(() => import('./PaintSurface')) from
  src/platform/app-registry/lazy-mount.tsx (default-export the surface!),
  defaultGeometry to taste. MULTI-instance, and DO declare
  acceptedFileTypes: ['image'] — it is routing-inert (the FIRST manifest
  declaring a kind wins routing, and image-viewer is registered ahead of
  you), but it documents intent. It does NOT steal the double-click route;
  opening plates into the painter happens through YOUR in-app picker or
  openApp('paint', { source: 'file', file: node }) — instance dedupe is
  appId-scoped, so you get one painter window PER PLATE while the viewer
  keeps its own windows on the same node.
- Saving a NEW plate: createNode(state, { parentId: state.rootId, name,
  kind: 'image', src }) where src is the canvas PNG data URI — the
  notepad's first-save pattern (name offered inline, FSError collision →
  in-world refusal shake, then REBIND the window onto the specimen with
  rebindWindow(windowId, { instanceId: fileInstanceKey(id), launch:
  { source: 'file', file: node } }) so reload/dedupe/delete-handling treat
  it as the plate's window from then on). Saving an OPENED plate: update
  the node's src through the FS store's only mutation seam — an app-owned
  pure transform (the notepad's withTextContent pattern, but for image src)
  committed via useFSStore.getState().commit(...).
- Image nodes carry src as a URL or data URI; the shipped CSP allows
  img-src 'self' data:. The Plate Viewer already renders data-URI plates.
- STORAGE HONESTY (important): data URIs ride the IndexedDB persistence
  envelope. The platform's quota fallback sacrifices window records, never
  the catalog — so oversized plates are an honest hazard. Fix a MODEST
  working plate size (one fixed canvas, e.g. 960×600, or a small discrete
  set), document the cap in-app, and do not offer pixel-mega canvases.
- Pointer discipline (committed repo pattern): Pointer Events +
  setPointerCapture, rAF-batched drawing, no per-move store writes (your
  drawing state is canvas-local; the FS is touched only on save), Escape /
  pointercancel end the stroke cleanly, touch-action: none on the plate.
- Persistence is automatic for FS commits; a dirty, un-saved plate should
  ride the window's appState (setWindowAppState — structured-clone-safe;
  data URIs are strings and clone fine at your capped size) so a reload
  restores the in-progress work; validate defensively on read. Dirty guard
  on close via the manifest's onCloseRequest (the notepad's per-window
  guard registry pattern) — ✕ and unclaimed Esc interpose an in-world
  strip, never a browser dialog.
- Sounds: playCue('drop-on-folder') from src/lib/audio on accession (the
  filing cue — a plate being filed). playCue no-ops while the console is
  muted (soundsEnabled defaults to false). NEVER touch src/lib/audio.
- Live title: setWindowTitle when the bound plate renames; external delete
  of the bound plate → close-only in-world PLATE REMOVED notice (the
  viewer's pattern).
- PNG export: canvas.toBlob → object URL → an anchor with download= (a real
  user gesture, no network request, CSP-clean). Revoke the URL after.
- Testing matrix: npm run check (typecheck + lint + vitest + perf) and
  npm run test:e2e (Playwright chromium; first run on a machine needs
  `npx playwright install chromium` once; it boots its own dev server on
  port 5180 — if specs fail weirdly after source edits, kill the stale
  server on 5180 and re-run; documented in docs/TESTING.md). Budgets the
  perf gate enforces: total JS ≤ 250 KB gz, main chunk ≤ 120 KB gz, fonts
  ≤ 150 KB raw, CSS ≤ 40 KB gz. Baseline ~114.1 / ~88.0 KB gz. Your surface
  ships as its own lazy chunk; main may grow only by your manifest + icon
  (keep it tiny).
- Session artifacts (your plan, log, state) go under docs/ultron/sessions/
  (create it; e.g. paint-plan.md). NEVER edit the platform records in
  docs/ultron/ — they are frozen history; design-brief.md is read-only law.
- Commit per completed task, message prefixed with the app (e.g.
  "paint: plate surface + brush engine"). Never commit unrelated changes.

APP SPEC:
- Tools (the floor): brush, eraser, flood fill (fill may be CUT if it
  threatens the budget — say so in your plan either way), discrete sizes
  (e.g. 3–5 steps with a B612 readout), a palette of token-derived swatches
  plus a custom color input, Clear (oxide, two-step), Undo (a bounded
  history stack, e.g. 20 snapshots — snapshot the capped canvas; document
  the bound).
- The plate: fixed modest dimensions (see storage honesty), rendered crisp
  (devicePixelRatio-aware), parchment ground with ink strokes; the plate is
  the tab/click focus seat of the window.
- Save / Open / Export as specified in the repo facts above; an in-app
  Open picker listing image specimens from the FS store (its own small
  in-world listing — accession + name), launcher opens a FRESH blank plate
  (the notepad's untitled-draft shape).
- Architecture discipline (match the fleet): a pure model module (tool
  state machine, palette, the src-update transform, dirty logic)
  unit-tested without a DOM; stroke rendering + flood fill as pure-ish
  canvas functions tested where practical; a thin surface. Keep every file
  inside src/apps/paint/.

ACCEPTANCE CRITERIA (plan.md style — verifiable, no vibes):
Outcome: Plate Painter registered under id 'paint', multi-instance, lazy own
chunk; draws with ink on a parchment plate, accessions plates into the
catalog as real image specimens, reopens them, exports PNG, zero platform
edits.
Files: src/apps/paint/**, one line in src/apps/index.ts, fleet pin in
src/apps/apps.test.ts, one row in docs/KEYBOARD.md, tests + e2e specs.
Acceptance:
1. Manifest: id 'paint', retryableLazy mount, default geometry sane; a
   launcher open is a fresh blank plate (e2e).
2. Draw → Save: name offered inline → plate specimen EXISTS in the store
   (unit + e2e), its icon is on the desktop, reload → still there, and
   double-click opens it in the PLATE VIEWER (the untouched platform route)
   showing the drawn PNG (e2e).
3. Reopen: from the painter's picker (or an openApp file launch) the same
   plate loads its pixels; edit → save → the node's src is updated (unit on
   the pure transform; e2e via the viewer showing the new pixels after a
   reopen).
4. Export: triggers a real PNG download (e2e: download event with a
   .png filename; blob size > 0).
5. Guard: dirty plate + ✕ → in-world unsaved strip (Keep editing /
   Discard), Discard closes, Keep keeps; clean ✕ closes immediately (e2e,
   the notepad guard precedent). A dirty in-progress plate survives reload
   via appState (e2e).
6. Cue: accession fires playCue('drop-on-folder') exactly once per save,
   and only when sounds are armed (unit with the engine's test seam).
7. Storage discipline: canvas dimensions capped (constant + test); no
   toDataURL at unbounded sizes anywhere (grep).
8. Visual law: parchment plate inside console chrome; zero raw hex in your
   CSS (grep test); no phosphor glow in artwork; oxide only on the
   destructive control.
9. Gates: npm run check green incl. perf budgets (PaintSurface its own
   lazy chunk; main growth ≤ ~1 KB gz); npm run test:e2e green, zero
   retries; launcher order intact (notepad still the first item).
10. Zero platform diffs: git diff over src/platform, src/lib, src/styles,
    src/main.tsx, index.html, vite.config.ts, package.json is EMPTY.
Validate: the commands above; verification pass records evidence in your
session log under docs/ultron/sessions/.
Size: small–medium.

When you hit a genuine decision the prompt did not settle (exact palette
swatch list, fill algorithm, undo bound), decide it in-world, record it in
your session log, and keep moving. When you hit a CONTRACT gap, stop and
surface it — that is the one halt.
```

---

## Session 3 — DAW

```text
You are running the $ultron-supreme pipeline in the repository at
/Users/arrangedgodly/Documents/Projects/desktop-sim (cwd). You are building
ONE federated app: a basic DAW (a step sequencer) for the HOLD/OS desktop
simulator. This is an acknowledged STRETCH app: deliberately small, a toy
instrument with real craft — not a digital audio workstation.

PIPELINE SHAPE: start at plan-it-out. Assembly and scoping are ALREADY
SETTLED — this prompt is the approved town-hall equivalent; do not re-run
assembly, do not re-open scope. Then run your own production lane
(production-supreme) with your own task breakdown, and finish with your own
verification pass. Task cap 20 dispatched tasks per run applies; this app is
medium (4–6 tasks).

READ FIRST, in this order, before planning anything:
1. docs/APP-CONTRACT.md — the entire interface between your app and the
   platform. The TypeScript types are the contract; the code decides.
2. docs/ultron/design-brief.md — the world law (The Survey Archive). Its
   "Direction contract blocks" are law: amber phosphor lives ONLY inside
   recessed display wells; brass only at hardware touchpoints; oxide red is
   warnings/destructive only; Settings uses hardware toggle switches.
3. README.md, section "Add your own app".
4. docs/KEYBOARD.md — the keyboard map your app joins.
5. docs/TESTING.md — the check matrix you must keep green.
6. src/lib/audio/engine.ts and src/lib/audio/palette.ts — READ ONLY, as
   pattern books: the console's committed audio LAWS (mute law, lazy
   AudioContext under sticky user activation, one shared context, master
   gain, no autoplay hostility). You follow these laws in your own
   app-local audio module; you never edit that directory.
7. src/apps/notepad/ — the reference app for save-into-the-catalog and the
   appState/appCloseGuard patterns.

THE PRODUCT (one paragraph). A Survey Sequencer: a small instrument rack on
the science officer's console — three or four synthesized voices, a 16-step
grid (8 optional), a playhead, a tempo dial. The visitor toggles a few
steps, throws the transport, and the rack plays a looping figure in the
console's own square/triangle hardware register — cassette-futurism you can
dance to, slightly. Songs accession into the archive as text specimens (a
JSON score): reload the page, reopen the song, and it plays again — the
living-filesystem truth applied to music. Target user: the portfolio
visitor (recruiter or engineering peer) who plays with it for two minutes
and sends the link to a colleague; the demo is delight, the persistence is
the proof of craft.

NON-GOALS (fixed): NOT a full DAW — no audio recording, no audio import or
export (no WAV/MP3/MIDI anything), no piano roll beyond the step grid, no
   effects chain beyond per-voice envelope + master gain, no sample playback
   (synthesis only — zero fetched bytes), no polyphony beyond the voices, no
   AudioWorklet (module loading under the strict CSP for zero benefit at
   this scope — plain oscillator graphs only, matching the console's own
   synthesis pattern), no sharing/collaboration, no platform or
src/lib/audio changes of any kind.

WORLD LAW for this app: the DAW is a CONSOLE INSTRUMENT RACK. Each voice is
a rack strip with a hardware toggle (mute) — the Settings app's switch
vocabulary (bevel housing, brass bat, state lamp in its own tiny well) is
the pattern; brass lives at exactly these touchpoints and nowhere else. The
step grid + playhead + tempo readout live inside ONE recessed display well:
amber phosphor on the deepest ground, active steps lit, B612 Mono for every
digit, scanlines from cheap repeating gradients (never canvases/filters).
Transport controls are engraved chrome buttons. Oxide appears only if you
need a destructive control (e.g. Clear song) — guarded, two-step. Reduced
motion: the playhead may be a discrete lit-step indicator, not a sweeping
animation; nothing here requires motion. ALL ink from tokens in
src/styles/tokens.css — no raw hex in your CSS (grep-test yourself, the
repo convention); primitives live in src/styles/global.css.

CONTRACT LAW: zero platform edits are expected. Platform-owned (a diff on
any of these at the end of your session = failure): src/platform/**,
src/lib/** (this INCLUDES src/lib/audio — read it, never edit it),
src/styles/**, src/main.tsx, index.html, vite.config.ts, package.json. Your
entire app lives in src/apps/daw/. If the contract cannot express something
you need — STOP and surface it to the user with the specific seam; that is
a HALT, not something you work around by forking. Sanctioned edits beyond
your folder, all app-side:
- ONE manifest line in src/apps/index.ts, inserted immediately BEFORE the
  settingsApp line (keeps the launcher's stable order: notepad stays the
  first item — that floor is e2e-pinned — and Console Settings keeps the
  closing run).
- src/apps/apps.test.ts pins the shipped fleet (exact id order + "every id
  is reserved"). Your id is NOT one of the platform's six reserved ids —
  update this test honestly to the new fleet (the established "honest
  unfreeze" pattern: keep its intent — no demo, every reserved id still
  ships, every mount retryableLazy, order still pinned — now including
  'daw').
- docs/KEYBOARD.md: add your app's keys to the "Inside apps" table.
- Your own tests (colocated *.test.ts(x)) and your own e2e specs under
  tests/e2e/.

REPO FACTS (verified; rely on them):
- React 19 + TypeScript strict + Vite; Zustand v5. Static bundle, no
  backend, no network. Node ^20.19.0 || >=22.12.0.
- The manifest: id 'daw' (kebab-case; NOT a reserved id — that is fine),
  name (suggested in-world: "Survey Sequencer"), a render-only SVG icon,
  mount = retryableLazy(() => import('./DawSurface')) from
  src/platform/app-registry/lazy-mount.tsx (default-export the surface!),
  singleton: true (one rack ever; re-open raises + focuses it),
  defaultGeometry to taste. Do NOT declare acceptedFileTypes (the notepad
  owns the text route; your scores reopen through YOUR picker).
- AUDIO LAWS (follow src/lib/audio/engine.ts's committed pattern in your
  OWN module under src/apps/daw/ — an app-local engine, not a fork):
  * MUTE LAW: the console ships muted. `soundsEnabled` in the settings
    store (src/platform/stores/settings-store.ts) defaults to false. While
    false, your rack creates ZERO AudioContexts: the transport runs, the
    playhead moves, a well lamp reads MUTED — silence by construction.
    The console's Settings toggle is the ONE sound switch; you do not add
    a second global audio arming (per-voice mutes are musical, not arming).
  * LAZY + GESTURE: build ONE shared AudioContext per session, only on the
    first Play after sounds are armed (Play is a user gesture; sticky
    activation guards it the way engine.ts does). Never at mount. Close it
    on mute (and honestly on stop-idle if you like) so muted = no live
    graph.
  * POLITENESS: one master gain (~−12 dB), per-voice envelopes with quick
    attacks (no click-steps), stop = cancel scheduled events + a tail no
    longer than one step.
  * SCHEDULING: lookahead scheduling against AudioContext.currentTime (a
    small setInterval lookahead + exact per-step event times) — never
    per-step setTimeout drift. Keep the beat math PURE (steps → times for
    a given tempo/length) so it is unit-testable with a fake clock.
  * SYNTHESIS: square/triangle oscillators (the console hardware register)
    with optional pitch glide per step; a percussive voice = very short
    square blips. No AudioWorklet, no media elements, no samples.
- Songs: save the score as a TEXT specimen via createNode (kind: 'text',
  content: JSON string — {version, steps, tempo, voices, grid}) with the
  notepad's first-save pattern (name offered inline, FSError refusal
  shake). Reopening via an in-app picker over your own scores (list text
  specimens from the FS store, parse + defensively validate the JSON — it
  crossed the persistence trust boundary; malformed or foreign JSON → an
  honest in-world refusal, never a throw). A double-clicked score opens in
  the notepad as raw JSON — that is correct and honest, not a bug.
- In-progress work (grid edits not yet accessioned) rides the window's
  appState (setWindowAppState — structured-clone-safe, validate on read)
  so a reload restores the exact rack, playing state optional. A dirty
  guard via the manifest's onCloseRequest interposes ✕/unclaimed Esc with
  an in-world strip (the notepad pattern) — your call whether un-saved
  grid edits count as dirty; decide in-world and document it.
- FS access: pure ops from src/lib/fs through the store's ONLY mutation
  seam: useFSStore.getState().commit(op(useFSStore.getState().fs, ...));
  ops throw typed FSError — catch and render in-world.
- Console cues: playCue('toggle') from src/lib/audio for hardware-toggle
  feedback if you like; playCue no-ops while muted. NEVER edit
  src/lib/audio.
- Keyboard: claim keys on the focused rack (the viewer/atlas precedent):
  Space = play/stop (when focus is in the rack, not in an input — respect
  the OS input-field law), arrows walk steps/voices, Enter toggles a step.
  Document every claim in docs/KEYBOARD.md. Esc precedence: apps get first
  claim inside their window.
- Testing matrix: npm run check (typecheck + lint + vitest + perf) and
  npm run test:e2e (Playwright chromium; first run on a machine needs
  `npx playwright install chromium` once; it boots its own dev server on
  port 5180 — if specs fail weirdly after source edits, kill the stale
  server on 5180 and re-run; documented in docs/TESTING.md). Budgets the
  perf gate enforces: total JS ≤ 250 KB gz, main chunk ≤ 120 KB gz, fonts
  ≤ 150 KB raw, CSS ≤ 40 KB gz. Baseline ~114.1 / ~88.0 KB gz — you have
  generous headroom; spend it on craft, not libraries (ZERO new
  dependencies expected — WebAudio is a browser global; if you believe you
  need one, surface it as a decision first).
- The strict CSP in index.html allows no off-origin anything; the privacy
  e2e audits the production build for external requests. Synthesis-only
  keeps you clean by construction.
- Session artifacts (your plan, log, state) go under docs/ultron/sessions/
  (create it; e.g. daw-plan.md). NEVER edit the platform records in
  docs/ultron/ — they are frozen history; design-brief.md is read-only law.
- Commit per completed task, message prefixed with the app (e.g.
  "daw: rack surface + voice engine"). Never commit unrelated changes.

APP SPEC:
- Voices: 3 by default (a square lead, a triangle bass, a short square
  tick for percussion), 4 max. Each voice strip: hardware mute toggle
  (brass bat + lamp well), a short engraved name, optional per-voice
  pitch/base-note control if it earns its keep (discrete, B612 readout).
- Grid: 16 steps default, 8 switchable; monophonic per voice per step (a
  step is ON or OFF; optional: two or three pitch rows for the lead if
  cheap — cut freely). The whole grid sits in ONE phosphor well with a lit
  playhead column while playing.
- Transport + tempo: Play/Stop (Space when the rack holds focus), tempo in
  BPM (a discrete control, e.g. 60–180 in steps of 4–10, B612 readout);
  tempo changes land cleanly at the next beat (no restart glitch).
- Save/Open/Clear: accession the score as a text specimen; reopen from the
  picker; Clear is oxide-guarded two-step.
- Architecture discipline (match the fleet): a pure model (grid transforms,
  score encode/decode + validation, beat/lookahead math) unit-tested
  without a DOM and without a real AudioContext; the app-local audio
  engine injectable with a fake context (the engine.ts test-seam pattern)
  so playback logic is testable; a thin surface. Keep every file inside
  src/apps/daw/.

ACCEPTANCE CRITERIA (plan.md style — verifiable, no vibes):
Outcome: Survey Sequencer registered under id 'daw', singleton, lazy own
chunk; a 16-step, 3-voice synthesized rack with lookahead scheduling,
mute-law-correct audio, songs accessioned as text specimens, zero platform
edits.
Files: src/apps/daw/**, one line in src/apps/index.ts, fleet pin in
src/apps/apps.test.ts, one row in docs/KEYBOARD.md, tests + e2e specs.
Acceptance:
1. Manifest: id 'daw', singleton: true, retryableLazy mount; re-open raises
   + focuses the one window (e2e).
2. Grid + transport: toggling steps and play/stop work by pointer AND
   keyboard (e2e); while playing, the playhead advances and Stop leaves no
   sounding notes beyond one step's tail (e2e with the fake-capable engine
   or an audible-graph probe).
3. MUTE LAW: with sounds left at their default (OFF), a full session of
   toggling + transport + song save creates ZERO AudioContexts (e2e
   patch-counted, the console's own audio-gate pattern); arming sounds in
   Settings then pressing Play creates exactly ONE shared context and
   audible events (e2e).
4. Scheduling: unit tests on the pure beat math — steps map to exact
   times for a given BPM; a mid-loop tempo change lands on the next beat;
   no drift accumulation across many bars with a fake clock.
5. Songs: save accessions a text specimen whose JSON parses (unit + e2e:
   specimen exists, reload persists); reopen restores the exact grid +
   tempo; malformed or foreign JSON in a chosen file → in-world refusal,
   never a throw (unit with hostile payloads).
6. appState: in-progress grid edits survive reload (e2e); stored appState
   is validated defensively (unit with hostile payloads).
7. Visual law: the grid/playhead/readout confined to one well treatment;
   brass only on the hardware toggles; B612 Mono digits; zero raw hex in
   your CSS (grep test); no continuous playhead animation under
   prefers-reduced-motion.
8. Gates: npm run check green incl. perf budgets (DawSurface its own lazy
   chunk; main growth ≤ ~1 KB gz); npm run test:e2e green, zero retries;
   launcher order intact (notepad still the first item).
9. Zero platform diffs: git diff over src/platform, src/lib, src/styles,
   src/main.tsx, index.html, vite.config.ts, package.json is EMPTY (this
   explicitly includes src/lib/audio).
Validate: the commands above; verification pass records evidence in your
session log under docs/ultron/sessions/.
Size: medium.

When you hit a genuine decision the prompt did not settle (voice timbres,
pitch-row count, dirty-guard policy for grid edits), decide it in-world,
record it in your session log, and keep moving. When you hit a CONTRACT gap
or believe you need a new dependency or ANY platform change, stop and
surface it — that is the one halt.
```

---

## After a session lands

Each session updates only app-side surfaces, so sessions compose: run one,
run another, both registrations survive (each adds one line before
`settingsApp` and one id to the fleet pin). After each session it is worth
a fresh `npm run check && npm run test:e2e` and a quick tour of the desktop
— then, if you are the authoring kind, a line in the app's session log
under `docs/ultron/sessions/` noting anything the next federated session
should know. The README's app table and this document are the two places a
newly shipped app may deserve a mention; that edit belongs to the session
that shipped it.
