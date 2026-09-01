/**
 * Pure gesture math for IM-4b (window move/resize) — no DOM, no store access.
 *
 * Every function takes the single captured gesture-start snapshot (RQ-3:
 * "movement math from the single captured start snapshot, not accumulated
 * deltas") plus the RAW pointer delta and returns the next geometry, already
 * clamped through `clampGeometryToViewport` (geometry.ts) — so the transient
 * paint path and the pointerup commit path can never disagree, and neither can
 * propose an offscreen or undersized window. The min-size floor lives in
 * geometry.ts (`MIN_WINDOW_WIDTH` 320 / `MIN_WINDOW_HEIGHT` 200).
 */

import type { WindowGeometry } from '../../stores/wm-store'
import { clampGeometryToViewport, type ViewportSize } from '../geometry'

/**
 * Click-vs-drag threshold (RQ-3: "~3–4 px"). Pointer travel up to and including
 * this distance is a CLICK (focus only); beyond it the gesture arms. Applied to
 * the squared distance so no sqrt runs per move.
 */
export const CLICK_VS_DRAG_THRESHOLD_PX = 4

/** Corner-bracket resize directions shipped by IM-4b (se corner + e/s edges). */
export type ResizeHandle = 'se' | 'e' | 's'

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['se', 'e', 's']

/** True when pointer travel exceeds the click-vs-drag threshold. */
export function movedBeyondThreshold(
  dx: number,
  dy: number,
  threshold: number = CLICK_VS_DRAG_THRESHOLD_PX,
): boolean {
  return dx * dx + dy * dy > threshold * threshold
}

/**
 * Next geometry for a move gesture: start plus the raw delta, viewport-clamped.
 * The paint path renders the CLAMPED result as a transform delta (start→next)
 * so `left`/`top` never move mid-gesture (transform-only, RQ-3).
 */
export function resolveMoveGeometry(
  start: WindowGeometry,
  dx: number,
  dy: number,
  viewport: ViewportSize,
): WindowGeometry {
  return clampGeometryToViewport({ ...start, x: start.x + dx, y: start.y + dy }, viewport)
}

/**
 * Next geometry for a resize gesture. `e` grows width only, `s` height only,
 * `se` both — negative deltas shrink, floored at the min size (and capped at
 * the viewport) by the shared clamp. x/y never change: these handles pull the
 * far edge, the origin stays put.
 */
export function resolveResizeGeometry(
  start: WindowGeometry,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  viewport: ViewportSize,
): WindowGeometry {
  const w = handle === 'se' || handle === 'e' ? start.w + dx : start.w
  const h = handle === 'se' || handle === 's' ? start.h + dy : start.h
  return clampGeometryToViewport({ ...start, w, h }, viewport)
}
