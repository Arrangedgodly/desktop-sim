/**
 * Vivarium model (batch 2, brief 1) — the PURE, React-free, DOM-free, store-free
 * simulation behind the hold's tank. The brief's floor is exact: behavior is a
 * PURE step function `step(state, dt, rng) -> state`, unit-testable with a
 * seeded RNG; schooling constants live in vivarium-species.ts (data, not code).
 *
 * Determinism contract: the rng is consumed in ARRAY ORDER with a count that
 * depends only on the world's own state (2 wander draws per boid, 1 dart-gate
 * draw for the predator, 2 jitter draws per mote), so two worlds stepped under
 * one seed trace identical states — the property the determinism test pins.
 *
 * World law (asserted by tests, not comments):
 * - BOUNDED: every position stays inside `bounds` after every step (soft wall
 *   steering + a hard clamp-and-reflect backstop — a tank, not a torus).
 * - FOOD CONVERGENCE: minnows seek nutrient motes; the drifter ignores them.
 * - CENSUS HONESTY: nothing is ever born or eaten — population is invariant;
 *   nutrients decay by life, never by consumption.
 *
 * Import discipline (docs/APP-CONTRACT.md — notepad-model's, verbatim): no
 * store access, no DOM, no timers. The surface owns the rAF loop
 * (vivarium-loop.ts) and the ink (vivarium-canvas.ts).
 */

import {
  MOTE_LAW,
  NUTRIENT_LAW,
  SIM_LAW,
  SPECIES,
  type SpeciesId,
} from './vivarium-species'

/* --------------------------------------------------------------------------
 * Primitives
 * -------------------------------------------------------------------------- */

/** A seeded uniform RNG in [0, 1) — the model's only source of chance. */
export type Rng = () => number

/** mulberry32 — tiny, fast, good enough for fish. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A one-off seed for a fresh tank (a seeded variant per open — brief law). */
export function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
}

interface Vec2 {
  readonly x: number
  readonly y: number
}

const len = (x: number, y: number): number => Math.hypot(x, y)

/** A `from → to` unit vector; a deterministic fallback when the two coincide. */
function unitBetween(dx: number, dy: number, fallbackAngle: number): Vec2 {
  const d = len(dx, dy)
  if (d < 1e-6) return { x: Math.cos(fallbackAngle), y: Math.sin(fallbackAngle) }
  return { x: dx / d, y: dy / d }
}

/* --------------------------------------------------------------------------
 * State
 * -------------------------------------------------------------------------- */

/** One swimming specimen (the three boid kinds). */
export interface Boid {
  readonly id: number
  readonly species: SpeciesId
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  /** Predator only: seconds of dart burst remaining (0 = cruising). */
  readonly dart: number
}

/** One drifting mote (ambient specimen dust). */
export interface Mote {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
}

/** One nutrient mote dropped by a glass tap: it sinks and decays. */
export interface Nutrient {
  readonly id: number
  readonly x: number
  readonly y: number
  /** Remaining life in seconds (≤ 0 = dissolved). */
  readonly life: number
}

export interface WorldBounds {
  readonly w: number
  readonly h: number
}

export interface VivariumWorld {
  readonly bounds: WorldBounds
  readonly boids: readonly Boid[]
  readonly motes: readonly Mote[]
  readonly nutrients: readonly Nutrient[]
  /** Next entity id — keeps ids unique across a world's whole life. */
  readonly nextId: number
  /** Sim seconds elapsed (the drifter's bob phase rides on it, deterministically). */
  readonly clock: number
}

/* --------------------------------------------------------------------------
 * Readouts
 * -------------------------------------------------------------------------- */

/** The census readout: every living specimen, boids and motes alike. */
export function populationOf(world: VivariumWorld): number {
  return world.boids.length + world.motes.length
}

/** The food readout: live nutrient motes. */
export function nutrientCountOf(world: VivariumWorld): number {
  return world.nutrients.length
}

/* --------------------------------------------------------------------------
 * Construction
 * -------------------------------------------------------------------------- */

function seedBoid(
  id: number,
  species: SpeciesId,
  x: number,
  y: number,
  heading: number,
  speed: number,
): Boid {
  return {
    id,
    species,
    x,
    y,
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
    dart: 0,
  }
}

