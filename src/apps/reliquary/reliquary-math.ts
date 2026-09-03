/**
 * Reliquary math (batch 2, worker 8) — the hand-rolled mat4 kit. ZERO
 * dependencies by brief law: this module is the portfolio proof, so every
 * matrix op the vitrine needs is authored here and unit-tested against
 * hand-computed cases (reliquary-math.test.ts).
 *
 * Conventions (fixed, WebGL-native):
 * - `Mat4` is a plain length-16 array in COLUMN-MAJOR order (m[col * 4 +
 *   row]) — exactly the layout `uniformMatrix4fv` takes, so the renderer
 *   uploads without transposes.
 * - Clip space is the WebGL unit cube; the view looks down −Z (right-handed
 *   eye space, the standard perspective below).
 * - `mat4Multiply(a, b)` composes "apply b FIRST, then a" — (a · b) · v —
 *   the convention that lets a frame read left-to-right as
 *   projection · view · model.
 *
 * Pure: no DOM, no WebGL types, no state. Everything allocates its result.
 */

/** A 4×4 matrix in column-major order (16 entries). */
export type Mat4 = readonly number[]

/** A homogeneous 4-vector [x, y, z, w]. */
export type Vec4 = readonly [number, number, number, number]

/** A 3-vector [x, y, z]. */
export type Vec3 = readonly [number, number, number]

/** The additive identity tolerance used by this module's own tests' callers. */
export const MAT_EPSILON = 1e-9

/** 2π — one full turn, in radians. */
export const TAU = Math.PI * 2

/** Degrees → radians. */
export const degToRad = (deg: number): number => (deg * Math.PI) / 180

/** Radians → degrees. */
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI

/** The identity matrix. */
export function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

/**
 * Matrix product a · b ("apply b, then a"), column-major. Hand-checkable:
 * result[c*4+r] = Σk a[k*4+r] · b[c*4+k].
 */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0)
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[col * 4 + k]!
      out[col * 4 + row] = sum
    }
  }
  return out
}

/** Pure translation by (tx, ty, tz). */
export function mat4Translate(tx: number, ty: number, tz: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]
}

/** Right-handed rotation about +X by `rad`: +Y → +Z at +90°. */
export function mat4RotateX(rad: number): Mat4 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  // column-major storage of the row-major matrix [1 0 0; 0 c -s; 0 s c]
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]
}

/** Right-handed rotation about +Y by `rad`: +Z → +X, +X → −Z at +90°. */
export function mat4RotateY(rad: number): Mat4 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  // column-major storage of the row-major matrix [c 0 s; 0 1 0; -s 0 c]
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
}

/**
 * The standard WebGL perspective projection (right-handed eye space looking
 * down −Z, depth mapped to [−1, 1]). `fovyRadians` is the VERTICAL field of
 * view; `aspect` is width/height. Points at −`near` map to ndc z = −1, points
 * at −`far` to +1 — both hand-checked in the unit tests.
 */
export function mat4Perspective(fovyRadians: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovyRadians / 2)
  const nf = 1 / (near - far)
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]
}

/** Apply `m` to a homogeneous point — NO divide (see {@link projectPoint}). */
export function transformPoint(m: Mat4, p: Vec4): Vec4 {
  const x = p[0]
  const y = p[1]
  const z = p[2]
  const w = p[3]
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]! * w,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]! * w,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]! * w,
    m[3]! * x + m[7]! * y + m[11]! * z + m[15]! * w,
  ]
}

/**
 * Full projection: transform, then the PERSPECTIVE DIVIDE — clip [x,y,z,w]
 * → ndc [x/w, y/w, z/w]. The fallback engraver also uses this with a rigid
 * matrix (w stays 1) to place silhouette points.
 */
export function projectPoint(m: Mat4, p: Vec4): Vec3 {
  const clip = transformPoint(m, p)
  const w = clip[3]
  if (w === 0) return [0, 0, clip[2]] // a degenerate homogeneous point collapses to origin
  return [clip[0] / w, clip[1] / w, clip[2] / w]
}

/**
 * Rotate a DIRECTION (a normal): the upper-left 3×3 only, translation
 * ignored by construction. Correct for the rigid (rotation-only) model
 * matrices this app builds — for non-uniform scale you would need the
 * inverse-transpose, which the reliquary never uploads.
 */
export function transformDirection(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2],
    m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2],
    m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2],
  ]
}

/**
 * Invert a RIGID transform (rotation + translation, no scale): transpose the
 * 3×3 block, translation becomes −Rᵀ·t. Non-rigid inputs are NOT supported —
 * callers here only ever build rigid frames; the renderer derives the eye
 * position from its view matrix with this.
 */
export function invertRigid(m: Mat4): Mat4 {
  // rᵀ stored column-major: rᵀ[c*4+r] = m[r*4+c]
  const out = mat4Identity().slice() as number[]
  for (let col = 0; col < 3; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      out[col * 4 + row] = m[row * 4 + col]!
    }
  }
  const tx = m[12]!
  const ty = m[13]!
  const tz = m[14]!
  out[12] = -(out[0]! * tx + out[4]! * ty + out[8]! * tz)
  out[13] = -(out[1]! * tx + out[5]! * ty + out[9]! * tz)
  out[14] = -(out[2]! * tx + out[6]! * ty + out[10]! * tz)
  return out
}

/**
 * The vitrine's ORBIT VIEW: `translate(0, 0, −distance) · rotateX(pitch) ·
 * rotateY(yaw)` — the specimen sits at the origin; yaw spins it about its
 * post, pitch tips the camera over it, and the whole rig is pulled back to
 * `distance`. The matching world-space eye is
 * `transformPoint(invertRigid(view), [0,0,0,1])` (unit-tested).
 */
export function orbitView(yaw: number, pitch: number, distance: number): Mat4 {
  return mat4Multiply(mat4Translate(0, 0, -distance), mat4Multiply(mat4RotateX(pitch), mat4RotateY(yaw)))
}

/**
 * A frame's full pipeline in one call: `projection · view · model` — the
 * exact product the renderer uploads as uMVP. Column-major product reads
 * left-to-right as application order right-to-left, matching the kit's law.
 */
export function frameMatrix(projection: Mat4, view: Mat4, model: Mat4): Mat4 {
  return mat4Multiply(projection, mat4Multiply(view, model))
}

/** Normalize a 3-vector to unit length (the zero vector passes through). */
export function normalize3(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2])
  if (length === 0) return [0, 0, 0]
  return [v[0] / length, v[1] / length, v[2] / length]
}

/** Cross product a × b. */
export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
}

/** Dot product a · b. */
export const dot3 = (a: Vec3, b: Vec3): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!

/** Two matrices agree entry-for-entry within `epsilon`. */
export function matricesNear(a: Mat4, b: Mat4, epsilon = 1e-9): boolean {
  for (let i = 0; i < 16; i += 1) {
    if (Math.abs(a[i]! - b[i]!) > epsilon) return false
  }
  return true
}
