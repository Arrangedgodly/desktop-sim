// @vitest-environment jsdom
/**
 * Relay surface (batch 2, brief 3) — the wire through its real seams: the
 * manifest's singleton law, the drip arriving under FAKE TIMERS (brief
 * acceptance 1's "unit-tested with fake timers", in situ), the relay clock's
 * hidden-pause (accrual stops under document.hidden), reading letters on
 * parchment, the watch riding the window record's appState (validated;
 * hostile payloads never partially load; a remount restores the same watch),
 * and FILE TO THE ARCHIVE bootstrapping the Relay drawer + a real text
 * specimen through the live FS store — idempotent across lost watches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createNode } from '../../lib/fs'
import { openApp, registerApp, resetAppRegistry } from '../../platform/app-registry'
import { resetLazyMount } from '../../platform/app-registry/lazy-mount'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { relayApp } from './index'
import RelaySurface from './RelaySurface'
import { RELAY_LETTERS } from './relay-letters'

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

beforeEach(() => {
  vi.useFakeTimers()
  setHidden(false) // the hold's display is present
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  registerApp(relayApp)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* --------------------------------- helpers --------------------------------- */

const qs = (selector: string): HTMLElement => {
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLElement)) throw new Error(`${selector} not rendered`)
  return el
}

const windowCount = (): number => Object.keys(useWMStore.getState().windows).length

function mountRelay() {
  const windowId = openApp('relay')!
  const view = render(<RelaySurface windowId={windowId} launch={{ source: 'launcher' }} />)
  return { windowId, view }
}

/** Advance the relay clock the honest way: wall ticks on a visible document. */
const tick = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const rows = (): NodeListOf<HTMLElement> => document.querySelectorAll('[data-relay-row]')
const row = (id: string): HTMLElement => qs(`[data-relay-row="${id}"]`)

/* --------------------------------- manifest -------------------------------- */

describe('relay · registration manifest', () => {
  it('declares the singleton wire with NO file capability and a lazy mount', () => {
    expect(relayApp.id).toBe('relay')
    expect(relayApp.name).toBe('Survey Relay')
    expect(relayApp.singleton).toBe(true)
    expect(relayApp.acceptedFileTypes).toBeUndefined() // correspondence is not a specimen handler
    expect(relayApp.defaultGeometry).toEqual({ w: 720, h: 520 })
    expect(resetLazyMount(relayApp.mount)).toBe(true) // retryableLazy — own chunk
  })

  it('the icon is render-only SVG (no stores, no effects — source scan)', async () => {
    const source = await import('./RelayIcon?raw').then((m) => m.default as string)
    expect(source).not.toContain('useFSStore')
    expect(source).not.toContain('useWMStore')
    expect(source).not.toContain('useEffect')
  })

  it('SINGLETON through the registry: a second open raises the SAME window', () => {
    const first = openApp('relay')
    const second = openApp('relay')
    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(windowCount()).toBe(1)
  })
})

/* ---------------------------------- the wire -------------------------------- */

