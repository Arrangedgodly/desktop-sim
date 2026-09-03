import { describe, expect, it } from 'vitest'
import {
  composeTableau,
  createRng,
  createWorld,
  dropNutrient,
  nutrientCountOf,
  populationOf,
  step,
  withBounds,
  type Boid,
  type VivariumWorld,
} from './vivarium-model'
import { MOTE_LAW, NUTRIENT_LAW, SIM_LAW, SPECIES } from './vivarium-species'

/**
 * Vivarium model law (batch 2, brief 1, acceptance 1) — the PURE sim against
 * its three pinned truths: BOUNDED (nothing leaves the tank), FOOD-CONVERGENT
 * (the school seeks nutrient motes; the drifter ignores them), and SEEDED
 * (identical seeds trace identical worlds). Plus census honesty, the nutrient
 * cap/decay laws, the composed reduced-motion tableau, and step purity.
 */

const BOUNDS = { w: 600, h: 380 }

/** A synthetic world of minnows (and optional food) at exact positions. */
function minnowWorld(
  positions: readonly (readonly [number, number])[],
  food: readonly (readonly [number, number])[] = [],
): VivariumWorld {
  let id = 0
  const boids: Boid[] = positions.map(([x, y]) => ({
    id: id++,
    species: 'minnow' as const,
    x,
    y,
    vx: 40,
    vy: 0,
    dart: 0,
  }))
  const nutrients = food.map(([x, y]) => ({ id: id++, x, y, life: NUTRIENT_LAW.lifeSeconds }))
  return { bounds: BOUNDS, boids, motes: [], nutrients, nextId: id, clock: 0 }
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

const distanceTo = (b: { x: number; y: number }, p: { x: number; y: number }): number =>
  Math.hypot(b.x - p.x, b.y - p.y)

/** Mean signed closing distance toward a point over a run (px; > 0 = approach). */
function closingDistance(
  world: VivariumWorld,
  before: readonly { x: number; y: number }[],
  target: { x: number; y: number },
): number {
  const after = world.boids
  const perBoid = after.map((b, i) => {
    const prior = before[i]!
    return distanceTo(prior, target) - distanceTo(b, target)
  })
  return mean(perBoid)
}

function run(world: VivariumWorld, seconds: number, seed: number, dt = 1 / 30): VivariumWorld {
  const rng = createRng(seed)
  let current = world
  for (let t = 0; t < seconds; t += dt) current = step(current, dt, rng)
  return current
}

describe('vivarium model · construction', () => {
  it('seeds the authored census: 18 minnows, 2 drifters, 1 predator, motes — all inside the tank, ids unique', () => {
    const world = createWorld(BOUNDS, 1234)
    const bySpecies = (id: string): number => world.boids.filter((b) => b.species === id).length
    expect(bySpecies('minnow')).toBe(SPECIES.minnow.census)
    expect(bySpecies('drifter')).toBe(SPECIES.drifter.census)
    expect(bySpecies('predator')).toBe(SPECIES.predator.census)
    expect(world.motes.length).toBe(MOTE_LAW.census)
    expect(populationOf(world)).toBe(21 + MOTE_LAW.census)
    const ids = [...world.boids, ...world.motes].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of [...world.boids, ...world.motes]) {
      expect(e.x).toBeGreaterThanOrEqual(0)
      expect(e.x).toBeLessThanOrEqual(BOUNDS.w)
      expect(e.y).toBeGreaterThanOrEqual(0)
      expect(e.y).toBeLessThanOrEqual(BOUNDS.h)
    }
  })

  it('is SEEDED: identical seeds build identical worlds and trace identical steps; different seeds differ', () => {
    const a = createWorld(BOUNDS, 42)
    const b = createWorld(BOUNDS, 42)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))

    const steppedA = run(a, 2, 99)
    const steppedB = run(b, 2, 99)
    expect(JSON.stringify(steppedA)).toBe(JSON.stringify(steppedB))

    const other = run(createWorld(BOUNDS, 43), 2, 99)
    expect(JSON.stringify(steppedA)).not.toBe(JSON.stringify(other))
  })
})

