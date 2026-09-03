/**
 * Vitals model tests (federated batch 2) — the pure math floor, DOM-free:
 * the ring buffer's rolling window + overflow, decimation correctness
 * (peaks survive), honest fps, the guarded heap read, byte/quota/uptime
 * formats, the boot-timeline shaper against hostile shapes, the persisted
 * rate's defensive read, and the SAMPLING CONTROLLER's hidden-pause (this
 * batch's acceptance case 3).
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SAMPLE_RATE,
  RingLog,
  axisTicks,
  createSamplingController,
  decimate,
  formatBytes,
  formatUptime,
  fpsOf,
  niceCeil,
  plotPoint,
  quotaPercent,
  readHeap,
  readVitalsState,
  replaySchedule,
  shapeBootTimeline,
  storageDue,
  uptimeFromOrigin,
  uptimeFromTimeline,
  type Sample,
  type SamplerHost,
} from './vitals-model'

/* ------------------------------ RingLog ---------------------------------- */

describe('RingLog — the rolling window', () => {
  it('holds samples under capacity in push order', () => {
    const log = new RingLog(4)
    for (let i = 0; i < 3; i++) log.push({ t: i * 100, v: i })
    expect(log.length).toBe(3)
    expect(log.snapshot()).toEqual([
      { t: 0, v: 0 },
      { t: 100, v: 1 },
      { t: 200, v: 2 },
    ])
  })

  it('wraps at capacity: the OLDEST sample drops, order stays chronological', () => {
    const log = new RingLog(3)
    for (let i = 0; i < 6; i++) log.push({ t: i * 10, v: i })
    expect(log.length).toBe(3)
    expect(log.snapshot()).toEqual([
      { t: 30, v: 3 },
      { t: 40, v: 4 },
      { t: 50, v: 5 },
    ])
  })

  it('reports the dropped sample on overflow (the caller may log it)', () => {
    const log = new RingLog(2)
    expect(log.push({ t: 0, v: 1 })).toBeNull()
    expect(log.push({ t: 1, v: 2 })).toBeNull()
    expect(log.push({ t: 2, v: 3 })).toEqual({ t: 0, v: 1 })
  })

  it('wraps many times over (the memory stays O(capacity))', () => {
    const log = new RingLog(5)
    for (let i = 0; i < 1000; i++) log.push({ t: i, v: i })
    expect(log.length).toBe(5)
    expect(log.snapshot()[0]).toEqual({ t: 995, v: 995 })
    expect(log.snapshot()[4]).toEqual({ t: 999, v: 999 })
  })

  it('snapshots are copies — mutating one never touches the log', () => {
    const log = new RingLog(2)
    log.push({ t: 0, v: 1 })
    log.snapshot().pop()
    expect(log.length).toBe(1)
    expect(log.snapshot()).toEqual([{ t: 0, v: 1 }])
  })

  it('rejects degenerate capacities', () => {
    expect(() => new RingLog(0)).toThrow()
    expect(() => new RingLog(2.5)).toThrow()
    expect(() => new RingLog(-3)).toThrow()
  })
})

/* ------------------------------ decimate --------------------------------- */

describe('decimate — peaks survive the pixels', () => {
  it('empty in, empty out', () => {
    expect(decimate([], 10)).toEqual([])
  })

  it('fewer samples than buckets: every sample is its own bucket', () => {
    const samples: Sample[] = [
      { t: 0, v: 10 },
      { t: 5, v: 20 },
    ]
    expect(decimate(samples, 8)).toEqual([
      { t: 0, min: 10, max: 10, last: 10 },
      { t: 5, min: 20, max: 20, last: 20 },
    ])
  })

  it('decimates to at most maxBuckets, preserving every bucket min AND max', () => {
    // 10 samples, 3 buckets -> size ceil(10/3)=4 -> buckets [0..3][4..7][8..9]
    const samples: Sample[] = [
      { t: 0, v: 5 },
      { t: 1, v: 1 },
      { t: 2, v: 3 },
      { t: 3, v: 2 },
      { t: 4, v: 9 },
      { t: 5, v: 4 },
      { t: 6, v: 4 },
      { t: 7, v: 6 },
      { t: 8, v: 0 },
      { t: 9, v: 7 },
    ]
    expect(decimate(samples, 3)).toEqual([
      { t: 0, min: 1, max: 5, last: 2 }, // the dropped frame at v=1 SURVIVES as min
      { t: 4, min: 4, max: 9, last: 6 }, // the spike at v=9 SURVIVES as max
      { t: 8, min: 0, max: 7, last: 7 },
    ])
  })

  it('is deterministic — same input, same output, every time', () => {
    const samples: Sample[] = Array.from({ length: 500 }, (_, i) => ({
      t: i * 50,
      v: Math.sin(i / 7) * 50 + 50,
    }))
    const first = decimate(samples, 90)
    for (let run = 0; run < 3; run += 1) {
      expect(decimate(samples, 90)).toEqual(first)
    }
    expect(first.length).toBeLessThanOrEqual(90)
  })

  it('a single sample decimates to itself', () => {
    expect(decimate([{ t: 42, v: 3.5 }], 90)).toEqual([{ t: 42, min: 3.5, max: 3.5, last: 3.5 }])
  })

  it('refuses degenerate bucket counts', () => {
    expect(decimate([{ t: 0, v: 1 }], 0)).toEqual([])
    expect(decimate([{ t: 0, v: 1 }], -4)).toEqual([])
    expect(decimate([{ t: 0, v: 1 }], Number.NaN)).toEqual([])
  })
})

