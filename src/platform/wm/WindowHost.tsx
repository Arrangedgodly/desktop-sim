import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useWMStore, type WindowRecord } from '../stores'
import { useViewportSize } from './use-viewport-size'
import { WindowFrame } from './WindowFrame'
import { viewportRecovery, type ViewportSize } from './geometry'

export interface WindowHostProps {
  /**
   * Content resolver — the IM-3 seam. Given the live window record it returns
   * the React node to mount in that window's content slot. Omit → placeholder
   * label naming the appId.
   */
  readonly contentFor?: (win: WindowRecord) => ReactNode
  /**
   * Close-request policy — the HU-2 seam (`appCloseGuardFor` at the
   * composition root). `true` vetoes a platform-initiated close; the owning
   * app takes the rest of the flow. Omit → always close.
   */
  readonly closeGuard?: (win: WindowRecord) => boolean
  /** Override for the measured viewport (tests / embedding seams). */
  readonly viewport?: ViewportSize
}

/**
 * Mounting host for the open-windows registry (IM-4a). Renders one WindowFrame
 * per registry entry in stacking order (bottom → top); each frame carries its
 * own inline z from the record, kept in lockstep with this order by the store.
 *
 * Minimized windows STAY MOUNTED and are hidden with CSS — component state of
 * mounted apps survives a minimize/restore cycle. The IM-4c taskbar seam: list
 * `windows` (minimized included) and call `restoreWindow(id)` on click.
 *
 * HU-2 offscreen recovery: a window whose STORED geometry no longer fits the
 * live viewport (saved on a big monitor, reopened on a laptop — or the browser
 * window shrank since) is committed back to its clamped on-screen geometry.
 * The renderer already clamps visually every frame; this closes the gap
 * between the rendered frame and the record so the persisted geometry, the
 * drag math and the pixels can never disagree (without it, the first
 * title-bar grab of a recovered window teleports it off-screen).
 */
export function WindowHost({ contentFor, closeGuard, viewport: viewportOverride }: WindowHostProps) {
  // zOrder consumer (store layer rule 1): the host re-renders when stacking
  // changes (open/close/raise) — never on a window's geometry commits.
  const zOrder = useWMStore((s) => s.zOrder)
  const measured = useViewportSize()
  const viewport = viewportOverride ?? measured

  // Offscreen recovery (see the component doc). Runs when the stacking order
  // changes (hydrate included — the MF-2 loader rebuilds zOrder) or the
  // viewport changes; commits ONLY the offending records, so it converges in
  // one pass and never fights the gesture path (drag commits are already
  // clamped, and a geometry commit does not re-trigger this effect).
  useEffect(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return
    const wm = useWMStore.getState()
    for (const id of zOrder) {
      const win = wm.windows[id]
      if (!win) continue
      const recovered = viewportRecovery(win.geometry, viewport)
      if (recovered) useWMStore.getState().commitWindowGeometry(id, recovered)
    }
  }, [viewport, zOrder])

  return (
    <div className="wm-host" data-wm-host>
      {zOrder.map((id) => (
        <WindowFrame
          key={id}
          id={id}
          viewport={viewport}
          renderContent={contentFor}
          closeGuard={closeGuard}
        />
      ))}
    </div>
  )
}
