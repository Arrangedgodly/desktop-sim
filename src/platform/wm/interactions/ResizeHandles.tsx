/**
 * Corner-bracket resize surfaces (IM-4b): the SE corner bracket plus the E/S
 * edge pulls, in the console's rack-handle vocabulary (brass hardware
 * touchpoints, same family as the specimen selection brackets). Pointer-only
 * surfaces by design — the keyboard story belongs to DD-1's interaction map.
 */

import { RESIZE_HANDLES, type ResizeHandle } from './gesture-math'
import type { GestureSurfaceProps } from './use-window-gestures'
import './interactions.css'

export interface WindowResizeHandlesProps {
  /** Props for one handle surface, from `useWindowGestures().resizeHandle`. */
  readonly handleProps: (handle: ResizeHandle) => GestureSurfaceProps
}

/** Renders the se/e/s resize surfaces inside the window frame. */
export function WindowResizeHandles({ handleProps }: WindowResizeHandlesProps) {
  return (
    <>
      {RESIZE_HANDLES.map((handle) => (
        <div
          key={handle}
          className="wm-resize-handle"
          data-resize={handle}
          aria-hidden="true"
          {...handleProps(handle)}
        />
      ))}
    </>
  )
}
