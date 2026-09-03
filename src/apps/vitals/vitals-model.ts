/**
 * Vitals model (federated batch 2) — the pure, DOM-free math under the
 * console's self-monitoring panel. Everything here is deterministic and
 * unit-tested: the rolling ring buffer, chart decimation, the fps/heap/
 * storage/boot-timeline shapers, the persisted-rate reader, and the
 * SAMPLING CONTROLLER whose hidden-pause is this module's acceptance case.
 *
 * Honesty law (the app's whole point): no fabricated numbers. Every shaper
 * either returns a true value derived from its input or `null` — null is the
 * surface's cue to cut the "NOT TELEMETRIED" plate. Hostile inputs (NaN,
 * negatives, wrong shapes crossing the persistence boundary) never throw
 * past this module.
 *
 * Import discipline (docs/APP-CONTRACT.md — notepad/ is the reference): no
 * store access, no DOM, no timers created here; the controller RECEIVES its
 * clock/schedule/visibility through {@link SamplerHost} so tests drive time
 * themselves.
 */

/* ------------------------------------------------------------------ */
/* The rolling sample log — a fixed-capacity ring buffer               */
/* ------------------------------------------------------------------ */

/** One telemetry sample: when it was taken (host clock, ms) and its value. */
export interface Sample {
  readonly t: number
  readonly v: number
}

/**
 * A ring buffer of samples at fixed capacity: `push` beyond capacity drops
 * the OLDEST sample (the rolling window), `snapshot` reads chronological
 * order without copying the backing store twice. The chart reads this; the
 * window is the app's entire memory of the session (live session only —
 * nothing persists but the sample rate).
 */
export class RingLog {
  private readonly slots: Sample[]
  private start = 0
  private count = 0

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('RingLog capacity must be a positive integer')
    }
    this.slots = new Array<Sample>(capacity)
  }

  get length(): number {
    return this.count
  }

  /** Append a sample; returns the sample dropped by the wrap, if any. */
  push(sample: Sample): Sample | null {
    if (this.count < this.capacity) {
      this.slots[(this.start + this.count) % this.capacity] = sample
      this.count += 1
      return null
    }
    // full: the write lands ON the oldest slot — capture the evicted sample
    // BEFORE the overwrite, then advance the window past it
    const dropped = this.slots[this.start]!
    this.slots[this.start] = sample
    this.start = (this.start + 1) % this.capacity
    return dropped
  }

  /** Chronological copy (oldest first). Safe to mutate by the caller. */
  snapshot(): Sample[] {
    const out: Sample[] = []
    for (let i = 0; i < this.count; i += 1) {
      out.push(this.slots[(this.start + i) % this.capacity]!)
    }
    return out
  }
}

/* ------------------------------------------------------------------ */
/* Decimation — many samples, few pixels, peaks preserved              */
/* ------------------------------------------------------------------ */

/** One decimated chart bucket: the honest envelope of the samples it holds. */
export interface Bucket {
  /** Timestamp of the bucket's FIRST sample (the bucket's x seat). */
  readonly t: number
  readonly min: number
  readonly max: number
  readonly last: number
}

/**
 * Decimate `samples` (chronological) to AT MOST `maxBuckets` index buckets,
 * preserving each bucket's min AND max — a decimation that averaged away a
 * dropped frame or a long-task stall would lie on an instrument panel. With
 * `samples.length <= maxBuckets` every sample is its own bucket. Deterministic
 * (pure index math — the same input always yields the same output).
 */
export function decimate(samples: readonly Sample[], maxBuckets: number): Bucket[] {
  if (!Number.isFinite(maxBuckets) || maxBuckets <= 0 || samples.length === 0) return []
  const n = samples.length
  if (n <= maxBuckets) {
    return samples.map((s) => ({ t: s.t, min: s.v, max: s.v, last: s.v }))
  }
  const size = Math.ceil(n / maxBuckets)
  const buckets: Bucket[] = []
  for (let i = 0; i < n; i += size) {
    const slice = samples.slice(i, Math.min(i + size, n))
    let min = Infinity
    let max = -Infinity
    for (const s of slice) {
      if (s.v < min) min = s.v
      if (s.v > max) max = s.v
    }
    buckets.push({ t: slice[0]!.t, min, max, last: slice[slice.length - 1]!.v })
  }
  return buckets
}

