// @vitest-environment jsdom
/**
 * Cursor surface tests (batch 2, brief 4) — the machine's face through its
 * real seams: the manifest's singleton law, the entry line's keyboard floor
 * (Enter prints, Esc clears the line and stands down the guarded Clear),
 * the tape's printed lines (values and refusals), the two-step oxide Clear,
 * and the appState round trip (the tape rides the window record; a hostile
 * payload degrades to a fresh tape, a good one restores verbatim).
 *
 * Assertion style: plain DOM (the fleet ships no jest-dom — the notepad
 * suite's own convention), selectors on the same data-* seams the e2e rides.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { openApp, registerApp, resetAppRegistry, type AppLaunchContext } from '../../platform/app-registry'
import { useWMStore } from '../../platform/stores'
import { cursorApp } from './index'
import CursorSurface from './CursorSurface'

/* ------------------------------ hygiene ----------------------------------- */

const initialWM = useWMStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  registerApp(cursorApp)
})

afterEach(() => {
  cleanup()
  useWMStore.setState(initialWM, true)
})

/** Mount the surface inside a REAL window record (openApp makes the record
 *  the appState seam writes into). */
function mountSurface(): { winId: string } {
  const winId = openApp('cursor')
  if (winId === null) throw new Error('cursor failed to open — not registered?')
  const launch: AppLaunchContext = { source: 'launcher' }
  render(<CursorSurface windowId={winId} launch={launch} />)
  return { winId }
}

/* plain-DOM query helpers over the e2e's own seams */
const q = (attr: string): HTMLElement | null => document.querySelector(`[data-${attr}]`)
const all = (attr: string): HTMLElement[] => Array.from(document.querySelectorAll(`[data-${attr}]`))

const line = (): HTMLInputElement => {
  const el = document.querySelector<HTMLInputElement>('input[data-cursor-input]')
  if (!el) throw new Error('entry line not mounted')
  return el
}

const clearButton = (): HTMLElement => {
  const el = Array.from(document.querySelectorAll('button')).find((b) =>
    /clear the tape|tear the tape/i.test(b.getAttribute('aria-label') ?? ''),
  )
  if (!el) throw new Error('clear control not mounted')
  return el
}

const equalsButton = (): HTMLElement => {
  const el = Array.from(document.querySelectorAll('button')).find((b) =>
    /equals/i.test(b.getAttribute('aria-label') ?? ''),
  )
  if (!el) throw new Error('brass equals key not mounted')
  return el
}

const print = (text: string): void => {
  fireEvent.change(line(), { target: { value: text } })
  fireEvent.keyDown(line(), { key: 'Enter' })
}

/* ------------------------------ the tests ---------------------------------- */

describe('cursor · manifest law', () => {
  it('registers and opens; singleton — a second open is the SAME window', () => {
    const first = openApp('cursor')
    const second = openApp('cursor')
    expect(first).not.toBeNull()
    expect(second).toBe(first)
  })

  it('declares the brief facts: id cursor, name Cursor, singleton, no file types', () => {
    expect(cursorApp.id).toBe('cursor')
    expect(cursorApp.name).toBe('Cursor')
    expect(cursorApp.singleton).toBe(true)
    expect(cursorApp.acceptedFileTypes).toBeUndefined()
    expect(cursorApp.defaultGeometry).toEqual({ w: 400, h: 520 })
  })
})

