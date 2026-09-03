import { describe, expect, it } from 'vitest'
import { facetedCrystal } from './reliquary-geometry'
import { engrave, hull2D } from './reliquary-plate'

/**
 * Reliquary engraved plate (batch 2, worker 8) — the honest degrade's pure
 * core: the convex hull (hand-checked on paper shapes) and the engraving
 * projection (bounded, finite, deterministic, honest about vertex counts).
 */

describe('reliquary · convex hull (monotone chain)', () => {
  it('hulls a square, winding counter-clockwise from the low-left, interior points excluded', () => {
    const hull = hull2D([
      [0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5], [0.25, 0.75],
    ])
    expect(hull).toEqual([
      [0, 0], [1, 0], [1, 1], [0, 1],
    ])
  })

  it('keeps collinear boundary points OFF the chains', () => {
    const hull = hull2D([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]])
    expect(hull).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]])
  })

  it('collapses degenerate (collinear) input to its two extremes', () => {
    expect(hull2D([[0, 0], [1, 1], [2, 2], [3, 3]])).toEqual([[0, 0], [3, 3]])
  })
})

describe('reliquary · the engraving projection', () => {
  const crystal = facetedCrystal()

  it('projects a closed silhouette: hull ≥ 3 points, all inside the plate disc', () => {
    const plate = engrave(crystal, 0.62, 0.34)
    expect(plate.hull.length).toBeGreaterThanOrEqual(3)
    expect(plate.projectedCount).toBe(60)
    for (const [x, y] of [...plate.hull, ...plate.stipple]) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
      expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-6)
      expect(Math.abs(y)).toBeLessThanOrEqual(1 + 1e-6)
    }
  })

  it('is deterministic: same geometry + same camera → the same engraving', () => {
    const a = engrave(crystal, 1.1, -0.4)
    const b = engrave(crystal, 1.1, -0.4)
    expect(a.hull).toEqual(b.hull)
    expect(a.stipple).toEqual(b.stipple)
  })

  it('rotates: a quarter turn moves the silhouette', () => {
    const rest = engrave(crystal, 0, 0)
    const turned = engrave(crystal, Math.PI / 2, 0)
    // The crystal is NOT four-fold symmetric — the hull must differ.
    expect(turned.hull).not.toEqual(rest.hull)
  })

  it('honors the stipple stride (stride 1 → every vertex stippled)', () => {
    const dense = engrave(crystal, 0, 0, { stippleStride: 1 })
    expect(dense.stipple.length).toBe(60)
  })

  it('normalizes to fill the plate at every camera angle', () => {
    for (const yaw of [0, 0.9, 2.2]) {
      const plate = engrave(crystal, yaw, 0.3)
      const reach = Math.max(...plate.hull.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))))
      expect(reach).toBeGreaterThan(0.9)
    }
  })
})
