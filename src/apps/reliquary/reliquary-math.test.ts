import { describe, expect, it } from 'vitest'
import { degToRad } from './reliquary-math'

/**
 * Reliquary math (batch 2, worker 8, acceptance 1) — the hand-rolled mat4
 * kit against HAND-COMPUTED cases. Every assertion below was worked out on
 * paper first (the comments carry the arithmetic), so a wrong formula cannot
 * pass by agreeing with itself.
 */

import {
  TAU,
  cross3,
  dot3,
  frameMatrix,
  invertRigid,
  mat4Identity,
  mat4Multiply,
  mat4Perspective,
  mat4RotateX,
  mat4RotateY,
  mat4Translate,
  matricesNear,
  normalize3,
  orbitView,
  projectPoint,
  radToDeg,
  transformDirection,
  transformPoint,
} from './reliquary-math'

const near = (a: readonly number[], b: readonly number[], epsilon = 1e-9): boolean =>
  a.length === b.length && a.every((value, i) => Math.abs(value - b[i]!) <= epsilon)

describe('reliquary · matrix construction and composition', () => {
  it('identity transforms a point to itself', () => {
    expect(transformPoint(mat4Identity(), [4, -2, 7, 1])).toEqual([4, -2, 7, 1])
  })

  it('multiplies as (a·b)·v — b applies FIRST (the pipeline reads left to right)', () => {
    // T(2,0,0) · T(0,3,0) on the origin: inner translation lands first.
    const combined = mat4Multiply(mat4Translate(2, 0, 0), mat4Translate(0, 3, 0))
    expect(near(transformPoint(combined, [0, 0, 0, 1]), [2, 3, 0, 1])).toBe(true)
  })

  it('composes rotations in the same order — Rx(90°)·Ry(90°) sends +X up, not back', () => {
    // Ry(90°): (1,0,0) → (0,0,−1).  Rx(90°): (0,0,−1) → (0,1,0)  [y' = −s·z].
    const combined = mat4Multiply(mat4RotateX(degToRad(90)), mat4RotateY(degToRad(90)))
    expect(near(transformPoint(combined, [1, 0, 0, 1]), [0, 1, 0, 1], 1e-12)).toBe(true)
    // The reverse order differs: Ry(90°)·Rx(90°) leaves (1,0,0) on the X axis
    // (Rx fixes it), then sends it to (0,0,−1) — composition is not commutative.
    const reverse = mat4Multiply(mat4RotateY(degToRad(90)), mat4RotateX(degToRad(90)))
    expect(near(transformPoint(reverse, [1, 0, 0, 1]), [0, 0, -1, 1], 1e-12)).toBe(true)
  })

  it('rotates right-handed: +90° about X sends +Y to +Z; +90° about Y sends +X to −Z', () => {
    expect(near(transformDirection(mat4RotateX(degToRad(90)), [0, 1, 0]), [0, 0, 1], 1e-12)).toBe(true)
    expect(near(transformDirection(mat4RotateY(degToRad(90)), [1, 0, 0]), [0, 0, -1], 1e-12)).toBe(true)
  })

  it('translates points and leaves directions untouched (normals ignore translation)', () => {
    expect(transformPoint(mat4Translate(1, 2, 3), [4, 5, 6, 1])).toEqual([5, 7, 9, 1])
    const moved = mat4Multiply(mat4Translate(9, 9, 9), mat4RotateY(degToRad(90)))
    expect(near(transformDirection(moved, [1, 0, 0]), [0, 0, -1], 1e-12)).toBe(true)
  })

  it('rounds angle helpers against the constants', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI)
    expect(radToDeg(TAU)).toBeCloseTo(360)
  })
})

