# Deploying HOLD/OS — Cloudflare Pages runbook

What you are deploying: a fully static bundle. `npm run build` runs
`tsc --noEmit && vite build` and emits `dist/` — one `index.html`, hashed
`assets/` (JS/CSS/WOFF2), plus `_headers` (copied verbatim from `public/`).
No backend, no server code, no environment variables (nothing at build or
runtime reads env), no secrets, no database. Vite builds with `base: './'`,
so the bundle works at any path depth — including a project-root
`<name>.pages.dev`.

This is the human part of DEP-1: the repo side (header file, this runbook)
is done; the account wiring and first deploy below are yours.

---

## Path A (recommended): connect the repo to Cloudflare Pages

This is the committed decision from scoping — Pages wired to GitHub, deploy
gated on push.

1. **Push this repo to GitHub** if you have not already (the production line
   deliberately never pushed). Create an empty repo on GitHub, then:

   ```sh
   git remote add origin git@github.com:<you>/desktop-sim.git
   git push -u origin master
   ```

   The default branch here is `master` — rename it to `main` first if you
   prefer; just use the same name in step 4.

2. **Create the Pages project.** Cloudflare dashboard → **Workers & Pages**
   → **Create** → **Pages** tab → **Connect to Git**. Authorize GitHub and
   select the `desktop-sim` repository.

3. **Set up the build** (these three values are the whole contract):

   | Setting | Value |
   |---|---|
   | Project name | your choice — becomes `https://<name>.pages.dev` |
   | Production branch | `master` (or `main`, per step 1) |
   | Framework preset | **None** (the *Vite* preset also works — the rows below are what matter) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Environment variables | none needed |

4. **Save and Deploy.** Watch the first build finish; the site goes live at
   `https://<project>.pages.dev`. From now on every push to the production
   branch redeploys automatically, and other branches get preview URLs.

**If the build fails on Node version:** Vite 8 requires
`node ^20.19.0 || >=22.12.0`. Cloudflare's build image is normally new
enough, but if not: project → **Settings** → **Environment variables** →
add `NODE_VERSION` = `22` (Production), then **Retry deployment**.

**One Cloudflare feature to leave off:** do not enable Web Analytics'
automatic script injection on this project. The shipped CSP
(`script-src 'self'`) blocks injected analytics scripts — that is the
policy working as designed (CA-1); turning both on just generates console
noise.

## Path B (fallback): direct upload with wrangler

For a quick manual deploy without the Git integration:

```sh
npm run build
npx wrangler pages deploy dist
```

The first run opens a browser to log in to your Cloudflare account, then
asks you to create (or pick) the Pages project; later runs redeploy in
seconds. Trade-off: no auto-deploy on push and no branch previews — every
update means re-running the two commands. Path A remains the committed
recommendation; this path exists for fast manual publishes.

**Why there is no `wrangler.toml` in this repo:** Git-integration Pages
projects are configured entirely in the dashboard (build command, output
dir — as above), and direct upload needs nothing but the CLI command;
`wrangler.toml` is the Workers config surface. Committing an unused — or
worse, partially honored — config file would create a false second source
of truth. Build truth lives in `package.json` + `vite.config.ts`; deploy
truth lives in this file.

## Custom domain

Pages project → **Custom domains** → **Set up a custom domain**.

- **Domain's DNS already on this Cloudflare account:** the CNAME and the
  certificate are wired automatically. Keep the record **proxied** (orange
  cloud) — Pages serves its TLS through the Cloudflare edge; setting it
  DNS-only (gray cloud) leaves the hostname without Pages certificate
  coverage.
- **Domain's DNS elsewhere (registrar/other provider):** either move the
  zone onto Cloudflare (recommended — same automatic path as above), or add
  a `CNAME` record at your DNS host pointing at `<project>.pages.dev` and
  finish the activation in the dashboard; the certificate is issued once
  Cloudflare verifies the record.

**Optional, after the custom domain is live and stable:** HSTS was
deliberately left out of `public/_headers` (CA-1 logged it as
"optional once the custom domain is known" — it is a hostname-wide
commitment, and `*.pages.dev` is already HTTPS-only + HSTS-preloaded). If
you want it for the custom hostname, add this line to the `/*` block in
`public/_headers`, commit, push:

```
  Strict-Transport-Security: max-age=15552000
```

## SPA routing / 404 page — deliberately not shipped

There is no client-side router: the app is a single `index.html` whose
"navigation" is in-app window state, so there are no deep links to 404 and
nothing for a `404.html`-as-index fallback to serve. The plan's DEP-1 note
("custom-404 for SPA routing **if used**") resolves to *not used* — a
`404.html` copy of `index.html` would be dead weight and could shadow the
platform's own 404 behavior for genuinely missing paths.

## Verifying the first deploy (5 checks)

Do these against the production URL after the first successful deploy.
Note: `vite preview` does **not** apply `_headers` — it serves the file as
a static asset without interpreting it — so header verification (check 5)
can only happen here, post-deploy.

1. **Boot POST visible** — a first visit (fresh profile / incognito) types
   the amber POST sequence and reaches the desktop within ~2 s; click or
   key skips it; a reload short-circuits it (return visit).
2. **Icons render** — the seeded specimen icons sit on the star-chart
   plate with parchment accession labels, and the drawer-rail taskbar
   ticks its live timecode.
3. **Reload persists** — drag an icon somewhere, open a window, type into
   a notepad specimen; reload the page → everything is as you left it.
4. **Console clean** — DevTools console shows zero errors/noise; the
   Network panel shows same-origin requests only (off-origin traffic
   appears solely when you click the officer's external links).
5. **CSP / header canary** — DevTools → Network → the document request →
   Response headers: `content-security-policy: frame-ancestors 'none'`,
   `x-frame-options: DENY`,
   `permissions-policy: camera=(), microphone=(), geolocation=()`,
   `x-content-type-options: nosniff`, `referrer-policy: no-referrer`; and
   any `/assets/…` response carries
   `cache-control: public, max-age=31536000, immutable` while the document
   itself carries `cache-control: no-cache`. (The strict meta CSP is
   already proven enforced by the repo's e2e canaries; these response
   headers are the part only the real deployment can prove.)

All five green → report back to the production line so DEP-1 closes out.
Anything red → capture a screenshot + the Network/console state; header
misses usually mean `_headers` did not reach `dist/` (run `npm run build`
locally and confirm `dist/_headers` exists) or the deploy predates the
file.
