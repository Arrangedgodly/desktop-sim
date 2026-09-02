/**
 * Cue wiring (UI-6) — the subscribe layer that maps the platform's existing
 * seams onto `playCue`. It EDITS NO BEHAVIOR: every cue rides a store
 * subscription or an event-bus listen, never a forked code path.
 *
 *   seam                        → cue
 *   ─────────────────────────────────────────────────────────────────
 *   wm-store windows diff       → window-open / window-close
 *   wm-store minimized count    → minimize (stowing only; restores are quiet)
 *   settings soundsEnabled      → toggle (arming click only; muting = silence
 *                                 + shutdownAudio, so muted = no live graph)
 *   fs-store nodes diff         → drop-on-folder (IM-5's atomic moveNode commit)
 *   menus event bus             → menu-open / menu-select
 *   boot milestone 'desktop-ready' → boot-complete
 *
 * Diff rules (deliberate):
 * - WM: exactly ONE window added/removed is an operator action; bulk reseats
 *   (MF-2 hydrate at boot, AP-4's reset rehydrate) stay silent.
 * - FS: the cue fires only on the exact IM-5 shape — same id set, exactly one
 *   node whose parent changed, and it landed in a DRAWER (new parent ≠ root;
 *   desktop drops can only file INTO folders, so a reseed's root-ward
 *   reseats never masquerade as a filing).
 * - Boot: 'desktop-ready' (the desktop's first frame — always marked once,
 *   return visits included). On a reload with sounds armed it arrives before
 *   any gesture and the engine drops it by the activation law; it sounds for
 *   the operator who clicked/skipped their way in.
 * - The taskbar's module DRAWER (IM-4c) is its own control surface, not the
 *   UI-5 menu shell — its open is a drawer pull, and its launches already
 *   sound as window-open through the WM seam. Nothing else is owed a cue.
 *
 * Cost when muted: each seam event costs one playCue call, which returns at
 * the first boolean check (engine.ts mute law) — no deferred work anywhere.
 *
 * LAYERING: like lib/storage, this is a src/lib module that imports from
 * src/platform — it is DEFINED by the store seams it serves; the dependency
 * stays one-directional (platform never imports audio; main.tsx attaches it
 * once).
 */

import { ROOT_ID } from '../fs'
import { playCue, shutdownAudio } from './engine'
import { useFSStore } from '../../platform/stores/fs-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { useWMStore } from '../../platform/stores/wm-store'
import type { WindowRecord } from '../../platform/stores/wm-store'
import { DESKTOP_READY } from '../../platform/boot/boot-milestones'
import { onBootMilestone } from '../perf/boot-timeline'
import { onMenuEvent } from '../../platform/menus/menu-events'

/** Windows currently minimized — the selector the minimize cue rides. */
function minimizedCount(windows: Readonly<Record<string, WindowRecord>>): number {
  return Object.values(windows).filter((win) => win.minimized).length
}

/** Guard so double-attach (HMR re-running main.tsx) never double-fires cues. */
let attached = false

/**
 * Attach every cue subscription. Called ONCE from main.tsx (idempotent — a
 * re-attach, e.g. under HMR, returns the same no-op detach). The returned
 * detach exists for tests; production never detaches.
 */
export function attachAudioCues(): () => void {
  if (attached) return () => {}
  attached = true

  const detachAll = (): void => {
    for (const detach of detachers.splice(0)) detach()
    attached = false
  }

  const detachers: Array<() => void> = [
    // The switch's own throw: arming clicks; muting is silence itself — and
    // shuts the live graph down so muted = zero audio state.
    useSettingsStore.subscribe(
      (s) => s.soundsEnabled,
      (armed) => {
        if (armed) playCue('toggle')
        else shutdownAudio()
      },
    ),

    // Window seating / closing: single add or remove through the one WM map.
    useWMStore.subscribe(
      (s) => s.windows,
      (windows, prev) => {
        const added = Object.keys(windows).filter((id) => !(id in prev))
        const removed = Object.keys(prev).filter((id) => !(id in windows))
        if (added.length === 1 && removed.length === 0) playCue('window-open')
        else if (removed.length === 1 && added.length === 0) playCue('window-close')
        // Bulk reseats (hydrate/reset) and mixed shapes stay silent.
      },
    ),

    // LED stows to the rail. (A minimized count rising can only be a stow.)
    useWMStore.subscribe(
      (s) => minimizedCount(s.windows),
      (now, prev) => {
        if (now > prev) playCue('minimize')
      },
    ),

    // IM-5's drop-on-folder: the ONE atomic moveNode commit per gesture,
    // recognized from the store diff — the gesture code stays untouched.
    useFSStore.subscribe(
      (s) => s.fs.nodes,
      (nodes, prev) => {
        const ids = Object.keys(nodes)
        const prevIds = Object.keys(prev)
        if (ids.length !== prevIds.length) return // create/delete — not a filing
        const moved: string[] = []
        for (const id of ids) {
          if (!prev[id]) return
          if (nodes[id]!.parentId !== prev[id]!.parentId) moved.push(id)
        }
        const [movedId] = moved
        if (
          moved.length === 1 &&
          movedId !== undefined &&
          nodes[movedId]!.parentId !== ROOT_ID // landed in a drawer, not a reseat to root
        ) {
          playCue('drop-on-folder')
        }
      },
    ),

    // Menu shell life: the unfold tick and the row tock.
    onMenuEvent((event) => {
      playCue(event === 'open' ? 'menu-open' : 'menu-select')
    }),

    // The archive is live — the desktop's first frame.
    onBootMilestone((milestone) => {
      if (milestone.name === DESKTOP_READY) playCue('boot-complete')
    }),
  ]

  return detachAll
}
