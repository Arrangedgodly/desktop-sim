import type { AppManifest } from '../app-registry'
import type { AppId, WindowId, WindowRecord } from '../stores/wm-store'

/**
 * Open-window LED model (IM-4c) — pure derivation from the wm-store registry
 * onto the rail's indicator strip. No store access, no React: TaskbarRail
 * feeds the live slices in, the view models come out. Consumed by
 * `WindowLedButton` (render) and the tests (truth).
 *
 * Label law (dispatch):
 * - registered app → the manifest's module name;
 * - multi-instance app with N > 1 open windows → `NAME <1-based index>`
 *   (index by open order, `openedAt`, so a module's LEDs read 1, 2, 3… and
 *   never reshuffle when focus raises one);
 * - unregistered app (IM-3) → the MODULE UNAVAILABLE state — the LED keeps
 *   reporting the window (it is still open and closable) under IM-3's own
 *   vocabulary, dimmed by the view.
 */

/** The LED's label for a window whose app left the registry (IM-3 vocabulary). */
export const MODULE_UNAVAILABLE_LABEL = 'MODULE UNAVAILABLE'

/** One rail indicator. Flags mirror the store; the view maps them to states. */
export interface WindowLed {
  readonly id: WindowId
  readonly appId: AppId
  /** Caption shown on the indicator (module name, or the unavailable label). */
  readonly label: string
  /** 1-based open-order index among this app's open windows. */
  readonly instanceIndex: number
  /** How many windows this app has open. */
  readonly instanceCount: number
  readonly minimized: boolean
  readonly focused: boolean
  /** The app is no longer registered (IM-3 MODULE UNAVAILABLE behavior). */
  readonly unavailable: boolean
}

export type WindowsSlice = Readonly<Record<WindowId, WindowRecord>>
export type AppsSlice = Readonly<Record<AppId, AppManifest>>

/**
 * Derive the LED list, ordered by OPEN order (`openedAt` ascending, stacking
 * position as the tie-break for same-millisecond opens) — launch order reads
 * steadier on a rail than stacking order, which reshuffles on every raise.
 * Minimized windows are included by design (the rail is their restore seam).
 */
export function buildWindowLeds(
  windows: WindowsSlice,
  zOrder: readonly WindowId[],
  focusedId: WindowId | null,
  apps: AppsSlice,
): readonly WindowLed[] {
  const stackIndex = new Map<WindowId, number>()
  zOrder.forEach((id, index) => stackIndex.set(id, index))
  const opened = zOrder.flatMap((id) => {
    const record = windows[id]
    return record ? [record] : []
  })
  const ordered = [...opened].sort((a, b) => {
    const byTime = a.openedAt - b.openedAt
    if (byTime !== 0) return byTime
    return (stackIndex.get(a.id) ?? 0) - (stackIndex.get(b.id) ?? 0)
  })

  const counts = new Map<AppId, number>()
  for (const record of ordered) counts.set(record.appId, (counts.get(record.appId) ?? 0) + 1)

  const seen = new Map<AppId, number>()
  return ordered.map((record) => {
    const manifest = apps[record.appId]
    const instanceCount = counts.get(record.appId) ?? 1
    const instanceIndex = (seen.get(record.appId) ?? 0) + 1
    seen.set(record.appId, instanceIndex)
    const label =
      manifest === undefined
        ? MODULE_UNAVAILABLE_LABEL
        : instanceCount > 1
          ? `${manifest.name} ${instanceIndex}`
          : manifest.name
    return {
      id: record.id,
      appId: record.appId,
      label,
      instanceIndex,
      instanceCount,
      minimized: record.minimized,
      focused: focusedId === record.id,
      unavailable: manifest === undefined,
    }
  })
}

/** Accessible name: the caption plus the window's live state word. */
export function ledAriaLabel(led: WindowLed): string {
  const state = led.focused ? 'focused' : led.minimized ? 'minimized' : 'open'
  return `${led.label}, ${state}`
}

/** Hover tooltip — names the action (craft floor: controls name their action). */
export function ledTitle(led: WindowLed): string {
  if (led.unavailable) {
    return `${led.appId} is not registered with the archive — module unavailable`
  }
  if (led.focused) return `${led.label} — click to stow (minimize)`
  if (led.minimized) return `${led.label} — click to restore`
  return `${led.label} — click to raise and focus`
}
