/**
 * Vitals charts (federated batch 2) — the engraved plates' SVG drawing
 * layer. PURE RENDER over the model's deterministic geometry: every pixel
 * seat comes from vitals-model (decimate/axisTicks/plotPoint), so the charts
 * have no logic of their own to test — the model tests ARE the chart tests.
 *
 * World law (DESIGN.md): a chart is a readout, so it lives inside a recessed
 * phosphor well — the trace, envelope, markers, and axis ink are ALL the
 * amber monochrome family (brightness distinguishes signal, never hue);
 * axis digits ride B612 Mono (the Measuring Law); every color comes from a
 * token via CSS classes in vitals.css (zero raw hex, zero hex in SVG
 * attributes); updates STEP — geometry swaps at sample time, nothing sweeps.
 */

import { axisTicks, plotPoint, type BootMark, type Bucket } from './vitals-model'

/* ------------------------------------------------------------------ */
/* The trace chart — rolling values over a ruled axis                  */
/* ------------------------------------------------------------------ */

export interface TraceEvent {
  /** Host-clock timestamp of the marked event (a long task's start). */
  readonly t: number
}

export interface TraceChartProps {
  readonly buckets: readonly Bucket[]
  /** Axis ceiling (the model's niceCeil output). */
  readonly top: number
  /** Axis unit label in the chart's accessible name (e.g. "FPS"). */
  readonly unit: string
  /** Marked events drawn as vertical ticks inside the plot. */
  readonly events?: readonly TraceEvent[]
  /** The newest host-clock timestamp the window has seen (axis "now"). */
  readonly now: number
  /** viewBox size — 360 keeps text ~1:1 at the default geometry's plate width. */
  readonly viewBoxWidth?: number
  readonly viewBoxHeight?: number
}

/** Chart plot geometry shared by the x/y mapping (viewBox units). */
const PLOT = { left: 34, right: 8, top: 8, bottom: 14 } as const

export function TraceChart({
  buckets,
  top,
  unit,
  events = [],
  now,
  viewBoxWidth = 360,
  viewBoxHeight = 130,
}: TraceChartProps) {
  const plot = {
    x: PLOT.left,
    y: PLOT.top,
    w: Math.max(1, viewBoxWidth - PLOT.left - PLOT.right),
    h: Math.max(1, viewBoxHeight - PLOT.top - PLOT.bottom),
  }
  const baseline = plot.y + plot.h

  const ticks = axisTicks(top, plot, 4)

  if (buckets.length === 0) {
    return (
      <svg
        className="vitals-trace"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label={`${unit} trace: awaiting first sample`}
      >
        <line
          className="vitals-trace-axis"
          x1={plot.x}
          y1={baseline}
          x2={plot.x + plot.w}
          y2={baseline}
        />
        <text className="vitals-trace-await" x={viewBoxWidth / 2} y={plot.y + plot.h / 2}>
          AWAITING FIRST SAMPLE
        </text>
      </svg>
    )
  }

  // x mapping over the OBSERVED window (first bucket → last bucket's seat
  // at the right edge; a lone sample rides the right edge, not the left —
  // the trace enters from the right like a chart recorder).
  const tFirst = buckets[0]!.t
  const tLast = buckets[buckets.length - 1]!.t
  const span = Math.max(tLast - tFirst, 1)
  const xOf = (t: number): number => plot.x + ((t - tFirst) / span) * plot.w

  const envelope = buckets.map((b, i) => {
    const x = Math.min(plot.x + plot.w, Math.max(plot.x, xOf(b.t)))
    const yMin = plotPoint(b.min, top, plot)
    const yMax = plotPoint(b.max, top, plot)
    return { key: i, x, yMin: Math.min(yMin, yMax), yMax: Math.max(yMin, yMax) }
  })

  const trace = buckets
    .map((b, i) => {
      const x = Math.min(plot.x + plot.w, Math.max(plot.x, xOf(b.t)))
      const y = plotPoint(b.last, top, plot)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  const marks = events
    .filter((e) => e.t >= tFirst && e.t <= tLast)
    .map((e, i) => ({ key: i, x: xOf(e.t) }))

  return (
    <svg
      className="vitals-trace"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      role="img"
      aria-label={`${unit} trace over the rolling window`}
    >
      {/* ruled value axis — grid lines + B612 labels (the model's seats) */}
      {ticks.map((tick) => (
        <g key={tick.v}>
          <line
            className="vitals-trace-grid"
            x1={plot.x}
            y1={tick.y}
            x2={plot.x + plot.w}
            y2={tick.y}
          />
          <text className="vitals-trace-tick" x={plot.x - 4} y={tick.y + 3} textAnchor="end">
            {tick.label}
          </text>
        </g>
      ))}

      {/* the honest envelope — every bucket's min..max, peaks preserved */}
      {envelope.map((b) => (
        <line
          key={b.key}
          className="vitals-trace-envelope"
          x1={b.x}
          y1={b.yMin}
          x2={b.x}
          y2={b.yMax}
        />
      ))}

      {/* marked events — long tasks flagging the trace */}
      {marks.map((m) => (
        <line
          key={m.key}
          className="vitals-trace-event"
          x1={m.x}
          y1={plot.y}
          x2={m.x}
          y2={baseline}
        />
      ))}

      {/* the signal itself */}
      <path className="vitals-trace-line" d={trace} />

      {/* the window's age edges — how far back the roll reaches */}
      <text className="vitals-trace-tick" x={plot.x} y={viewBoxHeight - 3}>
        −{secondsAgo(now, tLast)}
      </text>
      <text
        className="vitals-trace-tick"
        x={plot.x + plot.w}
        y={viewBoxHeight - 3}
        textAnchor="end"
      >
        −{secondsAgo(now, tFirst)}
      </text>
    </svg>
  )
}

/** Whole seconds of window age, floor 0 — the x edges' labels. */
function secondsAgo(now: number, t: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000))
  return `${s}S`
}

