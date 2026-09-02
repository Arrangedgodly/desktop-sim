# Privacy note (CA-1 → COM-1)

One paragraph, written for the README's front face. COM-1 folds this in
verbatim (or lightly edited for voice); CA-1 owns the wording so the privacy
claims stay audited. Every sentence below is backed by a gate in
`tests/e2e/privacy.spec.ts` against the production build — see the CA-1 entry
in `docs/ultron/production-log.md` for the full audit (request inventory,
storage containment, CSP enforcement).

---

**This site stores nothing anywhere but your browser.** There is no server,
no account, and nothing to sign into: the entire archive ships as static
files, runs locally in your tab, and every byte of your session — the
specimens you open, the drawers you rearrange, the notes you type — is kept
in your own browser's IndexedDB (plus one tiny local flag that remembers
you've booted before), never sent anywhere and never read by anyone,
including us. The console makes zero network requests after it loads: no
analytics, no telemetry, no font CDNs, no third-party calls of any kind — a
locked-down Content-Security-Policy enforces that, refusing even the
possibility of an off-origin connection. The only links that ever leave the
site are the ones you click yourself (the officer's contact channels and
project plates), which open in a new tab stripped of any referrer
information about where you came from. Clear your browser storage and the
archive forgets you completely — that is the whole deal.
