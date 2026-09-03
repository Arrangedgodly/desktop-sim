/**
 * Vitals surface (federated batch 2) — the self-monitoring panel. An
 * instrument grid of engraved plates over recessed phosphor wells: frame
 * rate, JS heap, long tasks, archive storage, console counts, and the boot
 * ladder — every one either a TRUE local reading or an honest "NOT
 * TELEMETRIED" plate, never a fabricated number (the app's whole point).
 *
 * Architecture:
 * - SAMPLING rides the model's {@link createSamplingController} with the
 *   real browser host (setTimeout cadence, `document.hidden` verdict) —
 *   hidden tabs suspend sampling by construction (the controller's tested
 *   law), and rAF frame-delta collection stops with the browser's own rAF.
 * - BUFFERS are fixed-capacity RingLogs in refs; each tick bumps ONE state
 *   counter, so the panel renders ONE stepped frame per sample — no sweeps,
 *   no tweened geometry (motion-minimal by design; reduced-motion changes
 *   nothing because there is nothing to collapse).
 * - TELEMETRY SOURCES are injectable (`telemetry` prop, default = the real
 *   guarded browser reads) so the honest-unavailable paths unit-test
 *   without faking the platform: pass a source with no heap and the plate
 *   honestly says NOT TELEMETRIED.
 * - The ONE authored moment is the BOOT REPLAY: the ladder's marks light in
 *   stepped succession at their TRUE relative durations — a 1.4s boot
 *   replays in 1.4s. Stepped by construction, so reduced-motion is
 *   identical, and it never starts blank (mark 0 lights immediately).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AppSurfaceProps } from '../../platform/app-registry'
import { useAppRegistryStore } from '../../platform/app-registry'
import { useWMStore } from '../../platform/stores'
import { BootLadder, TraceChart } from './VitalsCharts'
import { defaultTelemetry, type ArchiveEstimate, type TelemetrySources } from './vitals-telemetry'
import {
  DEFAULT_SAMPLE_RATE,
  RingLog,
  SAMPLE_RATES,
  TRACE_CAPACITY,
  createSamplingController,
  decimate,
  formatBytes,
  formatUptime,
  fpsOf,
  niceCeil,
  quotaPercent,
  readVitalsState,
  replaySchedule,
  shapeBootTimeline,
  storageDue,
  uptimeFromOrigin,
  uptimeFromTimeline,
  type BootMark,
  type SampleRateMs,
  type SamplerHost,
} from './vitals-model'
import './vitals.css'

/* ------------------------------------------------------------------ */
/* Tuning constants                                                    */
/* ------------------------------------------------------------------ */

const MIB = 1024 * 1024
/** Chart buckets across the rolling window (plot width / ~3px). */
const CHART_BUCKETS = 100
/** Recent long-task markers kept for the fps chart (bounded by construction). */
const MARKER_EVENTS = 120
/** Storage estimate refresh floor (the estimate is async + slow-moving). */
const STORAGE_REFRESH_MS = 5_000
/** Marker reach floor: even a short trace flags the last minute's tasks. */
const MARKER_WINDOW_MS = 60_000

/* ------------------------------------------------------------------ */
/* The surface                                                         */
/* ------------------------------------------------------------------ */

