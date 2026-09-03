/**
 * Reliquary geometry (batch 2, worker 8) — the three procedurally-authored
 * specimens as PURE generators → interleaved-free GL buffers (positions,
 * normals, indices). No assets, no GLTF, zero fetched bytes (CSP-clean by
 * construction — the brief's non-goal list is the law here).
 *
 * Every generator is deterministic (no randomness at all — the shapes are
 * authored constants) and every vertex is finite; both properties are
 * unit-asserted in reliquary-geometry.test.ts, including EXACT counts.
 *
 * Winding/culling: the renderer draws with face culling OFF (the shell's
 * mouth is genuinely open — you see its inner wall), so winding matters only
 * for the flat-shaded crystal's face normals, which are oriented outward by
 * the centroid test below.
 */

/** A renderable mesh: flat Float32Array attribute stores + a Uint16 index stream. */
export interface Geometry {
  /** xyz per vertex. */
  readonly positions: Float32Array
  /** xyz per vertex, unit length. */
  readonly normals: Float32Array
  /** triangle indices into the attribute stores (Uint16 — every mesh stays well under 65k). */
  readonly indices: Uint16Array
}

/** Build a Geometry from plain number arrays (the generators' assembly step). */
function assemble(positions: number[], normals: number[], indices: number[]): Geometry {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** Scale every position so the farthest vertex sits at `radius` (normals unchanged). */
function fitRadius(geometry: Geometry, radius: number): Geometry {
  let max = 0
  const p = geometry.positions
  for (let i = 0; i < p.length; i += 3) {
    max = Math.max(max, Math.hypot(p[i]!, p[i + 1]!, p[i + 2]!))
  }
  if (max === 0) return geometry
  const k = radius / max
  const scaled = new Float32Array(p.length)
  for (let i = 0; i < p.length; i += 3) {
    scaled[i] = p[i]! * k
    scaled[i + 1] = p[i + 1]! * k
    scaled[i + 2] = p[i + 2]! * k
  }
  return { positions: scaled, normals: geometry.normals, indices: geometry.indices }
}

/* --------------------------------------------------------------------------
 * Specimen 1 — the VENT PRISM: a flat-shaded icosahedron, drawn out along
 * its polar axis into a crystal. Every face carries ONE normal (cut facets,
 * the whole point of a reliquary crystal).
 * ------------------------------------------------------------------------ */

/** The icosahedron's golden constant. */
const PHI = (1 + Math.sqrt(5)) / 2

/** The 12 canonical icosahedron vertices (unnormalized — radius √(1+φ²)). */
const ICO_VERTS: readonly (readonly [number, number, number])[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
]

/** The 20 faces, wound so the outward normal faces the viewer (verified by the centroid flip below). */
const ICO_FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

/** The prism's authored anisotropy: slim across the girth, drawn out at the points. */
const CRYSTAL_SCALE: readonly [number, number, number] = [0.72, 1.22, 0.72]

/**
 * The faceted crystal: 20 flat-shaded faces → exactly 60 vertices, 60
 * normals, 180 indices. Each face's normal is the normalized cross product,
 * flipped outward when the face centroid disagrees with it (a convex solid
 * around the origin makes the test exact).
 */
export function facetedCrystal(radius = 1.05): Geometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const scaled = ICO_VERTS.map(([x, y, z]) => [x * CRYSTAL_SCALE[0], y * CRYSTAL_SCALE[1], z * CRYSTAL_SCALE[2]] as const)

  for (const [ia, ib, ic] of ICO_FACES) {
    const a = scaled[ia]!
    const b = scaled[ib]!
    const c = scaled[ic]!
    // face normal from the winding…
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue // degenerate face on authored constants — cannot happen, kept honest anyway
    nx /= len
    ny /= len
    nz /= len
    // …oriented outward by the centroid (convex solid about the origin).
    const cx = (a[0] + b[0] + c[0]) / 3
    const cy = (a[1] + b[1] + c[1]) / 3
    const cz = (a[2] + b[2] + c[2]) / 3
    if (nx * cx + ny * cy + nz * cz < 0) {
      nx = -nx
      ny = -ny
      nz = -nz
    }
    const base = positions.length / 3
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
    indices.push(base, base + 1, base + 2)
  }

  return fitRadius(assemble(positions, normals, indices), radius)
}

