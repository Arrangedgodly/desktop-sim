/**
 * Viewer model (AP-3) — the pure, React-free math behind the plate viewer:
 * launch-context → bound plate id, the live image-specimen lookup, and the
 * FIT/1:1/ZOOM state machine with its pan discipline. Everything testable
 * without a DOM lives here; the surface wires measurements into it.
 *
 * Import discipline (docs/APP-CONTRACT.md — explorer/ and notepad/ are the
 * reference implementations): TYPES ride the app-registry contract
 * (`FSNodeRef`, `AppLaunchContext`); the only structural assumption is the
 * catalog tree shape `{ rootId, nodes }` (the FS store's state satisfies it
 * by construction). No store access, no DOM, no timers in this module.
 *
 * The measuring law (surface + CSS must agree with it):
 * - The MAT is the parchment field inside the window; the PLATE (image +
 *   caption strip) is centered on it. FIT therefore scales the image into
 *   the stage box MINUS the mat padding and the caption band — constants
 *   below are the single source of truth the CSS mirrors.
 * - ZOOM is explicit: `pct` of the image's natural pixels (`1` = 1:1, the
 *   plan's "100%"); steps are 25%, clamped 25–400%.
 * - PAN rides a translate on the centered plate, clamped so the plate's
 *   edges never leave the stage (half the overflow on either side of the
 *   center) — only reachable while the plate overflows the stage.
 */

import type { AppLaunchContext, FSNodeRef } from '../../platform/app-registry'

/**
 * The catalog tree shape this module reads — structurally the FS domain state
 * (`FSTree`/`FSState`), typed through the contract's node so the app never
 * names a lib/fs type directly (explorer/notepad discipline, verbatim).
 */
export interface CatalogSheet {
  readonly rootId: string
  readonly nodes: Readonly<Record<string, FSNodeRef>>
}

/** An image plate through the contract's node union (src-carrying kind). */
export type ImagePlateRef = Extract<FSNodeRef, { kind: 'image' }>

/** A 2-D measurement in CSS pixels. */
export interface Size {
  readonly w: number
  readonly h: number
}

/** A translate offset in CSS pixels. */
export interface Pan {
  readonly x: number
  readonly y: number
}

/* --------------------------------------------------------------------------
 * View state (fit / explicit zoom) — the plan's "fit/100% toggle" plus steps
 * ------------------------------------------------------------------------ */

/** `fit` scales to the stage; `zoom` holds an explicit pct (1 = 1:1). */
export type ViewMode = 'fit' | 'zoom'

export interface ViewState {
  readonly mode: ViewMode
  /** Explicit zoom factor in zoom mode; 1 = 1:1 actual pixels. */
  readonly pct: number
}

/** The view every plate opens in (also the toolbar's Fit state). */
export const FIT_VIEW: ViewState = { mode: 'fit', pct: 1 }

/** Actual pixels — the toggle's other side and the +/− stepper's base. */
export const ACTUAL_VIEW: ViewState = { mode: 'zoom', pct: 1 }

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4
export const ZOOM_STEP = 0.25

/** The toolbar readout for a view: `FIT`, or the zoom as a whole percent. */
export function viewReadout(view: ViewState): string {
  return view.mode === 'fit' ? 'FIT' : `${Math.round(view.pct * 100)}%`
}

/** Clamp a zoom factor into [ZOOM_MIN, ZOOM_MAX] (guarding float dust). */
export function clampZoom(pct: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pct))
}

/**
 * The F key / toggle law: fit → ACTUAL PIXELS (100%); any zoom (100% or not)
 * → fit. One key, two stable ends — the plan's "fit/100% toggle".
 */
export function toggleFit(view: ViewState): ViewState {
  return view.mode === 'fit' ? ACTUAL_VIEW : FIT_VIEW
}

/**
 * One +/− step (25% increments, clamped 25–400%). From FIT the stepper
 * starts at 100% — the 1:1 reference — so `+` reads 125% and `−` reads 75%;
 * from a zoom it steps the current factor. Floating-point dust is rounded at
 * the step so readouts never show 124.999%.
 */
export function stepZoom(view: ViewState, steps: number): ViewState {
  const base = view.mode === 'fit' ? ACTUAL_VIEW.pct : view.pct
  const stepped = Math.round((base + steps * ZOOM_STEP) * 1000) / 1000
  return { mode: 'zoom', pct: clampZoom(stepped) }
}

/* --------------------------------------------------------------------------
 * Per-session view memory — explorer's discipline (deliberately NOT
 * persisted: zoom posture is the operator's stance at the desk, not archive
 * data; new viewer windows in THIS session inherit the last choice).
 * ------------------------------------------------------------------------ */