describe('vivarium model · step (the pure floor)', () => {
  it('returns a NEW world and leaves the input untouched; dt ≤ 0 is the same reference', () => {
    const world = createWorld(BOUNDS, 7)
    const snapshot = JSON.stringify(world)
    const next = step(world, 1 / 60, createRng(5))
    expect(next).not.toBe(world)
    expect(JSON.stringify(world)).toBe(snapshot)

    expect(step(world, 0, createRng(5))).toBe(world)
    expect(step(world, -1, createRng(5))).toBe(world)
    expect(step(world, Number.NaN, createRng(5))).toBe(world)
  })

  it('clamps dt: a stale timestamp from a restored tab advances the clock by maxDt only', () => {
    const world = createWorld(BOUNDS, 7)
    const next = step(world, 1000, createRng(5))
    expect(next.clock).toBe(SIM_LAW.maxDt)
  })

  it('keeps every specimen BOUNDED and finite across a long run', () => {
    let world = createWorld(BOUNDS, 2026)
    const rng = createRng(77)
    for (let i = 0; i < 600; i++) world = step(world, 1 / 60, rng)
    for (const e of [...world.boids, ...world.motes]) {
      expect(Number.isFinite(e.x)).toBe(true)
      expect(Number.isFinite(e.y)).toBe(true)
      expect(Number.isFinite(e.vx)).toBe(true)
      expect(e.x).toBeGreaterThanOrEqual(0)
      expect(e.x).toBeLessThanOrEqual(BOUNDS.w)
      expect(e.y).toBeGreaterThanOrEqual(0)
      expect(e.y).toBeLessThanOrEqual(BOUNDS.h)
    }
  })
})

describe('vivarium model · food law', () => {
  it('CONVERGENCE: the school closes hard on a nutrient mote', () => {
    const minnows: [number, number][] = [
      [140, 170],
      [160, 190],
      [150, 210],
      [175, 165],
      [170, 205],
      [185, 188],
    ]
    const food = { x: 330, y: 190 } // 150–180px out — inside sense radius
    const world = minnowWorld(minnows, [[food.x, food.y]])
    const before = world.boids.map((b) => ({ x: b.x, y: b.y }))
    const after = run(world, 5, 313)
    expect(closingDistance(after, before, food)).toBeGreaterThan(80)
  })

  it('THE DRIFTER IGNORES FOOD: its trajectory is invariant to where food falls (minnows diverge)', () => {
    const driftersAt = (): VivariumWorld => ({
      bounds: BOUNDS,
      boids: [
        { id: 0, species: 'drifter', x: 200, y: 100, vx: 5, vy: 0, dart: 0 },
        { id: 1, species: 'drifter', x: 400, y: 280, vx: -5, vy: 0, dart: 0 },
      ],
      motes: [],
      nutrients: [],
      nextId: 3,
      clock: 0,
    })
    const withFood = (x: number, y: number): VivariumWorld => ({
      ...driftersAt(),
      nutrients: [{ id: 2, x, y, life: NUTRIENT_LAW.lifeSeconds }],
    })

    // No food / food beside drifter 0 / food beside drifter 1 — same seed:
    // the drifters trace BYTE-IDENTICAL paths (they never read the larder).
    const bare = run(driftersAt(), 5, 2718)
    const besideA = run(withFood(220, 110), 5, 2718)
    const besideB = run(withFood(390, 270), 5, 2718)
    expect(JSON.stringify(besideA.boids)).toBe(JSON.stringify(bare.boids))
    expect(JSON.stringify(besideB.boids)).toBe(JSON.stringify(bare.boids))

    // Control: the same experiment on a minnow school diverges immediately.
    const school = [
      [150, 170],
      [170, 195],
      [160, 215],
      [180, 160],
      [185, 210],
      [200, 185],
    ] as const
    const chaseEast = run(minnowWorld(school, [[420, 190]]), 5, 2718)
    const chaseWest = run(minnowWorld(school, [[80, 190]]), 5, 2718)
    expect(JSON.stringify(chaseEast.boids)).not.toBe(JSON.stringify(chaseWest.boids))
  })

  it('nutrients decay to nothing; the census never changes (nothing is born or eaten)', () => {
    let world = dropNutrient(createWorld(BOUNDS, 5), 300, 190)
    const pop0 = populationOf(world)
    expect(nutrientCountOf(world)).toBe(1)
    world = run(world, NUTRIENT_LAW.lifeSeconds + 2, 11)
    expect(nutrientCountOf(world)).toBe(0)
    expect(populationOf(world)).toBe(pop0)
  })

  it('dropNutrient clamps out-of-glass taps into the tank', () => {
    const world = dropNutrient(createWorld(BOUNDS, 5), -50, 9999)
    const food = world.nutrients[0]!
    expect(food.x).toBeGreaterThanOrEqual(1)
    expect(food.x).toBeLessThanOrEqual(BOUNDS.w - 1)
    expect(food.y).toBeLessThanOrEqual(BOUNDS.h - 1)
  })

  it('caps concurrent nutrients at the law, dissolving the OLDEST first', () => {
    let world = createWorld(BOUNDS, 5)
    for (let i = 0; i < NUTRIENT_LAW.cap + 3; i++) world = dropNutrient(world, 100 + i * 10, 100)
    expect(world.nutrients.length).toBe(NUTRIENT_LAW.cap)
    const firstDropped = world.nutrients.map((n) => n.id)
    expect(firstDropped).not.toContain(0) // the three oldest dissolved
  })
})

