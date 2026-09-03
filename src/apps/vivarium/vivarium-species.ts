/**
 * Vivarium species law (batch 2, brief 1) — the TUNING DATA behind the hold's
 * tank, isolated from the model so behavior is adjustable as DATA, never as
 * control flow (the brief's floor: "schooling cohesion/alignment/separation
 * tuned by constants in a data module").
 *
 * Pure data, DOM-free, store-free. Three authored specimens plus the drifting
 * motes share one amber family — brightness distinguishes species in the well,
 * never hue (the phosphor-well monochrome law; the canvas module owns those
 * brightness assignments).
 *
 * Units: positions in tank px (the canvas's CSS pixels), speeds in px/s,
 * radii in px, weights dimensionless steering blends.
 */

/** The tank's authored specimen kinds. */
export type SpeciesId = 'minnow' | 'drifter' | 'predator'

/**
 * One species' behavioral profile. Weights steer a unit "desire" vector that
 * the model scales by `cruise` and blends toward exponentially — the classic
 * Reynolds flocking shape, tuned for a ~600×380 tank at 60fps.
 */
export interface SpeciesProfile {
  readonly id: SpeciesId
  /** Specimens of this kind in a fresh tank. */
  readonly census: number
  /** Cruising speed (px/s) — the speed every desire is expressed at. */
  readonly cruise: number
  /** Speed ceiling (px/s) — dart bursts and feeding convergences live here. */
  readonly maxSpeed: number
  /** Exponential velocity response (1/s) — how fast a desire takes hold. */
  readonly turnResponse: number
  /** Radius for flock-centroid attraction (school/drifter cohesion). */
  readonly cohesionRadius: number
  readonly cohesionWeight: number
  /** Radius for heading matching. */
  readonly alignmentRadius: number
  readonly alignmentWeight: number
  /** Radius for crowding avoidance (same species). */
  readonly separationRadius: number
  readonly separationWeight: number
  /** Radius within which a nutrient mote is sensed and sought. */
  readonly nutrientSenseRadius: number
  readonly nutrientWeight: number
  /** True when this kind never responds to food (the drifter's law). */
  readonly ignoresNutrients: boolean
  /** Radius at which minnows shy away from the predator. */
  readonly fleeRadius: number
  readonly fleeWeight: number
  /** Distance the predator keeps from the school centroid (the stalk ring). */
  readonly standoffRadius: number
  /** Mean seconds between predator darts through the school's edge. */
  readonly dartPeriodSeconds: number
  /** Length of one dart burst (s). */
  readonly dartSeconds: number
  /** Speed multiplier while darting. */
  readonly dartBoost: number
  /** Rng wander magnitude (unit-desire units per frame). */
  readonly wander: number
  /** Wall standoff margin (px) and inward push weight. */
  readonly wallMargin: number
  readonly wallWeight: number
}

const minnow: SpeciesProfile = {
  id: 'minnow',
  census: 18,
  cruise: 46,
  maxSpeed: 115,
  turnResponse: 3.4,
  cohesionRadius: 92,
  cohesionWeight: 0.9,
  alignmentRadius: 68,
  alignmentWeight: 1.15,
  separationRadius: 15,
  separationWeight: 1.7,
  nutrientSenseRadius: 200,
  nutrientWeight: 2.7,
  ignoresNutrients: false,
  fleeRadius: 84,
  fleeWeight: 1.3,
  standoffRadius: 0,
  dartPeriodSeconds: 0,
  dartSeconds: 0,
  dartBoost: 1,
  wander: 0.32,
  wallMargin: 30,
  wallWeight: 1.25,
}

const drifter: SpeciesProfile = {
  id: 'drifter',
  census: 2,
  cruise: 8,
  maxSpeed: 14,
  turnResponse: 0.55,
  cohesionRadius: 0, // drifters do not school
  cohesionWeight: 0,
  alignmentRadius: 0,
  alignmentWeight: 0,
  separationRadius: 120, // ...but they keep apart from each other
  separationWeight: 0.6,
  nutrientSenseRadius: 0,
  nutrientWeight: 0,
  ignoresNutrients: true, // the drifter ignores food (brief law)
  fleeRadius: 0,
  fleeWeight: 0,
  standoffRadius: 0,
  dartPeriodSeconds: 0,
  dartSeconds: 0,
  dartBoost: 1,
  wander: 0.14,
  wallMargin: 44,
  wallWeight: 0.5,
}

const predator: SpeciesProfile = {
  id: 'predator',
  census: 1,
  cruise: 42,
  maxSpeed: 170,
  turnResponse: 2.1,
  cohesionRadius: 0,
  cohesionWeight: 0,
  alignmentRadius: 0,
  alignmentWeight: 0,
  separationRadius: 0,
  separationWeight: 0,
  nutrientSenseRadius: 0, // it hunts the SCHOOL's edge, never the food
  nutrientWeight: 0,
  ignoresNutrients: true,
  fleeRadius: 0,
  fleeWeight: 0,
  standoffRadius: 118,
  dartPeriodSeconds: 9,
  dartSeconds: 1.1,
  dartBoost: 2.3,
  wander: 0.1,
  wallMargin: 26,
  wallWeight: 1.0,
}

/** The tank's law, by kind. */
export const SPECIES: Readonly<Record<SpeciesId, SpeciesProfile>> = {
  minnow,
  drifter,
  predator,
}

/**
 * The drifting motes — the tank's fourth kind: ambient specimen dust. Not
 * boids (no flocking), just slow drift with gentle jitter.
 */
export const MOTE_LAW = {
  census: 26,
  cruise: 5,
  maxSpeed: 11,
  /** Velocity jitter magnitude (px/s per step). */
  jitter: 5.5,
  /** Exponential damping toward cruise (1/s) — jitter never accumulates. */
  damping: 0.8,
} as const

/**
 * Nutrient motes — dropped by tapping the glass. They sink slowly and decay;
 * they are never "eaten" (the census never lies about population).
 */
export const NUTRIENT_LAW = {
  /** Full life in seconds. */
  lifeSeconds: 10,
  /** Sink speed (px/s, straight down — food falls). */
  sink: 6,
  /** Concurrent motes cap — the oldest dissolves when the glass is over-tapped. */
  cap: 8,
} as const

/** Simulation-wide law. */
export const SIM_LAW = {
  /** dt clamp (s) — a restored tab never tunnels the world across the tank. */
  maxDt: 0.05,
  /** The frame-advance dt under reduced motion (one deliberate step). */
  tableauDt: 1 / 30,
} as const

/** Default tank bounds before the first measurement (also the test bench). */
export const DEFAULT_BOUNDS = { w: 600, h: 380 } as const
