/**
 * Vivarium loop controller (batch 2, brief 1) — the rAF mechanics LIFTED OUT
 * of the surface so the brief's acceptance is unit-testable in node:
 * "rAF pauses hidden/minimized (unit-testable via the loop controller)".
 *
 * The controller owns exactly three truths:
 *  1. dt is the clamp-bounded frame delta in SECONDS (a restored tab's stale
 *     timestamp never tunnels the world — `maxDt` caps it);
 *  2. while `isSuspended()` answers true (document.hidden, the window
 *     minimized, or the operator's PAUSE bat thrown) NO tick fires, and the
 *     timestamp stays fresh so resuming never produces a spike;
 *  3. `stop()` cancels the pending frame — unmounting leaves nothing live.
 *
 * Every browser seam is injected (`requestFrame`/`cancelFrame`), so the node
 * test drives frames by hand with controlled timestamps. The surface supplies
 * `isSuspended: () => document.hidden || minimized || paused` and `tick` =
 * step + draw + readout sync.
 */

/** The two rAF-family seams, injected (node tests drive them by hand). */
export interface LoopSeams {
  readonly requestFrame: (callback: (timestamp: number) => void) => number
  readonly cancelFrame: (handle: number) => void
  /** True while the loop must hold: hidden, minimized, or user-paused. */
  readonly isSuspended: () => boolean
  /** dt ceiling in seconds (SIM_LAW.maxDt at the surface). */
  readonly maxDt: number
}

export interface StepLoop {
  /** Arm the loop (idempotent — a running loop is a no-op). */
  readonly start: () => void
  /** Disarm + cancel the pending frame (idempotent). */
  readonly stop: () => void
  /** True while armed (a suspended loop is still armed — it holds, it does not die). */
  readonly isLive: () => boolean
}

export function createStepLoop(seams: LoopSeams, tick: (dt: number) => void): StepLoop {
  let live = false
  let handle: number | null = null
  let lastT: number | null = null

  const frame = (t: number): void => {
    handle = null
    if (!live) return
    if (seams.isSuspended()) {
      // HOLD: no tick, and the timestamp stays current so the resume delta
      // is one honest frame, not a backlog.
      lastT = t
      handle = seams.requestFrame(frame)
      return
    }
    const dt =
      lastT === null ? 0 : Math.max(0, Math.min((t - lastT) / 1000, seams.maxDt))
    lastT = t
    if (dt > 0) tick(dt)
    handle = seams.requestFrame(frame)
  }

  return {
    start: () => {
      if (live) return
      live = true
      lastT = null
      handle = seams.requestFrame(frame)
    },
    stop: () => {
      live = false
      if (handle !== null) seams.cancelFrame(handle)
      handle = null
      lastT = null
    },
    isLive: () => live,
  }
}
