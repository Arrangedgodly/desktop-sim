// @vitest-environment jsdom
// Batch 2 · brief 5 — the Specimen Survey surface through its real seams:
// the manifest, the multi-instance rule, the well grid's full keyboard
// floor (roving tabindex, arrows, Enter reveal, F pin), the static end
// states, the preset selector + New Survey, and the appState mirror that
// resumes a dig across reload (validated — hostile payloads fall back to a
// fresh field). Registers ONLY this manifest: the batch's siblings are
// being built in parallel and are not this app's dependency.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { resetAppRegistry, registerApp, openApp } from '../../platform/app-registry'
import { resetLazyMount } from '../../platform/app-registry/lazy-mount'
import { useWMStore } from '../../platform/stores/wm-store'
import SpecimenSurveySurface from './SpecimenSurveySurface'
import { SpecimenSurveyIcon } from './SpecimenSurveyIcon'
import { specimenSurveyApp } from './index'
import {
  type SurveyPersistState,
  SURVEY_MIRROR_DELAY_MS,
  freshSurvey,
  markPlot,
  peekSurveyTestFixture,
  readSurveyState,
  serializeSurvey,
  setSurveyTestFixture,
} from './survey-model'

/* ------------------------- store/module hygiene --------------------------- */

const initialWM = useWMStore.getState()