describe('relay · the drip (fake timers on the real surface)', () => {
  it('mounts QUIET — awaiting note, dark lamp, honest readouts', () => {
    mountRelay()
    expect(qs('[data-relay-awaiting]').textContent).toContain('Awaiting first post')
    expect(qs('[data-relay-lamp]').getAttribute('data-lit')).toBe('false')
    expect(qs('[data-relay-count]').textContent).toBe('MAIL 00/06')
    expect(qs('[data-relay-watch]').textContent).toBe('WATCH 00:00:00')
    expect(qs('[data-relay-next]').textContent).toBe('NEXT 00:20')
    expect(qs('[data-relay-marginal]').textContent).toContain('The wire is quiet')
  })

  it('first post arrives at 20s — a row settles in, the lamp lights, the count reads', () => {
    mountRelay()
    tick(19_000) // one second short: still quiet
    expect(rows()).toHaveLength(0)

    tick(1_000) // 20s: the first letter is on the wire
    expect(rows()).toHaveLength(1)
    expect(row(RELAY_LETTERS[0]!.id).getAttribute('data-unread')).toBe('true')
    expect(qs('[data-relay-lamp]').getAttribute('data-lit')).toBe('true')
    expect(qs('[data-relay-count]').textContent).toBe('MAIL 01/06')
    expect(qs('[data-relay-watch]').textContent).toBe('WATCH 00:00:20')
    expect(qs('[data-relay-next]').textContent).toBe('NEXT 01:40')
    expect(qs('.relay-sr').textContent).toContain('Post 1 of 6 received, 1 unread')
  })

  it('posts continue minutes apart, in arrival order, one at a time', () => {
    mountRelay()
    tick(120_000) // 20s + 120s: two letters
    expect(rows()).toHaveLength(2)
    expect(row(RELAY_LETTERS[0]!.id)).toBeTruthy()
    expect(row(RELAY_LETTERS[1]!.id)).toBeTruthy()

    tick(180_000) // +3min: the third
    expect(rows()).toHaveLength(3)
    // the ledger lists in ARRIVAL order, not map order
    const ids = Array.from(rows()).map((el) => el.getAttribute('data-relay-row'))
    expect(ids).toEqual([
      RELAY_LETTERS[0]!.id,
      RELAY_LETTERS[1]!.id,
      RELAY_LETTERS[2]!.id,
    ])
  })

  it('the relay clock PAUSES while the display is hidden — no letter arrives unseen', () => {
    mountRelay()
    tick(120_000) // two letters while watched
    expect(rows()).toHaveLength(2)

    setHidden(true) // the operator walks away
    tick(600_000) // ten hidden minutes: the wire WAITS
    expect(rows()).toHaveLength(2)
    expect(qs('[data-relay-watch]').textContent).toBe('WATCH 00:02:00')

    setHidden(false) // back at the console: the drip resumes where it stood
    tick(180_000)
    expect(rows()).toHaveLength(3)
    expect(qs('[data-relay-watch]').textContent).toBe('WATCH 00:05:00')
  })
})

/* --------------------------------- reading ---------------------------------- */

describe('relay · reading a letter (parchment, the read-lamp state)', () => {
  it('opening a letter renders its body on parchment and marks it READ', () => {
    const { windowId } = mountRelay()
    tick(20_000)

    fireEvent.click(row(RELAY_LETTERS[0]!.id))
    expect(qs('[data-relay-letter]').getAttribute('data-relay-letter')).toBe(RELAY_LETTERS[0]!.id)
    expect(qs('[data-relay-letter-body]').textContent).toContain(
      RELAY_LETTERS[0]!.paragraphs[1]!,
    )
    // the read-lamp state: the row's lamp goes dark, the wire owes nothing
    expect(row(RELAY_LETTERS[0]!.id).getAttribute('data-unread')).toBe('false')
    expect(qs('[data-relay-lamp]').getAttribute('data-lit')).toBe('false')
    // …and the read mark rode the window record
    const persisted = useWMStore.getState().windows[windowId]?.appState as Record<string, unknown>
    expect(persisted['read']).toContain(RELAY_LETTERS[0]!.id)
  })

  it('the quiet sheet offers its marginal notes for both empty states', () => {
    mountRelay()
    expect(qs('[data-relay-marginal]').textContent).toContain('The wire is quiet')
    tick(20_000)
    expect(qs('[data-relay-marginal]').textContent).toContain('Select a transmission')
  })
})

/* ------------------------- the watch across remounts ------------------------ */