describe('vivarium model · the predator and the tableau', () => {
  it('the predator darts eventually (a burst that always decays)', () => {
    let world = createWorld(BOUNDS, 31415)
    const rng = createRng(9)
    let sawDart = false
    for (let i = 0; i < 1800; i++) {
      const dartBefore = world.boids.find((b) => b.species === 'predator')?.dart ?? 0
      world = step(world, 1 / 30, rng)
      const predator = world.boids.find((b) => b.species === 'predator')!
      if (predator.dart > dartBefore) sawDart = true
      expect(predator.dart).toBeLessThanOrEqual(SPECIES.predator.dartSeconds + 1e-9)
    }
    expect(sawDart).toBe(true)
  })

  it('composeTableau: one deliberate heading, ONE coherent crescent sector (composed, not a scatter)', () => {
    const tableau = composeTableau(BOUNDS, 8)
    const minnows = tableau.boids.filter((b) => b.species === 'minnow')

    // The school portrait faces one heading (a small authored jitter band).
    const headingOf = (b: { vx: number; vy: number }): number => Math.atan2(b.vy, b.vx)
    for (const m of minnows) {
      const spread = Math.abs(
        Math.atan2(Math.sin(headingOf(m) - -0.25), Math.cos(headingOf(m) - -0.25)),
      )
      expect(spread).toBeLessThanOrEqual(0.2)
    }

    // A composed portrait LINES THE SCHOOL UP: minnows ride the crescent in
    // spawn order (rank correlation between index and chord position ≈ 1).
    // A spawned cluster (the createWorld shape) is unordered — the correlation
    // is whatever the seed rolled, near zero.
    const pearson = (xs: readonly number[], ys: readonly number[]): number => {
      const mx = mean(xs)
      const my = mean(ys)
      let num = 0
      let dx2 = 0
      let dy2 = 0
      for (let i = 0; i < xs.length; i++) {
        const a = xs[i]! - mx
        const b = ys[i]! - my
        num += a * b
        dx2 += a * a
        dy2 += b * b
      }
      return num / Math.sqrt(dx2 * dy2)
    }

    const random = createWorld(BOUNDS, 8)
    const rMinnows = random.boids.filter((b) => b.species === 'minnow')

    const tableauAlignment = pearson(
      minnows.map((_, i) => i),
      minnows.map((m) => m.x),
    )
    const randomAlignment = pearson(
      rMinnows.map((_, i) => i),
      rMinnows.map((m) => m.x),
    )
    expect(tableauAlignment).toBeGreaterThan(0.85) // the crescent is posed in order
    expect(tableauAlignment).toBeGreaterThan(randomAlignment + 0.4) // …and the cluster is not
    const cx = mean(minnows.map((m) => m.x))
    const cy = mean(minnows.map((m) => m.y))

    // A predator holds the flank; nothing is out of bounds; no food posed.
    const predator = tableau.boids.find((b) => b.species === 'predator')!
    expect(Math.hypot(predator.x - cx, predator.y - cy)).toBeGreaterThan(
      SPECIES.predator.standoffRadius * 0.5,
    )
    for (const e of [...tableau.boids, ...tableau.motes]) {
      expect(e.x).toBeGreaterThanOrEqual(0)
      expect(e.x).toBeLessThanOrEqual(BOUNDS.w)
      expect(e.y).toBeGreaterThanOrEqual(0)
      expect(e.y).toBeLessThanOrEqual(BOUNDS.h)
    }
    expect(tableau.nutrients).toHaveLength(0)
  })

  it('composeTableau is seeded-deterministic and steppable (motion only on command)', () => {
    expect(JSON.stringify(composeTableau(BOUNDS, 21))).toBe(JSON.stringify(composeTableau(BOUNDS, 21)))
    const stepped = step(composeTableau(BOUNDS, 21), SIM_LAW.tableauDt, createRng(4))
    expect(stepped.clock).toBe(SIM_LAW.tableauDt)
    expect(stepped.boids.length).toBe(composeTableau(BOUNDS, 21).boids.length)
  })

  it('withBounds re-seats a world on resize (same bounds = same reference)', () => {
    const world = createWorld(BOUNDS, 6)
    expect(withBounds(world, BOUNDS)).toBe(world)
    const shrunk = withBounds(world, { w: 200, h: 100 })
    expect(shrunk.bounds).toEqual({ w: 200, h: 100 })
    for (const b of shrunk.boids) {
      expect(b.x).toBeLessThanOrEqual(200)
      expect(b.y).toBeLessThanOrEqual(100)
    }
  })
})
