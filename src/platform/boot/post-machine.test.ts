import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FULL_POST_TIMING,
  PostController,
  RESUME_POST_TIMING,
  STATIC_POST_TIMING,
  postSequenceDurationMs,
  type PostLine,
} from './post-machine'
import { buildPostLines, buildResumeLine, type PostSubsystemReport } from './post-lines'

/* The timing machine is driven with fake timers — every claim below is about
   the schedule itself, no DOM involved. */

const LINES: readonly PostLine[] = [
  { id: 'one', text: 'ARCHIVE INTEGRITY .... VERIFIED' },
  { id: 'two', text: 'MODULE REGISTRY ..... 1 MODULE REGISTERED' },
  { id: 'three', text: 'CONSOLE ............. ONLINE' },
]

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PostController · sequencing', () => {
  it('types line by line: a line only starts after the previous one finished plus the gap', () => {
    const controller = new PostController({ lines: LINES, timing: FULL_POST_TIMING })
    controller.start()

    // First character lands synchronously; nothing of line 2 exists yet.
    expect(controller.getSnapshot().chars).toEqual([1, 0, 0])

    // Type the rest of line 1 (len 31 → 30 more chars × 3ms).
    vi.advanceTimersByTime(30 * 3)
    let chars = controller.getSnapshot().chars
    expect(chars[0]).toBe(LINES[0]!.text.length)
    expect(chars[1]).toBe(0) // still inside the 90ms gap
    expect(controller.getSnapshot().phase).toBe('typing')

    vi.advanceTimersByTime(FULL_POST_TIMING.lineGapMs)
    chars = controller.getSnapshot().chars
    expect(chars[1]).toBe(1) // line 2's first char — ordering held
    expect(chars[2]).toBe(0)

    // Run everything out: all lines complete, then the hold, then completion.
    vi.advanceTimersByTime(postSequenceDurationMs(LINES, FULL_POST_TIMING))
    const final = controller.getSnapshot()
    expect(final.phase).toBe('complete')
    expect(final.chars).toEqual(LINES.map((line) => line.text.length))
  })

  it('holds the completed state for holdMs before firing onComplete once', () => {
    const onComplete = vi.fn()
    const controller = new PostController({ lines: LINES, timing: FULL_POST_TIMING, onComplete })
    controller.start()

    const typing = postSequenceDurationMs(LINES, FULL_POST_TIMING) - FULL_POST_TIMING.holdMs
    vi.advanceTimersByTime(typing)
    expect(controller.getSnapshot().phase).toBe('hold')
    expect(onComplete).not.toHaveBeenCalled()

    vi.advanceTimersByTime(FULL_POST_TIMING.holdMs)
    expect(controller.getSnapshot().phase).toBe('complete')
    expect(onComplete).toHaveBeenCalledTimes(1)

    // No further timer activity exists — completion is terminal.
    vi.advanceTimersByTime(10_000)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().phase).toBe('complete')
  })

  it('notifies subscribers on every transition and stops after unsubscribe', () => {
    const listener = vi.fn()
    const controller = new PostController({ lines: LINES, timing: FULL_POST_TIMING })
    const unsubscribe = controller.subscribe(listener)
    controller.start()
    const callsAfterStart = listener.mock.calls.length
    expect(callsAfterStart).toBeGreaterThan(0)

    unsubscribe()
    vi.advanceTimersByTime(postSequenceDurationMs(LINES, FULL_POST_TIMING))
    expect(listener.mock.calls.length).toBe(callsAfterStart) // silent after unsubscribe
  })

  it('getSnapshot is referentially stable between emissions', () => {
    const controller = new PostController({ lines: LINES, timing: FULL_POST_TIMING })
    controller.start()
    const first = controller.getSnapshot()
    expect(controller.getSnapshot()).toBe(first) // useSyncExternalStore contract
    vi.advanceTimersByTime(FULL_POST_TIMING.charDelayMs)
    expect(controller.getSnapshot()).not.toBe(first)
  })
})