describe('cursor · the machine face', () => {
  it('mounts with the line focused and the empty-tape note in-world', () => {
    mountSurface()
    expect(line().value).toBe('')
    expect(document.activeElement).toBe(line())
    expect(q('cursor-empty')?.textContent ?? '').toMatch(/tape empty/i)
  })

  it('Enter prints expr = result to the tape and clears the line', () => {
    mountSurface()
    print('2^3^2')
    expect(all('cursor-row')).toHaveLength(1)
    expect(q('cursor-expr')?.textContent).toBe('2^3^2')
    expect(q('cursor-line')?.textContent).toBe('= 512')
    expect(q('cursor-row')?.getAttribute('data-refused')).toBe('false')
    expect(line().value).toBe('')
  })

  it('newest line feeds first; the tape keeps its history', () => {
    mountSurface()
    print('1+1')
    print('2*21')
    const rows = all('cursor-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('42')
    expect(rows[1]?.textContent).toContain('= 2')
  })

  it('refusals print as in-world warning lines, flagged in the DOM', () => {
    mountSurface()
    print('1/0')
    expect(all('cursor-row')[0]?.getAttribute('data-refused')).toBe('true')
    expect(all('cursor-row')[0]?.textContent).toContain('DIVISION BY ZERO')
    print('sqrt(-1)')
    expect(all('cursor-row')[0]?.textContent).toContain('OUT OF DOMAIN')
    print('foo')
    expect(all('cursor-row')[0]?.textContent).toContain('MALFORMED EXPRESSION')
  })

  it('eval-shaped input is refused in the UI too — never executed', () => {
    mountSurface()
    print('eval("alert(1)")')
    const row = all('cursor-row')[0]
    expect(row?.getAttribute('data-refused')).toBe('true')
    expect(row?.textContent).toContain('MALFORMED EXPRESSION')
  })

  it('a blank Enter prints nothing; Esc clears the line', () => {
    mountSurface()
    fireEvent.change(line(), { target: { value: '   ' } })
    fireEvent.keyDown(line(), { key: 'Enter' })
    expect(all('cursor-row')).toHaveLength(0)

    fireEvent.change(line(), { target: { value: '2+2' } })
    fireEvent.keyDown(line(), { key: 'Escape' })
    expect(line().value).toBe('')
    expect(all('cursor-row')).toHaveLength(0) // nothing printed, nothing lost
  })

  it('the brass "=" key prints too, and hands focus back to the line', () => {
    mountSurface()
    fireEvent.change(line(), { target: { value: '6*7' } })
    fireEvent.click(equalsButton())
    expect(all('cursor-row')[0]?.textContent).toContain('42')
    expect(document.activeElement).toBe(line())
  })
})

describe('cursor · the guarded Clear', () => {
  it('arms on the first click, tears the tape on the second, stands down on Esc', () => {
    mountSurface()
    print('1+1')

    const clear = clearButton()
    fireEvent.click(clear)
    expect(clear.getAttribute('data-armed')).toBe('true')
    expect(clear.textContent).toBe('Confirm')
    expect(all('cursor-row')).toHaveLength(1) // armed is a GUARD, not a wipe

    fireEvent.keyDown(line(), { key: 'Escape' }) // the line's first claim: stand down
    expect(clear.getAttribute('data-armed')).toBe('false')
    expect(all('cursor-row')).toHaveLength(1)

    // Esc claims the guard from ANY seat — focus still on the Clear itself
    // must not let the OS close the window out from under an armed guard.
    fireEvent.click(clear)
    expect(clear.getAttribute('data-armed')).toBe('true')
    fireEvent.keyDown(clear, { key: 'Escape' })
    expect(clear.getAttribute('data-armed')).toBe('false')
    expect(all('cursor-row')).toHaveLength(1)

    fireEvent.click(clear)
    fireEvent.click(clear)
    expect(all('cursor-row')).toHaveLength(0)
    expect(q('cursor-empty')).not.toBeNull()
  })
})

describe('cursor · the tape rides the window record (appState)', () => {
  it('every print persists; a remount restores the same tape', () => {
    const { winId } = mountSurface()
    print('2^3^2')
    print('1/0')

    const record = useWMStore.getState().windows[winId]
    const payload = record?.appState as { version?: number; tape?: unknown[] }
    expect(payload.version).toBe(1)
    expect(payload.tape).toHaveLength(2)

    // a remount (minimize/restore, or a reload re-mounting the surface) reads
    // the same tape back off the window record
    cleanup()
    const launch: AppLaunchContext = { source: 'launcher' }
    render(<CursorSurface windowId={winId} launch={launch} />)
    const rows = all('cursor-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('DIVISION BY ZERO')
    expect(rows[1]?.textContent).toContain('512')
  })

  it('a hostile appState degrades to a fresh tape, never a crash', () => {
    const winId = openApp('cursor')
    if (winId === null) throw new Error('cursor failed to open')
    useWMStore.getState().setWindowAppState(winId, {
      version: 1,
      tape: [{ id: 1, expr: '2+2', line: '4', refused: 'yes' }],
    })
    cleanup()
    const launch: AppLaunchContext = { source: 'launcher' }
    render(<CursorSurface windowId={winId} launch={launch} />)
    expect(all('cursor-row')).toHaveLength(0)
    expect(q('cursor-empty')).not.toBeNull()
  })
})