/**
 * A fresh tank: a tight school mid-left traveling one heading, two drifters in
 * the upper water, the predator entering low-right, motes scattered throughout.
 * Fully determined by (bounds, seed).
 */
export function createWorld(bounds: WorldBounds, seed: number): VivariumWorld {
  const rng = createRng(seed)
  const { w, h } = bounds
  const boids: Boid[] = []
  let id = 0

  const schoolX = w * 0.36
  const schoolY = h * 0.48
  const heading = rng() * Math.PI * 2
  const minnow = SPECIES.minnow
  for (let i = 0; i < minnow.census; i++) {
    const jitter = minnow.separationRadius * 0.9
    boids.push(
      seedBoid(
        id++,
        'minnow',
        schoolX + (rng() * 2 - 1) * jitter * 2,
        schoolY + (rng() * 2 - 1) * jitter,
        heading + (rng() * 2 - 1) * 0.35,
        minnow.cruise,
      ),
    )
  }
  const drifter = SPECIES.drifter
  for (let i = 0; i < drifter.census; i++) {
    boids.push(
      seedBoid(
        id++,
        'drifter',
        w * (0.55 + rng() * 0.18),
        h * (0.22 + rng() * 0.2),
        rng() * Math.PI * 2,
        drifter.cruise,
      ),
    )
  }
  const predator = SPECIES.predator
  const toSchool = Math.atan2(schoolY - h * 0.8, schoolX - w * 0.84)
  boids.push(seedBoid(id++, 'predator', w * 0.84, h * 0.8, toSchool, predator.cruise))

  const motes: Mote[] = []
  for (let i = 0; i < MOTE_LAW.census; i++) {
    const driftAngle = rng() * Math.PI * 2
    motes.push({
      id: id++,
      x: rng() * w,
      y: rng() * h,
      vx: Math.cos(driftAngle) * MOTE_LAW.cruise,
      vy: Math.sin(driftAngle) * MOTE_LAW.cruise,
    })
  }

  return { bounds, boids, motes, nutrients: [], nextId: id, clock: 0 }
}

/**
 * The reduced-motion TABLEAU — a still, deliberate arrangement, never a frozen
 * mid-frame (the brief's law): the school posed as a shallow crescent all
 * facing one heading, drifters hanging in the upper water, the predator
 * holding station at the school's flank, motes in loose authored rings.
 * Stepping it (the frame-advance control) is allowed and honest — motion only
 * ever arrives on command.
 */
export function composeTableau(bounds: WorldBounds, seed: number): VivariumWorld {
  const rng = createRng(seed)
  const { w, h } = bounds
  const boids: Boid[] = []
  let id = 0

  const arcX = w * 0.4
  const arcY = h * 0.52
  const arcR = Math.min(w, h) * 0.2
  const poseHeading = -0.25 // the school faces up-right, slightly
  const minnow = SPECIES.minnow
  for (let i = 0; i < minnow.census; i++) {
    const t = minnow.census === 1 ? 0.5 : i / (minnow.census - 1)
    const angle = -Math.PI / 2 + (t - 0.5) * 1.15 // a shallow crescent, nose forward
    const rr = arcR * (0.82 + rng() * 0.36)
    boids.push(
      seedBoid(
        id++,
        'minnow',
        arcX + Math.cos(angle) * rr,
        arcY + Math.sin(angle) * rr,
        poseHeading + (rng() * 2 - 1) * 0.18,
        minnow.cruise,
      ),
    )
  }
  const drifter = SPECIES.drifter
  boids.push(seedBoid(id++, 'drifter', w * 0.62, h * 0.24, Math.PI / 2, drifter.cruise))
  boids.push(seedBoid(id++, 'drifter', w * 0.74, h * 0.38, -Math.PI / 2, drifter.cruise))
  const predator = SPECIES.predator
  const stalkX = w * 0.82
  const stalkY = h * 0.72
  boids.push(
    seedBoid(
      id++,
      'predator',
      stalkX,
      stalkY,
      Math.atan2(arcY - stalkY, arcX - stalkX),
      predator.cruise,
    ),
  )

  const motes: Mote[] = []
  for (let i = 0; i < MOTE_LAW.census; i++) {
    const ring = i % 3
    const ringR = (Math.min(w, h) / 2) * (0.25 + ring * 0.24)
    const angle = rng() * Math.PI * 2
    motes.push({
      id: id++,
      x: w / 2 + Math.cos(angle) * ringR * 1.4,
      y: h / 2 + Math.sin(angle) * ringR,
      vx: Math.cos(angle + Math.PI / 2) * MOTE_LAW.cruise,
      vy: Math.sin(angle + Math.PI / 2) * MOTE_LAW.cruise,
    })
  }

  return { bounds, boids, motes, nutrients: [], nextId: id, clock: 0 }
}

