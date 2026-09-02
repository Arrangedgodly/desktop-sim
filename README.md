# HOLD/OS — The Survey Archive

A fantasy operating system that runs entirely in one browser page. You are the science officer of a deep-space survey vessel: boot the hold's archive console, and a desktop lights up — specimen icons you can drag into drawers, windows with real chrome, and a living filesystem underneath. The archive remembers everything you do, and it never talks to a server.

It is a portfolio showpiece first: nothing here is a screenshot. Every icon drags, every drawer opens, every file operation works, and the whole desktop — windows, notes, icon positions — survives a reload.

## Try it

You need Node `^20.19.0 || >=22.12.0` and a desktop browser (viewport ≥ 1024px — on a phone the console declines honestly with a notice card carrying the officer's contact channels, never a broken layout).

```sh
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). The first boot runs the power-on self-test in amber; click or press a key to skip it.

### The check matrix

The repo keeps five gates (see [docs/TESTING.md](docs/TESTING.md) for what each covers):

| Command | What it does |
| --- | --- |
| `npm run typecheck` | strict TypeScript over app, tests, and configs |
| `npm run lint` | ESLint over the repo |
| `npm test` | Vitest unit + component suite |
| `npm run perf` | production build + size budgets (total JS ≤ 250 KB gz, main chunk ≤ 120 KB gz, fonts ≤ 150 KB, CSS ≤ 40 KB) |
| `npm run test:e2e` | Playwright chromium suite in a real browser — boots its own dev server on port 5180 |

- `npm run check` = typecheck + lint + test + perf — the fast local gate.
- Full matrix: `npm run check && npm run test:e2e`.
- First e2e run on a machine: `npx playwright install chromium` once.

## The tour

**Boot.** The console runs a real POST — archive integrity, module registry, plugin bus — typed in amber on the display well, ≤ 2 s, skippable, and a plain `RESUME` flash on return visits.

**Desktop.** Specimen icons sit on an archive-plate wallpaper (star chart by default; an anatomical plate, a phytograph print, and a survey sheet ship too). Drag specimens anywhere on the grid, drop them into drawers to file them, right-click (or press `Menu`) for the ground and specimen menus — new drawers, new specimens, rename, delete. Along the bottom runs the drawer-rail taskbar: open windows as LEDs, a live timecode, and the module pull that launches every app.

**The eight apps.**

| App | What it is |
| --- | --- |
| **Specimen Notepad** | a parchment-sheet text editor — autosaves into the archive, guards unsaved changes on close |
| **Catalog Terminal** | a phosphor-well shell over the real archive — `ls`, `cd`, `cat`, `mkdir`, `rm`, and the signature `accession` catalog walk; session and history persist |
| **Plate Painter** | the specimen-plate studio — ink on parchment, save accessions your plate into the archive, reopen it, export a PNG |
| **Plate Viewer** | the image reader — fit ↔ 1:1, 25–400% zoom, drag to pan, engraved captions |
| **Catalog Explorer** | the file browser — drawers and specimens, breadcrumbs, card or ledger views, full file operations |
| **Field Atlas** | the project index — curated plates with field notes and links out to live sites and repositories |
| **Nameplate Manifest** | the officer's plaque — name, bio, and contact channels (the portfolio's real content) |
| **Console Settings** | wallpaper plates, UI sounds (synthesized, muted by default), reduced-motion, storage vault readout, and the guarded archive reset |

## It remembers everything

Every change — where you dragged an icon, which windows are open and how they're sized, the text you typed, the wallpaper you chose, even an unsaved notepad draft — is written to your browser's IndexedDB and restored exactly on the next visit. Reload whenever you like; the archive holds.

To start over, open **Console Settings → Archive reset**: lift the oxide guard cover, throw the *Reseal archive* switch, and the catalog reseeds itself to its original state.

## Privacy

> **This site stores nothing anywhere but your browser.** There is no server, no account, and nothing to sign into: the entire archive ships as static files, runs locally in your tab, and every byte of your session — the specimens you open, the drawers you rearrange, the notes you type — is kept in your own browser's IndexedDB (plus one tiny local flag that remembers you've booted before), never sent anywhere and never read by anyone, including us. The console makes zero network requests after it loads: no analytics, no telemetry, no font CDNs, no third-party calls of any kind — a locked-down Content-Security-Policy enforces that, refusing even the possibility of an off-origin connection. The only links that ever leave the site are the ones you click yourself (the officer's contact channels and project plates), which open in a new tab stripped of any referrer information about where you came from. Clear your browser storage and the archive forgets you completely — that is the whole deal.

Every claim in that paragraph is asserted automatically against the production build; the audit write-up lives in [docs/privacy-note.md](docs/privacy-note.md).

## Keyboard users

The whole console is operable without a pointer: `F6` walks the desktop → taskbar → window zones, arrows walk the icon grid, `Enter` opens, `Alt+Esc` cycles windows, `Esc` closes (apps get first claim — the notepad's unsaved-changes guard wins). The full map, including menu keys and per-app shortcuts, is [docs/KEYBOARD.md](docs/KEYBOARD.md).

## Add your own app

The platform (window chrome, focus, z-order, dragging, taskbar, persistence, boot, fault isolation) is not yours to build and not yours to edit. An app is one folder with a manifest, plus one line in `src/apps/index.ts`:

```ts
export const apps: readonly AppManifest[] = [notepadApp, /* … */, yourApp]
```

That's the whole integration. Your surface ships as its own lazy chunk, mounts in a real window, survives reload, and crashes into its own fault card instead of taking the OS down. The complete contract — types, registry API, lifecycle rules, a copy-paste example — is [docs/APP-CONTRACT.md](docs/APP-CONTRACT.md).

A Terminal, a Paint, a DAW: all welcome. The contract exists precisely so future apps can be built as separate sessions on this repo without forking the core.

## Deploying

The build is a fully static bundle — `npm run build` emits `dist/`, no backend, no environment variables, no secrets. The recommended home is Cloudflare Pages: connect the repo (build command `npm run build`, output directory `dist`) for push-to-deploy, or run `npx wrangler pages deploy dist` for a quick manual publish. The step-by-step runbook, including the post-deploy verification checklist, is [docs/DEPLOY.md](docs/DEPLOY.md).

## Design & stack

React + TypeScript + Vite, Zustand stores, IndexedDB persistence — one page, no backend. The world is *The Survey Archive*: warm near-black console chrome, amber phosphor confined to recessed display wells, parchment catalog labels, brass only at hardware touchpoints. Typefaces: **Chakra Petch** (engraved labels), **Lora** (parchment reading surfaces), and **B612 Mono** (timecode and digits) — self-hosted latin-subset WOFF2 under the SIL Open Font License 1.1, with each license text alongside the font files in [`src/styles/fonts/`](src/styles/fonts/).

## Documentation

| Doc | What's inside |
| --- | --- |
| [docs/TESTING.md](docs/TESTING.md) | the check matrix — what each gate covers and how to grow it |
| [docs/KEYBOARD.md](docs/KEYBOARD.md) | the complete keyboard map |
| [docs/APP-CONTRACT.md](docs/APP-CONTRACT.md) | how to write an app for the platform |
| [docs/DEPLOY.md](docs/DEPLOY.md) | the Cloudflare Pages runbook |
| [docs/privacy-note.md](docs/privacy-note.md) | the privacy claims and the audit behind them |
