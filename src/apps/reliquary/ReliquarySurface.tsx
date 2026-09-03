/**
 * Reliquary surface (batch 2, worker 8) — THE 3D CASE, mounted lazy in its
 * own chunk. Singleton: one case on the hold; the registry raises it.
 *
 *   ┌ toolbar (console chrome) ─────────────────────────────────────────┐
 *   │ RELIQUARY   [OPTICS OFFLINE — ENGRAVED PLATE]  AZ 035.5 EL … R 2.90│
 *   ├ bench (parchment) ────────────────┬─ catalog (parchment) ─────────┤
 *   │ ┌ glass case (THE well) ─────────┐ │ SPECIMENS                     │
 *   │ │  amber-lit specimen, scanlines │ │ [VENT PRISM  RQ-0001]         │
 *   │ └────────────────────────────────┘ │ [GYRE SHELL  RQ-0002]        │
 *   │  zoom lever · drag to orbit       │ [BRACT CLUSTER RQ-0003]       │
 *   │                                   │ ┌ label card ─────────────┐   │
 *   │                                   │ │ RQ-0002 · GYRE SHELL    │   │
 *   │                                   │ └─────────────────────────┘   │
 *   └───────────────────────────────────┴───────────────────────────────┘
 *
 * - THE CASE IS A WELL (the world's phosphor law): the WebGL canvas clears
 *   to well-ground, the specimen is lit in the amber family (brightness
 *   distinguishes specimens — never hues), scanlines ride over the glass,
 *   and the vitrine's brass frame is the hardware the law sanctions.
 * - THE HONEST DEGRADE: `VitrineRenderer.create` is guarded; null (no WebGL,
 *   shader fault) swaps the canvas for the CATALOG PLATE — the same
 *   specimen engraved as silhouette + stipple by the same pure math, with
 *   arrow-key rotation. Never a broken canvas, never a fake 3D.
 * - Gesture discipline (the fleet's): pointer capture on drag, camera
 *   mutated in a ref, draws INVALIDATION-scheduled through the renderer's
 *   single rAF-deduped path, camera state COMMITTED to React on release.
 *   The instrument readout is written LIVE by the renderer's onFrame (the
 *   machine's own hand), and its `data-reliquary-camera` attribute is the
 *   documented e2e hook.
 * - Zoom: wheel (non-passive) AND the brass lever, both clamped by the same
 *   pure `clampCamera` every path funnels through.
 * - Keyboard: arrows orbit, +/− zoom (canvas and catalog plate both carry
 *   the keys). No idle auto-rotation exists to disable — motion is
 *   user-driven only (the reduced-motion law holds by construction).
 * - Session-only state (brief-sanctioned): no FS, no appState, no close
 *   guard — nothing in the case can be lost.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { playCue } from '../../lib/audio'
import type { AppSurfaceProps } from '../../platform/app-registry'
import { engrave } from './reliquary-plate'
import {
  CAMERA_LIMITS,
  DEFAULT_CAMERA,
  KEY_ORBIT_STEP,
  ORBIT_RATE,
  VitrineRenderer,
  cameraHookValue,
  clampCamera,
  formatCamera,
  parseColor,
  zoomCamera,
  type CameraState,
} from './reliquary-renderer'
import { SPECIMENS, specimenById, toneTokenOf, type PhosphorTone, type SpecimenDef } from './reliquary-specimens'
import type { Geometry } from './reliquary-geometry'
import type { Vec3 } from './reliquary-math'
import './reliquary.css'

/** The specimen-change warm-up: how long the tube takes to settle (CSS paints it). */
const WARM_SETTLE_MS = 480

/** Token-resolution fallbacks if a custom property ever fails to resolve (the painter's paranoia). */
const FALLBACK_GROUND = '#120d07'
const FALLBACK_BRIGHT = '#ffd28a'
const FALLBACK_TONES: Readonly<Record<PhosphorTone, string>> = {
  phosphor: '#ffb340',
  'phosphor-bright': '#ffd28a',
  'phosphor-dim': '#b97e24',
}

/** Resolve one design token to its concrete value (ALL ink from tokens). */
function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** The zoom lever's two ends: 0 (stand-off max) … 100 (closest approach). */
function distanceToSlider(distance: number): number {
  const { minDistance, maxDistance } = CAMERA_LIMITS
  return Math.round((100 * (maxDistance - distance)) / (maxDistance - minDistance))
}

