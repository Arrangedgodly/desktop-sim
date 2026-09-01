import type { ReactNode } from 'react'
import { useWMStore, type WindowRecord } from '../stores'
import { useViewportSize } from './use-viewport-size'
import { WindowFrame } from './WindowFrame'
import type { ViewportSize } from './geometry'

export interface WindowHostProps {
  /**
   * Content resolver — the IM-3 seam. Given the live window record it returns
   * the React node to mount in that window's content slot. Omit → placeholder
   * label naming the appId.
   */
  readonly contentFor?: (win: WindowRecord) => ReactNode
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
 */
export function WindowHost({ contentFor, viewport: viewportOverride }: WindowHostProps) {
  // zOrder consumer (store layer rule 1): the host re-renders when stacking
  // changes (open/close/raise) — never on a window's geometry commits.
  const zOrder = useWMStore((s) => s.zOrder)
  const measured = useViewportSize()
  const viewport = viewportOverride ?? measured

  return (
    <div className="wm-host" data-wm-host>
      {zOrder.map((id) => (
        <WindowFrame key={id} id={id} viewport={viewport} renderContent={contentFor} />
      ))}
    </div>
  )
}