beforeEach(() => {
  vi.useRealTimers()
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  registerApp(specimenSurveyApp)
  setSurveyTestFixture(null)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/* -------------------------------- helpers --------------------------------- */

/** A persisted-shape FIELD board with every specimen in the bottom row. */
function bottomRowState(): SurveyPersistState {
  const total = 64
  const specimens = new Array<string>(total).fill('0')
  for (let i = 56; i < 64; i++) specimens[i] = '1'
  return {
    v: 1,
    presetId: 'field',
    specimens: specimens.join(''),
    revealed: '0'.repeat(total),
    marked: '0'.repeat(total),
    status: 'digging',
    disturbedAt: null,
    elapsedMs: 0,
    runningSince: null,
  }
}

/** Mount against a REAL registry window (the mirror needs a live record). */
function mountWindowed(preseed?: unknown) {
  const windowId = openApp('specimen-survey')!
  if (preseed !== undefined) {
    act(() => {
      useWMStore.getState().setWindowAppState(windowId, preseed)
    })
  }
  const view = render(
    <SpecimenSurveySurface windowId={windowId} launch={{ source: 'launcher' }} />,
  )
  return { windowId, view }
}

const plot = (index: number | string): HTMLElement => {
  const el = document.querySelector(`[data-survey-plot="${index}"]`)
  if (!(el instanceof HTMLElement)) throw new Error(`plot ${index} not rendered`)
  return el
}

const plots = (): NodeListOf<HTMLElement> => document.querySelectorAll('[data-survey-plot]')

const status = (): string =>
  document.querySelector('[data-survey-status]')!.textContent ?? ''

const readout = (kind: string): string =>
  document.querySelector(`[data-survey-readout="${kind}"]`)!.textContent ?? ''

/** Narrow fake timers: the timer seams + the clock the dig reads (notepad's
 *  discipline, plus Date so advanceTimersByTime moves the epoch the model
 *  anchors to). */
const useSurveyTimers = (): void => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
}

/* ------------------------------- the manifest ------------------------------ */

describe('survey · registration manifest', () => {
  it('declares the brief\'s identity: id, name, MULTI-instance, geometry, no file types', () => {
    expect(specimenSurveyApp.id).toBe('specimen-survey')
    expect(specimenSurveyApp.name).toBe('Specimen Survey')
    expect(specimenSurveyApp.singleton).toBeUndefined() // one dig per launcher open
    expect(specimenSurveyApp.acceptedFileTypes).toBeUndefined()
    expect(specimenSurveyApp.defaultGeometry).toEqual({ w: 520, h: 560 })
  })

  it('mounts a LAZY surface (own chunk) and a render-only icon', () => {
    expect(resetLazyMount(specimenSurveyApp.mount)).toBe(true)
    expect(specimenSurveyApp.icon).toBe(SpecimenSurveyIcon)
    const { container } = render(<SpecimenSurveyIcon size={20} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('multi-instance: two launcher opens are two independent digs', () => {
    const first = openApp('specimen-survey')!
    const second = openApp('specimen-survey')!
    expect(first).not.toBe(second)
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(2)
  })
})

/* ------------------------------- the surface ------------------------------- */

describe('survey · the dig site surface', () => {
  it('renders a FIELD field: 64 plots in an ARIA grid of 8 rows, readouts in wells', () => {
    mountWindowed()
    expect(plots()).toHaveLength(64)
    expect(document.querySelectorAll('[data-survey-grid] [role="row"]')).toHaveLength(8)
    expect(document.querySelector('[data-survey-grid]')!.getAttribute('role')).toBe('grid')
    expect(readout('specimens')).toBe('08')
    expect(readout('marks')).toBe('00')
    expect(readout('elapsed')).toBe('00:00')
    expect(status()).toBe('DIG UNDERWAY')
    expect(document.querySelector('[data-survey-well]')!.className).toContain('well')
  })

  it('the preset selector deals the chosen field; the dealt preset is pressed-in', () => {
    mountWindowed()
    expect(
      document.querySelector<HTMLButtonElement>('[data-survey-preset="field"]')!.getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')

    fireEvent.click(document.querySelector('[data-survey-preset="survey"]')!)
    expect(plots()).toHaveLength(144)
    expect(readout('specimens')).toBe('20')
    expect(
      document.querySelector<HTMLButtonElement>('[data-survey-preset="survey"]')!.getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
  })

  it('New Survey reseals the field', () => {
    mountWindowed(bottomRowState())
    fireEvent.click(plot(0)) // open something
    expect(status()).toBe('SURVEY CLEARED')

    fireEvent.click(document.querySelector('[data-survey-new]')!)
    expect(status()).toBe('DIG UNDERWAY')
    expect(plots()).toHaveLength(64)
    for (const el of Array.from(plots())) {
      expect(el.getAttribute('data-state')).toBe('sealed')
    }
  })
})

/* --------------------------- first-click safety ---------------------------- */

describe('survey · the first click is always safe (by construction)', () => {
  it('a fresh board\'s first reveal never disturbs a specimen — the clicked plot opens clear', () => {
    for (const firstPlot of [0, 27, 63]) {
      cleanup()
      mountWindowed()
      fireEvent.click(plot(firstPlot))
      const state = plot(firstPlot).getAttribute('data-state')
      expect(state === 'clear' || state === 'numbered').toBe(true)
      expect(status()).toBe('DIG UNDERWAY')
    }
  })
})

/* ------------------------------ keyboard floor ----------------------------- */

describe('survey · keyboard floor (brief 5: arrows, Enter, F)', () => {
  it('exactly ONE plot is tabbable (roving tabindex) — the seat follows arrow moves', () => {
    mountWindowed()
    const seat = (index: number): number =>
      Array.from(plots()).filter((el) => el.getAttribute('tabIndex') === '0').length === 1 &&
      plot(index).getAttribute('tabIndex') === '0'
        ? index
        : -1
    expect(seat(0)).toBe(0)

    const grid = document.querySelector('[data-survey-grid]')!
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(plot(1))
    expect(seat(1)).toBe(1)

    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(plot(9))
    fireEvent.keyDown(grid, { key: 'End' })
    expect(document.activeElement).toBe(plot(63))
    fireEvent.keyDown(grid, { key: 'Home' })
    expect(document.activeElement).toBe(plot(0))
  })

  it('edges STOP (the explorer\'s law) — no wrap, no scroll', () => {
    mountWindowed()
    plot(0).focus() // the roving seat, as Tab would leave it
    const grid = document.querySelector('[data-survey-grid]')!
    expect(document.activeElement).toBe(plot(0))
    fireEvent.keyDown(grid, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(plot(0)) // stopped at the west edge
    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(plot(0)) // stopped at the north edge
  })

  it('Enter reveals the focused plot; F pins it; a pinned plot refuses Enter', () => {
    mountWindowed()
    const grid = document.querySelector('[data-survey-grid]')!
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    const seat = plot(10)
    expect(document.activeElement).toBe(seat)

    fireEvent.keyDown(seat, { key: 'Enter' })
    expect(['clear', 'numbered']).toContain(seat.getAttribute('data-state'))

    // A fresh plot: F pins it (the brass pin), Enter no longer opens it.
    fireEvent.keyDown(grid, { key: 'End' })
    const corner = plot(63)
    fireEvent.keyDown(corner, { key: 'f' })
    expect(corner.getAttribute('data-state')).toBe('pinned')
    expect(readout('marks')).toBe('01')
    fireEvent.keyDown(corner, { key: 'Enter' })
    expect(corner.getAttribute('data-state')).toBe('pinned') // the pin is the lock
    fireEvent.keyDown(corner, { key: 'F' }) // uppercase too — and unpins
    expect(corner.getAttribute('data-state')).toBe('sealed')
  })

  it('arrow keys are preventDefaulted — the page never scrolls under the survey', () => {
    mountWindowed()
    const grid = document.querySelector('[data-survey-grid]')!
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    grid.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})

/* ---------------------------- pointer parity ------------------------------- */

describe('survey · pointer parity', () => {
  it('right-click pins (the browser\'s menu never shows)', () => {
    mountWindowed()
    fireEvent.contextMenu(plot(30))
    expect(plot(30).getAttribute('data-state')).toBe('pinned')
  })
})

/* ------------------------------ end states --------------------------------- */

describe('survey · end states are STATIC (reduced-motion identical by construction)', () => {
  it('WIN via the fixture: one click clears the field — status flips, specimens auto-pin, marks read full', () => {
    mountWindowed(bottomRowState())
    fireEvent.click(plot(0))

    expect(status()).toBe('SURVEY CLEARED')
    expect(readout('marks')).toBe('08')
    for (let i = 56; i < 64; i++) expect(plot(i).getAttribute('data-state')).toBe('pinned')
    expect(document.querySelector('[data-survey-surface]')!.getAttribute('data-ended')).toBe('true')
  })

  it('LOSS via the fixture: the disturbed plot wears the static oxide state; every specimen lies open', () => {
    mountWindowed(bottomRowState())
    fireEvent.click(plot(56)) // straight onto a specimen

    expect(status()).toBe('SPECIMEN DISTURBED')
    expect(plot(56).getAttribute('data-state')).toBe('disturbed')
    for (let i = 57; i < 64; i++) expect(plot(i).getAttribute('data-state')).toBe('specimen')
    // The dig is over — further clicks and pins are inert.
    fireEvent.click(plot(3))
    expect(plot(3).getAttribute('data-state')).toBe('sealed')
    fireEvent.contextMenu(plot(3))
    expect(plot(3).getAttribute('data-state')).toBe('sealed')
  })
})

/* --------------------------- appState mirror ------------------------------- */

describe('survey · the dig rides the window record (reload resumes)', () => {
  beforeEach(() => {
    useSurveyTimers()
  })

  it('after the mirror debounce, the record carries the SAME playable board', () => {
    // The bottom-row fixture makes the moves deterministic: plot 48 opens
    // alone (proximity rim — no cascade), plot 12 stays sealed for the pin.
    const { windowId } = mountWindowed(bottomRowState())
    fireEvent.click(plot(48))
    fireEvent.contextMenu(plot(12))

    act(() => {
      vi.advanceTimersByTime(SURVEY_MIRROR_DELAY_MS)
    })
    const persisted = readSurveyState(useWMStore.getState().windows[windowId]!.appState)
    expect(persisted).not.toBeNull()
    expect(persisted!.revealed[48]).toBe(true)
    expect(persisted!.marked[12]).toBe(true)
    expect(persisted!.presetId).toBe('field')
  })

  it('a PRE-SEEDED record resumes the SAME dig (the reload path, mount-time read)', () => {
    // A mid-dig: plot 48 open, plot 10 pinned, the clock anchored recently.
    const state = bottomRowState()
    const revealed = state.revealed.split('')
    revealed[48] = '1'
    const marked = state.marked.split('')
    marked[10] = '1'
    mountWindowed({
      ...state,
      revealed: revealed.join(''),
      marked: marked.join(''),
      elapsedMs: 30_000,
      runningSince: Date.now() - 500,
    })

    expect(plot(48).getAttribute('data-state')).toBe('numbered')
    expect(plot(10).getAttribute('data-state')).toBe('pinned')
    expect(readout('marks')).toBe('01')
    expect(status()).toBe('DIG UNDERWAY')
  })

  it('a HOSTILE record falls back to a fresh FIELD board — never a playable lie', () => {
    mountWindowed({ v: 99, presetId: 'field', specimens: '1'.repeat(64) })
    expect(plots()).toHaveLength(64)
    for (const el of Array.from(plots())) expect(el.getAttribute('data-state')).toBe('sealed')
    expect(readout('elapsed')).toBe('00:00')

    cleanup()
    mountWindowed('not a board at all')
    expect(plots()).toHaveLength(64)
  })

  it('a resumed dig re-anchors the clock — closed time never counts', () => {
    const state = bottomRowState()
    const revealed = state.revealed.split('')
    revealed[48] = '1'
    mountWindowed({
      ...state,
      revealed: revealed.join(''),
      elapsedMs: 30_000,
      runningSince: Date.now() - 500,
    })
    // 30s banked at the mirror; the readout shows 00:30 immediately and only
    // advances from HERE (a fresh anchor), never from a stale epoch.
    expect(readout('elapsed')).toBe('00:30')
  })

  it('the fixture serves exactly ONE window — cleared on its first commit', () => {
    setSurveyTestFixture(bottomRowState())
    mountWindowed()
    fireEvent.click(plot(0))
    expect(status()).toBe('SURVEY CLEARED')
    expect(peekSurveyTestFixture()).toBeNull()
  })
})

/* ------------------------------ the clock ---------------------------------- */

describe('survey · the elapsed readout', () => {
  beforeEach(() => {
    useSurveyTimers()
  })

  it('starts at the first move and ticks up while the dig runs; it freezes at the end', () => {
    mountWindowed(bottomRowState())
    expect(readout('elapsed')).toBe('00:00')

    fireEvent.click(plot(48)) // a rim plot: opens alone, dig runs
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(readout('elapsed')).toBe('00:05')

    fireEvent.click(plot(56)) // disturb: the clock freezes here
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(status()).toBe('SPECIMEN DISTURBED')
    expect(readout('elapsed')).toBe('00:05')
  })
})

/* --------------------------- model seam sanity ----------------------------- */

describe('survey · markPlot parity with the surface', () => {
  it('markPlot is the surface\'s pin (same board law the tests above drove)', () => {
    const board = markPlot(freshSurvey('field'), 12)
    expect(board.marked[12]).toBe(true)
    expect(serializeSurvey(board).marked[11]).toBe('0')
    expect(serializeSurvey(board).marked[12]).toBe('1')
  })
})
