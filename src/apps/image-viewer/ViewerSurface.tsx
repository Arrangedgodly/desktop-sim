/**
 * Viewer surface (AP-3) — the PLATE VIEWER, mounted lazy in its own chunk.
 * One window PER PLATE: the registry's file-instance dedupe
 * (`instanceId = file:<nodeId>`) makes `openApp('image-viewer', …)` focus an
 * already-open plate instead of duplicating it — this component never manages
 * that itself (docs/APP-CONTRACT.md instance rules). A launcher open (no
 * file) is an EMPTY STAGE: the viewer only ever READS plates (no draft, no
 * dirty state, no close guard — the notepad's writing-side machinery has no
 * analogue here).
 *
 * Anatomy — the design brief's console/archive duality, viewing side:
 *
 *   ┌ toolbar (dark console chrome) ──────────────────────────────┐
 *   │ REFERENCE-PLATE.PNG   [PLT-0001]   − [ FIT ] +      [ 1:1 ] │
 *   └──────────────────────────────────────────────────────────────┘
 *   ┌ stage (parchment MAT) ───────────────────────────────────────┐
 *   │        ┌───────────────────────────┐                         │
 *   │        │  the plate (the image)    │  ← centered, shadowed   │
 *   │        └───────────────────────────┘                         │
 *   │        PLT-0001 · REFERENCE-PLATE.PNG · LABELLED …           │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * - FIT (the default) scales the plate into the mat — re-fit follows the
 *   stage through a ResizeObserver (window resize/maximize re-fits), with a
 *   window-resize fallback for hosts without one (jsdom).
 * - 1:1 renders ACTUAL PIXELS; +/− step the zoom in 25% increments clamped
 *   25–400% (from fit the stepper anchors at 100%). When the plate overflows
 *   the mat, DRAG PANS it — the committed gesture discipline applied
 *   lightly: pointer capture, transform-only move, NO inertia, ZERO state
 *   writes mid-gesture, ONE `setPan` commit at pointerup; Escape bounces
 *   back. Panning is armed ONLY while the plate overflows (data-pannable).
 * - Keyboard floor: the stage holds focus; F toggles fit↔1:1, +/− step.
 * - The CAPTION strip is engraved on the mat beneath the plate (accession,
 *   name, label timestamp — digits ride B612, the committed typeface law).
 * - Guards: a plate whose src is empty (or unreadable) draws an in-world
 *   PLATE NOT DEVELOPED notice; a plate decommissioned elsewhere draws the
 *   close-only PLATE REMOVED notice; a launcher open draws NO PLATE MOUNTED.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useFSStore, useWMStore } from '../../platform/stores'
import type { AppSurfaceProps } from '../../platform/app-registry'
import {
  clampPan,
  displaySize,
  effectiveScale,
  formatLabelStamp,
  imageBox,
  imageSpecimen,
  overflowOf,
  pannable,
  plateId,
  sessionView,
  setSessionView,
  stepZoom,
  toggleFit,
  viewReadout,
  type Pan,
  type Size,
  type ViewState,
} from './viewer-model'
import { ViewerIcon } from './ViewerIcon'
import './viewer.css'

/** Header label while the stage holds no live plate. */
const NO_PLATE_LABEL = 'No plate mounted'

/** Accession readout while the stage holds no live plate. */
const UNFILED_ACCESSION = 'UNFILED'

/** One live pan gesture (the light two-phase discipline — no rAF, no inertia). */
interface PanSession {
  readonly pointerId: number
  readonly captureElement: HTMLElement
  readonly startPointer: { x: number; y: number }
  readonly startPan: Pan
  /** Latest clamped offset (mutated by move; read by the single commit). */
  latest: Pan
}

const EMPTY_PAN: Pan = { x: 0, y: 0 }

