/**
 * Reliquary engraved plate (batch 2, worker 8) — the HONEST DEGRADE's pure
 * core. When WebGL is unavailable the case does not fake 3D: it cuts a
 * CATALOG PLATE — the specimen's silhouette engraved as line + stipple,
 * computed by the same pure math that drives the renderer. This module
 * projects vertices through the SAME rotation the orbit camera uses
 * (rotateX(pitch) · rotateY(yaw)) and drops the depth axis (an orthographic
 * elevation — the survey sheet, not a perspective fake).
 *
 * Pure and deterministic: same geometry + same camera → same engraving,
 * byte-for-byte (unit-asserted).
 */

import type { Geometry } from './reliquary-geometry'
import { mat4Multiply, mat4RotateX, mat4RotateY, transformDirection, type Vec3 } from './reliquary-math'

/** A 2D plate point in normalized plate space: x,y ∈ [−1, 1]. */
export type PlatePoint = readonly [number, number]

/** An engraving's cut geometry: the closed hull outline + the stipple field. */
export interface PlateEngraving {
  /** The silhouette's convex outline, wound counter-clockwise, NOT closed (the renderer closes it). */
  readonly hull: readonly PlatePoint[]
  /** Interior specimen points — the stipple field that fills the outline. */
  readonly stipple: readonly PlatePoint[]
  /** How many source vertices were projected (the caption reports it honestly). */
  readonly projectedCount: number
}

/**
 * The convex hull by Andrew's monotone chain, wound counter-clockwise.
 * Collinear points on the boundary are kept OFF the chains (strict turns).
 * A degenerate (all-collinear) input collapses to its two extremes.
 */
export function hull2D(points: readonly PlatePoint[]): PlatePoint[] {
  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1]! - b[1]! : a[0]! - b[0]!))
  const deduped: PlatePoint[] = []
  for (const point of sorted) {
    const last = deduped[deduped.length - 1]
    if (!last || last[0] !== point[0] || last[1] !== point[1]) deduped.push(point)
  }
  if (deduped.length <= 2) return deduped

  const cross = (o: PlatePoint, a: PlatePoint, b: PlatePoint): number =>
    (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!)

  const lower: PlatePoint[] = []
  for (const point of deduped) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  }
  const upper: PlatePoint[] = []
  for (let i = deduped.length - 1; i >= 0; i -= 1) {
    const point = deduped[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }
  upper.pop() // last point of each chain is the first of the other
  lower.pop()
  return [...lower, ...upper]
}

/** Default stipple density: the field lands near ~150 marks whatever the mesh. */
const TARGET_STIPPLE = 150

/**
 * Engrave one specimen: rotate by the orbit camera's rotation, project
 * orthographically onto the plate (drop depth), normalize to the unit disc,
 * hull the outline, stipple the interior. `stippleStride` overrides the
 * density heuristic (tests pin it at 1 for exactness).
 */
export function engrave(
  geometry: Geometry,
  yaw: number,
  pitch: number,
  options: { readonly stippleStride?: number } = {},
): PlateEngraving {
  const rotation = mat4Multiply(mat4RotateX(pitch), mat4RotateY(yaw))
  const positions = geometry.positions
  const vertexCount = positions.length / 3

  const rotated: Vec3[] = []
  let maxRadius = 0
  for (let i = 0; i < vertexCount; i += 1) {
    const rotatedVertex = transformDirection(rotation, [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!])
    rotated.push(rotatedVertex)
    maxRadius = Math.max(maxRadius, Math.abs(rotatedVertex[0]), Math.abs(rotatedVertex[1]))
  }
  const scale = maxRadius === 0 ? 1 : 1 / maxRadius

  const projected: PlatePoint[] = rotated.map((v) => [v[0] * scale, v[1] * scale])
  const stride = options.stippleStride ?? Math.max(1, Math.ceil(vertexCount / TARGET_STIPPLE))
  const stipple: PlatePoint[] = []
  for (let i = 0; i < projected.length; i += stride) stipple.push(projected[i]!)

  return {
    hull: hull2D(projected),
    stipple,
    projectedCount: vertexCount,
  }
}
