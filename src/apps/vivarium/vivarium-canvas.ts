/**
 * Vivarium canvas ink (batch 2, brief 1) — the authored 2D rendering behind
 * the tank. Every color is resolved from the world's design tokens at draw
 * time (the paint app's sanctioned pattern — ZERO raw hex in this module),
 * and the phosphor AMBER MONOCROME FAMILY law holds by construction: species
 * are distinguished by BRIGHTNESS (bright = predator, mid = minnow, dim =
 * drifter + motes), never by hue.
 *
 * Glow discipline (DESIGN.md, the Phosphor Wells Rule): every shadow this
 * module casts is INSIDE the tank's recessed well — the nutrient sparkle and
 * the predator's catch-light bloom against the well ground. Nothing here
 * draws outside the canvas.
 *
 * Drawing is a pure function of (world, palette): no time, no rng — motion
 * belongs to the model; a frame is state, faithfully inked.
 */

import { NUTRIENT_LAW } from './vivarium-species'
import type { Boid, Mote, Nutrient, VivariumWorld } from './vivarium-model'

/** The well's ink family, resolved from tokens (null → the sheet is absent;
 *  the surface skips drawing rather than ink a wrong color). */
export interface WellPalette {
  readonly ground: string
  readonly phosphor: string
  readonly bright: string
  readonly dim: string
  readonly glow: string
}

/** Resolve the tank's palette from the document's tokens (cached by caller). */
export function resolveWellPalette(doc: Document): WellPalette | null {
  const computed = doc.defaultView?.getComputedStyle(doc.documentElement)
  if (!computed) return null
  const token = (name: string): string => computed.getPropertyValue(name).trim()
  const ground = token('--well-ground')
  const phosphor = token('--phosphor')
  const dim = token('--phosphor-dim')
  const bright = token('--phosphor-bright')
  if (!ground || !phosphor || !dim || !bright) return null
  return { ground, phosphor, dim, bright, glow: token('--phosphor-glow') || 'transparent' }
}

/** Save/translate/rotate scaffold for oriented specimen drawing. */
function oriented(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  draw: () => void,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  draw()
  ctx.restore()
}

function headingOf(vx: number, vy: number): number {
  return Math.atan2(vy, vx)
}

/* -- the species' authored forms ------------------------------------------ */

/** The minnow: a 9px teardrop stroke with a flicked V tail. */
function drawMinnow(ctx: CanvasRenderingContext2D, b: Boid, ink: string): void {
  oriented(ctx, b.x, b.y, headingOf(b.vx, b.vy), () => {
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    // body: nose forward, waist slight
    ctx.beginPath()
    ctx.moveTo(4.2, 0)
    ctx.quadraticCurveTo(0, -1.6, -3.8, 0)
    ctx.stroke()
    // tail: a V opening backward
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(-3.6, 0)
    ctx.lineTo(-6.4, -2.4)
    ctx.moveTo(-3.6, 0)
    ctx.lineTo(-6.4, 2.4)
    ctx.stroke()
  })
}

/** The drifter: a slow bell with three trailing filaments. */
function drawDrifter(ctx: CanvasRenderingContext2D, b: Boid, ink: string): void {
  const tilt = Math.max(-0.25, Math.min(0.25, b.vx / 60))
  oriented(ctx, b.x, b.y, tilt, () => {
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    // bell: a shallow dome
    ctx.beginPath()
    ctx.moveTo(-8, 2)
    ctx.quadraticCurveTo(0, -11, 8, 2)
    ctx.stroke()
    // filaments: three swaying curves below the rim
    ctx.lineWidth = 1
    for (const [rx, sway] of [
      [-5, 2.6],
      [0, -1.8],
      [5, 2.2],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(rx, 2)
      ctx.quadraticCurveTo(rx + sway, 8, rx + sway * 0.4, 14)
      ctx.stroke()
    }
  })
}

/** The predator: a long dart with swept fins — the tank's brightest form. */
function drawPredator(ctx: CanvasRenderingContext2D, b: Boid, ink: string, glow: string): void {
  oriented(ctx, b.x, b.y, headingOf(b.vx, b.vy), () => {
    // the catch-light bloom (inside the well — sanctioned)
    ctx.shadowColor = glow
    ctx.shadowBlur = b.dart > 0 ? 10 : 5
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.moveTo(11, 0) // nose
    ctx.lineTo(1.5, -2.6) // shoulder
    ctx.lineTo(-9, -1) // tail top
    ctx.lineTo(-9, 1) // tail bottom
    ctx.lineTo(1.5, 2.6) // shoulder
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
    // swept fins
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(2, -2.2)
    ctx.lineTo(-1.5, -6)
    ctx.moveTo(2, 2.2)
    ctx.lineTo(-1.5, 6)
    ctx.stroke()
  })
}

/** The nutrient mote: a sinking four-point sparkle, fading with its life. */
function drawNutrient(ctx: CanvasRenderingContext2D, n: Nutrient, ink: string, glow: string): void {
  const alpha = Math.max(0, Math.min(1, n.life / NUTRIENT_LAW.lifeSeconds))
  ctx.save()
  ctx.globalAlpha = 0.35 + 0.65 * alpha
  ctx.shadowColor = glow
  ctx.shadowBlur = 5 * alpha
  ctx.strokeStyle = ink
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(n.x - 3.2, n.y)
  ctx.lineTo(n.x + 3.2, n.y)
  ctx.moveTo(n.x, n.y - 3.2)
  ctx.lineTo(n.x, n.y + 3.2)
  ctx.stroke()
  ctx.restore()
}

/** The drifting mote: a speck of specimen dust. */
function drawMote(ctx: CanvasRenderingContext2D, m: Mote, ink: string): void {
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.arc(m.x, m.y, 1.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Ink one frame of the tank. `ctx` is expected in CSS-pixel space (the
 * surface applies the devicePixelRatio transform); the world's bounds are the
 * canvas's CSS size by construction.
 */
export function drawWorld(ctx: CanvasRenderingContext2D, world: VivariumWorld, palette: WellPalette): void {
  const { w, h } = world.bounds

  ctx.fillStyle = palette.ground
  ctx.fillRect(0, 0, w, h)

  for (const m of world.motes) drawMote(ctx, m, palette.dim)
  for (const n of world.nutrients) drawNutrient(ctx, n, palette.bright, palette.glow)
  for (const b of world.boids) {
    if (b.species === 'drifter') drawDrifter(ctx, b, palette.dim)
  }
  for (const b of world.boids) {
    if (b.species === 'minnow') drawMinnow(ctx, b, palette.phosphor)
  }
  for (const b of world.boids) {
    if (b.species === 'predator') drawPredator(ctx, b, palette.bright, palette.glow)
  }
}