/* --------------------------------------------------------------------------
 * Interactions
 * -------------------------------------------------------------------------- */

/**
 * Tap the glass: drop a nutrient mote at the tap point (clamped into the
 * tank). The cap is honest — over-tapping dissolves the OLDEST mote, so the
 * readout and the state never disagree.
 */
export function dropNutrient(world: VivariumWorld, x: number, y: number): VivariumWorld {
  const cx = Math.min(Math.max(x, 1), world.bounds.w - 1)
  const cy = Math.min(Math.max(y, 1), world.bounds.h - 1)
  let nutrients = [
    ...world.nutrients,
    { id: world.nextId, x: cx, y: cy, life: NUTRIENT_LAW.lifeSeconds },
  ]
  if (nutrients.length > NUTRIENT_LAW.cap) {
    nutrients = nutrients.slice(nutrients.length - NUTRIENT_LAW.cap)
  }
  return { ...world, nutrients, nextId: world.nextId + 1 }
}

/** Re-seat the world in new bounds (a resize): positions clamp inside. */
export function withBounds(world: VivariumWorld, bounds: WorldBounds): VivariumWorld {
  if (bounds.w === world.bounds.w && bounds.h === world.bounds.h) return world
  const clampX = (x: number): number => Math.min(Math.max(x, 0.5), bounds.w - 0.5)
  const clampY = (y: number): number => Math.min(Math.max(y, 0.5), bounds.h - 0.5)
  return {
    bounds,
    boids: world.boids.map((b) => ({ ...b, x: clampX(b.x), y: clampY(b.y) })),
    motes: world.motes.map((m) => ({ ...m, x: clampX(m.x), y: clampY(m.y) })),
    nutrients: world.nutrients.map((n) => ({ ...n, x: clampX(n.x), y: clampY(n.y) })),
    nextId: world.nextId,
    clock: world.clock,
  }
}

/* --------------------------------------------------------------------------
 * The step function (the brief's floor: PURE, seeded, bounded)
 * -------------------------------------------------------------------------- */

/** Soft inward push when inside the wall margin; zero in open water. */
function wallDesire(
  x: number,
  y: number,
  bounds: WorldBounds,
  margin: number,
): Vec2 {
  let dx = 0
  let dy = 0
  if (x < margin) dx += (margin - x) / margin
  if (x > bounds.w - margin) dx -= (x - (bounds.w - margin)) / margin
  if (y < margin) dy += (margin - y) / margin
  if (y > bounds.h - margin) dy -= (y - (bounds.h - margin)) / margin
  return { x: dx, y: dy }
}

/** Clamp a velocity's magnitude into [0, ceil] (never NaN, never stalled). */
function clampSpeed(vx: number, vy: number, ceil: number): Vec2 & { s: number } {
  const s = len(vx, vy)
  if (!Number.isFinite(s) || s < 1e-9) return { x: ceil, y: 0, s: ceil } // becalmed → headway resumes forward
  const target = Math.min(s, ceil)
  return { x: (vx / s) * target, y: (vy / s) * target, s: target }
}

/** Centroid of a point set (null when empty). */
function centroidOf(points: readonly { x: number; y: number }[]): Vec2 | null {
  if (points.length === 0) return null
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / points.length, y: sy / points.length }
}

