import type { WindowGeometry } from '../stores/wm-store'

/**
 * Window geometry math (IM-4a). Pure functions, no store access — shared by the
 * render path (WindowFrame derives on-screen bounds) and, later, by IM-4b's
 * gesture-commit path, so a dragger can never commit an offscreen window either.
 */

/** Structural floor for a usable module (UI-1 may revisit the exact figure). */
export const MIN_WINDOW_WIDTH = 320
export const MIN_WINDOW_HEIGHT = 200

export interface ViewportSize {
  readonly w: number
  readonly h: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Keep a window fully on-screen: sizes floored at the minimums and capped at the
 * viewport, position clamped so the whole module stays reachable. Windows are
 * kept ENTIRELY inside the viewport at this layer (HU-2 later owns the
 * allow-partially-offscreen niceties for dragged windows).
 */
export function clampGeometryToViewport(
  geometry: WindowGeometry,
  viewport: ViewportSize,
): WindowGeometry {
  const w = clamp(geometry.w, MIN_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, viewport.w))
  const h = clamp(geometry.h, MIN_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, viewport.h))
  const x = clamp(geometry.x, 0, Math.max(0, viewport.w - w))
  const y = clamp(geometry.y, 0, Math.max(0, viewport.h - h))
  return { x, y, w, h }
}

/**
 * HU-2 offscreen recovery: the geometry a STORED window record should be
 * committed to when it no longer fits the live viewport — saved on a big
 * monitor, reopened on a laptop — or `null` when it already sits fully
 * on-screen (or the viewport is degenerate/0, i.e. not yet measured: there is
 * nothing honest to clamp against). The renderer clamps visually on every
 * frame; THIS is the store-side recovery, so the persisted record, the drag
 * math (`startGeometry`) and the rendered frame can never disagree — without
 * it, the first title-bar grab of a recovered window teleports it.
 */
export function viewportRecovery(
  geometry: WindowGeometry,
  viewport: ViewportSize,
): WindowGeometry | null {
  if (viewport.w <= 0 || viewport.h <= 0) return null
  const clamped = clampGeometryToViewport(geometry, viewport)
  return clamped.x === geometry.x &&
    clamped.y === geometry.y &&
    clamped.w === geometry.w &&
    clamped.h === geometry.h
    ? null
    : clamped
}

/**
 * Maximized bounds are DERIVED from the `maximized` flag (IM-2 store contract):
 * the stored `geometry` is always the normal-state geometry and is never
 * overwritten by maximizing.
 */
export function maximizedGeometry(viewport: ViewportSize): WindowGeometry {
  return { x: 0, y: 0, w: viewport.w, h: viewport.h }
}