/* ------------------------------------------------------------------ */
/* The boot ladder — the timeline replay, one ruled row per mark       */
/* ------------------------------------------------------------------ */

export interface BootLadderProps {
  readonly marks: readonly BootMark[]
  /** Index of the newest mark lit by a running replay (null = at rest). */
  readonly litUpTo?: number | null
  readonly viewBoxWidth?: number
}

const LADDER_ROW = 18
const LADDER_PAD = 6
const LADDER_LABEL_W = 108
const LADDER_T0_W = 48

export function BootLadder({
  marks,
  litUpTo = null,
  viewBoxWidth = 360,
}: BootLadderProps) {
  const height = marks.length * LADDER_ROW + LADDER_PAD * 2
  const total = Math.max(1, ...marks.map((m) => m.at))
  const barX = LADDER_LABEL_W + LADDER_T0_W
  const barW = Math.max(1, viewBoxWidth - barX - 8)

  return (
    <svg
      className="vitals-ladder"
      viewBox={`0 0 ${viewBoxWidth} ${height}`}
      role="img"
      aria-label="boot milestone ladder"
    >
      {marks.map((mark, i) => {
        const y = LADDER_PAD + i * LADDER_ROW + LADDER_ROW / 2
        const lit = litUpTo !== null && i <= litUpTo
        const current = litUpTo === i
        const w = (mark.at / total) * barW
        return (
          <g key={`${mark.order}-${mark.name}`}>
            <text className="vitals-ladder-t0" x={0} y={y + 3}>
              +{mark.at >= 1000 ? `${(mark.at / 1000).toFixed(2)}S` : `${Math.round(mark.at)}MS`}
            </text>
            <text className={current ? 'vitals-ladder-name vitals-ladder-name--now' : 'vitals-ladder-name'} x={LADDER_T0_W} y={y + 3}>
              {mark.name.toUpperCase()}
            </text>
            <line
              className={lit ? 'vitals-ladder-rule vitals-ladder-rule--lit' : 'vitals-ladder-rule'}
              x1={barX}
              y1={y}
              x2={barX + barW}
              y2={y}
            />
            <line
              className={current ? 'vitals-ladder-bar vitals-ladder-bar--now' : 'vitals-ladder-bar'}
              x1={barX}
              y1={y}
              x2={barX + Math.max(2, w)}
              y2={y}
            />
          </g>
        )
      })}
    </svg>
  )
}
