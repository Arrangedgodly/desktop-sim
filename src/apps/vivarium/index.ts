/**
 * Vivarium manifest (batch 2, brief 1) — HOLD VIVARIUM, the OS's moment of
 * life: a phosphor-well tank of fictional specimens (a schooling minnow form,
 * slow drifters, a darting stalker at the school's edge, drifting motes).
 * Tapping the glass drops a nutrient mote — the school converges, the drifter
 * ignores it.
 *
 * Instance rule: SINGLETON — one tank on the hold, ever; a re-open raises and
 * focuses it (registry instance dedupe; this app manages none of it).
 *
 * No acceptedFileTypes: the vivarium is a habitat, not a specimen handler —
 * nothing in the catalog opens into it.
 *
 * No persistence of tank state (brief non-goal): a fresh seeded tank every
 * open; nothing is written to the window's appState, and the platform's
 * window restoration remounts a fresh tank by design.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * SEAM REQUEST (logged in docs/ultron/sessions/batch2/vivarium-log.md):
 * idle-takeover — the tank becoming the OS's screensaver after an idle period
 * needs a platform-level idle timer seam this app cannot express from inside
 * its window; the launchable tank is the shipped scope.
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { VivariumIcon } from './VivariumIcon'

const VivariumSurface = retryableLazy(() => import('./VivariumSurface'))

export const VIVARIUM_APP_ID = 'vivarium'

export const vivariumApp: AppManifest = {
  id: VIVARIUM_APP_ID,
  name: 'Hold Vivarium',
  icon: VivariumIcon,
  mount: VivariumSurface,
  singleton: true, // one tank on the hold — re-open raises it
  defaultGeometry: { w: 640, h: 520 },
}