/* --------------------------------------------------------------------------
 * Specimen 2 — the GYRE SHELL: a parametric tube swept along a logarithmic
 * spiral. The whorl radius decays geometrically (self-similar coil) and the
 * tube radius rides the whorl radius, so successive whorls kiss their
 * neighbors exactly — a shell by construction, not by eyeballing.
 * ------------------------------------------------------------------------ */

/** The shell's authored constants (unit-test pins the derived vertex count). */
export const SHELL_PARAMS = {
  /** Spiral sweep: just under two full turns. */
  thetaEnd: Math.PI * 3.6,
  /** Whorl radius at θ: exp(−k·θ), decaying from 1 to `endRadius`. */
  endRadius: 0.12,
  /** Tube radius as a fraction of the local whorl radius (whorls overlap into contact). */
  tubeRatio: 0.62,
  /** Coil rings along the sweep. */
  rings: 72,
  /** Facets around the tube. */
  segments: 12,
} as const

/**
 * The spiral shell tube. Vertices: `rings × segments` (864) — ring-to-ring
 * quads split into triangles, wrap-around by index modulo (no seam vertex:
 * the analytic tube normal at φ=0 equals the one at 2π). The mouth stays
 * open — you see the coil's interior through it, which is why the renderer
 * never culls.
 */
export function spiralShell(radius = 1.05): Geometry {
  const { thetaEnd, endRadius, tubeRatio, rings, segments } = SHELL_PARAMS
  const k = Math.log(1 / endRadius) / thetaEnd
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  // The centerline and its tangent (finite difference on a fine step).
  const whorl = (theta: number): number => Math.exp(-k * theta)
  const centerAt = (theta: number): [number, number, number] => {
    const r = whorl(theta)
    return [r * Math.cos(theta), 0, r * Math.sin(theta)]
  }

  const dTheta = 1e-4
  for (let i = 0; i < rings; i += 1) {
    const theta = (i / (rings - 1)) * thetaEnd
    const c = centerAt(theta)
    const cNext = centerAt(theta + dTheta)
    // tangent T
    let tx = cNext[0] - c[0], ty = cNext[1] - c[1], tz = cNext[2] - c[2]
    let tLen = Math.hypot(tx, ty, tz)
    if (tLen === 0) {
      tx = 0; ty = 0; tz = 1; tLen = 1
    }
    tx /= tLen; ty /= tLen; tz /= tLen
    // radial outward N (from the coil axis to the centerline), re-orthogonalized to T
    const rLen = Math.hypot(c[0], c[2])
    let nx = rLen === 0 ? 1 : c[0] / rLen
    let ny = 0
    let nz = rLen === 0 ? 0 : c[2] / rLen
    // B = T × N, then N = B × T (an orthonormal frame even where N nearly meets T)
    let bx = ty * nz - tz * ny
    let by = tz * nx - tx * nz
    let bz = tx * ny - ty * nx
    const bLen = Math.hypot(bx, by, bz)
    if (bLen === 0) {
      bx = 0; by = 1; bz = 0
    } else {
      bx /= bLen; by /= bLen; bz /= bLen
    }
    nx = by * tz - bz * ty
    ny = bz * tx - bx * tz
    nz = bx * ty - by * tx

    const tubeR = tubeRatio * whorl(theta)
    for (let j = 0; j < segments; j += 1) {
      const phi = (j / segments) * Math.PI * 2
      const cosPhi = Math.cos(phi)
      const sinPhi = Math.sin(phi)
      const dx = cosPhi * nx + sinPhi * bx
      const dy = cosPhi * ny + sinPhi * by
      const dz = cosPhi * nz + sinPhi * bz
      positions.push(c[0] + tubeR * dx, c[1] + tubeR * dy, c[2] + tubeR * dz)
      normals.push(dx, dy, dz) // orthonormal frame → already unit
    }
  }

  for (let i = 0; i < rings - 1; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const jNext = (j + 1) % segments
      const a = i * segments + j
      const b = i * segments + jNext
      const c = (i + 1) * segments + j
      const d = (i + 1) * segments + jNext
      indices.push(a, b, c, b, d, c)
    }
  }

  return fitRadius(assemble(positions, normals, indices), radius)
}