describe('PostController · skip', () => {
  it('jumps to the complete state instantly from mid-typing (all lines full)', () => {
    const onComplete = vi.fn()
    const controller = new PostController({ lines: LINES, timing: FULL_POST_TIMING, onComplete })
    controller.start()
    vi.advanceTimersByTime(40) // somewhere inside line 1

    controller.skip()

    const snapshot = controller.getSnapshot()
    expect(snapshot.phase).toBe('complete')
    expect(snapshot.chars).toEqual(LINES.map((line) => line.text.length))
    expect(onComplete).toHaveBeenCalledTimes(1)

    // Terminal: nothing more fires, skip again is a no-op.
    vi.advanceTimersByTime(10_000)
    controller.skip()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('skip before start completes immediately (probe-phase skip)', () => {
    const onComplete = vi.fn()
    const controller = new PostController({ lines: LINES, timing: FULL_POST_TIMING, onComplete })
    controller.skip()
    expect(controller.getSnapshot().phase).toBe('complete')
    expect(onComplete).toHaveBeenCalledTimes(1)

    controller.start() // no-op after completion
    expect(controller.getSnapshot().phase).toBe('complete')
  })

  it('start is idempotent (React StrictMode double-effect safe)', () => {
    const onComplete = vi.fn()
    const controller = new PostController({ lines: LINES, timing: FULL_POST_TIMING, onComplete })
    controller.start()
    const afterFirstStart = controller.getSnapshot().chars[0]
    controller.start() // second StrictMode invocation
    expect(controller.getSnapshot().chars[0]).toBe(afterFirstStart)

    vi.advanceTimersByTime(postSequenceDurationMs(LINES, FULL_POST_TIMING))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('dispose freezes the machine: no timers, no completion, no restart', () => {
    const onComplete = vi.fn()
    const controller = new PostController({ lines: LINES, timing: FULL_POST_TIMING, onComplete })
    controller.start()
    controller.dispose()

    vi.advanceTimersByTime(postSequenceDurationMs(LINES, FULL_POST_TIMING))
    expect(onComplete).not.toHaveBeenCalled()

    const fresh = new PostController({ lines: LINES, timing: FULL_POST_TIMING })
    fresh.dispose()
    fresh.start()
    expect(fresh.started).toBe(false)
  })
})

describe('PostController · instant timings (reduced motion / resume flash)', () => {
  it('static timing shows the FINAL state immediately and completes after the ~300ms hold', () => {
    const onComplete = vi.fn()
    const controller = new PostController({ lines: LINES, timing: STATIC_POST_TIMING, onComplete })
    controller.start()

    // Every line fully visible at t≈0 — no animation to reduce away.
    expect(controller.getSnapshot().chars).toEqual(LINES.map((line) => line.text.length))
    expect(controller.getSnapshot().phase).toBe('hold')
    expect(onComplete).not.toHaveBeenCalled()

    vi.advanceTimersByTime(STATIC_POST_TIMING.holdMs)
    expect(controller.getSnapshot().phase).toBe('complete')
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('resume timing completes within the 200ms return-visit budget', () => {
    const controller = new PostController({
      lines: [buildResumeLine()],
      timing: RESUME_POST_TIMING,
    })
    expect(postSequenceDurationMs([buildResumeLine()], RESUME_POST_TIMING)).toBeLessThanOrEqual(200)

    controller.start()
    expect(controller.getSnapshot().chars).toEqual([buildResumeLine().text.length])
    vi.advanceTimersByTime(RESUME_POST_TIMING.holdMs)
    expect(controller.getSnapshot().phase).toBe('complete')
  })
})

describe('UI-2 budget · the real first-visit POST completes within 2s', () => {
  it('full timing over the real subsystem lines (and fatter variants) stays ≤2000ms', () => {
    const report: PostSubsystemReport = {
      bootOrigin: 'stored',
      schemaVersion: 1,
      nodeCount: 42,
      moduleCount: 6,
      recovery: null,
    }
    const lines = buildPostLines(report)
    expect(lines).toHaveLength(5)

    expect(postSequenceDurationMs(lines, FULL_POST_TIMING)).toBeLessThanOrEqual(2000)

    // Headroom check: even a recovery wordier than any today plus a large
    // catalog stays inside the budget.
    const wordy = lines.map((line) =>
      line.id === 'archive-integrity'
        ? { ...line, text: 'ARCHIVE INTEGRITY ....... RESTORED FROM BACKUP · 999 ITEMS · V1' }
        : line,
    )
    expect(postSequenceDurationMs(wordy, FULL_POST_TIMING)).toBeLessThanOrEqual(2000)
  })
})
