/**
 * Settings model (AP-4) — the console panel's machinery that is NOT markup:
 * the guarded-reset orchestration, the session-scoped "archive resealed"
 * report flag, and the vault readout's pure formatters.
 *
 * THE GUARDED RESET (the design brief's law: "destructive actions are guarded
 * toggle covers") ends in `throwGuardedReset`, which composes two seams that
 * already existed before this app:
 *
 *   1. MF-2's `resetDesktop()` (src/lib/storage/persistence.ts — "AP-4 seam"):
 *      clear state + backup + boot flag → reseed the catalog → REHYDRATE the
 *      three stores → persist immediately (never debounced). Hydration is the
 *      "closes all windows" step by construction — `hydrateStores` replaces
 *      the WM session with the seed's empty one, so every open window
 *      (including THIS console) unmounts.
 *   2. IM-3's `openApp` — the console RELIGHTS ITSELF under its singleton id
 *      the moment the reseed lands, so the in-world ARCHIVE RESEALED report
 *      has a home to render in. This continuation runs past its own unmount
 *      on purpose: a thrown hardware switch does not wait for the module it
 *      just powered down.
 *
 * The report flag is SESSION-SCOPED (module state, like the viewer's per-
 * session view memory): a reload clears it with every other per-session app
 * memory — which is exactly what the confirm strip promises.
 *
 * SOUNDS + REDUCED-MOTION toggles have no model machinery of their own: they
 * write the settings store (persisted by MF-2's autosave the same millisecond
 * as wallpaper), and their consumers land in later tasks —
 *   · soundsEnabled: UI-6's WebAudio playback is wired to this switch
 *     (src/lib/audio reads it live; ships muted).
 *   · reducedMotionFollow: governs whether the console's authored motion
 *     (POST pacing, the guard's rail slide, phosphor moments) follows the OS
 *     `prefers-reduced-motion` preference. Today the OS floor honors the
 *     preference unconditionally (global.css media hook + UI-2's boot reads
 *     the media query directly), which is byte-identical to the default
 *     (follow = ON); consuming the OFF demand at the boot seam belongs to the
 *     platform lane that owns BootSequence (DD-2 scope), recorded here so the
 *     seam is not lost. This module consumes it honestly where it CAN: the
 *     guard snaps between its seats instead of sliding when the console
 *     holds still (`motionHoldsStill`).
 */

import { SETTINGS_APP_ID, openApp } from '../../platform/app-registry'
import { resetDesktop, type ResetResult } from '../../lib/storage'

/** Epoch ms of the last completed guarded reset; null until one lands. */
let resealedAt: number | null = null

/** The resealed report's clock (rendered as the strip's stamp). Null = none. */
export function archiveResealedAt(): number | null {
  return resealedAt
}

/**
 * Clear the report — the operator's "return to console" dismissal. A reload
 * clears it the hard way (module state), which is the documented behavior.
 */
export function clearArchiveResealed(): void {
  resealedAt = null
}

/**
 * Throw the guarded reset switch: storage reset → reseed → rehydrate (every
 * window closes) → immediate persist, then relight the console so the seal
 * can report itself. The in-memory reseed proceeds even when storage fails
 * (private mode); the typed failure rides the result for the vault readout.
 */
export async function throwGuardedReset(): Promise<ResetResult> {
  const result = await resetDesktop()
  resealedAt = Date.now()
  openApp(SETTINGS_APP_ID) // singleton: one relit console, never a second
  return result
}

/**
 * Does the console hold still right now? True only when the operator lets it
 * follow the OS AND the OS asks for reduced motion. A follow=OFF console
 * demands full motion (the flap swings); the global CSS floor still collapses
 * animation for the OS-side case, so this gates the module's own transition.
 */
export function motionHoldsStill(reducedMotionFollow: boolean): boolean {
  if (!reducedMotionFollow) return false
  const mm =
    typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
      : null
  return Boolean(mm?.matches)
}

/** B612 readout clock — HH:MM:SS, UTC, zero-padded (deterministic in tests). */
export function formatReadoutClock(epoch: number): string {
  const d = new Date(epoch)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** Whole bytes below the first unit, one decimal above (1.2 MB, 512 B, 0 B). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = unit === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1)
  return `${text} ${BYTE_UNITS[unit]!}`
}

/** Whole-percent share of the quota, clamped at 100; null when uncomputable. */
export function quotaPercent(usage: number, quota: number): number | null {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0 || usage < 0) return null
  return Math.min(100, Math.round((usage / quota) * 100))
}