export default function VitalsSurface({
  windowId,
  telemetry = defaultTelemetry,
}: AppSurfaceProps & { telemetry?: TelemetrySources }) {
  /* -- the persisted sample rate (validated on read) ------------------- */
  const persistedRate = useWMStore((s) => readVitalsState(s.windows[windowId]?.appState))
  const [rateMs, setRateMs] = useState<SampleRateMs>(persistedRate ?? DEFAULT_SAMPLE_RATE)

  const chooseRate = useCallback(
    (next: SampleRateMs) => {
      setRateMs(next)
      useWMStore.getState().setWindowAppState(windowId, { rateMs: next })
    },
    [windowId],
  )

  /* -- live console counts (the platform's own registries) ------------- */
  const openWindows = useWMStore((s) => Object.keys(s.windows).length)
  const moduleCount = useAppRegistryStore((s) => s.order.length)

  /* -- telemetry buffers (refs — ONE stepped render per tick) ---------- */
  const fpsLog = useRef<RingLog | null>(null)
  const heapLog = useRef<RingLog | null>(null)
  if (fpsLog.current === null) fpsLog.current = new RingLog(TRACE_CAPACITY)
  if (heapLog.current === null) heapLog.current = new RingLog(TRACE_CAPACITY)

  const frameDeltas = useRef<number[]>([])
  const longTaskTotals = useRef({ count: 0, worst: 0 })
  const longTaskEvents = useRef<Array<{ t: number; dur: number }>>([])
  const storageAt = useRef<number | null>(null)
  /** undefined = estimate in flight · null = probed, unavailable · object = live. */
  const [storage, setStorage] = useState<ArchiveEstimate | null | undefined>(undefined)
  const [lastTick, setLastTick] = useState<number | null>(null)

  /* -- availability probes (per mount; these seams do not appear later) - */
  const [heapAvailable] = useState(() => telemetry.heap() !== null)
  const [longTasksAvailable] = useState(() => telemetry.supportsLongTasks())

  const bootMarks = useMemo<BootMark[] | null>(
    () => shapeBootTimeline(telemetry.bootTimeline() as readonly unknown[]),
    [telemetry],
  )

  /* -- the storage estimate: once on mount, then throttled per tick ----- */
  const runEstimate = useCallback(
    (t: number) => {
      storageAt.current = t
      telemetry
        .estimate()
        .then((estimate) => setStorage(estimate ?? null))
        .catch(() => setStorage(null))
    },
    [telemetry],
  )

  useEffect(() => {
    runEstimate(telemetry.now())
  }, [runEstimate, telemetry])

  /* -- long-task observation (guarded; disconnects on unmount) --------- */
  useEffect(() => {
    if (!longTasksAvailable) return
    const disconnect = telemetry.observeLongTasks((event) => {
      longTaskTotals.current.count += 1
      if (event.dur > longTaskTotals.current.worst) longTaskTotals.current.worst = event.dur
      const events = longTaskEvents.current
      events.push(event)
      if (events.length > MARKER_EVENTS) events.splice(0, events.length - MARKER_EVENTS)
    })
    return disconnect
  }, [telemetry, longTasksAvailable])

  /* -- the frame-interval probe: rAF deltas into the ref --------------- */
  useEffect(() => {
    const raf = globalThis.requestAnimationFrame?.bind(globalThis)
    const cancel = globalThis.cancelAnimationFrame?.bind(globalThis)
    if (!raf || !cancel) return // no frames to measure — the trace waits, honestly
    const deltas = frameDeltas.current
    let last = 0
    let rafId = 0
    const measure = (now: number): void => {
      if (document.hidden) {
        // a hidden tab's first frame back would carry the whole gap as a
        // "delta" — drop the seam instead of reporting a fabricated stall
        last = 0
      } else {
        if (last > 0) deltas.push(now - last)
        last = now
      }
      rafId = raf(measure)
    }
    rafId = raf(measure)
    return () => cancel(rafId)
  }, [])

  /* -- the sample cadence: the controller's hidden-pause is the law ---- */
  useEffect(() => {
    const host: SamplerHost = {
      now: telemetry.now,
      schedule: (fn, ms) => {
        const id = window.setTimeout(fn, ms)
        return () => window.clearTimeout(id)
      },
      canSample: () => !document.hidden,
    }

    const onSample = (t: number): void => {
      const deltas = frameDeltas.current
      const fps = fpsOf(deltas)
      deltas.length = 0
      if (fps !== null) fpsLog.current!.push({ t, v: fps })
      if (heapAvailable) {
        const heap = telemetry.heap()
        if (heap !== null) heapLog.current!.push({ t, v: heap.used / MIB })
      }
      if (storageDue(storageAt.current, t, STORAGE_REFRESH_MS)) runEstimate(t)
      setLastTick(t)
    }

    const controller = createSamplingController(host, rateMs, onSample)
    controller.start()
    return () => controller.stop()
  }, [rateMs, telemetry, heapAvailable, runEstimate])

  /* -- the boot replay: the module's one authored moment --------------- */
  const [replayIdx, setReplayIdx] = useState<number | null>(null)
  const replayTimers = useRef<number[]>([])

  const clearReplayTimers = useCallback(() => {
    for (const id of replayTimers.current) window.clearTimeout(id)
    replayTimers.current = []
  }, [])

  useEffect(() => clearReplayTimers, [clearReplayTimers])

  const startReplay = useCallback(() => {
    if (bootMarks === null || bootMarks.length === 0) return
    clearReplayTimers()
    const schedule = replaySchedule(bootMarks)
    setReplayIdx(0)
    let acc = 0
    for (let i = 1; i < schedule.length; i += 1) {
      // TRUE relative durations, floored at one frame so back-to-back marks
      // still register on the eye — a 1.4s boot replays in ~1.4s.
      acc += Math.max(60, schedule[i]!.at - schedule[i - 1]!.at)
      const idx = i
      replayTimers.current.push(window.setTimeout(() => setReplayIdx(idx), acc))
    }
    replayTimers.current.push(window.setTimeout(() => setReplayIdx(null), acc + 900))
  }, [bootMarks, clearReplayTimers])

  /* -- derived chart state (computed on the stepped render) ------------ */
  const now = lastTick ?? telemetry.now()
  const fpsSamples = fpsLog.current!.snapshot()
  const heapSamples = heapLog.current!.snapshot()
  const fpsBuckets = decimate(fpsSamples, CHART_BUCKETS)
  const heapBuckets = decimate(heapSamples, CHART_BUCKETS)
  const fpsTop = niceCeil(maxOf(fpsSamples), 60)
  const heapTop = niceCeil(maxOf(heapSamples), 16)
  const currentFps = fpsSamples.length > 0 ? fpsSamples[fpsSamples.length - 1]!.v : null
  const currentHeap =
    heapSamples.length > 0 ? heapSamples[heapSamples.length - 1]!.v * MIB : telemetry.heap()?.used
  const markerReach = Math.max(MARKER_WINDOW_MS, now - (fpsSamples[0]?.t ?? now))
  const markers = longTaskEvents.current.filter((e) => e.t >= now - markerReach)

  const uptime =
    uptimeFromTimeline(telemetry.now(), bootMarks) ??
    uptimeFromOrigin(telemetry.epochNow(), telemetry.timeOrigin())
  const quota = storage ? quotaPercent(storage.usage, storage.quota) : null

  return (
    <div className="vitals" data-vitals-root data-vitals-rate={rateMs}>
      <header className="vitals-toolbar">
        <div
          className="vitals-rates"
          role="radiogroup"
          aria-label="Sample rate"
          onKeyDown={(event) => onRateKeyDown(event, rateMs, chooseRate)}
        >
          <span className="vitals-rates-label engraved">SAMPLE RATE</span>
          {SAMPLE_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              role="radio"
              className="vitals-rate"
              data-vitals-rate-option={rate}
              aria-checked={rateMs === rate}
              onClick={() => chooseRate(rate)}
            >
              {rateLabel(rate)}
            </button>
          ))}
        </div>
        <span className="vitals-toolbar-note">LOCAL READINGS ONLY · NOTHING LEAVES THE HOLD</span>
      </header>

      <div className="vitals-grid">
        {/* -- FRAME RATE ------------------------------------------------ */}
        <section className="vitals-plate" data-vitals-plate="fps" aria-label="Frame rate">
          <header className="vitals-plate-head">
            <h2 className="vitals-plate-title engraved">FRAME RATE</h2>
            <span className="vitals-readout well" data-vitals-fps-readout>
              {currentFps === null ? '—' : currentFps.toFixed(1)}
            </span>
          </header>
          <div className="vitals-plate-well well" data-vitals-fps-chart>
            <TraceChart buckets={fpsBuckets} top={fpsTop} unit="FPS" events={markers} now={now} />
            <div className="scanlines" />
          </div>
          <p className="vitals-plate-note">FRAME INTERVALS · MEASURED AT R-A-F</p>
        </section>

        {/* -- JS HEAP --------------------------------------------------- */}
        {heapAvailable ? (
          <section className="vitals-plate" data-vitals-plate="heap" aria-label="JS heap">
            <header className="vitals-plate-head">
              <h2 className="vitals-plate-title engraved">JS HEAP</h2>
              <span className="vitals-readout well" data-vitals-heap-readout>
                {currentHeap === null || currentHeap === undefined ? '—' : formatBytes(currentHeap)}
              </span>
            </header>
            <div className="vitals-plate-well well" data-vitals-heap-chart>
              <TraceChart buckets={heapBuckets} top={heapTop} unit="MIB" now={now} />
              <div className="scanlines" />
            </div>
            <p className="vitals-plate-note">USED JS HEAP · AS THE BROWSER REPORTS IT</p>
          </section>
        ) : (
          <NotTelemetriedPlate
            plate="heap"
            title="JS HEAP"
            note="THE BROWSER EXPOSES NO JS HEAP COUNTER"
          />
        )}

        {/* -- LONG TASKS ------------------------------------------------ */}
        {longTasksAvailable ? (
          <section className="vitals-plate" data-vitals-plate="longtasks" aria-label="Long tasks">
            <header className="vitals-plate-head">
              <h2 className="vitals-plate-title engraved">LONG TASKS</h2>
              <span className="vitals-readout well" data-vitals-longtasks-count>
                {longTaskTotals.current.count}
              </span>
            </header>
            <div className="vitals-plate-well well" data-vitals-longtasks-well>
              <dl className="vitals-facts">
                <div className="vitals-fact">
                  <dt>THIS SESSION</dt>
                  <dd>{longTaskTotals.current.count} TASKS OVER 50MS</dd>
                </div>
                <div className="vitals-fact">
                  <dt>WORST</dt>
                  <dd data-vitals-longtasks-worst>
                    {formatDuration(longTaskTotals.current.worst)}
                  </dd>
                </div>
                <div className="vitals-fact">
                  <dt>MARKED</dt>
                  <dd>BRIGHT TICKS ON THE FRAME TRACE</dd>
                </div>
              </dl>
              <div className="scanlines" />
            </div>
            <p className="vitals-plate-note">PER PERFORMANCE OBSERVER · LONGTASK</p>
          </section>
        ) : (
          <NotTelemetriedPlate
            plate="longtasks"
            title="LONG TASKS"
            note="THE PERFORMANCE OBSERVER LACKS THE LONGTASK ENTRY"
          />
        )}

        {/* -- ARCHIVE STORAGE ------------------------------------------- */}
        {storage === undefined ? (
          <section
            className="vitals-plate"
            data-vitals-plate="storage"
            data-vitals-storage-pending
            aria-label="Archive storage"
          >
            <PlateHead title="ARCHIVE STORAGE" />
            <div className="vitals-plate-well well">
              <p className="vitals-await">ESTIMATING…</p>
              <div className="scanlines" />
            </div>
            <p className="vitals-plate-note">NAVIGATOR STORAGE ESTIMATE · BEST EFFORT</p>
          </section>
        ) : storage === null ? (
          <NotTelemetriedPlate
            plate="storage"
            title="ARCHIVE STORAGE"
            note="THE STORAGE ESTIMATE IS NOT AVAILABLE HERE"
          />
        ) : (
          <section className="vitals-plate" data-vitals-plate="storage" aria-label="Archive storage">
            <header className="vitals-plate-head">
              <h2 className="vitals-plate-title engraved">ARCHIVE STORAGE</h2>
              <span className="vitals-readout well" data-vitals-storage-readout>
                {quota === null ? '—' : `${quota}%`}
              </span>
            </header>
            <div className="vitals-plate-well well" data-vitals-storage-well>
              <dl className="vitals-facts">
                <div className="vitals-fact">
                  <dt>USAGE</dt>
                  <dd data-vitals-storage-usage>{formatBytes(storage.usage)}</dd>
                </div>
                <div className="vitals-fact">
                  <dt>QUOTA</dt>
                  <dd>{formatBytes(storage.quota)}</dd>
                </div>
              </dl>
              <div
                className="vitals-storage-bar"
                role="meter"
                aria-valuenow={quota ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Archive quota share"
              >
                <span className="vitals-storage-fill" style={{ width: `${quota ?? 0}%` }} />
              </div>
              <div className="scanlines" />
            </div>
            <p className="vitals-plate-note">NAVIGATOR STORAGE ESTIMATE · BEST EFFORT</p>
          </section>
        )}

        {/* -- CONSOLE --------------------------------------------------- */}
        <section className="vitals-plate" data-vitals-plate="console" aria-label="Console">
          <header className="vitals-plate-head">
            <h2 className="vitals-plate-title engraved">CONSOLE</h2>
            <span className="vitals-readout well" data-vitals-uptime>
              {uptime === null ? '—' : formatUptime(uptime)}
            </span>
          </header>
          <div className="vitals-plate-well well" data-vitals-console-well>
            <dl className="vitals-facts">
              <div className="vitals-fact">
                <dt>OPEN WINDOWS</dt>
                <dd data-vitals-windows>{openWindows}</dd>
              </div>
              <div className="vitals-fact">
                <dt>REGISTERED MODULES</dt>
                <dd data-vitals-modules>{moduleCount}</dd>
              </div>
              <div className="vitals-fact">
                <dt>SESSION UPTIME</dt>
                <dd>{uptime === null ? 'NOT TELEMETRIED' : formatUptime(uptime)}</dd>
              </div>
            </dl>
            <div className="scanlines" />
          </div>
          <p className="vitals-plate-note">LIVE COUNTS · WINDOW + MODULE REGISTRIES</p>
        </section>

        {/* -- BOOT SEQUENCE --------------------------------------------- */}
        {bootMarks !== null ? (
          <section className="vitals-plate" data-vitals-plate="boot" aria-label="Boot sequence">
            <header className="vitals-plate-head">
              <h2 className="vitals-plate-title engraved">BOOT SEQUENCE</h2>
              <button type="button" className="vitals-replay" data-vitals-replay onClick={startReplay}>
                REPLAY
              </button>
            </header>
            <div className="vitals-plate-well well" data-vitals-boot-well>
              <BootLadder marks={bootMarks} litUpTo={replayIdx} />
              <div className="scanlines" />
            </div>
            <p className="vitals-plate-note">THE SESSION'S OWN MILESTONES · TRUE DURATIONS</p>
          </section>
        ) : (
          <NotTelemetriedPlate
            plate="boot"
            title="BOOT SEQUENCE"
            note="NO BOOT TIMELINE WAS RECORDED THIS SESSION"
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Small local helpers                                                  */
/* ------------------------------------------------------------------ */

/** Max sample value, 0 for an empty log (axis ceilings stay honest). */
function maxOf(samples: readonly { v: number }[]): number {
  let max = 0
  for (const s of samples) if (s.v > max) max = s.v
  return max
}

/** Radio labels: digits ride the mono face (the Measuring Law). */
function rateLabel(rate: SampleRateMs): string {
  return rate >= 1000 ? `${rate / 1000}S` : `${rate}MS`
}

/** Arrows walk the radiogroup — selection AND focus move together. */
function onRateKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  current: SampleRateMs,
  choose: (rate: SampleRateMs) => void,
): void {
  const step: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    ArrowLeft: -1,
  }
  const count = SAMPLE_RATES.length
  const at = Math.max(0, SAMPLE_RATES.indexOf(current))
  let target: number
  if (event.key in step) {
    target = (at + step[event.key]! + count) % count
  } else if (event.key === 'Home') {
    target = 0
  } else if (event.key === 'End') {
    target = count - 1
  } else {
    return
  }
  event.preventDefault()
  const rate = SAMPLE_RATES[target]!
  choose(rate)
  document.querySelector<HTMLButtonElement>(`[data-vitals-rate-option="${rate}"]`)?.focus()
}

/** Milliseconds as an honest duration readout (B612-ready). */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}MS`
  return `${(ms / 1000).toFixed(2)}S`
}

/** A plate header without a readout (the pending storage plate's). */
function PlateHead({ title }: { title: string }) {
  return (
    <header className="vitals-plate-head">
      <h2 className="vitals-plate-title engraved">{title}</h2>
      <span className="vitals-readout well">—</span>
    </header>
  )
}

/** The honest unavailable plate: dashed brass frame, engraved refusal. */
function NotTelemetriedPlate({
  plate,
  title,
  note,
}: {
  plate: string
  title: string
  note: string
}) {
  return (
    <section
      className="vitals-plate vitals-plate--na"
      data-vitals-plate={plate}
      data-vitals-na={plate}
      aria-label={title}
    >
      <header className="vitals-plate-head">
        <h2 className="vitals-plate-title engraved">{title}</h2>
      </header>
      <div className="vitals-na">
        <p className="vitals-na-title engraved">NOT TELEMETRIED</p>
        <p className="vitals-na-note">{note}</p>
      </div>
    </section>
  )
}
