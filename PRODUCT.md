# Product

<!-- impeccable:product-schema 1 -->

> Derived 2026-09-01 by `$impeccable init` from the user-approved scoping brief at `docs/ultron/town-hall.md` (ultron-supreme pipeline; no re-interview required — every fact below was user-confirmed in the assembly session).

## Platform

web

## Stack

React + TypeScript + Vite (user-selected at the design touchpoint, 2026-09-01). Static bundle output only — deployable on Cloudflare Pages from GitHub; no backend.

## Users

- **Primary:** recruiters and hiring managers arriving cold from a resume/portfolio link — mostly desktop browsers, occasionally phones, giving the site well under a minute of attention.
- **Secondary:** engineering peers evaluating frontend craft.
- **Ongoing:** the author, who will extend the platform with new apps (Terminal, Paint, DAW) in separate future build sessions.

## Product Purpose

A one-page portfolio showpiece that simulates a custom fantasy operating system in the browser: a desktop with draggable icons, clickable folders, a full window manager, and a living virtual filesystem that remembers everything the visitor does. It exists to make the author's frontend craft (state management, interaction design, performance discipline, accessibility) legible and memorable in the first seconds of a visit. Success = the visitor plays with the desktop, finds the About app and curated project pages, and leaves remembering it.

## Positioning

Not a static mock or screenshot gallery: every icon drags, every folder opens, every file operation works, and the whole desktop state survives reload — a persistent, working OS metaphor as portfolio. Neighboring products (template portfolios, non-interactive OS pastiches) cannot truthfully claim a living filesystem plus a real window manager.

## Operating Context

- Visitors arrive via a direct link; no search/SEO dependency; no accounts.
- Evergreen desktop browsers, viewport ≥ ~1024px for the full experience.
- Phone visitors receive a styled notice card with the author's real links (deliberate non-goal: touch adaptation).
- Hosted as a static site on Cloudflare Pages deployed from the GitHub repo.
- Author supplies real content (name, bio, links, project list, screenshots) once, via template, during production.

## Capabilities and Constraints

Confirmed functionality (MVP, this session): icon grid with select/open/drag-and-drop (drop-on-folder moves items); full window manager (drag, resize, minimize, maximize, close, z-order focus, taskbar switching); virtual filesystem with context-menu new-folder/new-file/rename/delete; persistence of all state across reloads; apps = File explorer, About, Notepad, Image viewer, Settings (wallpaper, accent, sounds, Reset desktop), project Browser (curated internal pages + external open); boot animation (≤2s, skippable); wallpaper collection; UI sounds muted by default; app-plugin contract so future sessions register apps without forking the core; per-app ultron-supreme session prompts as a final deliverable.

Non-goals (this session): Terminal, Paint, DAW apps (federated to later sessions); mobile/touch adaptation; real network features, auth, sharing, telemetry; multi-language; iframing arbitrary external sites.

Technical constraints: client-side only; all persistence in browser storage; static deploy. Explicitly undecided (routed): storage technology (localStorage vs IndexedDB — research); frontend stack (research/planning).

## Brand Commitments

- The OS is a **custom fantasy OS**: an invented design language, explicitly not a clone of any real operating system (user-binding).
- Product name/identity: undecided — the design direction phase may propose one.

## Evidence on Hand

None yet. The author's real content pack (name, bio, links, project list, project screenshots) arrives during production via a template. Future work must not fabricate bio, projects, testimonials, or metrics.

## Product Principles

1. **Wow in the first five seconds** — boot to interactive desktop fast; polish where visitors look first.
2. **Everything is real** — working apps and persistent state beat decorative imitation.
3. **Desktop-first, degrade honestly** — full experience on desktop; phones get an honest notice card, never a broken layout.
4. **The platform is a product** — the app-plugin contract keeps federated future apps welcome.
5. **Performance is part of the aesthetic** — 60fps interactions, fast load, motion that never blocks.

## Accessibility & Inclusion

Confirmed requirements: keyboard paths for icons and windows (arrows navigate, Enter opens, Esc closes), visible focus states, ARIA window roles, `prefers-reduced-motion` respected (boot animation skippable), external links safe (`rel="noopener"`, new tab).
