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
 * Maximized bounds are DERIVED from the `maximized` flag (IM-2 store contract):
 * the stored `geometry` is always the normal-state geometry and is never
 * overwritten by maximizing.
 */
export function maximizedGeometry(viewport: ViewportSize): WindowGeometry {
  return { x: 0, y: 0, w: viewport.w, h: viewport.h }
}
