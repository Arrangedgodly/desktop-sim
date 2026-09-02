/**
 * UI-7 · gate — the viewport verdict and the matchMedia swap law.
 *
 * The boundary tests pin the brief's full-experience floor exactly (1023 is a
 * phone, 1024 is a desktop, 1025 stays one); the engine tests prove the
 * both-ways swap contract against a FAKE MediaQueryList: one registration for
 * the gate's lifetime (no listener churn), callbacks only on real flips, and
 * a clean dispose. The no-engine fallback (SSR / hostile matchMedia) must
 * answer DESKTOP and never throw.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createViewportGate,
  FULL_EXPERIENCE_FLOOR_PX,
  isPhoneViewport,
  PHONE_GATE_QUERY,
} from './gate'

/* ------------------------------ the boundary ------------------------------- */

describe('UI-7 · isPhoneViewport (the 1024px floor)', () => {
  it('1023 is a phone; 1024 and 1025 are desktops — the floor is inclusive', () => {
    expect(FULL_EXPERIENCE_FLOOR_PX).toBe(1024)
    expect(isPhoneViewport(1023)).toBe(true)
    expect(isPhoneViewport(1024)).toBe(false)
    expect(isPhoneViewport(1025)).toBe(false)
  })

  it('covers the real device classes the card must serve', () => {
    for (const width of [320, 375, 390, 568, 640, 740, 844, 1023]) {
      expect(isPhoneViewport(width)).toBe(true)
    }
    for (const width of [1024, 1280, 1366, 1440, 1920]) {
      expect(isPhoneViewport(width)).toBe(false)
    }
    expect(isPhoneViewport(0)).toBe(true) // a collapsed viewport is still narrow
  })
})

/* ------------------------------ the engine --------------------------------- */

/** A controllable MediaQueryList: records registrations, replays verdicts. */
class FakeMediaQueryList {
  readonly media = PHONE_GATE_QUERY
  matches: boolean
  private readonly listeners = new Set<(event: MediaQueryListEvent) => void>()

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.delete(listener)
  }

  /** How many engine registrations are live right now. */
  get registrations(): number {
    return this.listeners.size
  }

  /** The viewport crossed the floor — emit the engine's change event. */
  emit(matches: boolean): void {
    this.matches = matches
    const event = { matches } as MediaQueryListEvent
    for (const listener of [...this.listeners]) listener(event)
  }
}

/** A window whose matchMedia hands back one shared fake query list. */
function fakeWindow(initialPhone: boolean): {
  mql: FakeMediaQueryList
  matchMediaCalls: string[]
  win: { matchMedia(query: string): MediaQueryList }
} {
  const mql = new FakeMediaQueryList(!initialPhone)
  const matchMediaCalls: string[] = []
  return {
    mql,
    matchMediaCalls,
    win: {
      matchMedia(query: string): MediaQueryList {
        matchMediaCalls.push(query)
        return mql as unknown as MediaQueryList
      },
    },
  }
}

describe('UI-7 · createViewportGate', () => {
  it('reads the boot verdict from the single query, once', () => {
    const { mql, matchMediaCalls, win } = fakeWindow(true)
    const gate = createViewportGate(win)
    expect(gate.isPhone()).toBe(true)
    expect(matchMediaCalls).toEqual([PHONE_GATE_QUERY])
    expect(PHONE_GATE_QUERY).toBe('(min-width: 1024px)')
    expect(mql.registrations).toBe(1)
  })

  it('boots desktop-side when the viewport is at or over the floor', () => {
    const { mql, win } = fakeWindow(false)
    const gate = createViewportGate(win)
    expect(gate.isPhone()).toBe(false)
    expect(mql.registrations).toBe(1)
  })

  it('swaps BOTH ways across the floor — desktop → phone → desktop', () => {
    const { mql, win } = fakeWindow(false)
    const onFlip = vi.fn()
    const gate = createViewportGate(win)
    expect(gate.isPhone()).toBe(false)
    gate.subscribe(onFlip)

    mql.emit(true) // a resize that stays desktop-side (the query still matches)
    expect(onFlip).not.toHaveBeenCalled()
    expect(gate.isPhone()).toBe(false)

    mql.emit(false) // crossed down to phone (query stopped matching)
    expect(onFlip).toHaveBeenCalledTimes(1)
    expect(onFlip).toHaveBeenLastCalledWith(true)
    expect(gate.isPhone()).toBe(true)

    mql.emit(false) // churn while phone-side
    expect(onFlip).toHaveBeenCalledTimes(1)

    mql.emit(true) // crossed back up to desktop
    expect(onFlip).toHaveBeenCalledTimes(2)
    expect(onFlip).toHaveBeenLastCalledWith(false)
    expect(gate.isPhone()).toBe(false)
  })

  it('unsubscribe stops the flips; dispose retires the engine registration', () => {
    const { mql, win } = fakeWindow(true)
    const gate = createViewportGate(win)
    const onFlip = vi.fn()
    const unsubscribe = gate.subscribe(onFlip)

    mql.emit(true) // crossed up to desktop
    expect(onFlip).toHaveBeenCalledTimes(1)

    unsubscribe()
    mql.emit(false) // back down to phone — unheard
    expect(onFlip).toHaveBeenCalledTimes(1)

    gate.dispose()
    expect(mql.registrations).toBe(0)
  })

  it('with no matchMedia at all, answers DESKTOP (the product) and never throws', () => {
    const gate = createViewportGate({})
    expect(gate.isPhone()).toBe(false)
    const onFlip = vi.fn()
    expect(() => gate.subscribe(onFlip)).not.toThrow()
    expect(() => gate.dispose()).not.toThrow()
  })

  it('with a matchMedia that throws, degrades to the desktop default', () => {
    const gate = createViewportGate({
      matchMedia: () => {
        throw new Error('hostile engine')
      },
    })
    expect(gate.isPhone()).toBe(false)
  })
})
