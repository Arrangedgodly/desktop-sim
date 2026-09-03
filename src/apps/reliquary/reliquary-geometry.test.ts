import { describe, expect, it } from 'vitest'
import { POD_PARAMS, SHELL_PARAMS, bractCluster, facetedCrystal, spiralShell, type Geometry } from './reliquary-geometry'

/**
 * Reliquary geometry (batch 2, worker 8, acceptance 2) — the three
 * procedural specimens: EXACT counts (derived from the authored parameters,
 * never eyeballed), finiteness (no NaN/Infinity anywhere in a buffer), unit
 * normals, fit radius, and byte-for-byte determinism across builds.
 */

/** Every number in every buffer is finite. */
function assertFinite(geometry: Geometry): void {
  for (const value of geometry.positions) expect(Number.isFinite(value), `position ${value}`).toBe(true)
  for (const value of geometry.normals) expect(Number.isFinite(value), `normal ${value}`).toBe(true)
  for (const value of geometry.indices) expect(Number.isFinite(value), `index ${value}`).toBe(true)
}

/** Every normal is unit length (± 1e-6). */
function assertUnitNormals(geometry: Geometry): void {
  const normals = geometry.normals
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!)
    expect(Math.abs(length - 1), `normal ${i / 3} length ${length}`).toBeLessThan(1e-6)
  }
}

/** The farthest vertex sits at (or under) the fit radius. */
function assertFits(geometry: Geometry, radius: number): void {
  let max = 0
  for (let i = 0; i < geometry.positions.length; i += 3) {
    max = Math.max(max, Math.hypot(geometry.positions[i]!, geometry.positions[i + 1]!, geometry.positions[i + 2]!))
  }
  expect(max).toBeLessThanOrEqual(radius * (1 + 1e-6))
  expect(max).toBeGreaterThan(radius * 0.9) // the fit actually used the room
}

/** Two builds are byte-identical. */
function assertDeterministic(build: () => Geometry): void {
  const a = build()
  const b = build()
  expect([...a.positions]).toEqual([...b.positions])
  expect([...a.normals]).toEqual([...b.normals])
  expect([...a.indices]).toEqual([...b.indices])
}

/** Indices stay inside the attribute stores. */
function assertIndicesBound(geometry: Geometry): void {
  const vertexCount = geometry.positions.length / 3
  expect(geometry.normals.length).toBe(geometry.positions.length)
  for (const index of geometry.indices) {
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(vertexCount)
  }
}

describe('reliquary · the vent prism (flat-shaded icosahedral crystal)', () => {
  it('carries EXACT counts: 20 faces × 3 flat-shaded corners = 60 verts, 60 indices', () => {
    const crystal = facetedCrystal()
    expect(crystal.positions.length).toBe(60 * 3)
    expect(crystal.normals.length).toBe(60 * 3)
    expect(crystal.indices.length).toBe(20 * 3)
  })

  it('is drawn out along Y (the girth is slimmer than the height)', () => {
    const crystal = facetedCrystal()
    let maxY = 0
    let maxX = 0
    for (let i = 0; i < crystal.positions.length; i += 3) {
      maxY = Math.max(maxY, Math.abs(crystal.positions[i + 1]!))
      maxX = Math.max(maxX, Math.abs(crystal.positions[i]!))
    }
    expect(maxY).toBeGreaterThan(maxX * 1.5) // a crystal, not a ball
  })

  it('is finite, unit-normal, radius-fit, index-bound, deterministic', () => {
    const crystal = facetedCrystal(1.05)
    assertFinite(crystal)
    assertUnitNormals(crystal)
    assertFits(crystal, 1.05)
    assertIndicesBound(crystal)
    assertDeterministic(() => facetedCrystal())
  })
})

describe('reliquary · the gyre shell (log-spiral tube)', () => {
  it('carries EXACT counts: rings × segments verts, (rings−1) × segments quads', () => {
    const shell = spiralShell()
    const { rings, segments } = SHELL_PARAMS
    expect(shell.positions.length).toBe(rings * segments * 3)
    expect(shell.normals.length).toBe(rings * segments * 3)
    expect(shell.indices.length).toBe((rings - 1) * segments * 6)
  })

  it('coils inward: the last ring sits far closer to the axis than the first', () => {
    const shell = spiralShell()
    const radiusOf = (ring: number): number => {
      const i = ring * SHELL_PARAMS.segments * 3
      return Math.hypot(shell.positions[i]!, shell.positions[i + 2]!)
    }
    expect(radiusOf(SHELL_PARAMS.rings - 1)).toBeLessThan(radiusOf(0) * 0.2)
  })

  it('is finite, unit-normal, radius-fit, index-bound, deterministic', () => {
    const shell = spiralShell(1.05)
    assertFinite(shell)
    assertUnitNormals(shell)
    assertFits(shell, 1.05)
    assertIndicesBound(shell)
    assertDeterministic(() => spiralShell())
  })
})

describe('reliquary · the bract cluster (merged ellipsoids)', () => {
  it('carries EXACT counts: 6 pods × (7 rings × 11 seam verts, 360 indices)', () => {
    const cluster = bractCluster()
    const pods = 6
    const vertsPerPod = (POD_PARAMS.stacks + 1) * (POD_PARAMS.sectors + 1)
    expect(cluster.positions.length).toBe(pods * vertsPerPod * 3)
    expect(cluster.indices.length).toBe(pods * POD_PARAMS.stacks * POD_PARAMS.sectors * 6)
  })

  it('spans a crown: the apical pod reaches above every ring pod', () => {
    const cluster = bractCluster()
    let top = -Infinity
    for (let i = 0; i < cluster.positions.length; i += 3) top = Math.max(top, cluster.positions[i + 1]!)
    expect(top).toBeGreaterThan(0.9) // fitted to ~1.05 — the crown uses it
  })

  it('is finite, unit-normal, radius-fit, index-bound, deterministic', () => {
    const cluster = bractCluster(1.05)
    assertFinite(cluster)
    assertUnitNormals(cluster)
    assertFits(cluster, 1.05)
    assertIndicesBound(cluster)
    assertDeterministic(() => bractCluster())
  })

  it('keeps every mesh under the Uint16 index ceiling', () => {
    for (const geometry of [facetedCrystal(), spiralShell(), bractCluster()]) {
      expect(geometry.positions.length / 3).toBeLessThan(65536)
    }
  })
})