let latestView: ViewState = FIT_VIEW

/** The view a fresh plate window opens in (the session's last choice). */
export function sessionView(): ViewState {
  return latestView
}

/** Record a view switch; new plate windows in this session inherit it. */
export function setSessionView(view: ViewState): void {
  latestView = view
}

/* --------------------------------------------------------------------------
 * Plate resolution
 * ------------------------------------------------------------------------ */

/**
 * The node this window is bound to: the launch context's plate for a file
 * open; `null` for a launcher open (an empty stage — the viewer has no
 * untitled-draft flow; it only ever READS plates).
 */
export function plateId(launch: AppLaunchContext): string | null {
  return launch.source === 'file' ? launch.file.id : null
}

/**
 * The live image plate bound to this window, or null — the node is gone
 * (decommissioned elsewhere) or is not an image specimen (a routing bug).
 * The surface renders its PLATE REMOVED notice on the gone case.
 */
export function imageSpecimen(sheet: CatalogSheet, id: string | null): ImagePlateRef | null {
  if (id === null) return null
  const node = sheet.nodes[id]
  return node && node.kind === 'image' ? node : null
}

/* --------------------------------------------------------------------------
 * Scale math (fit + zoom share one rendering path)
 * ------------------------------------------------------------------------ */

/** Mat padding (one side, CSS px) reserved around the plate. CSS mirrors it. */
export const MAT_PADDING = 18

/** Caption band height (CSS px) reserved beneath the image. CSS mirrors it. */
export const CAPTION_HEIGHT = 46

/**
 * The box the IMAGE may occupy: the stage minus the mat padding (both axes)
 * and the caption band (vertical). Non-positive axes collapse to 0.
 */
export function imageBox(stage: Size): Size {
  return {
    w: Math.max(0, stage.w - MAT_PADDING * 2),
    h: Math.max(0, stage.h - MAT_PADDING * 2 - CAPTION_HEIGHT),
  }
}

/**
 * Contain-fit scale for an image in a box — min of the axis ratios, up or
 * DOWN (a small plate on a large mat enlarges honestly; "fit" means fits).
 * Degenerate inputs (any 0 dimension) read as 1 so pre-measure renders and
 * jsdom (0×0 rects) stay well-defined.
 */
export function fitScale(natural: Size, box: Size): number {
  if (natural.w <= 0 || natural.h <= 0 || box.w <= 0 || box.h <= 0) return 1
  return Math.min(box.w / natural.w, box.h / natural.h)
}

/** The scale the current view renders at, given the measured stage. */
export function effectiveScale(natural: Size, view: ViewState, stage: Size): number {
  return view.mode === 'fit' ? fitScale(natural, imageBox(stage)) : view.pct
}

/** Rendered size at a scale (whole CSS px — the style carries round numbers). */
export function displaySize(natural: Size, scale: number): Size {
  return { w: Math.round(natural.w * scale), h: Math.round(natural.h * scale) }
}

/** How far the plate spills past the image box on each axis (0 = within). */
export function overflowOf(display: Size, box: Size): Size {
  return { w: Math.max(0, display.w - box.w), h: Math.max(0, display.h - box.h) }
}

/** Panning is reachable ONLY while the plate overflows the box. */
export function pannable(display: Size, box: Size): boolean {
  const overflow = overflowOf(display, box)
  return overflow.w > 0 || overflow.h > 0
}

/**
 * Clamp a pan into the reachable band. The plate sits CENTERED on the mat;
 * a translate may reveal at most half the overflow on either side:
 * `x ∈ [−overflow.w/2, +overflow.w/2]` (same for y). Outside that the
 * plate's edge detaches from the mat — the archive does not float specimens.
 */
export function clampPan(pan: Pan, overflow: Size): Pan {
  const x = overflow.w > 0 ? Math.min(overflow.w / 2, Math.max(-overflow.w / 2, pan.x)) : 0
  const y = overflow.h > 0 ? Math.min(overflow.h / 2, Math.max(-overflow.h / 2, pan.y)) : 0
  return { x: Math.round(x), y: Math.round(y) }
}

/* --------------------------------------------------------------------------
 * Label stamp (the caption's engraved timestamp)
 * ------------------------------------------------------------------------ */

/**
 * The label timestamp on the mat: mission-clock `YYYY-MM-DD HH:MM`, UTC —
 * the same clock the explorer's ledger stamps (explorer-model's algorithm,
 * mirrored here rather than imported across app boundaries; digits ride the
 * mono face at the use site per the typeface decision).
 */
export function formatLabelStamp(epochMs: number): string {
  const date = new Date(epochMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  )
}
