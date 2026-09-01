// @vitest-environment jsdom
// The hold's ONE clock (IM-4c): a single shared interval across every
// consumer, torn down with the last subscriber, paused while the document is
// hidden and woken straight to a fresh reading.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { formatTimecode, getTimecode, subscribeTimecode } from './timecode'
import { TimecodeWell } from './TimecodeWell'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Count interval lifecycle calls through stubbed globals (no fake timers). */
function stubTimers(): { readonly started: () => number; readonly stopped: () => number } {
  const realSetInterval = globalThis.setInterval.bind(globalThis)
  const realClearInterval = globalThis.clearInterval.bind(globalThis)
  const start = vi.fn((...args: Parameters<typeof setInterval>) => realSetInterval(...args))
  const stop = vi.fn((...args: Parameters<typeof clearInterval>) => realClearInterval(...args))
  vi.stubGlobal('setInterval', start)
  vi.stubGlobal('clearInterval', stop)
  return { started: () => start.mock.calls.length, stopped: () => stop.mock.calls.length }
}

describe('timecode · formatTimecode', () => {
  it('formats 24-hour HH:MM:SS, zero-padded', () => {
    expect(formatTimecode(new Date(2026, 8, 1, 5, 7, 9))).toBe('05:07:09')
    expect(formatTimecode(new Date(2026, 8, 1, 23, 59, 59))).toBe('23:59:59')
    expect(formatTimecode(new Date(2026, 8, 1, 0, 0, 0))).toBe('00:00:00')
    expect(formatTimecode(new Date(2026, 8, 1, 13, 2, 3))).toBe('13:02:03')
  })
})

describe('timecode · the ONE shared interval', () => {
  it('two consumers ride a single interval; the last unsubscribe stops it', () => {
    const timers = stubTimers()
    const first = subscribeTimecode(vi.fn())
    expect(timers.started()).toBe(1)

    const second = subscribeTimecode(vi.fn())
    expect(timers.started()).toBe(1) // still ONE timer for both consumers

    first()
    expect(timers.stopped()).toBe(0) // a consumer remains
    second()
    expect(timers.stopped()).toBe(1) // the hold sleeps
  })

  it('two mounted readouts also share exactly one interval', () => {
    const timers = stubTimers()
    render(
      <>
        <TimecodeWell />
        <TimecodeWell />
      </>,
    )
    expect(timers.started()).toBe(1)
    expect(screen.getAllByRole('timer')).toHaveLength(2)

    cleanup() // unmount both → the last subscriber stops the clock
    expect(timers.stopped()).toBe(1)
  })

  it('notifies subscribers once per second with a fresh reading', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 1, 7, 8, 9))

    const readings: string[] = []
    const unsubscribe = subscribeTimecode(() => readings.push(getTimecode()))

    vi.advanceTimersByTime(2100)
    unsubscribe()

    expect(readings).toEqual(['07:08:10', '07:08:11']) // ticks at 1s and 2s
  })

  it('the mounted readout rolls over on the tick', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 1, 7, 8, 9))

    render(<TimecodeWell />)
    expect(screen.getByRole('timer').textContent).toBe('07:08:09')

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('timer').textContent).toBe('07:08:10')
  })
})

describe('timecode · document.hidden pause', () => {
  /** Shadow jsdom's prototype getter with a controllable one. */
  function setDocumentHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  }

  it('hiding the document tears the interval down; returning rebuilds + wakes', () => {
    const timers = stubTimers()
    const listener = vi.fn()
    const unsubscribe = subscribeTimecode(listener)
    expect(timers.started()).toBe(1)
    listener.mockClear()

    try {
      setDocumentHidden(true)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(timers.stopped()).toBe(1)

      setDocumentHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(timers.started()).toBe(2) // rebuilt
      expect(listener).toHaveBeenCalledTimes(1) // woken to a fresh reading at once
    } finally {
      delete (document as { hidden?: boolean }).hidden // restore the prototype getter
      unsubscribe()
    }
  })

  it('a subscriber arriving while hidden starts no timer until the wake', () => {
    const timers = stubTimers()
    setDocumentHidden(true)
    let unsubscribe: () => void = () => {}
    try {
      unsubscribe = subscribeTimecode(vi.fn())
      expect(timers.started()).toBe(0) // hidden: no clock

      setDocumentHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(timers.started()).toBe(1) // awake again
    } finally {
      delete (document as { hidden?: boolean }).hidden
      unsubscribe()
    }
  })
})
