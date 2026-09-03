/**
 * Vitals telemetry sources (federated batch 2) — the guarded browser reads,
 * in their own module so the surface file stays component-only (the fleet's
 * file discipline). Every outside world the panel touches sits behind
 * {@link TelemetrySources}: the default implementation NEVER throws and
 * honestly reports absence (null / false) where the platform exposes no
 * seam — the surface turns those into NOT TELEMETRIED plates. Unit tests
 * substitute fakes to prove those paths without faking the platform.
 */

import { readBootTimeline, type BootMilestone } from '../../lib/perf'
import { estimateStorage } from '../../lib/storage'
import { readHeap, type HeapSnapshot } from './vitals-model'

export interface ArchiveEstimate {
  readonly usage: number
  readonly quota: number
}

/**
 * Every outside world this panel reads, behind one defensible interface.
 */
export interface TelemetrySources {
  /** performance.now() — the timeline's clock. */
  readonly now: () => number
  /** Date.now() — the epoch fallback's clock. */
  readonly epochNow: () => number
  /** performance.timeOrigin, or null when absent. */
  readonly timeOrigin: () => number | null
  /** JS heap counters, or null where the browser exposes none. */
  readonly heap: () => HeapSnapshot | null
  /** The raw boot timeline (the lib/perf seam's defensive copy). */
  readonly bootTimeline: () => readonly BootMilestone[]
  /** Long-task observation; false when the observer type is unsupported. */
  readonly supportsLongTasks: () => boolean
  /** Start observing; returns the disconnect. Only called when supported. */
  readonly observeLongTasks: (sink: (event: { t: number; dur: number }) => void) => () => void
  /** navigator.storage.estimate() (the storage lib's seam), or null. */
  readonly estimate: () => Promise<ArchiveEstimate | null>
}

const perf = globalThis.performance

export const defaultTelemetry: TelemetrySources = {
  now: () => perf.now(),
  epochNow: () => Date.now(),
  timeOrigin: () =>
    typeof perf.timeOrigin === 'number' && Number.isFinite(perf.timeOrigin)
      ? perf.timeOrigin
      : null,
  heap: () => readHeap((perf as { memory?: unknown }).memory),
  bootTimeline: () => {
    try {
      return readBootTimeline()
    } catch {
      return []
    }
  },
  supportsLongTasks: () => {
    try {
      const PO = globalThis.PerformanceObserver as
        | { supportedEntryTypes?: readonly string[] }
        | undefined
      return Boolean(PO?.supportedEntryTypes?.includes('longtask'))
    } catch {
      return false
    }
  },
  observeLongTasks: (sink) => {
    const PO = globalThis.PerformanceObserver as
      | (new (
          cb: (list: { getEntries(): Array<{ startTime: number; duration: number }> }) => void,
        ) => {
          observe: (opts: { entryTypes: string[]; buffered?: boolean }) => void
          disconnect: () => void
        })
      | undefined
    if (!PO) return () => undefined
    const observer = new PO((list) => {
      for (const entry of list.getEntries()) {
        sink({ t: entry.startTime, dur: entry.duration })
      }
    })
    try {
      observer.observe({ entryTypes: ['longtask'], buffered: true })
    } catch {
      return () => undefined
    }
    return () => observer.disconnect()
  },
  estimate: () => estimateStorage(),
}
