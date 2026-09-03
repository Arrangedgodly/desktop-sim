/**
 * Relay manifest (batch 2, brief 3) — SURVEY RELAY, the hold's mail wire:
 * correspondence from the survey vessel's home office arrives on a drip
 * schedule once the relay is first opened (first post ~20s in, then minutes
 * apart; the wire pauses while the hold's display is hidden). Letters are
 * read on parchment; each may be FILED to the archive — a real text specimen
 * under a `Relay` drawer bootstrapped on the first file.
 *
 * Instance rule: SINGLETON — one relay window ever; a re-open raises and
 * focuses it (registry instance dedupe; this app manages none of it).
 *
 * No acceptedFileTypes: correspondence is not a specimen handler — nothing
 * in the catalog opens into the relay (the notepad owns the text
 * double-click route; filing is this module's own one-way street).
 *
 * No close guard: nothing can be lost here. Read/filed marks and the watch
 * clock ride the window record's appState (persisted as they change); filed
 * specimens live in the FS tree, which is already the archive's memory. The
 * in-world consequence, honored honestly: closing the window and reopening
 * starts a NEW watch — the wire speaks again, and filing is idempotent by
 * label so the archive never grows a duplicate transcript.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * TEST HOOK (documented for the integrator's e2e — brief 3 acceptance 8):
 * the mounted surface exposes `window.__relayTestHook.advance(ms)` to advance
 * the relay clock directly (the drip's honest seam for tests; an operator
 * pacing their own sandbox harms nothing). tests/e2e/relay.spec.ts drives it.
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { RelayIcon } from './RelayIcon'

const RelaySurface = retryableLazy(() => import('./RelaySurface'))

export const RELAY_APP_ID = 'relay'

export const relayApp: AppManifest = {
  id: RELAY_APP_ID,
  name: 'Survey Relay',
  icon: RelayIcon,
  mount: RelaySurface,
  singleton: true, // one wire on the hold — re-open raises it
  defaultGeometry: { w: 720, h: 520 },
}
