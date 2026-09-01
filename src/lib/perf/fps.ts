/**
 * rAF frame-counting harness (TH-1) — the drag-fps probe IM-4b and IM-5 use to
 * prove 60fps during scripted gestures ("rAF check during scripted drag",
 * plan.md), and later UI-2 can reuse for boot-phase smoothness checks.
 *
 * Counting contract (the part the unit tests pin):
 * - The FIRST scheduled frame is the anchor: it starts the clock
 *   (elapsed = 0, delta = 0) and is NOT counted as a completed frame.
 * - Every subsequent frame completes one interval: `frames` counts intervals,
 *   so fps = frames * 1000 / elapsed — an interval-based rate, not a
 *   sample-count guess. 60 callbacks after the anchor inside 1000ms ⇒ 60fps.
 * - Measurement ends on the first frame whose elapsed ≥ durationMs; that
 *   frame is included (its interval is real work that happened).
 *
 * `scheduleFrame` is injectable so tests drive deterministic timelines; the
 * default uses requestAnimationFrame when present (real browsers) and falls
 * back to a ~16ms timeout in environments without rAF (plain jsdom/node),
 * keeping the module loadable anywhere.
 */

/** One rAF tick as observed by an `onFrame` callback. */
export interface FrameTick {
  /** 0-based frame index since measurement start (anchor = 0). */
  readonly frame: number
  /** Milliseconds since the anchor frame. */
  readonly elapsedMs: number
  /** Milliseconds since the previous frame (0 on the anchor). */
  readonly deltaMs: number
}

/** Result of a completed measurement. */
export interface FpsSample {
  /** Interval-based frames-per-second. 0 when no interval was observed. */
  readonly fps: number
  /** Completed frame intervals (frames after the anchor). */
  readonly frames: number
  /** Anchor → last frame, milliseconds. */
  readonly elapsedMs: number
  /** Longest gap between consecutive frames — the worst single stutter. */
  readonly longestDeltaMs: number
}

/** Schedules `callback(nowMs)` on the next animation frame. rAF-shaped. */
export type FrameScheduler = (callback: (nowMs: number) => void) => unknown

/** Fallback cadence when no requestAnimationFrame exists: one 60fps frame. */
const FALLBACK_FRAME_MS = 16

type RafHost = { requestAnimationFrame?: (callback: (nowMs: number) => void) => unknown }

function defaultScheduleFrame(callback: (nowMs: number) => void): unknown {
  const raf = (globalThis as unknown as RafHost).requestAnimationFrame
  if (typeof raf === 'function') return raf.call(globalThis, callback)
  return globalThis.setTimeout(() => callback(globalThis.performance.now()), FALLBACK_FRAME_MS)
}

/**
 * Pure fps math, exported for tests and for converting externally captured
 * frame timestamps. Degenerate inputs (no frames, no elapsed time) yield 0 —
 * never NaN, never Infinity.
 */
export function computeFps(frames: number, elapsedMs: number): number {
  if (!(frames > 0) || !(elapsedMs > 0)) return 0
  return (frames * 1000) / elapsedMs
}

/**
 * Count rAF frames for `durationMs` and report the frame rate.
 * `onFrame` fires for every frame — anchor included — so callers can correlate
 * gesture steps (see ./gesture.ts) with the frame they land in.
 *
 * Non-positive / non-finite `durationMs` resolves immediately with a zeroed
 * sample (a nothing-measurement, not a rejected promise — probes must never
 * take the host test down with them).
 */
export async function measureFps(
  durationMs: number,
  onFrame?: (tick: FrameTick) => void,
  scheduleFrame: FrameScheduler = defaultScheduleFrame,
): Promise<FpsSample> {
  if (!(durationMs > 0) || !Number.isFinite(durationMs)) {
    return { fps: 0, frames: 0, elapsedMs: 0, longestDeltaMs: 0 }
  }
  return new Promise<FpsSample>((resolve) => {
    let frames = 0
    let anchorMs = -1
    let prevMs = 0
    let longestDeltaMs = 0

    const tick = (nowMs: number): void => {
      if (anchorMs < 0) {
        anchorMs = nowMs
        prevMs = nowMs
        onFrame?.({ frame: 0, elapsedMs: 0, deltaMs: 0 })
        scheduleFrame(tick)
        return
      }
      const deltaMs = Math.max(0, nowMs - prevMs)
      const elapsedMs = nowMs - anchorMs
      prevMs = nowMs
      frames += 1
      if (deltaMs > longestDeltaMs) longestDeltaMs = deltaMs
      onFrame?.({ frame: frames, elapsedMs, deltaMs })

      if (elapsedMs >= durationMs) {
        resolve({ fps: computeFps(frames, elapsedMs), frames, elapsedMs, longestDeltaMs })
        return
      }
      scheduleFrame(tick)
    }

    scheduleFrame(tick)
  })
}