/* --------------------------------- fps ------------------------------------ */

describe('fpsOf — frames over their own elapsed time', () => {
  it('sixty 16.67ms frames read ~60fps', () => {
    const deltas = Array.from({ length: 60 }, () => 1000 / 60)
    expect(fpsOf(deltas)).toBeCloseTo(60, 0)
  })

  it('thirty 33.33ms frames read ~30fps', () => {
    expect(fpsOf(Array.from({ length: 30 }, () => 1000 / 30))).toBeCloseTo(30, 0)
  })

  it('no frames is null — never a fabricated 0', () => {
    expect(fpsOf([])).toBeNull()
  })

  it('a corrupt delta poisons the sample to null (honesty over salvage)', () => {
    expect(fpsOf([16, 16, Number.NaN])).toBeNull()
    expect(fpsOf([16, -4, 16])).toBeNull()
    expect(fpsOf([16, Number.POSITIVE_INFINITY])).toBeNull()
  })

  it('a zero-span window is null, not infinity', () => {
    expect(fpsOf([0, 0, 0])).toBeNull()
  })

  it('rounds to one decimal', () => {
    const fps = fpsOf([10, 11, 10, 12]) // 4 frames / 43ms
    expect(fps).toBe(93) // 4/(0.043) = 93.02 -> 93.0
  })
})

/* --------------------------------- heap ----------------------------------- */