/* ------------------------------------------------------------------ */
/* FPS — frames over their own elapsed time                            */
/* ------------------------------------------------------------------ */

/**
 * Honest fps from the rAF deltas (ms) collected since the last sample tick:
 * frames / (sum of deltas / 1000). Null when there is nothing to measure
 * (no frames, or a degenerate non-positive span) — never a fabricated 0.
 */
export function fpsOf(deltas: readonly number[]): number | null {
  if (deltas.length === 0) return null
  let span = 0
  for (const d of deltas) {
    if (!Number.isFinite(d) || d < 0) return null // a corrupt delta poisons the sample
    span += d
  }
  if (span <= 0) return null
  return Math.round((deltas.length / (span / 1000)) * 10) / 10
}

/* ------------------------------------------------------------------ */
/* JS heap — guarded read of a non-standard surface                    */
/* ------------------------------------------------------------------ */

/** The heap numbers the panel reads, when the browser exposes them. */
export interface HeapSnapshot {
  /** usedJSHeapSize, bytes */
  readonly used: number
  /** totalJSHeapSize, bytes */
  readonly total: number
  /** jsHeapSizeLimit, bytes */
  readonly limit: number
}

/**
 * Read `performance.memory`-shaped data defensively: every field must be a
 * finite, positive number in sane relation (used <= total <= limit), or the
 * answer is null — the "NOT TELEMETRIED" plate. Chrome-only API; Firefox and
 * Safari honestly render the plate instead.
 */
export function readHeap(memory: unknown): HeapSnapshot | null {
  if (typeof memory !== 'object' || memory === null) return null
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = memory as Record<string, unknown>
  const used = readFinitePositive(usedJSHeapSize)
  const total = readFinitePositive(totalJSHeapSize)
  const limit = readFinitePositive(jsHeapSizeLimit)
  if (used === null || total === null || limit === null) return null
  if (used > total || total > limit) return null
  return { used, total, limit }
}

function readFinitePositive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/* ------------------------------------------------------------------ */
/* Storage — bytes and quota share                                     */
/* ------------------------------------------------------------------ */

/** Format bytes as an honest B612-ready string (binary units, 1 dp under 100). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = value >= 100 || unit === 0 ? Math.round(value).toString() : value.toFixed(1)
  return `${text} ${units[unit]}`
}

/** Quota share in whole percent, null when quota is 0/unknown. */
export function quotaPercent(usage: number, quota: number): number | null {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0 || usage < 0) return null
  return Math.min(100, Math.round((usage / quota) * 100))
}

/** Storage estimates are async and slow-moving: refresh at most this often. */
export function storageDue(lastAt: number | null, now: number, everyMs: number): boolean {
  return lastAt === null || now - lastAt >= everyMs
}

/* ------------------------------------------------------------------ */
/* Uptime + boot timeline — the session's own record                   */
/* ------------------------------------------------------------------ */

/** One validated boot milestone: absolute t plus its ladder offset. */
export interface BootMark {
  readonly name: string
  /** performance.now() when the mark landed (the timeline's own clock). */
  readonly t: number
  /** ms after the FIRST valid mark (the ladder's zero). */
  readonly at: number
  /** arrival order in the timeline (stable sort key). */
  readonly order: number
}

/**
 * Shape the raw `window.__BOOT_TIMELINE` (read through lib/perf's defensive
 * seam) into the replay ladder: entries validated (string name, finite t >=
 * 0), listed in TIME order (recorded order breaks ties — the ladder is a
 * timeline, and the replay walks the same list), times made RELATIVE to the
 * EARLIEST valid mark (the session's true zero — a mis-ordered record never
 * yields a negative offset). Null when nothing valid survives — an honest
 * empty plate, never a fabricated boot. Never throws on hostile shapes.
 */