/** …and back again. */
function sliderToDistance(value: number): number {
  const { minDistance, maxDistance } = CAMERA_LIMITS
  return maxDistance - (value / 100) * (maxDistance - minDistance)
}

/** The vitrine's resolved ink (tokens → linear rgb, once per mount). */
interface ResolvedInk {
  readonly ground: Vec3
  readonly bright: Vec3
  readonly tones: Readonly<Record<PhosphorTone, Vec3>>
}

function resolveInk(): ResolvedInk {
  const tone = (key: PhosphorTone): Vec3 =>
    parseColor(tokenValue(toneTokenOf(key)) || FALLBACK_TONES[key]) ?? parseColor(FALLBACK_TONES[key])!
  return {
    ground: parseColor(tokenValue('--well-ground') || FALLBACK_GROUND) ?? parseColor(FALLBACK_GROUND)!,
    bright: parseColor(tokenValue('--phosphor-bright') || FALLBACK_BRIGHT) ?? parseColor(FALLBACK_BRIGHT)!,
    tones: { phosphor: tone('phosphor'), 'phosphor-bright': tone('phosphor-bright'), 'phosphor-dim': tone('phosphor-dim') },
  }
}

export default function ReliquarySurface({ windowId }: AppSurfaceProps) {
  const [specimenId, setSpecimenId] = useState<string>(SPECIMENS[0]!.id)
  const specimen = specimenById(specimenId) ?? SPECIMENS[0]!
  /** 'vitrine' until the tube proves it cannot light; then 'plate'. */
  const [mode, setMode] = useState<'vitrine' | 'plate'>('vitrine')
  /** Camera as committed to render (drags commit on release — the fleet's law). */
  const [committed, setCommitted] = useState<CameraState>(DEFAULT_CAMERA)
  /** The one authored moment: the tube re-warms when a specimen takes the stage. */
  const [fresh, setFresh] = useState(false)
  const [dragging, setDragging] = useState(false)

  const bayRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const readoutRef = useRef<HTMLSpanElement | null>(null)
  const rendererRef = useRef<VitrineRenderer | null>(null)
  const cameraRef = useRef<CameraState>(DEFAULT_CAMERA)
  const inkRef = useRef<ResolvedInk | null>(null)
  const geometriesRef = useRef<Map<string, Geometry>>(new Map())
  const specimenIdRef = useRef(specimenId)
  specimenIdRef.current = specimenId

  /** Build (once) or fetch a specimen's mesh — deterministic, so cache by id. */
  const geometryFor = useCallback((entry: SpecimenDef): Geometry => {
    let geometry = geometriesRef.current.get(entry.id)
    if (!geometry) {
      geometry = entry.build()
      geometriesRef.current.set(entry.id, geometry)
    }
    return geometry
  }, [])

  /* ------------------------- the vitrine (mount) --------------------------- */

  // Build the case ONCE per window: resolve the palette's tokens, create the
  // guarded renderer, seat the opening specimen. A null renderer flips the
  // case to the engraved catalog plate (the honest degrade).
  useEffect(() => {
    const ink = resolveInk()
    inkRef.current = ink
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = VitrineRenderer.create(
      canvas,
      { ground: ink.ground, tone: ink.tones[specimen.tone], bright: ink.bright },
      cameraRef.current,
      {
        onFrame: (camera) => {
          // The instrument's own hand: the readout is machine output, written
          // by the draw itself (live during drags; committed on release).
          const node = readoutRef.current
          if (!node) return
          node.setAttribute('data-reliquary-camera', cameraHookValue(camera))
          node.textContent = formatCamera(camera)
        },
      },
    )
    if (!renderer) {
      setMode('plate') // no tube — the catalog plate takes the stage
      return
    }
    rendererRef.current = renderer
    const opening = specimenById(specimenIdRef.current) ?? SPECIMENS[0]!
    renderer.setSpecimen(geometryFor(opening), opening.baseYaw, opening.basePitch)
    renderer.setTone(ink.tones[opening.tone])
    renderer.requestDraw()
    return () => {
      rendererRef.current = null
      renderer.dispose()
    }
    // specimen read once at boot (a ref, deliberately not reactive); the
    // seat effect below owns subsequent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId, geometryFor])

  /* --------------------------- camera plumbing ----------------------------- */

  /** The ONE camera path: clamp, mutate the live ref, invalidate, optionally commit. */
  const applyCamera = useCallback((next: CameraState, commit = true): void => {
    const clamped = clampCamera(next)
    cameraRef.current = clamped
    rendererRef.current?.setCamera(clamped) // plate mode: renderer is null — state IS the render
    if (commit) setCommitted(clamped)
  }, [])

  // Wheel zoom: a NON-PASSIVE native listener (React's wheel is passive at
  // the root; the case must never scroll the page under the glass).
  useEffect(() => {
    const bay = bayRef.current
    if (!bay) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const notches = Math.max(-3, Math.min(3, event.deltaY / 100))
      applyCamera(zoomCamera(cameraRef.current, notches))
    }
    bay.addEventListener('wheel', onWheel, { passive: false })
    return () => bay.removeEventListener('wheel', onWheel)
  }, [applyCamera])

  /* ----------------------------- orbit drag -------------------------------- */

  const dragLastRef = useRef<{ x: number; y: number } | null>(null)

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!event.isPrimary || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    dragLastRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const last = dragLastRef.current
    if (!last || !event.isPrimary) return
    const dx = event.clientX - last.x
    const dy = event.clientY - last.y
    dragLastRef.current = { x: event.clientX, y: event.clientY }
    applyCamera(
      {
        yaw: cameraRef.current.yaw + dx * ORBIT_RATE,
        pitch: cameraRef.current.pitch + dy * ORBIT_RATE,
        distance: cameraRef.current.distance,
      },
      false, // no commits mid-gesture — the readout rides onFrame, state lands on release
    )
  }

  /** End the orbit cleanly (pointerup, pointercancel — the same law). */
  const endDrag = (): void => {
    if (!dragLastRef.current) return
    dragLastRef.current = null
    setDragging(false)
    setCommitted(cameraRef.current) // the gesture's transform state, committed
  }

  /* ------------------------------ keyboard --------------------------------- */

  /** Arrows orbit, +/− zoom — the canvas and the catalog plate share the keys. */
  const handleCaseKeys = (event: ReactKeyboardEvent<HTMLElement>): void => {
    const camera = cameraRef.current
    let next: CameraState // every case below assigns; default returns unhandled
    switch (event.key) {
      case 'ArrowLeft':
        next = { ...camera, yaw: camera.yaw - KEY_ORBIT_STEP }
        break
      case 'ArrowRight':
        next = { ...camera, yaw: camera.yaw + KEY_ORBIT_STEP }
        break
      case 'ArrowUp':
        next = { ...camera, pitch: camera.pitch + KEY_ORBIT_STEP }
        break
      case 'ArrowDown':
        next = { ...camera, pitch: camera.pitch - KEY_ORBIT_STEP }
        break
      case '+':
      case '=':
        next = zoomCamera(camera, -1)
        break
      case '-':
      case '_':
        next = zoomCamera(camera, 1)
        break
      default:
        return
    }
    event.preventDefault()
    applyCamera(next)
  }

  /* --------------------------- specimen changes ----------------------------- */

  // Seat (or engrave) the chosen specimen. The vitrine re-seats its buffers
  // and tone; the plate mode re-renders through `committed` alone.
  useEffect(() => {
    if (mode !== 'vitrine') return
    const renderer = rendererRef.current
    const ink = inkRef.current
    if (!renderer || !ink) return
    renderer.setSpecimen(geometryFor(specimen), specimen.baseYaw, specimen.basePitch)
    renderer.setTone(ink.tones[specimen.tone])
  }, [specimen, mode, geometryFor])

  // The ONE authored moment: the tube warms to its new specimen (CSS runs
  // the settle; reduced motion collapses it globally to its visible end).
  useEffect(() => {
    setFresh(true)
    const timer = window.setTimeout(() => setFresh(false), WARM_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [specimenId, mode])

  const selectSpecimen = (id: string): void => {
    if (id === specimenId) return
    setSpecimenId(id)
    playCue('toggle') // a hardware seat changes — the bat clicks
  }

  /* ------------------------------ the plate --------------------------------- */

  const plateEngraving = useMemo(
    () =>
      mode === 'plate'
        ? engrave(geometryFor(specimen), committed.yaw + specimen.baseYaw, committed.pitch + specimen.basePitch)
        : null,
    [mode, specimen, committed.yaw, committed.pitch, geometryFor],
  )

  /* ------------------------------- render ----------------------------------- */

  return (
    <div className="reliquary" data-reliquary-surface data-mode={mode}>
      <div className="reliquary-toolbar">
        <span className="reliquary-name engraved">Reliquary</span>
        {mode === 'plate' && (
          <span className="reliquary-mode engraved" title="WebGL is unavailable on this console">
            Optics offline — engraved plate
          </span>
        )}
        <span
          ref={readoutRef}
          className="reliquary-readout well"
          data-reliquary-camera={cameraHookValue(committed)}
          aria-label="Camera azimuth, elevation and range"
        >
          {formatCamera(committed)}
        </span>
      </div>

      <div className="reliquary-content parchment-surface">
        <div className="reliquary-bench">
          <div className="reliquary-caseframe" data-fresh={fresh || undefined}>
            <div className="reliquary-case well" ref={bayRef} data-reliquary-case data-dragging={dragging || undefined}>
              {mode === 'vitrine' ? (
                <>
                  <canvas
                    ref={canvasRef}
                    className="reliquary-canvas"
                    data-reliquary-canvas
                    tabIndex={0}
                    role="img"
                    aria-label={`${specimen.name} in the case — drag or use arrow keys to orbit, plus and minus to zoom`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={handleCaseKeys}
                  />
                  <div className="scanlines" aria-hidden="true" />
                </>
              ) : (
                <div
                  className="reliquary-plate"
                  data-reliquary-plate
                  tabIndex={0}
                  role="img"
                  aria-label={`${specimen.name} — engraved catalog plate; arrow keys rotate it`}
                  onKeyDown={handleCaseKeys}
                >
                  {plateEngraving && (
                    <svg className="reliquary-plate-svg" viewBox="-1.15 -1.02 2.3 2.04" aria-hidden="true" focusable="false">
                      <g className="reliquary-plate-ink" transform="scale(1,-1)">
                        <polygon
                          className="reliquary-plate-hull"
                          points={plateEngraving.hull.map((point) => `${point[0]},${point[1]}`).join(' ')}
                        />
                        {plateEngraving.stipple.map((point, index) => (
                          <rect key={index} x={point[0]! - 0.006} y={point[1]! - 0.006} width={0.012} height={0.012} />
                        ))}
                      </g>
                    </svg>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="reliquary-casefoot">
            <span className="reliquary-zoom-legend engraved" aria-hidden="true">
              Zoom
            </span>
            <input
              type="range"
              className="reliquary-zoom"
              data-reliquary-zoom
              min={0}
              max={100}
              step={1}
              value={distanceToSlider(committed.distance)}
              aria-label="Zoom — stand-off distance"
              onChange={(event) =>
                applyCamera({ ...cameraRef.current, distance: sliderToDistance(Number(event.target.value)) })
              }
            />
            <p className="reliquary-hint">
              {mode === 'vitrine'
                ? 'Drag to orbit the case — wheel or lever to zoom.'
                : 'Arrow keys rotate the plate — the tube cannot light on this console.'}
            </p>
          </div>
        </div>

        <aside className="reliquary-catalog">
          <p className="reliquary-catalog-head engraved--parchment">Specimens</p>
          <div className="reliquary-picker" role="group" aria-label="Specimens">
            {SPECIMENS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="reliquary-card"
                data-reliquary-pick={entry.id}
                data-selected={entry.id === specimenId || undefined}
                aria-pressed={entry.id === specimenId}
                onClick={() => selectSpecimen(entry.id)}
              >
                <span className="reliquary-card-name">{entry.name}</span>
                <span className="reliquary-card-accession">{entry.accession}</span>
              </button>
            ))}
          </div>
          <div className="reliquary-label" data-reliquary-label>
            <span className="reliquary-label-accession">{specimen.accession}</span>
            <p className="reliquary-label-name">{specimen.name}</p>
            <p className="reliquary-label-note">{specimen.note}</p>
          </div>
        </aside>
      </div>
      {/* Case state for assistive tech (the readout itself is machine output). */}
      <span className="reliquary-sr" role="status">
        {mode === 'plate' ? 'Engraved plate — optics offline' : `${specimen.name} on display`}
      </span>
    </div>
  )
}
