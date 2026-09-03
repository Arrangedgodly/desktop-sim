/**
 * Vivarium surface (batch 2, brief 1) — the TANK, mounted lazy in its own
 * chunk: one deep phosphor well (canvas + the global scanline primitive),
 * a console-chrome census bar above it.
 *
 *   ┌ census bar (console chrome) ────────────────────────────────────────┐
 *   │ HOLD VIVARIUM  [POP 045] [FOOD 00] [HELD]    TAP GLASS TO FEED      │
 *   │                                               STEP   PAUSE ⬒  ●     │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌ the tank (THE phosphor well) ───────────────────────────────────────┐
 *   │  canvas 2D: minnow school · drifters · the stalker · motes · food   │
 *   │  ~~~ scanlines ~~~                                                  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * Division of labor (each piece unit-tested alone):
 * - vivarium-model.ts — the PURE sim (step/world/tableau/dropNutrient).
 * - vivarium-loop.ts — the rAF controller (dt clamp; holds under
 *   document.hidden AND while the window is minimized AND on the operator's
 *   PAUSE bat — the suspension predicate reads the WM store directly, so no
 *   subscription churn).
 * - vivarium-canvas.ts — the ink (tokens resolved at draw time; amber
 *   brightness families distinguish species, never hue).
 * - THIS component — wiring only: it never computes a force, never schedules
 *   its own frames, never names a color.
 *
 * Reduced motion (the brief's floor): the living loop is replaced by a STATIC
 * COMPOSED TABLEAU (vivarium-model.composeTableau — a deliberate arrangement,
 * never a frozen mid-frame) plus a STEP frame-advance control; a glass tap
 * still drops a nutrient (state, honestly read out) and the visitor advances
 * frames by hand. Honored via the settings store's reducedMotionFollow (the
 * OS preference) AND the live media query.
 *
 * Fresh tank per open (brief non-goal: no tank persistence) — nothing is
 * written to the window's appState; a restored window simply mounts a new
 * seeded tank. The first world is composed during first render (the lazy
 * worldRef init), so the census readout never flashes a wrong number —
 * instrument readouts snap, they never guess.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { playCue } from '../../lib/audio'
import { useSettingsStore, useWMStore } from '../../platform/stores'
import type { AppSurfaceProps } from '../../platform/app-registry'
import { DEFAULT_BOUNDS, SIM_LAW } from './vivarium-species'
import { drawWorld, resolveWellPalette, type WellPalette } from './vivarium-canvas'
import { createStepLoop, type StepLoop } from './vivarium-loop'
import {
  composeTableau,
  createRng,
  createWorld,
  dropNutrient,
  freshSeed,
  nutrientCountOf,
  populationOf,
  step,
  withBounds,
  type Rng,
  type VivariumWorld,
} from './vivarium-model'
import './vivarium.css'

/** Read the OS preference defensively (a host without the query reads "no"). */
function readPrefersReduced(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

export default function VivariumSurface({ windowId }: AppSurfaceProps) {
  /* ------------------------- motion preference --------------------------- */

  const reducedFollow = useSettingsStore((s) => s.reducedMotionFollow)
  const [mediaReduced, setMediaReduced] = useState(readPrefersReduced)
  const reduced = reducedFollow && mediaReduced

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setMediaReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  /* ------------------------------ console ------------------------------- */

  const [paused, setPaused] = useState(false)
  /** Explicit frame count under reduced motion (the STEP control's tally). */
  const [frames, setFrames] = useState(0)

  /* ------------------------------- engine -------------------------------- */

  const wellRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const worldRef = useRef<VivariumWorld | null>(null)
  const rngRef = useRef<Rng | null>(null)
  const paletteRef = useRef<WellPalette | null>(null)
  const dprRef = useRef(1)
  const pausedRef = useRef(false)
  const reducedRef = useRef(reduced)

  /* First world, composed during first render (lazy ref init — the seeded
     variant of the brief's "fresh tank per open"). */
  if (worldRef.current === null) {
    rngRef.current = createRng(freshSeed())
    worldRef.current = reduced
      ? composeTableau(DEFAULT_BOUNDS, freshSeed())
      : createWorld(DEFAULT_BOUNDS, freshSeed())
  }

  const [census, setCensus] = useState(() => ({
    pop: worldRef.current ? populationOf(worldRef.current) : 0,
    food: 0,
  }))

  /* The loop's suspension reads live refs, not state (no re-arm churn):
     under reduced motion the loop never runs, so the bat reports held. */
  pausedRef.current = paused || reduced
  reducedRef.current = reduced

  const syncCensus = useCallback((world: VivariumWorld): void => {
    const pop = populationOf(world)
    const food = nutrientCountOf(world)
    setCensus((prev) => (prev.pop === pop && prev.food === food ? prev : { pop, food }))
  }, [])

  const draw = useCallback((): void => {
    const canvas = canvasRef.current
    const world = worldRef.current
    const palette = paletteRef.current
    if (!canvas || !world || !palette) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom / a headless host: the model still lives, unseen
    const dpr = dprRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawWorld(ctx, world, palette)
  }, [])

  /* Mode flips re-seed the tank: reduced ON composes the deliberate tableau
     (never a frozen mid-frame); reduced OFF seeds a fresh live tank. The
     mount-time seed already happened in render — the first run only skips. */
  const seededModeRef = useRef(reduced)
  useEffect(() => {
    if (seededModeRef.current === reduced) return
    seededModeRef.current = reduced
    rngRef.current = createRng(freshSeed())
    worldRef.current = reduced
      ? composeTableau(DEFAULT_BOUNDS, freshSeed())
      : createWorld(DEFAULT_BOUNDS, freshSeed())
    setFrames(0)
    syncCensus(worldRef.current)
    draw()
  }, [reduced, draw, syncCensus])

  /* Resolve the ink once per mount (tokens do not change mid-session). */
  useEffect(() => {
    paletteRef.current = resolveWellPalette(document)
    draw()
  }, [draw])

  /* The living loop — one rAF chain, held (not killed) while suspended. */
  useEffect(() => {
    if (reduced) return
    const loop: StepLoop = createStepLoop(
      {
        requestFrame: (cb) => requestAnimationFrame(cb),
        cancelFrame: (handle) => cancelAnimationFrame(handle),
        isSuspended: () =>
          pausedRef.current ||
          document.hidden ||
          useWMStore.getState().windows[windowId]?.minimized === true,
        maxDt: SIM_LAW.maxDt,
      },
      (dt) => {
        const world = worldRef.current
        const rng = rngRef.current
        if (!world || !rng) return
        const next = step(world, dt, rng)
        worldRef.current = next
        syncCensus(next)
        draw()
      },
    )
    loop.start()
    return () => loop.stop()
  }, [reduced, windowId, draw, syncCensus])

  /* Repaint the tableau when a STEP advances it (no loop under reduced). */
  useEffect(() => {
    if (!reduced) return
    draw()
  }, [reduced, frames, draw])

  /* Sizing: the backing store follows the well; the world re-seats inside. */
  useEffect(() => {
    const well = wellRef.current
    if (!well) return
    const size = (): void => {
      const w = Math.max(1, well.clientWidth)
      const h = Math.max(1, well.clientHeight)
      const dpr = window.devicePixelRatio || 1
      dprRef.current = dpr
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = Math.max(1, Math.round(w * dpr))
        canvas.height = Math.max(1, Math.round(h * dpr))
      }
      const world = worldRef.current
      if (world) {
        const reseeded = withBounds(world, { w, h })
        worldRef.current = reseeded
        syncCensus(reseeded)
      }
      draw()
    }
    size()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(size)
    observer.observe(well)
    return () => observer.disconnect()
  }, [draw, syncCensus])

  /* ---------------------------- interactions ----------------------------- */

  const dropAt = useCallback(
    (x: number, y: number): void => {
      const world = worldRef.current
      if (!world) return
      const next = dropNutrient(world, x, y)
      worldRef.current = next
      playCue('drop-on-folder')
      syncCensus(next)
      if (reducedRef.current) setFrames((f) => f + 1) // the tableau re-inks on command
      else draw()
    },
    [draw, syncCensus],
  )

  const onTankClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    dropAt(e.clientX - rect.left, e.clientY - rect.top)
  }

  const onTankKeyDown = (e: ReactKeyboardEvent<HTMLCanvasElement>): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    const world = worldRef.current
    const rng = rngRef.current
    if (!world || !rng) return
    // A deterministic feeding spot — the keyboard operator taps mid-tank.
    dropAt(world.bounds.w * (0.3 + rng() * 0.4), world.bounds.h * (0.25 + rng() * 0.4))
  }

  const onTogglePause = (): void => {
    setPaused((p) => !p)
    playCue('toggle')
  }

  const onStep = (): void => {
    const world = worldRef.current
    const rng = rngRef.current
    if (!world || !rng) return
    const next = step(world, SIM_LAW.tableauDt, rng)
    worldRef.current = next
    playCue('menu-select')
    syncCensus(next)
    setFrames((f) => f + 1)
  }

  /* ------------------------------- render -------------------------------- */

  const popReadout = `POP ${String(census.pop).padStart(3, '0')}`
  const foodReadout = `FOOD ${String(census.food).padStart(2, '0')}`
  const running = !reduced && !paused

  return (
    <div className="vivarium">
      <header className="vivarium-bar">
        <span className="engraved vivarium-legend">Hold vivarium</span>
        <span className="well vivarium-readout" data-vivarium-pop>
          {popReadout}
        </span>
        <span className="well vivarium-readout" data-vivarium-food>
          {foodReadout}
        </span>
        {paused && !reduced ? (
          <span className="well vivarium-hold" data-vivarium-hold>
            HELD
          </span>
        ) : null}
        <span className="vivarium-hint">Tap glass to feed</span>
        {reduced ? (
          <button type="button" className="vivarium-step" data-vivarium-step onClick={onStep}>
            Step
          </button>
        ) : null}
        <button
          type="button"
          role="switch"
          className="vivarium-switch"
          data-vivarium-pause
          aria-checked={paused}
          aria-label="Pause the vivarium"
          disabled={reduced}
          onClick={onTogglePause}
        >
          <span className="vivarium-switch-caption" aria-hidden="true">
            Pause
          </span>
          <span className="vivarium-switch-housing" aria-hidden="true">
            <span className="vivarium-switch-slot">
              <span className="vivarium-bat" />
            </span>
          </span>
          <span className="vivarium-lamp" data-lit={running} aria-hidden="true" />
        </button>
      </header>
      <div className="vivarium-content">
        <div
          className="well vivarium-well"
          data-vivarium-tank
          data-vivarium-frames={frames}
          onClick={onTankClick}
        >
          <canvas
            ref={canvasRef}
            className="vivarium-canvas"
            tabIndex={0}
            role="img"
            aria-label="Specimen tank: tap to drop a nutrient mote"
            onKeyDown={onTankKeyDown}
          />
          <div className="scanlines" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
