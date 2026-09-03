/**
 * Vitals manifest (federated batch 2) — CONSOLE VITALS: the OS honestly
 * monitoring itself. An instrument panel of engraved plates over recessed
 * phosphor wells — rolling frame rate, long tasks, JS heap, archive storage,
 * open windows + registered modules, session uptime, and the boot timeline
 * replayed from the platform's own `window.__BOOT_TIMELINE` seam. Every
 * metric is local and true; an unavailable metric renders a "NOT
 * TELEMETRIED" plate, never a fabricated number.
 *
 * Nothing routes FILES into it (no `acceptedFileTypes` — the panel is
 * opened, never "opened onto").
 *
 * Instance rule: SINGLETON — one panel ever; every later open (launcher,
 * taskbar) raises + focuses the existing window via the registry's singleton
 * instance key (docs/APP-CONTRACT.md "Instance rules"). The panel's one
 * persisted setting (the sample rate) rides the window record's opaque
 * appState, so the single window is the same instrument across reloads.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes)
 * rides the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * NOTE (registration ORDER — the integrator wires this): suggested seat is
 * in the closing run immediately BEFORE the settings console, joining the
 * terminal and the painter; the launcher's first item stays the notepad and
 * its last stays the console.
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { VitalsIcon } from './VitalsIcon'

const VitalsSurface = retryableLazy(() => import('./VitalsSurface'))

export const vitalsApp: AppManifest = {
  id: 'vitals',
  name: 'Console Vitals',
  icon: VitalsIcon,
  mount: VitalsSurface,
  singleton: true, // ONE panel ever: re-open raises + focuses it
  // 720×520: two chart plates side by side above the readout row, at the
  // cascade origin, clear of the 44px drawer rail on a 720-tall viewport.
  defaultGeometry: { w: 720, h: 520 },
}
