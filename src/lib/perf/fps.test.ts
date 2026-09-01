import { describe, expect, it } from 'vitest'
import { computeFps, measureFps } from './fps'
import type { FrameScheduler } from './fps'

/**
 * TH-1 unit tests: the fps MATH must be deterministic, so every timeline here
 * is driven through an injected scheduler that the test fires by hand — no
 * real rAF, no flakiness. (Real-browser use is IM-4b/IM-5's job.)
 */

/** A scheduler whose queued callbacks the test invokes with chosen times. */
function manualScheduler(): {
  scheduler: FrameScheduler
  fire: (nowMs: number) => void
  pending: number
} {
  const queue: ((nowMs: number) => void)[] = []
  return {
    scheduler: (callback) => queue.push(callback),
    fire: (nowMs) => queue.shift()?.(nowMs),
    get pending() {
      return queue.length
    },
  }
}

describe('TH-1 · computeFps (pure math)', () => {
  it('derives fps from frame intervals: 60 frames in 1000ms → 60', () => {
    expect(computeFps(60, 1000)).toBe(60)
  })

  it('scales: 120 frames in 500ms → 240', () => {
    expect(computeFps(120, 500)).toBe(240)
  })

  it('handles fractional rates (a stutter): 34 frames in 1000ms → 34', () => {
    expect(computeFps(34, 1000)).toBe(34)
  })

  it('never yields NaN/Infinity for degenerate inputs', () => {
    expect(computeFps(0, 1000)).toBe(0)
    expect(computeFps(60, 0)).toBe(0)
    expect(computeFps(-1, 1000)).toBe(0)
    expect(computeFps(60, -5)).toBe(0)
    expect(computeFps(Number.NaN, 1000)).toBe(0)
  })
})

describe('TH-1 · measureFps (injected scheduler)', () => {
  it('anchors on the first frame and counts intervals, not callbacks', async () => {
    const { scheduler, fire } = manualScheduler()
    const ticks: number[] = []

    const samplePromise = measureFps(100, (tick) => ticks.push(tick.frame), scheduler)
    // Frames at 0 (anchor), 20, 40, 60, 80, 100 — elapsed ≥ 100 stops at 100.
    for (const now of [0, 20, 40, 60, 80, 100]) fire(now)

    const sample = await samplePromise
    expect(sample.frames).toBe(5) // five intervals after the anchor
    expect(sample.elapsedMs).toBe(100)
    expect(sample.fps).toBe(50) // 5 intervals / 100ms
    expect(ticks).toEqual([0, 1, 2, 3, 4, 5]) // onFrame saw every frame incl. anchor
  })

  it('reports per-frame ticks: elapsed since anchor, delta since previous', async () => {
    const { scheduler, fire } = manualScheduler()
    const seen: { elapsedMs: number; deltaMs: number }[] = []

    const samplePromise = measureFps(
      60,
      (tick) => seen.push({ elapsedMs: tick.elapsedMs, deltaMs: tick.deltaMs }),
      scheduler,
    )
    fire(1000) // anchor
    fire(1016)
    fire(1048) // a 32ms stutter
    fire(1064)
    const sample = await samplePromise

    expect(seen[0]).toEqual({ elapsedMs: 0, deltaMs: 0 }) // anchor frame
    expect(seen[1]).toEqual({ elapsedMs: 16, deltaMs: 16 })
    expect(seen[2]).toEqual({ elapsedMs: 48, deltaMs: 32 })
    expect(seen[3]).toEqual({ elapsedMs: 64, deltaMs: 16 })
    expect(sample.longestDeltaMs).toBe(32) // worst single stutter
    expect(sample.fps).toBeCloseTo(3 * (1000 / 64), 10) // 3 intervals in 64ms
  })

  it('treats a single frame after the anchor as one interval', async () => {
    const { scheduler, fire } = manualScheduler()
    const samplePromise = measureFps(10, undefined, scheduler)
    fire(0)
    fire(50) // first post-anchor frame already exceeds duration → stop
    const sample = await samplePromise
    expect(sample.frames).toBe(1)
    expect(sample.elapsedMs).toBe(50)
    expect(sample.fps).toBe(20)
  })

  it('resolves immediately with a zeroed sample for non-positive durations', async () => {
    const { scheduler } = manualScheduler()
    for (const bad of [0, -100, Number.POSITIVE_INFINITY, Number.NaN]) {
      const sample = await measureFps(bad, undefined, scheduler)
      expect(sample).toEqual({ fps: 0, frames: 0, elapsedMs: 0, longestDeltaMs: 0 })
    }
  })

  it('works end-to-end against the rAF fallback (no rAF host, ~16ms ticks)', async () => {
    // 96ms of fallback ticking at ~16ms ≈ 6 intervals — smoke-tests the
    // default scheduler path without a real display.
    const sample = await measureFps(96)
    expect(sample.frames).toBeGreaterThan(2)
    expect(sample.fps).toBeGreaterThan(20)
    expect(sample.fps).toBeLessThan(200)
  })
})