export function shapeBootTimeline(raw: readonly unknown[] | null | undefined): BootMark[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const marks: Array<{ name: string; t: number; order: number }> = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { name, t, order } = entry as Record<string, unknown>
    if (typeof name !== 'string' || name.length === 0) continue
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) continue
    marks.push({
      name,
      t,
      order: typeof order === 'number' && Number.isFinite(order) ? order : marks.length,
    })
  }
  if (marks.length === 0) return null
  marks.sort((a, b) => a.t - b.t || a.order - b.order)
  const t0 = marks[0]!.t
  return marks.map((m) => ({ ...m, at: m.t - t0 }))
}

/**
 * Session uptime from the boot timeline (both times performance.now-relative):
 * now minus the first mark's absolute t. Null when no marks exist.
 */
export function uptimeFromTimeline(
  nowPerf: number,
  timeline: readonly BootMark[] | null,
): number | null {
  if (timeline === null || timeline.length === 0) return null
  if (!Number.isFinite(nowPerf)) return null
  return Math.max(0, nowPerf - timeline[0]!.t)
}

/**
 * Session uptime fallback when no timeline was recorded: epoch now minus
 * `performance.timeOrigin`. Null when the origin is absent/degenerate.
 */
export function uptimeFromOrigin(epochNow: number, timeOrigin: number | null): number | null {
  if (timeOrigin === null || !Number.isFinite(timeOrigin) || timeOrigin <= 0) return null
  if (!Number.isFinite(epochNow)) return null
  return Math.max(0, epochNow - timeOrigin)
}