describe('readHeap — the guarded non-standard surface', () => {
  const valid = { usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 100 }

  it('reads a well-formed performance.memory', () => {
    expect(readHeap(valid)).toEqual({ used: 10, total: 20, limit: 100 })
  })

  it('null when the API is absent (the NOT TELEMETRIED case)', () => {
    expect(readHeap(undefined)).toBeNull()
    expect(readHeap(null)).toBeNull()
    expect(readHeap(42)).toBeNull()
  })

  it('null on hostile shapes and degenerate numbers', () => {
    expect(readHeap({})).toBeNull()
    expect(readHeap({ usedJSHeapSize: 10 })).toBeNull()
    expect(readHeap({ ...valid, totalJSHeapSize: '20' })).toBeNull()
    expect(readHeap({ ...valid, jsHeapSizeLimit: Number.NaN })).toBeNull()
    expect(readHeap({ ...valid, usedJSHeapSize: -1 })).toBeNull()
    expect(readHeap({ ...valid, totalJSHeapSize: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('null on impossible relations', () => {
    expect(readHeap({ usedJSHeapSize: 30, totalJSHeapSize: 20, jsHeapSizeLimit: 100 })).toBeNull()
    expect(readHeap({ usedJSHeapSize: 10, totalJSHeapSize: 200, jsHeapSizeLimit: 100 })).toBeNull()
  })
})

/* ------------------------------- storage ---------------------------------- */

describe('formatBytes / quotaPercent / storageDue', () => {
  it('formats binary units honestly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KiB')
    expect(formatBytes(1536)).toBe('1.5 KiB')
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MiB')
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GiB')
  })

  it('refuses to format garbage', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('computes the quota share, clamped to 100', () => {
    expect(quotaPercent(1, 4)).toBe(25)
    expect(quotaPercent(3, 4)).toBe(75)
    expect(quotaPercent(9, 4)).toBe(100)
    expect(quotaPercent(0, 4)).toBe(0)
  })

  it('quota share null on degenerate inputs', () => {
    expect(quotaPercent(1, 0)).toBeNull()
    expect(quotaPercent(-1, 4)).toBeNull()
    expect(quotaPercent(Number.NaN, 4)).toBeNull()
  })

  it('the estimate refresh is due once, then only after its floor', () => {
    expect(storageDue(null, 1000, 5000)).toBe(true)
    expect(storageDue(1000, 4000, 5000)).toBe(false)
    expect(storageDue(1000, 5999, 5000)).toBe(false)
    expect(storageDue(1000, 6000, 5000)).toBe(true)
  })
})

/* --------------------------- uptime + boot -------------------------------- */

describe('shapeBootTimeline — the honest ladder', () => {
  it('shapes absolute marks into relative offsets, ordered by arrival', () => {
    const raw = [
      { name: 'boot-start', t: 100, order: 0 },
      { name: 'app-mounted', t: 480, order: 1 },
      { name: 'desktop-ready', t: 1320, order: 2 },
    ]
    expect(shapeBootTimeline(raw)).toEqual([
      { name: 'boot-start', t: 100, at: 0, order: 0 },
      { name: 'app-mounted', t: 480, at: 380, order: 1 },
      { name: 'desktop-ready', t: 1320, at: 1220, order: 2 },
    ])
  })

  it('lists marks in TIME order with the earliest mark as zero', () => {
    const raw = [
      { name: 'b', t: 300, order: 1 },
      { name: 'a', t: 100, order: 0 },
    ]
    const marks = shapeBootTimeline(raw)!
    expect(marks.map((m) => m.name)).toEqual(['a', 'b'])
    expect(marks[1]!.at).toBe(200)
  })

  it('a mis-ordered record never yields negative offsets', () => {
    const raw = [
      { name: 'late-recorded-first', t: 900, order: 0 },
      { name: 'early', t: 100, order: 1 },
    ]
    const marks = shapeBootTimeline(raw)!
    expect(marks.map((m) => m.name)).toEqual(['early', 'late-recorded-first'])
    expect(marks.map((m) => m.at)).toEqual([0, 800])
  })

  it('null for absent/empty timelines — never a fabricated boot', () => {
    expect(shapeBootTimeline(undefined)).toBeNull()
    expect(shapeBootTimeline(null)).toBeNull()
    expect(shapeBootTimeline([])).toBeNull()
    expect(shapeBootTimeline('nope' as unknown as never[])).toBeNull()
  })

  it('filters hostile entries and survives an all-hostile timeline', () => {
    const raw = [
      { name: 'ok', t: 50, order: 0 },
      null,
      42,
      { name: '', t: 10, order: 1 },
      { name: 'nan', t: Number.NaN, order: 2 },
      { name: 'neg', t: -5, order: 3 },
      { name: 'notype', order: 4 },
      { t: 30, order: 5 },
    ]
    expect(shapeBootTimeline(raw)).toEqual([{ name: 'ok', t: 50, at: 0, order: 0 }])
    expect(shapeBootTimeline([null, { bad: true }])).toBeNull()
  })

  it('missing order falls back to arrival index', () => {
    const raw = [
      { name: 'first', t: 0 },
      { name: 'second', t: 5 },
    ]
    expect(shapeBootTimeline(raw)!.map((m) => m.order)).toEqual([0, 1])
  })
})

describe('uptime', () => {
  const marks = shapeBootTimeline([
    { name: 'boot-start', t: 100, order: 0 },
    { name: 'desktop-ready', t: 1300, order: 1 },
  ])

  it('uptime from the timeline: now minus the first mark', () => {
    expect(uptimeFromTimeline(61_100, marks)).toBe(61_000)
    expect(uptimeFromTimeline(100, marks)).toBe(0)
  })

  it('clamps backwards clocks to zero', () => {
    expect(uptimeFromTimeline(50, marks)).toBe(0)
  })

  it('null without marks or with a corrupt now', () => {
    expect(uptimeFromTimeline(500, null)).toBeNull()
    expect(uptimeFromTimeline(Number.NaN, marks)).toBeNull()
    expect(uptimeFromTimeline(500, [])).toBeNull()
  })

  it('the epoch fallback: Date.now minus timeOrigin', () => {
    expect(uptimeFromOrigin(10_000, 1_000)).toBe(9_000)
    expect(uptimeFromOrigin(10_000, null)).toBeNull()
    expect(uptimeFromOrigin(10_000, 0)).toBeNull()
    expect(uptimeFromOrigin(10_000, Number.NaN)).toBeNull()
    expect(uptimeFromOrigin(500, 1_000)).toBe(0) // clamped
  })

  it('formats the HH:MM:SS readout with day prefixes', () => {
    expect(formatUptime(0)).toBe('00:00:00')
    expect(formatUptime(999)).toBe('00:00:00')
    expect(formatUptime(3_661_000)).toBe('01:01:01')
    expect(formatUptime(86_400_000)).toBe('1d 00:00:00')
    expect(formatUptime(90_061_000)).toBe('1d 01:01:01')
    expect(formatUptime(-5)).toBe('—')
    expect(formatUptime(Number.NaN)).toBe('—')
  })
})

describe('replaySchedule — true durations, sorted', () => {
  it('orders marks by their relative offsets', () => {
    const marks = shapeBootTimeline([
      { name: 'late', t: 900, order: 0 },
      { name: 'early', t: 100, order: 1 },
      { name: 'mid', t: 500, order: 2 },
    ])!
    expect(replaySchedule(marks).map((m) => m.name)).toEqual(['early', 'mid', 'late'])
  })

  it('never mutates the list it is given', () => {
    const marks = [
      { name: 'late', t: 900, at: 800, order: 0 },
      { name: 'early', t: 100, at: 0, order: 1 },
    ]
    replaySchedule(marks)
    expect(marks.map((m) => m.name)).toEqual(['late', 'early'])
  })
})

/* ------------------------------- the axes --------------------------------- */

describe('niceCeil / axisTicks / plotPoint — the chart geometry', () => {
  it('niceCeil rounds up to the unit, floored at the unit', () => {
    expect(niceCeil(59.9, 60)).toBe(60)
    expect(niceCeil(60, 60)).toBe(60)
    expect(niceCeil(61, 60)).toBe(120)
    expect(niceCeil(0, 16)).toBe(16)
    expect(niceCeil(48.2, 16)).toBe(64)
    expect(niceCeil(Number.NaN, 16)).toBe(16)
  })

  it('axisTicks seats 0..top evenly with pre-formatted labels', () => {
    const ticks = axisTicks(120, { y: 8, h: 100 }, 4)
    expect(ticks.map((t) => t.label)).toEqual(['120', '90', '60', '30', '0'])
    expect(ticks[0]!.y).toBe(8)
    expect(ticks[4]!.y).toBe(108)
    expect(ticks[2]!.y).toBeCloseTo(58, 6)
  })

  it('fractional tops format at one decimal', () => {
    const ticks = axisTicks(1, { y: 0, h: 10 }, 2)
    expect(ticks.map((t) => t.label)).toEqual(['1', '0.5', '0'])
  })

  it('axisTicks refuses degenerate axes', () => {
    expect(axisTicks(0, { y: 0, h: 10 }, 4)).toEqual([])
    expect(axisTicks(-5, { y: 0, h: 10 }, 4)).toEqual([])
    expect(axisTicks(10, { y: 0, h: 0 }, 4)).toEqual([])
    expect(axisTicks(10, { y: 0, h: 10 }, 0)).toEqual([])
  })

  it('plotPoint maps value to pixel, clamped to the plot box', () => {
    const plot = { y: 8, h: 100 }
    expect(plotPoint(0, 120, plot)).toBe(108)
    expect(plotPoint(120, 120, plot)).toBe(8)
    expect(plotPoint(60, 120, plot)).toBeCloseTo(58, 6)
    expect(plotPoint(999, 120, plot)).toBe(8) // clamped high
    expect(plotPoint(-50, 120, plot)).toBe(108) // clamped low
    expect(plotPoint(10, 0, plot)).toBe(108) // degenerate axis -> baseline
  })
})

/* --------------------------- persisted state ------------------------------ */

describe('readVitalsState — hostile-payload safe', () => {
  it('reads a valid persisted rate', () => {
    expect(readVitalsState({ rateMs: 250 })).toBe(250)
    expect(readVitalsState({ rateMs: 1000 })).toBe(1000)
    expect(readVitalsState({ rateMs: 5000 })).toBe(5000)
  })

  it('refuses everything that is not a selector stop', () => {
    expect(readVitalsState(null)).toBeNull()
    expect(readVitalsState(undefined)).toBeNull()
    expect(readVitalsState('fast')).toBeNull()
    expect(readVitalsState({ rateMs: '1000' })).toBeNull()
    expect(readVitalsState({ rateMs: 300 })).toBeNull()
    expect(readVitalsState({ rateMs: Number.NaN })).toBeNull()
    expect(readVitalsState({ rateMs: null })).toBeNull()
  })

  it('the default rate is a selector stop (the fallback is always valid)', () => {
    expect(readVitalsState({ rateMs: DEFAULT_SAMPLE_RATE })).toBe(DEFAULT_SAMPLE_RATE)
    expect([250, 1000, 5000]).toContain(DEFAULT_SAMPLE_RATE)
  })
})

/* ------------------------ the sampling controller ------------------------- */

/** A fully fake host: manual clock, manual timer queue, togglable hidden. */
function fakeHost() {
  let now = 0
  let hidden = false
  let seq = 0
  const timers = new Map<number, { at: number; fn: () => void; cancelled: boolean }>()
  const host: SamplerHost = {
    now: () => now,
    canSample: () => !hidden,
    schedule: (fn, ms) => {
      const id = ++seq
      timers.set(id, { at: now + ms, fn, cancelled: false })
      return () => {
        const timer = timers.get(id)
        if (timer) timer.cancelled = true
      }
    },
  }
  /** Advance the clock, firing due timers in order (re-arms included). */
  const advance = (ms: number): void => {
    const target = now + ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => !t.cancelled && t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      now = due[1].at
      timers.delete(due[0])
      due[1].fn()
    }
    now = target
  }
  return {
    host,
    advance,
    setHidden: (value: boolean) => {
      hidden = value
    },
    pendingTimers: () => [...timers.values()].filter((t) => !t.cancelled).length,
  }
}

describe('createSamplingController — the hidden-pause law', () => {
  it('samples on the cadence while visible', () => {
    const { host, advance } = fakeHost()
    const sampled: number[] = []
    const controller = createSamplingController(host, 250, (t) => sampled.push(t))
    controller.start()
    expect(sampled).toEqual([])
    advance(250)
    expect(sampled).toEqual([250])
    advance(250)
    expect(sampled).toEqual([250, 500])
    advance(1000)
    expect(sampled).toEqual([250, 500, 750, 1000, 1250, 1500])
    expect(controller.sampled).toBe(6)
    expect(controller.skippedWhilePaused).toBe(0)
  })

  it('PAUSES while hidden: ticks beat, onSample never fires', () => {
    const { host, advance, setHidden } = fakeHost()
    const sampled: number[] = []
    const controller = createSamplingController(host, 100, (t) => sampled.push(t))
    controller.start()
    advance(300)
    expect(sampled.length).toBe(3)

    setHidden(true)
    advance(1000)
    expect(sampled.length).toBe(3) // nothing new — the tab was hidden
    expect(controller.skippedWhilePaused).toBe(10)

    setHidden(false)
    advance(100)
    expect(sampled.length).toBe(4) // resumed within one tick
    expect(sampled[3]).toBe(1400)
  })

  it('stop cancels the cadence; start re-arms it', () => {
    const { host, advance, pendingTimers } = fakeHost()
    const sampled: number[] = []
    const controller = createSamplingController(host, 100, (t) => sampled.push(t))
    controller.start()
    expect(controller.running).toBe(true)
    expect(pendingTimers()).toBe(1)

    controller.stop()
    expect(controller.running).toBe(false)
    expect(pendingTimers()).toBe(0)
    advance(1000)
    expect(sampled).toEqual([])

    controller.start()
    advance(100)
    expect(sampled).toEqual([1100])
  })

  it('start is idempotent — double start never double-schedules', () => {
    const { host, advance, pendingTimers } = fakeHost()
    const controller = createSamplingController(host, 100, () => undefined)
    controller.start()
    controller.start()
    expect(pendingTimers()).toBe(1)
    advance(100)
    expect(pendingTimers()).toBe(1)
  })

  it('stop is idempotent and safe before any start', () => {
    const { host } = fakeHost()
    const controller = createSamplingController(host, 100, () => undefined)
    expect(() => controller.stop()).not.toThrow()
    controller.stop()
  })

  it('refuses a degenerate interval', () => {
    const { host } = fakeHost()
    expect(() => createSamplingController(host, 0, () => undefined)).toThrow()
    expect(() => createSamplingController(host, -100, () => undefined)).toThrow()
  })
})