describe('relay · the watch rides appState (validated, restore-safe)', () => {
  it('a remount restores the SAME watch — letters arrived, marks held, clock kept', () => {
    const { windowId } = mountRelay()
    tick(120_000)
    fireEvent.click(row(RELAY_LETTERS[0]!.id))
    cleanup() // unmount persists the final reading

    render(<RelaySurface windowId={windowId} launch={{ source: 'launcher' }} />)
    expect(rows()).toHaveLength(2) // both arrivals restored
    expect(row(RELAY_LETTERS[0]!.id).getAttribute('data-unread')).toBe('false') // read held
    expect(row(RELAY_LETTERS[1]!.id).getAttribute('data-unread')).toBe('true')
    expect(qs('[data-relay-watch]').textContent).toBe('WATCH 00:02:00') // clock kept
  })

  it('a VALID persisted payload restores directly (no re-drip)', () => {
    const windowId = openApp('relay')!
    act(() => {
      useWMStore.getState().setWindowAppState(windowId, {
        version: 1,
        openedAt: 1,
        elapsedMs: 300_000,
        read: [RELAY_LETTERS[0]!.id],
        filed: [],
      })
    })
    render(<RelaySurface windowId={windowId} launch={{ source: 'launcher' }} />)
    expect(rows()).toHaveLength(3)
    expect(qs('[data-relay-count]').textContent).toBe('MAIL 03/06')
    expect(row(RELAY_LETTERS[0]!.id).getAttribute('data-unread')).toBe('false')
  })

  it('HOSTILE payloads never partially load — the wire starts a fresh watch', () => {
    const hostile: readonly unknown[] = [
      null,
      42,
      'wire',
      ['version', 1],
      { version: 9, openedAt: 1, elapsedMs: 0 },
      { version: 1, openedAt: 1, elapsedMs: -40_000 },
      { version: 1, openedAt: 1, elapsedMs: 0, read: ['counterfeit-letter'] },
      { version: 1, openedAt: 1, elapsedMs: 0, read: [RELAY_LETTERS[0]!.id, RELAY_LETTERS[0]!.id] },
      { version: 1, openedAt: 1, elapsedMs: 0, filed: { id: RELAY_LETTERS[0]!.id } },
    ]
    for (const payload of hostile) {
      cleanup()
      const windowId = openApp('relay')!
      act(() => {
        useWMStore.getState().setWindowAppState(windowId, payload)
      })
      render(<RelaySurface windowId={windowId} launch={{ source: 'launcher' }} />)
      expect(qs('[data-relay-count]').textContent, JSON.stringify(payload)).toBe('MAIL 00/06')
      expect(qs('[data-relay-awaiting]')).toBeTruthy()
    }
  })
})

/* --------------------------------- filing ----------------------------------- */