/** One minnow's unit desire: school + food + predator shyness. */
function minnowDesire(
  self: Boid,
  minnows: readonly Boid[],
  predator: Boid | null,
  nutrients: readonly Nutrient[],
): Vec2 {
  const p = SPECIES.minnow
  let dx = 0
  let dy = 0

  let cohX = 0
  let cohY = 0
  let cohN = 0
  let aliX = 0
  let aliY = 0
  let aliN = 0
  let sepX = 0
  let sepY = 0
  for (const other of minnows) {
    if (other.id === self.id) continue
    const ox = other.x - self.x
    const oy = other.y - self.y
    const d = len(ox, oy)
    if (d > p.cohesionRadius || d < 1e-6) continue
    cohX += other.x
    cohY += other.y
    cohN++
    if (d <= p.alignmentRadius) {
      aliX += other.vx
      aliY += other.vy
      aliN++
    }
    if (d <= p.separationRadius) {
      const w = (p.separationRadius - d) / p.separationRadius
      sepX -= (ox / d) * w
      sepY -= (oy / d) * w
    }
  }
  if (cohN > 0) {
    const toSchool = unitBetween(cohX / cohN - self.x, cohY / cohN - self.y, 0)
    dx += toSchool.x * p.cohesionWeight
    dy += toSchool.y * p.cohesionWeight
  }
  if (aliN > 0) {
    const heading = unitBetween(aliX, aliY, Math.atan2(self.vy, self.vx))
    dx += heading.x * p.alignmentWeight
    dy += heading.y * p.alignmentWeight
  }
  dx += sepX * p.separationWeight
  dy += sepY * p.separationWeight

  // Food: the nearest nutrient mote inside sense radius pulls hardest of all.
  let food: Nutrient | null = null
  let foodD = Infinity
  for (const n of nutrients) {
    const d = len(n.x - self.x, n.y - self.y)
    if (d < foodD && d <= p.nutrientSenseRadius) {
      food = n
      foodD = d
    }
  }
  if (food) {
    const toFood = unitBetween(food.x - self.x, food.y - self.y, 0)
    dx += toFood.x * p.nutrientWeight
    dy += toFood.y * p.nutrientWeight
  }

  // The stalker: shy away, gently (the school parts around it).
  if (predator) {
    const d = len(predator.x - self.x, predator.y - self.y)
    if (d <= p.fleeRadius && d > 1e-6) {
      const away = unitBetween(self.x - predator.x, self.y - predator.y, 0)
      dx += away.x * p.fleeWeight
      dy += away.y * p.fleeWeight
    }
  }

  return { x: dx, y: dy }
}

/**
 * Integrate one swimming thing: blend its velocity toward the desire, clamp
 * the speed, advance, and keep it hard-inside the tank (clamp + reflect).
 */
function advanceBoid(
  b: Boid,
  desireVx: number,
  desireVy: number,
  dt: number,
  turnResponse: number,
  maxSpeed: number,
  bounds: WorldBounds,
): Boid {
  const blend = 1 - Math.exp(-turnResponse * dt)
  const clamped = clampSpeed(
    b.vx + (desireVx - b.vx) * blend,
    b.vy + (desireVy - b.vy) * blend,
    maxSpeed,
  )
  let { x, y } = b
  let { x: vx, y: vy } = clamped
  x += vx * dt
  y += vy * dt
  if (x < 0.5) {
    x = 0.5
    vx = Math.abs(vx)
  } else if (x > bounds.w - 0.5) {
    x = bounds.w - 0.5
    vx = -Math.abs(vx)
  }
  if (y < 0.5) {
    y = 0.5
    vy = Math.abs(vy)
  } else if (y > bounds.h - 0.5) {
    y = bounds.h - 0.5
    vy = -Math.abs(vy)
  }
  return { ...b, x, y, vx, vy }
}

/** Advance a mote: damped drift + jitter, kept inside the tank. */
function advanceMote(m: Mote, rng: Rng, dt: number, bounds: WorldBounds): Mote {
  const damp = Math.exp(-MOTE_LAW.damping * dt)
  const vx = m.vx * damp + (rng() * 2 - 1) * MOTE_LAW.jitter * dt
  const vy = m.vy * damp + (rng() * 2 - 1) * MOTE_LAW.jitter * dt
  const clamped = clampSpeed(vx, vy, MOTE_LAW.maxSpeed)
  let x = m.x + clamped.x * dt
  let y = m.y + clamped.y * dt
  let cvx = clamped.x
  let cvy = clamped.y
  if (x < 0.5) {
    x = 0.5
    cvx = Math.abs(cvx)
  } else if (x > bounds.w - 0.5) {
    x = bounds.w - 0.5
    cvx = -Math.abs(cvx)
  }
  if (y < 0.5) {
    y = 0.5
    cvy = Math.abs(cvy)
  } else if (y > bounds.h - 0.5) {
    y = bounds.h - 0.5
    cvy = -Math.abs(cvy)
  }
  return { ...m, x, y, vx: cvx, vy: cvy }
}

