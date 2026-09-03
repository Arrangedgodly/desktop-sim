import { describe, expect, it } from 'vitest'
import { createStepLoop, type LoopSeams } from './vivarium-loop'
import { SIM_LAW } from './vivarium-species'
/**
 * Vivarium loop controller law (batch 2, brief 1, acceptance 2) — the rAF
 * mechanics with EVERY browser seam injected: dt derives from frame
 * timestamps and clamps at maxDt; a suspended loop (hidden / minimized /
 * paused) NEVER ticks and keeps its timestamp fresh so resuming is one honest
 * frame, never a backlog; stop() cancels the pending frame. Node-run by
 * construction — the fake raf is pumped by hand.
 */

/** A hand-pumped requestAnimationFrame: one pending callback at most. */
class FakeRaf {
  private queue: { handle: number; cb: (t: number) => void }[] = []
  private next = 1
  readonly cancelled: number[] = []

  readonly request = (cb: (t: number) => void): number => {
    const handle = this.next++
    this.queue.push({ handle, cb })
    return handle
  }

  readonly cancel = (handle: number): void => {
    this.cancelled.push(handle)
    this.queue = this.queue.filter((entry) => entry.handle !== handle)
  }

  /** Fire every pending callback at timestamp t (the loop re-arms inside). */
  readonly pump = (t: number): void => {
    const pending = [...this.queue]
    this.queue = []
    for (const { cb } of pending) cb(t)
  }

  get pendingCount(): number {
    return this.queue.length
  }

  get lastHandle(): number {
    return this.next - 1
  }
}

/** Test-only widening: a seams bag whose suspension verdict flips on demand. */
interface MutableSeams extends LoopSeams {
  setSuspended: (value: boolean) => void
}

function makeSeams(raf: FakeRaf, suspended = false): MutableSeams {
  let isSuspended = suspended
  return {
    requestFrame: raf.request,
    cancelFrame: raf.cancel,
    maxDt: SIM_LAW.maxDt,
    isSuspended: () => isSuspended,
    setSuspended: (value: boolean) => {
      isSuspended = value
    },
  }
}

describe('vivarium loop controller', () => {
  it('ticks with the clamp-bounded frame delta; the first frame establishes the clock only', () => {
    const raf = new FakeRaf()
    const ticks: number[] = []
    const loop = createStepLoop(makeSeams(raf), (dt) => ticks.push(dt))

    loop.start()
    expect(raf.pendingCount).toBe(1)
    raf.pump(1000) // first frame: dt = 0 by construction — no tick
    expect(ticks).toEqual([])

    raf.pump(1016)
    expect(ticks).toEqual([0.016])

    raf.pump(1032)
    expect(ticks).toEqual([0.016, 0.016])
  })

  it('clamps a stale timestamp to maxDt (a restored tab never tunnels the world)', () => {
    const raf = new FakeRaf()
    const ticks: number[] = []
    const loop = createStepLoop(makeSeams(raf), (dt) => ticks.push(dt))
    loop.start()
    raf.pump(0)
    raf.pump(90_000) // 90 seconds "away"
    expect(ticks).toEqual([SIM_LAW.maxDt])
  })

  it('HOLDS while suspended (no tick) and resumes with one honest frame, never a backlog', () => {
    const raf = new FakeRaf()
    const ticks: number[] = []
    const seams = makeSeams(raf, true)
    const loop = createStepLoop(seams, (dt) => ticks.push(dt))
    loop.start()
    expect(loop.isLive()).toBe(true) // suspended, but armed — it holds, not dies

    raf.pump(1000)
    raf.pump(2000)
    raf.pump(3000)
    expect(ticks).toEqual([]) // hidden/minimized/paused: nothing moves

    seams.setSuspended(false)
    raf.pump(3016)
    expect(ticks).toEqual([0.016]) // ONE frame since the last held timestamp

    raf.pump(3032)
    expect(ticks).toEqual([0.016, 0.016])
  })

  it('stop() cancels the pending frame; pumping afterwards is dead; start() re-arms', () => {
    const raf = new FakeRaf()
    const ticks: number[] = []
    const loop = createStepLoop(makeSeams(raf), (dt) => ticks.push(dt))

    loop.start()
    raf.pump(1000)
    loop.stop()
    expect(raf.cancelled).toContain(raf.lastHandle)
    expect(raf.pendingCount).toBe(0)
    expect(loop.isLive()).toBe(false)

    raf.pump(2000)
    expect(ticks).toEqual([])

    loop.start()
    raf.pump(3000) // fresh clock — establishing frame, no tick
    raf.pump(3016)
    expect(ticks).toEqual([0.016])
  })

  it('start() is idempotent — a running loop never double-arms', () => {
    const raf = new FakeRaf()
    const loop = createStepLoop(makeSeams(raf), () => {})
    loop.start()
    loop.start()
    expect(raf.pendingCount).toBe(1)
    loop.stop()
    loop.stop()
    expect(raf.cancelled.length).toBe(1)
  })
})