/** HH:MM:SS (with a Dd prefix past a day) — the uptime readout's format. */
export function formatUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const total = Math.floor(ms / 1000)
  const days = Math.floor(total / 86_400)
  const h = Math.floor((total % 86_400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => n.toString().padStart(2, '0')
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`
  return days > 0 ? `${days}d ${clock}` : clock
}

/* ------------------------------------------------------------------ */
/* Replay schedule — the boot ladder's honest re-run                   */
/* ------------------------------------------------------------------ */

/**
 * The replay plan: each mark lights at its TRUE relative offset from boot
 * start (a 1.4s boot replays in 1.4s — the panel never pretends the machine
 * booted faster than it did). Pure; the surface's timers walk this list.
 */
export function replaySchedule(marks: readonly BootMark[]): readonly BootMark[] {
  return [...marks].sort((a, b) => a.at - b.at || a.order - b.order)
}

/* ------------------------------------------------------------------ */
/* Chart axes — ruled, honest, deterministic                           */
/* ------------------------------------------------------------------ */

/** A ruled axis tick: the value, its pixel seat, and its B612 label. */
export interface AxisTick {
  readonly v: number
  readonly y: number
  readonly label: string
}

/**
 * Round `v` up to the next multiple of `unit` (>= unit): the axis ceiling.
 * The fps axis floors at 60 (the display's own refresh band) and the heap
 * axis floors at its unit so a flat trace never renders at full-scale-zero.
 */
export function niceCeil(v: number, unit: number): number {
  if (!Number.isFinite(v) || !Number.isFinite(unit) || unit <= 0) return unit
  return Math.max(unit, Math.ceil(v / unit) * unit)
}

/**
 * The value-axis layout for a chart plot box: `steps` evenly spaced ticks
 * from 0 (bottom edge) to `top` (upper edge), labels pre-formatted. Values
 * map linearly; pixels are exact (the SVG renders these verbatim).
 */
export function axisTicks(top: number, plot: { y: number; h: number }, steps: number): AxisTick[] {
  if (!Number.isFinite(top) || top <= 0 || plot.h <= 0 || steps <= 0) return []
  const ticks: AxisTick[] = []
  for (let i = 0; i <= steps; i += 1) {
    const v = (top / steps) * (steps - i)
    const y = plot.y + (plot.h / steps) * i
    const label = Number.isInteger(v) ? v.toString() : v.toFixed(1)
    ticks.push({ v, y, label })
  }
  return ticks
}

/** A trace point's pixel seat inside a plot box (linear, clamped to the box). */
export function plotPoint(
  v: number,
  top: number,
  plot: { y: number; h: number },
): number {
  if (top <= 0 || plot.h <= 0) return plot.y + plot.h
  const clamped = Math.min(Math.max(v, 0), top)
  return plot.y + plot.h - (clamped / top) * plot.h
}

/* ------------------------------------------------------------------ */
/* Persisted window state — the sample rate rides appState             */
/* ------------------------------------------------------------------ */

/** The engraved sample-rate selector's stops (ms between samples). */
export const SAMPLE_RATES = [250, 1000, 5000] as const

export type SampleRateMs = (typeof SAMPLE_RATES)[number]

export const DEFAULT_SAMPLE_RATE: SampleRateMs = 1000

export function isSampleRate(v: unknown): v is SampleRateMs {
  return typeof v === 'number' && (SAMPLE_RATES as readonly number[]).includes(v)
}

/**
 * Defensively read the vitals payload off an UNTRUSTED `appState` (it crossed
 * the persistence boundary). Null for absent/hostile payloads — the caller
 * falls back to the default rate. Never throws.
 */
export function readVitalsState(appState: unknown): SampleRateMs | null {
  if (typeof appState !== 'object' || appState === null) return null
  const rate = (appState as Record<string, unknown>)['rateMs']
  return isSampleRate(rate) ? rate : null
}

/* ------------------------------------------------------------------ */
/* The sampling controller — one seam, hidden-paused by construction   */
/* ------------------------------------------------------------------ */

/**
 * The host services the controller needs, INJECTED so tests drive time:
 * a clock, a cancellable scheduler, and the pause verdict (document.hidden).
 * The surface passes the real browser services; unit tests pass fakes.
 */
export interface SamplerHost {
  readonly now: () => number
  /** Schedule `fn` ~`ms` out; the return value cancels it. */
  readonly schedule: (fn: () => void, ms: number) => () => void
  /** False = sampling is suspended (the tab is hidden). */
  readonly canSample: () => boolean
}

export interface SamplingController {
  /** Begin the cadence (idempotent; a fresh start re-arms the timer). */
  start(): void
  /** Cancel the cadence (idempotent). */
  stop(): void
  readonly running: boolean
  /** How many onSample calls fired — test observation, not UI state. */
  readonly sampled: number
  /** How many ticks were SKIPPED while paused — the hidden-pause ledger. */
  readonly skippedWhilePaused: number
}

/**
 * The sample-tick loop. Every `intervalMs` the host's timer fires; the tick
 * calls `onSample` ONLY when `canSample()` is true — a hidden tab suspends
 * sampling by construction (the browser keeps no honest rAF deltas while
 * hidden anyway; fabricating them would violate the panel's one law). The
 * cadence itself keeps beating so a re-shown tab resumes within one tick.
 */
export function createSamplingController(
  host: SamplerHost,
  intervalMs: number,
  onSample: (now: number) => void,
): SamplingController {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('sampling interval must be positive')
  }
  let cancel: (() => void) | null = null
  let running = false
  let sampled = 0
  let skippedWhilePaused = 0

  const tick = (): void => {
    if (!running) return
    if (host.canSample()) {
      sampled += 1
      onSample(host.now())
    } else {
      skippedWhilePaused += 1
    }
    cancel = host.schedule(tick, intervalMs)
  }

  return {
    start() {
      if (running) return
      running = true
      cancel = host.schedule(tick, intervalMs)
    },
    stop() {
      running = false
      cancel?.()
      cancel = null
    },
    get running() {
      return running
    },
    get sampled() {
      return sampled
    },
    get skippedWhilePaused() {
      return skippedWhilePaused
    },
  }
}

/** The rolling window's fixed length (samples kept per trace). */
export const TRACE_CAPACITY = 180