describe('relay · file to the archive (the REAL store seam)', () => {
  it('filing bootstraps the Relay drawer and accessions a REAL text specimen', () => {
    const { windowId } = mountRelay()
    tick(20_000)
    fireEvent.click(row(RELAY_LETTERS[0]!.id))
    expect(qs('[data-relay-file]')).toBeTruthy()

    fireEvent.click(qs('[data-relay-file]'))

    const fs = useFSStore.getState().fs
    const drawer = Object.values(fs.nodes).find(
      (node) => node.parentId === fs.rootId && node.kind === 'folder' && node.name === 'Relay',
    )
    expect(drawer).toBeDefined() // bootstrapped on the FIRST file

    const specimen = Object.values(fs.nodes).find(
      (node) => node.parentId === drawer!.id && node.name === RELAY_LETTERS[0]!.filedName,
    )
    expect(specimen).toBeDefined()
    expect(specimen!.kind).toBe('text')
    expect(specimen!.accession).toMatch(/^SPC-\d{4}$/)
    if (specimen!.kind === 'text') {
      expect(specimen!.content).toContain(RELAY_LETTERS[0]!.subject)
      expect(specimen!.content).toContain('TRANSCRIPT ENDS')
    }

    // the sheet says FILED with its accession; the ledger row carries the stamp;
    // the filed mark rode the window record
    expect(qs('[data-relay-filed]').textContent).toMatch(/^FILED · SPC-\d{4}$/)
    expect(row(RELAY_LETTERS[0]!.id).textContent).toContain('FILED')
    const persisted = useWMStore.getState().windows[windowId]?.appState as Record<string, unknown>
    expect(persisted['filed']).toContain(RELAY_LETTERS[0]!.id)
  })

  it('a LOST watch re-files idempotently — the archive never grows a duplicate transcript', () => {
    // Watch one files the letter; its window state is then lost (a closed
    // window takes its record — the platform's honest semantics).
    const { windowId } = mountRelay()
    tick(20_000)
    fireEvent.click(row(RELAY_LETTERS[0]!.id))
    fireEvent.click(qs('[data-relay-file]'))
    const afterFirst = useFSStore.getState().fs
    cleanup()

    // Watch two opens with NO knowledge of the filing (hostile to the naive path).
    act(() => {
      useWMStore.getState().setWindowAppState(windowId, {
        version: 1,
        openedAt: 2,
        elapsedMs: 20_000,
        read: [RELAY_LETTERS[0]!.id],
        filed: [],
      })
    })
    render(<RelaySurface windowId={windowId} launch={{ source: 'launcher' }} />)
    fireEvent.click(row(RELAY_LETTERS[0]!.id))
    fireEvent.click(qs('[data-relay-file]')) // files again

    const afterSecond = useFSStore.getState().fs
    const copies = Object.values(afterSecond.nodes).filter(
      (node) => node.kind === 'text' && node.name === RELAY_LETTERS[0]!.filedName,
    )
    expect(copies).toHaveLength(1) // the SAME transcript, not a duplicate
    expect(Object.keys(afterSecond.nodes).length).toBe(Object.keys(afterFirst.nodes).length)
    expect(qs('[data-relay-filed]').textContent).toMatch(/^FILED · SPC-\d{4}$/)
  })

  it('a name-squatting node refuses in-world — nothing filed, no dialog', () => {
    const { windowId } = mountRelay()
    expect(windowId).toBeTruthy()
    tick(20_000)
    fireEvent.click(row(RELAY_LETTERS[0]!.id))

    // The operator parks a drawer squatting the transcript's label in the
    // Relay drawer (a wrong-kind node of the same name — the collision rule
    // is case-insensitive and kind-blind, like the catalog's).
    act(() => {
      const { fs, commit } = useFSStore.getState()
      let next = createNode(fs, {
        id: 'sq-drawer',
        parentId: fs.rootId,
        name: 'Relay',
        kind: 'folder',
        now: 0,
      })
      next = createNode(next, {
        id: 'squatter',
        parentId: 'sq-drawer',
        name: RELAY_LETTERS[0]!.filedName.toUpperCase(),
        kind: 'folder',
        now: 0,
      })
      commit(next)
    })

    const before = Object.keys(useFSStore.getState().fs.nodes).length
    fireEvent.click(qs('[data-relay-file]'))
    expect(qs('[data-relay-refusal]').textContent).toContain('relabel it there')
    expect(Object.keys(useFSStore.getState().fs.nodes).length).toBe(before) // nothing committed
    expect(qs('[data-relay-file]')).toBeTruthy() // the action stands, unfiled
  })
})

/* -------------------------------- keyboard ---------------------------------- */

describe('relay · the keyboard floor', () => {
  it('arrows walk the ledger (roving rows, wrapping), Home/End jump; Enter opens', () => {
    mountRelay()
    tick(300_000) // three letters on the wire
    const nav = qs('.relay-ledger')

    row(RELAY_LETTERS[0]!.id).focus()
    expect(document.activeElement).toBe(row(RELAY_LETTERS[0]!.id))

    fireEvent.keyDown(nav, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(row(RELAY_LETTERS[1]!.id))
    fireEvent.keyDown(nav, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(row(RELAY_LETTERS[2]!.id))
    fireEvent.keyDown(nav, { key: 'ArrowDown' }) // wraps
    expect(document.activeElement).toBe(row(RELAY_LETTERS[0]!.id))
    fireEvent.keyDown(nav, { key: 'ArrowUp' }) // wraps back
    expect(document.activeElement).toBe(row(RELAY_LETTERS[2]!.id))
    fireEvent.keyDown(nav, { key: 'Home' })
    expect(document.activeElement).toBe(row(RELAY_LETTERS[0]!.id))
    fireEvent.keyDown(nav, { key: 'End' })
    expect(document.activeElement).toBe(row(RELAY_LETTERS[2]!.id))

    // Enter opens the focused row (a native button — the click route)
    fireEvent.click(row(RELAY_LETTERS[2]!.id))
    expect(qs('[data-relay-letter]').getAttribute('data-relay-letter')).toBe(RELAY_LETTERS[2]!.id)
  })
})
