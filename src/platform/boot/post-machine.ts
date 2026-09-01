/**
 * POST typing machine (UI-2) — the time-driven heart of the power-on self
 * test. DOM-free and framework-free: given lines and a timing it reveals
 * characters line by line, holds the final state for a beat, then reports
 * `complete`. React subscribes through `useSyncExternalStore`; unit tests
 * drive it with fake timers; nothing here touches storage or stores.
 *
 * Timings are DATA, not mode flags — the three UI-2 variants are just timings:
 * - FULL_POST_TIMING    first visit, motion allowed: characters type fast,
 *                       one line at a time, ≤2s to complete (postSequence
 *                       DurationMs asserts the budget from the real lines).
 * - STATIC_POST_TIMING  first visit, `prefers-reduced-motion: reduce`: the
 *                       final POST state appears at once and holds ~300ms
 *                       (no animation to reduce away).
 * - RESUME_POST_TIMING  return visit (boot flag seen): a single RESUME line
 *                       flashes for ≤200ms before the desktop takes over.
 *
 * `skip()` is the contract's escape hatch: click or any key jumps the machine
 * to its completed state instantly; `onComplete` fires exactly once whether
 * the sequence finishes naturally or is skipped.
 */

/** One typed POST row. `role` only affects rendering (the banner is brighter). */
export interface PostLine {
  readonly id: string
  readonly text: string
  /** Default 'status'; the final HOLD/OS line is 'banner'. */
  readonly role?: 'status' | 'banner'
}

export interface PostTiming {
  /** Delay between two revealed characters of the same line. 0 = no typing. */
  readonly charDelayMs: number
  /** Delay between finishing one line and starting the next. */
  readonly lineGapMs: number
  /** How long the completed POST state holds before `complete` fires. */
  readonly holdMs: number
}

export const FULL_POST_TIMING: PostTiming = { charDelayMs: 3, lineGapMs: 90, holdMs: 280 }
export const STATIC_POST_TIMING: PostTiming = { charDelayMs: 0, lineGapMs: 0, holdMs: 300 }
export const RESUME_POST_TIMING: PostTiming = { charDelayMs: 0, lineGapMs: 0, holdMs: 120 }

export type PostPhase = 'typing' | 'hold' | 'complete'

/** What the screen renders: the phase plus per-line visible character counts. */
export interface PostSnapshot {
  readonly phase: PostPhase
  readonly chars: readonly number[]
}

export type PostListener = () => void

export interface PostControllerOptions {
  readonly lines: readonly PostLine[]
  readonly timing: PostTiming
  /**
   * Fired exactly once, when the sequence reaches `complete` — naturally or
   * via {@link PostController.skip}. Never fires after `dispose()`.
   */
  readonly onComplete?: () => void
}

/**
 * Upper bound on time from `start()` to `complete` for a lines+timing pair —
 * the number the UI-2 budget tests assert (≤2000ms full POST, ≤200ms resume).
 */
export function postSequenceDurationMs(lines: readonly PostLine[], timing: PostTiming): number {
  if (lines.length === 0) return 0
  if (timing.charDelayMs <= 0 && timing.lineGapMs <= 0) return timing.holdMs
  const typing = lines.reduce((sum, line) => sum + line.text.length * timing.charDelayMs, 0)
  const gaps = (lines.length - 1) * timing.lineGapMs
  return typing + gaps + timing.holdMs
}

/** Shared empty snapshot for the pre-controller probe phase (no controller yet). */
export const POST_PROBE_SNAPSHOT: PostSnapshot = { phase: 'typing', chars: [] }

export class PostController {
  readonly lines: readonly PostLine[]
  private readonly timing: PostTiming
  private readonly onComplete?: () => void

  private phase: PostPhase = 'typing'
  private chars: number[]
  private cursorLine = 0
  private cursorChars = 0
  private listeners = new Set<PostListener>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private snapshotCache: PostSnapshot | null = null
  private completed = false
  private disposed = false

  constructor(options: PostControllerOptions) {
    this.lines = options.lines
    this.timing = options.timing
    this.onComplete = options.onComplete
    this.chars = options.lines.map(() => 0)
  }

  /** Stable arrow properties — `useSyncExternalStore` requires both identities. */
  readonly subscribe = (listener: PostListener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): PostSnapshot => {
    if (this.snapshotCache === null) {
      this.snapshotCache = Object.freeze({
        phase: this.phase,
        chars: Object.freeze([...this.chars]),
      })
    }
    return this.snapshotCache
  }

  private hasStarted = false

  /** True once `start()` has been called (idempotent — StrictMode-safe). */
  get started(): boolean {
    return this.hasStarted
  }

  /** Begin the sequence. No-op when already started or disposed. */
  start(): void {
    if (this.hasStarted || this.disposed) return
    this.hasStarted = true
    if (this.lines.length === 0) {
      this.finish()
      return
    }
    if (this.timing.charDelayMs <= 0 && this.timing.lineGapMs <= 0) {
      // Static variant: the FINAL post state immediately, then the hold.
      this.chars = this.lines.map((line) => line.text.length)
      this.phase = 'hold'
      this.emit()
      this.schedule(this.timing.holdMs, () => this.finish())
      return
    }
    this.tick() // first character lands synchronously — the beam is on
  }

  /** Skip to the completed POST state immediately (click / any key). */
  skip(): void {
    if (this.completed) return
    this.finish()
  }

  /** Stop all timers and drop listeners. The controller cannot restart. */
  dispose(): void {
    this.disposed = true
    this.clearTimer()
    this.listeners.clear()
  }

  private tick(): void {
    if (this.completed || this.disposed) return
    const line = this.lines[this.cursorLine]
    if (line === undefined) {
      this.beginHold()
      return
    }
    if (this.cursorChars < line.text.length) {
      this.cursorChars += 1
      this.chars[this.cursorLine] = this.cursorChars
      this.emit()
      if (this.cursorChars < line.text.length) {
        this.schedule(this.timing.charDelayMs, () => this.tick())
        return
      }
      // Last character just landed — fall through to the gap/hold NOW (no
      // wasted charDelay discovering the line was finished).
    }
    this.cursorLine += 1
    this.cursorChars = 0
    if (this.cursorLine >= this.lines.length) {
      this.beginHold() // last line done — the gap is BETWEEN lines only
      return
    }
    this.schedule(this.timing.lineGapMs, () => this.tick())
  }

  private beginHold(): void {
    this.phase = 'hold'
    this.emit()
    this.schedule(this.timing.holdMs, () => this.finish())
  }

  private finish(): void {
    if (this.completed) return
    this.completed = true
    this.clearTimer()
    this.phase = 'complete'
    this.chars = this.lines.map((line) => line.text.length)
    this.emit()
    if (!this.disposed) this.onComplete?.()
  }

  private schedule(delayMs: number, fn: () => void): void {
    this.clearTimer()
    this.timer = setTimeout(
      () => {
        this.timer = null
        fn()
      },
      Math.max(0, delayMs),
    )
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private emit(): void {
    this.snapshotCache = null
    for (const listener of this.listeners) listener()
  }
}
