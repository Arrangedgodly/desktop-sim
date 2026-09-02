/**
 * Wallplate geometry helpers (UI-4) — pure, deterministic math for the
 * authored archive plates. No randomness at render time: everything derives
 * from fixed seeds, so a plate paints IDENTICALLY on every mount (asserted
 * by the wallplates test) and costs one pass of arithmetic per page load —
 * the derived arrays are module-level constants, computed once, never per
 * mount.
 *
 * These are exact, session-specifiable constructions (the craft floor's
 * "geometry, not pictures" class), not generative art: densities, counts and
 * extents are chosen constants below.
 */

/** Minimal deterministic LCG (mulberry-style) — fixed seed in, same seq out. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Point {
  readonly x: number
  readonly y: number
}

/** Point on a quadratic bezier at t. */
export function quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  }
}

/** Tangent direction (radians) of a quadratic bezier at t. */
export function quadTangent(p0: Point, p1: Point, p2: Point, t: number): number {
  const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
  const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
  return Math.atan2(dy, dx)
}

export const deg = (d: number): number => (d * Math.PI) / 180

/** Polar → cartesian around a center; 0° = east, y grows downward. */
export function polar(center: Point, radius: number, angleRad: number): Point {
  return { x: center.x + radius * Math.cos(angleRad), y: center.y + radius * Math.sin(angleRad) }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Shortest perpendicular offset of a point from an infinite line p0→p1. */
export function distanceFromLine(p: Point, p0: Point, p1: Point): number {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p.x - p0.x, p.y - p0.y)
  return Math.abs((p.x - p0.x) * dy - (p.y - p0.y) * dx) / len
}

/**
 * Perpendicular chain ticks along a segment — the surveyor's chained
 * baseline. Every `step` units, a `len`-unit tick square to the line.
 */
export function chainTicks(
  p0: Point,
  p1: Point,
  step: number,
  len: number,
): readonly { readonly a: Point; readonly b: Point }[] {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const length = Math.hypot(dx, dy)
  const ux = dx / length
  const uy = dy / length
  const nx = -uy
  const ny = ux
  const ticks: { a: Point; b: Point }[] = []
  for (let d = step; d < length - step * 0.5; d += step) {
    const cx = p0.x + ux * d
    const cy = p0.y + uy * d
    ticks.push(
      { a: { x: cx - nx * len, y: cy - ny * len }, b: { x: cx + nx * len, y: cy + ny * len } },
    )
  }
  return ticks
}