/**
 * Advance the tank by `dt` seconds. Pure: returns a NEW world, consumes the
 * rng in a state-determined order, and leaves the input untouched. `dt <= 0`
 * (or non-finite) is an honest no-op — the same reference back.
 */
export function step(world: VivariumWorld, dt: number, rng: Rng): VivariumWorld {
  if (!Number.isFinite(dt) || dt <= 0) return world
  const dtd = Math.min(dt, SIM_LAW.maxDt)
  const { bounds } = world
  const clock = world.clock + dtd

  const minnows = world.boids.filter((b) => b.species === 'minnow')
  const predator = world.boids.find((b) => b.species === 'predator') ?? null
  const school = centroidOf(minnows)

  const boids = world.boids.map((b): Boid => {
    const p = SPECIES[b.species]
    let dx = 0
    let dy = 0
    let dart = b.dart

    if (b.species === 'minnow') {
      const d = minnowDesire(b, minnows, predator, world.nutrients)
      dx = d.x
      dy = d.y
    } else if (b.species === 'drifter') {
      for (const other of world.boids) {
        if (other.species !== 'drifter' || other.id === b.id) continue
        const d = len(other.x - b.x, other.y - b.y)
        if (d <= p.separationRadius && d > 1e-6) {
          dx -= ((other.x - b.x) / d) * p.separationWeight
          dy -= ((other.y - b.y) / d) * p.separationWeight
        }
      }
      // A slow authored bob, phased by id — deterministic (clock-driven).
      dx += Math.cos(clock * 0.5 + b.id * 2.4) * 0.4
      dy += Math.sin(clock * 0.35 + b.id * 1.7) * 0.4
    } else {
      // The predator: hold the standoff ring around the school with a tangent
      // drift, and occasionally DART through the edge (it never takes a
      // specimen — the census stays honest).
      dart = Math.max(0, dart - dtd)
      if (dart <= 0 && rng() < dtd / Math.max(p.dartPeriodSeconds, 1e-6)) {
        dart = p.dartSeconds
      }
      if (school) {
        if (dart > 0) {
          const prey = minnows.reduce((near, m) =>
            len(m.x - b.x, m.y - b.y) < len(near.x - b.x, near.y - b.y) ? m : near,
          )
          const toPrey = unitBetween(prey.x - b.x, prey.y - b.y, 0)
          dx = toPrey.x
          dy = toPrey.y
        } else {
          const out = unitBetween(b.x - school.x, b.y - school.y, b.id * 1.3)
          const ringX = school.x + out.x * p.standoffRadius
          const ringY = school.y + out.y * p.standoffRadius
          const toRing = unitBetween(ringX - b.x, ringY - b.y, 0)
          dx = toRing.x * 0.55 + -out.y * 0.45
          dy = toRing.y * 0.55 + out.x * 0.45
        }
      }
    }

    dx += (rng() * 2 - 1) * p.wander
    dy += (rng() * 2 - 1) * p.wander
    const wall = wallDesire(b.x, b.y, bounds, p.wallMargin)
    dx += wall.x * p.wallWeight
    dy += wall.y * p.wallWeight

    const desire = unitBetween(dx, dy, Math.atan2(b.vy, b.vx))
    const boost = dart > 0 ? p.dartBoost : 1
    return {
      ...advanceBoid(
        b,
        desire.x * p.cruise * boost,
        desire.y * p.cruise * boost,
        dtd,
        p.turnResponse,
        p.maxSpeed * boost,
        bounds,
      ),
      dart,
    }
  })

  const motes = world.motes.map((m) => advanceMote(m, rng, dtd, bounds))

  const nutrients = world.nutrients
    .map((n) => ({
      ...n,
      y: Math.min(n.y + NUTRIENT_LAW.sink * dtd, bounds.h - 1),
      life: n.life - dtd,
    }))
    .filter((n) => n.life > 0)

  return { ...world, boids, motes, nutrients, clock }
}