export default function ViewerSurface({ windowId, launch }: AppSurfaceProps) {
  const fs = useFSStore((s) => s.fs)

  /* ------------------------------ binding -------------------------------- */

  const boundId = plateId(launch)
  const plate = imageSpecimen(fs, boundId)

  /* ------------------------------ view state ------------------------------- */

  const [view, setView] = useState<ViewState>(() => sessionView())
  const [pan, setPan] = useState<Pan>(EMPTY_PAN)
  /** The plate's natural pixels (null until <img> load — and in jsdom). */
  const [natural, setNatural] = useState<Size | null>(null)
  /** True when the browser refused the src (unloadable plate data). */
  const [unreadable, setUnreadable] = useState(false)
  /** Measured stage box (0×0 until measured — jsdom stays there). */
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 })

  const developed = plate !== null && plate.src.length > 0 && !unreadable
  const displayName = plate?.name ?? NO_PLATE_LABEL
  const accession = plate?.accession ?? UNFILED_ACCESSION

  const box = imageBox(stage)
  const scale = developed && natural ? effectiveScale(natural, view, stage) : null
  const display = developed && natural && scale ? displaySize(natural, scale) : null
  const overflow = display ? overflowOf(display, box) : { w: 0, h: 0 }
  const canPan = display !== null && pannable(display, box)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const plateRef = useRef<HTMLElement | null>(null)
  const panSessionRef = useRef<PanSession | null>(null)
  // Handlers read the LIVE clamps through this ref (render-stable truth).
  const overflowRef = useRef(overflow)
  overflowRef.current = overflow

  /* ------------------------------ measuring -------------------------------- */

  const measure = (): void => {
    const el = stageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setStage({ w: rect.width, h: rect.height })
  }

  // Measure once, then track the stage's box: a ResizeObserver catches WM
  // window drags/resizes/maximize (the browser window itself never resizes);
  // hosts without one (jsdom) fall back to window resize events.
  useEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stageRef.current!)
    return () => observer.disconnect()
  }, [])

  // A new plate resets the posture: fresh natural size, centered, readable.
  useEffect(() => {
    setNatural(null)
    setUnreadable(false)
    setPan(EMPTY_PAN)
  }, [boundId])

  /* --------------------------- keyboard floor ------------------------------- */

  const focused = useWMStore((s) => s.focusedId === windowId)

  // The stage is the surface's focus seat (the notepad's sheet analogue): it
  // takes focus on mount and whenever the window is raised while focus sits
  // outside this surface — so F/+/-/Esc are live whenever the operator is
  // looking at the plate.
  useEffect(() => {
    if (!focused) return
    const el = stageRef.current
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [focused])

  /** Apply a view switch: state + session memory + recentered pan. */
  const switchView = (next: ViewState): void => {
    setView(next)
    setSessionView(next) // per-session memory: new plate windows inherit it
    setPan(EMPTY_PAN) // a new scale re-solves the clamp; start centered
  }

  const handleKeyDown = (event: ReactKeyboardEvent): void => {
    if (event.key === 'Escape') {
      // Escape during a live pan bounces the plate back (gesture discipline).
      const session = panSessionRef.current
      if (session) {
        event.preventDefault()
        endPan(session.startPan, false)
      }
      return
    }
    if (!developed) return
    switch (event.key) {
      case 'f':
      case 'F':
        event.preventDefault()
        switchView(toggleFit(view))
        break
      case '+':
      case '=':
        event.preventDefault()
        switchView(stepZoom(view, 1))
        break
      case '-':
      case '_':
        event.preventDefault()
        switchView(stepZoom(view, -1))
        break
    }
  }

  /* ------------------------------ pan gesture ------------------------------- */

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!canPan || event.button !== 0) return // primary pointer only
    if (panSessionRef.current) return // one live gesture per stage
    // No text selection / native image drag off the mat; the compatibility
    // click still fires (click is not a compatibility mouse event).
    event.preventDefault()
    // Best-effort capture (real pointers keep the events flowing here).
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // inactive/synthetic pointer (tests, exotic hosts) — bubble path
    }
    panSessionRef.current = {
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      startPointer: { x: event.clientX, y: event.clientY },
      startPan: pan,
      latest: pan,
    }
    stageRef.current?.setAttribute('data-panning', 'true') // the hand takes the mat
  }

  const movePan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const session = panSessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    // Transform-only, ZERO state writes mid-gesture (RQ-2 two-phase, lightly:
    // no rAF needed — one translate per pointer event, nothing else paints).
    const next = clampPan(
      {
        x: session.startPan.x + (event.clientX - session.startPointer.x),
        y: session.startPan.y + (event.clientY - session.startPointer.y),
      },
      overflowRef.current,
    )
    session.latest = next
    const el = plateRef.current
    if (el) el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`
  }

  /**
   * End the live pan. `commit` = pointerup-style (the ONE atomic `setPan`;
   * React re-renders and writes the same transform); `false` = Escape/
   * pointercancel (bounce back to the pre-gesture offset, silently).
   */
  const endPan = (final: Pan, commit: boolean): void => {
    const session = panSessionRef.current
    if (!session) return // idempotent end-matrix: the first end wins
    panSessionRef.current = null
    try {
      if (
        typeof session.captureElement.releasePointerCapture === 'function' &&
        typeof session.captureElement.hasPointerCapture === 'function' &&
        session.captureElement.hasPointerCapture(session.pointerId)
      ) {
        session.captureElement.releasePointerCapture(session.pointerId)
      }
    } catch {
      // pointer already inactive — nothing to release
    }
    stageRef.current?.removeAttribute('data-panning')
    if (commit) {
      setPan(final) // the single state write of the gesture
      return
    }
    const el = plateRef.current
    if (el) el.style.transform = `translate3d(${session.startPan.x}px, ${session.startPan.y}px, 0)`
  }

  /* ------------------------------- render ----------------------------------- */

  const zoomDisabled = !developed

  return (
    <div
      className="viewer"
      data-viewer-surface
      data-view-mode={view.mode}
      data-zoom={view.pct}
      onKeyDown={handleKeyDown}
    >
      <header className="viewer-toolbar">
        <span className="viewer-name engraved" data-viewer-name title={displayName}>
          {displayName}
        </span>
        {/* The accession readout — digits ride B612 in a recessed well. */}
        <span className="viewer-accession well">{accession}</span>
        <div className="viewer-controls" role="group" aria-label="Plate zoom">
          <button
            type="button"
            className="viewer-tool"
            data-viewer-zoom-out
            aria-label="Zoom out"
            title="Zoom out — 25% steps"
            disabled={zoomDisabled}
            onClick={() => switchView(stepZoom(view, -1))}
          >
            <MinusGlyph />
          </button>
          {/* The scale readout: FIT, or the explicit zoom in B612. */}
          <span className="viewer-readout well" data-viewer-readout aria-hidden="true">
            {viewReadout(view)}
          </span>
          <button
            type="button"
            className="viewer-tool"
            data-viewer-zoom-in
            aria-label="Zoom in"
            title="Zoom in — 25% steps"
            disabled={zoomDisabled}
            onClick={() => switchView(stepZoom(view, 1))}
          >
            <PlusGlyph />
          </button>
        </div>
        {/* The fit/1:1 toggle: the label names the ACTION (1:1 while
            fitting, Fit while zoomed) — the readout beside it names the
            state, so the two never say the same thing twice. */}
        <div className="viewer-controls" role="group" aria-label="Plate scale">
          <button
            type="button"
            className="viewer-mode-btn"
            data-viewer-toggle
            disabled={zoomDisabled}
            title="Toggle fit / actual pixels (F)"
            onClick={() => switchView(toggleFit(view))}
          >
            {view.mode === 'fit' ? '1:1' : 'Fit'}
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className="viewer-stage parchment-surface"
        data-viewer-stage
        data-pannable={canPan || undefined}
        role="group"
        aria-label={`Plate stage — ${displayName}`}
        tabIndex={-1}
        style={canPan ? { touchAction: 'none' } : undefined}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={(event) => {
          const session = panSessionRef.current
          if (!session || event.pointerId !== session.pointerId) return
          endPan(session.latest, true)
        }}
        onPointerCancel={(event) => {
          const session = panSessionRef.current
          if (!session || event.pointerId !== session.pointerId) return
          endPan(session.startPan, false)
        }}
        onLostPointerCapture={(event) => {
          const session = panSessionRef.current
          if (!session || event.pointerId !== session.pointerId) return
          // Defensive end (RQ-3): after pointerup the implicit release finds
          // the session consumed; an ABNORMAL loss commits — the operator's
          // pan should not vanish.
          endPan(session.latest, true)
        }}
      >
        {boundId !== null && plate === null ? (
          <RemovedPlateNotice onClose={() => useWMStore.getState().closeWindow(windowId)} />
        ) : plate === null ? (
          <EmptyStageNotice />
        ) : !developed ? (
          <UndevelopedPlateNotice />
        ) : (
          <figure
            ref={plateRef}
            className="viewer-plate"
            data-viewer-plate
            style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}
          >
            <img
              className="viewer-image"
              data-viewer-image
              src={plate.src}
              alt={plate.name}
              draggable={false}
              onLoad={(event) => {
                const el = event.currentTarget
                if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                  setNatural({ w: el.naturalWidth, h: el.naturalHeight })
                }
              }}
              onError={() => setUnreadable(true)}
              style={
                display
                  ? { width: `${display.w}px`, height: `${display.h}px` }
                  : undefined /* pre-measure: CSS max-constraints hold the line */
              }
            />
            {/* The engraved caption strip — the plate's own catalog label. */}
            <figcaption className="viewer-caption" data-viewer-caption>
              <span className="viewer-caption-accession">{plate.accession}</span>
              <span className="viewer-caption-name">{plate.name}</span>
              <span className="viewer-caption-stamp">
                LABELLED {formatLabelStamp(plate.accessionedAt)}
              </span>
            </figcaption>
          </figure>
        )}
      </div>
      {/* Scale state for assistive tech (the readout itself is decorative). */}
      <span className="viewer-sr" role="status">
        {developed ? `Plate on the mat at ${viewReadout(view)} scale` : displayName}
      </span>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * The stage notices — every empty/dead end speaks in-world, never a browser
 * dialog (the archive's law; the notepad set the pattern).
 * ------------------------------------------------------------------------ */

/** The plate was decommissioned elsewhere; this window is a closed file. */
function RemovedPlateNotice({ onClose }: { readonly onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // The notice is terminal: focus lands on its single action.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div className="viewer-notice" data-viewer-removed role="alert">
      <span className="viewer-notice-glyph" aria-hidden="true">
        <ViewerIcon size={30} />
      </span>
      <p className="viewer-notice-title">Plate removed from catalog</p>
      <p className="viewer-notice-hint">
        The specimen was decommissioned elsewhere in the archive. This module can only close.
      </p>
      <button
        ref={closeRef}
        type="button"
        className="viewer-notice-close"
        data-viewer-removed-close
        onClick={onClose}
      >
        Close module
      </button>
    </div>
  )
}

/** A launcher open: the viewer can only read plates — the stage holds none. */
function EmptyStageNotice() {
  return (
    <div className="viewer-notice" data-viewer-empty-stage role="status">
      <span className="viewer-notice-glyph" aria-hidden="true">
        <ViewerIcon size={30} />
      </span>
      <p className="viewer-notice-title">No plate mounted</p>
      <p className="viewer-notice-hint">
        This stage views catalogued plates. Open one from a drawer or the hold to mount it here.
      </p>
    </div>
  )
}

/** Bound but src-less (or unreadable): the catalog entry outlived its plate. */
function UndevelopedPlateNotice() {
  return (
    <div className="viewer-notice" data-viewer-empty-src role="status">
      <span className="viewer-notice-glyph" aria-hidden="true">
        <ViewerIcon size={30} />
      </span>
      <p className="viewer-notice-title">Plate not developed</p>
      <p className="viewer-notice-hint">
        This specimen's catalog entry carries no readable plate data. The archive cannot render it.
      </p>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * Toolbar chrome glyphs — same drawing discipline as the fleet (1.5px
 * stroke, currentColor, 24 grid). Drawn, never unicode stand-ins.
 * ------------------------------------------------------------------------ */

const TOOL_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function ToolSvg({ children }: { readonly children: React.ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  )
}

function MinusGlyph() {
  return (
    <ToolSvg>
      <line {...TOOL_STROKE} x1="6" y1="12" x2="18" y2="12" />
    </ToolSvg>
  )
}

function PlusGlyph() {
  return (
    <ToolSvg>
      <g {...TOOL_STROKE}>
        <line x1="6" y1="12" x2="18" y2="12" />
        <line x1="12" y1="6" x2="12" y2="18" />
      </g>
    </ToolSvg>
  )
}