/* --------------------------------------------------------------------------
 * Specimen 3 — the BRACT CLUSTER: six elongated ellipsoids (a low-pole UV
 * sphere each, anisotropically scaled — normals through the inverse-scale,
 * which is the exact inverse-transpose for a diagonal scale) merged into ONE
 * buffer at authored seats: one apical bract standing on the post, five
 * ringing it and tipping outward.
 * ------------------------------------------------------------------------ */

/** One pod's authored seat: position, radii, outward tilt (radians about Z). */
interface PodSeat {
  readonly at: readonly [number, number, number]
  readonly radii: readonly [number, number, number]
  readonly tiltZ: number
}

const POD_SEATS: readonly PodSeat[] = [
  { at: [0, 0.55, 0], radii: [0.26, 0.62, 0.26], tiltZ: 0 },
  { at: [0.52, 0.12, 0], radii: [0.24, 0.56, 0.24], tiltZ: -0.95 },
  { at: [0.16, 0.1, 0.5], radii: [0.24, 0.56, 0.24], tiltZ: -0.3 },
  { at: [-0.42, 0.12, 0.31], radii: [0.24, 0.56, 0.24], tiltZ: 0.7 },
  { at: [-0.42, 0.12, -0.31], radii: [0.22, 0.5, 0.22], tiltZ: 0.7 },
  { at: [0.16, 0.1, -0.5], radii: [0.22, 0.5, 0.22], tiltZ: -0.3 },
]

/** UV-sphere resolution per pod (pinned by the count test: 7×11 verts, 360 indices). */
export const POD_PARAMS = {
  stacks: 6,
  sectors: 10,
} as const

/**
 * The merged cluster: `pods × 77` vertices, `pods × 360` indices — one draw
 * call's worth of buffer, seams invisible because they are geometric, not
 * rendered. Tilt is a rotation about Z applied to each pod's own frame.
 */
export function bractCluster(radius = 1.05): Geometry {
  const { stacks, sectors } = POD_PARAMS
  const cosT = []
  const sinT = []
  for (let s = 0; s <= stacks; s += 1) {
    const phi = (s / stacks) * Math.PI
    cosT.push(Math.cos(phi))
    sinT.push(Math.sin(phi))
  }
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  for (const seat of POD_SEATS) {
    const [sx, sy, sz] = seat.radii
    const baseIndex = positions.length / 3
    const c = Math.cos(seat.tiltZ)
    const s = Math.sin(seat.tiltZ)

    for (let stack = 0; stack <= stacks; stack += 1) {
      const yUnit = cosT[stack]!
      const ringR = sinT[stack]!
      for (let sector = 0; sector <= sectors; sector += 1) {
        const theta = (sector / sectors) * Math.PI * 2
        const xUnit = ringR * Math.cos(theta)
        const zUnit = ringR * Math.sin(theta)
        // unit-sphere direction, tilted about Z…
        const tx = xUnit * c - yUnit * s
        const ty = xUnit * s + yUnit * c
        const tz = zUnit
        // …position = seat + direction scaled by radii; normal = inverse-transpose
        // of the diagonal scale applied to the tilted direction (unit for ellipsoids).
        const px = seat.at[0] + sx * tx
        const py = seat.at[1] + sy * ty
        const pz = seat.at[2] + sz * tz
        let nx = tx / sx
        let ny = ty / sy
        let nz = tz / sz
        const nLen = Math.hypot(nx, ny, nz)
        nx /= nLen
        ny /= nLen
        nz /= nLen
        positions.push(px, py, pz)
        normals.push(nx, ny, nz)
      }
    }

    for (let stack = 0; stack < stacks; stack += 1) {
      for (let sector = 0; sector < sectors; sector += 1) {
        const a = baseIndex + stack * (sectors + 1) + sector
        const b = a + sectors + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }

  return fitRadius(assemble(positions, normals, indices), radius)
}