describe('reliquary · perspective projection of known points (acceptance: projection of a known point)', () => {
  // fovy 90° → f = 1/tan(45°) = 1; aspect 2; near 1; far 101.
  const projection = mat4Perspective(degToRad(90), 2, 1, 101)

  it('projects a point on the frustum corner to ndc (±0.5, ±0.5)', () => {
    // View point (2, 1, −2): x_clip = (f/aspect)·2 = 1, y_clip = f·1 = 1,
    // z_clip = −1.02·(−2) − 2.02 = 0.02, w = −z_view = 2.
    const clip = transformPoint(projection, [2, 1, -2, 1])
    expect(near(clip, [1, 1, 0.02, 2], 1e-9)).toBe(true)
    expect(near(projectPoint(projection, [2, 1, -2, 1]), [0.5, 0.5, 0.01], 1e-9)).toBe(true)
  })

  it('maps the near and far planes to ndc z = −1 and +1 exactly', () => {
    expect(near(projectPoint(projection, [0, 0, -1, 1]), [0, 0, -1], 1e-9)).toBe(true)
    expect(near(projectPoint(projection, [0, 0, -101, 1]), [0, 0, 1], 1e-9)).toBe(true)
  })

  it('keeps the divide in projectPoint only — transformPoint returns clip coordinates', () => {
    const clip = transformPoint(projection, [0, 0, -2, 1])
    expect(clip[3]).toBe(2) // undivided
    expect(projectPoint(projection, [0, 0, -2, 1])[2]).toBeCloseTo(0.02 / 2)
  })
})

describe('reliquary · inverse-orientation cases (acceptance)', () => {
  it('rotation by +θ then −θ composes to the identity', () => {
    const theta = 1.234
    expect(matricesNear(mat4Multiply(mat4RotateY(theta), mat4RotateY(-theta)), mat4Identity(), 1e-12)).toBe(true)
    expect(matricesNear(mat4Multiply(mat4RotateX(-theta), mat4RotateX(theta)), mat4Identity(), 1e-12)).toBe(true)
  })

  it('invertRigid undoes an orbit view exactly', () => {
    const view = orbitView(0.77, -0.31, 2.9)
    expect(matricesNear(mat4Multiply(invertRigid(view), view), mat4Identity(), 1e-12)).toBe(true)
    expect(matricesNear(mat4Multiply(view, invertRigid(view)), mat4Identity(), 1e-12)).toBe(true)
  })

  it('derives the eye position: yaw 90°, distance 3 puts the eye on −X', () => {
    // eye = R(−yaw)·T(0,0,d)·origin = Ry(−90°)·(0,0,3) = (−3, 0, 0).
    const eye = transformPoint(invertRigid(orbitView(Math.PI / 2, 0, 3)), [0, 0, 0, 1])
    expect(near(eye, [-3, 0, 0, 1], 1e-12)).toBe(true)
  })
})

describe('reliquary · the orbit view and the frame pipeline', () => {
  it('orbits: yaw 90° carries +X from the wing to dead ahead of the camera', () => {
    // Ry(90°): (1,0,0) → (0,0,−1); pulled back 5 → view-space (0,0,−6).
    const view = orbitView(Math.PI / 2, 0, 5)
    expect(near(transformPoint(view, [1, 0, 0, 1]), [0, 0, -6, 1], 1e-12)).toBe(true)
  })

  it('pitch tips the rig: +90° about X sends +Y into the screen (camera looks down)', () => {
    // Rx(90°): (0,1,0) → (0,0,1); pulled back 2 → (0,0,1−2) = (0,0,−1).
    const view = orbitView(0, Math.PI / 2, 2)
    expect(near(transformPoint(view, [0, 1, 0, 1]), [0, 0, -1, 1], 1e-12)).toBe(true)
  })

  it('frameMatrix is exactly projection · view · model', () => {
    const p = mat4Perspective(1, 1, 0.1, 10)
    const v = orbitView(0.3, 0.2, 3)
    const m = mat4Multiply(mat4RotateX(0.1), mat4RotateY(0.4))
    expect(matricesNear(frameMatrix(p, v, m), mat4Multiply(p, mat4Multiply(v, m)), 1e-12)).toBe(true)
  })
})

describe('reliquary · vector kit', () => {
  it('normalizes (zero passes through)', () => {
    expect(normalize3([3, 4, 0])).toEqual([0.6, 0.8, 0])
    expect(normalize3([0, 0, 0])).toEqual([0, 0, 0])
  })

  it('crosses and dots the canonical triple', () => {
    expect(cross3([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
    expect(cross3([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1])
    expect(dot3([1, 2, 3], [4, 5, 6])).toBe(32)
  })
})
