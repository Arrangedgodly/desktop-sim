// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useWMStore, type WindowGeometry, type WindowId } from '../stores/wm-store'
import { WindowHost } from './WindowHost'

// Stores are module singletons — snapshot the pristine state (actions bound) and
// hard-reset before each test (same pattern as the store-layer suites).
const initialWM = useWMStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
})

afterEach(cleanup)

const GEOM: WindowGeometry = { x: 40, y: 30, w: 480, h: 320 }
const VIEWPORT = { w: 800, h: 600 }

// Store mutations outside React event handlers must run inside act() so the
// host's useSyncExternalStore subscription flushes synchronously in tests.
function actWM(fn: () => void): void {
  act(fn)
}

function open(title: string, geometry?: WindowGeometry): WindowId {
  let id: WindowId = ''
  actWM(() => {
    id = useWMStore.getState().openWindow({
      appId: title.toLowerCase(),
      title,
      ...(geometry ? { geometry } : {}),
    })
  })
  return id
}

function renderHost(contentFor?: (appId: string) => ReactNode) {
  return render(
    <WindowHost
      viewport={VIEWPORT}
      {...(contentFor ? { contentFor: (win) => contentFor(win.appId) } : {})}
    />,
  )
}

function dialogByName(name: string): HTMLElement {
  return screen.getByRole('dialog', { name })
}

function zIndexOf(el: HTMLElement): number {
  return Number(el.style.zIndex)
}

describe('WindowHost · registry rendering', () => {
  it('renders one dialog per open window, in stacking order, each labelled by its title', () => {
    renderHost()
    const alpha = open('Alpha')
    const beta = open('Beta')

    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(2)
    expect(dialogs.map((d) => d.getAttribute('data-window-id'))).toEqual([alpha, beta])
    expect(dialogByName('Alpha')).toBeTruthy()
    expect(dialogByName('Beta')).toBeTruthy()
  })

  it('gives newly opened windows the default cascade placement (offset per window)', () => {
    // Default jsdom viewport (1024×768) so the 720px-wide default geometry fits unclamped.
    render(<WindowHost />)
    open('Alpha')
    open('Beta')

    const alpha = dialogByName('Alpha')
    const beta = dialogByName('Beta')
    expect(alpha.style.left).toBe('96px')
    expect(beta.style.left).toBe('128px') // +32 cascade step
    expect(beta.style.top).toBe(`${Number(alpha.style.top.replace('px', '')) + 32}px`)
  })

  it('renders an empty host (no stray chrome) when no windows are open', () => {
    const { container } = renderHost()
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
    expect(container.querySelector('[data-wm-host]')).toBeTruthy()
  })
})

describe('WindowHost · stacking + focus', () => {
  it('derives stacking from z: the later/raised window carries the greater inline z-index', () => {
    renderHost()
    const alpha = open('Alpha')
    open('Beta')

    expect(zIndexOf(dialogByName('Alpha'))).toBeLessThan(zIndexOf(dialogByName('Beta')))

    actWM(() => useWMStore.getState().focusWindow(alpha))
    expect(zIndexOf(dialogByName('Alpha'))).toBeGreaterThan(zIndexOf(dialogByName('Beta')))
  })

  it('moves DOM focus to the window on open', () => {
    renderHost()
    open('Alpha')
    expect(document.activeElement).toBe(dialogByName('Alpha'))

    open('Beta')
    expect(document.activeElement).toBe(dialogByName('Beta'))
  })

  it('pointer-down anywhere on a window raises + focuses it (click-anywhere focus)', () => {
    renderHost()
    open('Alpha')
    open('Beta')

    const alpha = dialogByName('Alpha')
    fireEvent.pointerDown(alpha)

    expect(alpha.getAttribute('data-focused')).toBe('true')
    expect(dialogByName('Beta').getAttribute('data-focused')).toBe('false')
    expect(zIndexOf(alpha)).toBeGreaterThan(zIndexOf(dialogByName('Beta')))
    expect(document.activeElement).toBe(alpha)
    // Status LED follows focus.
    expect(alpha.querySelector('.wm-led')!.getAttribute('data-lit')).toBe('true')
  })
})

describe('WindowHost · minimize (IM-4c restore seam)', () => {
  it('minimize hides the window, keeps it registered, and hands focus to the next window', () => {
    renderHost()
    const alphaId = open('Alpha')
    open('Beta')

    const alpha = dialogByName('Alpha')
    fireEvent.pointerDown(alpha) // raise + focus Alpha
    fireEvent.click(within(alpha).getByRole('button', { name: 'Minimize' }))

    expect(alpha.getAttribute('data-minimized')).toBe('true') // CSS: display none
    expect(useWMStore.getState().windows[alphaId]!.minimized).toBe(true)
    expect(document.activeElement).toBe(dialogByName('Beta'))
  })

  it('restoreWindow (the taskbar seam) un-hides, raises and focuses', () => {
    renderHost()
    const alpha = open('Alpha')
    open('Beta')
    actWM(() => useWMStore.getState().minimizeWindow(alpha))

    actWM(() => useWMStore.getState().restoreWindow(alpha))

    const el = dialogByName('Alpha')
    expect(el.getAttribute('data-minimized')).toBe('false')
    expect(zIndexOf(el)).toBeGreaterThan(zIndexOf(dialogByName('Beta')))
    expect(document.activeElement).toBe(el)
  })
})

describe('WindowHost · maximize (flag-only geometry)', () => {
  it('maximize derives viewport bounds; restoring returns the normal geometry', () => {
    renderHost()
    const alphaId = open('Alpha', GEOM)

    const alpha = dialogByName('Alpha')
    fireEvent.click(within(alpha).getByRole('button', { name: 'Maximize' }))

    expect(alpha.getAttribute('data-maximized')).toBe('true')
    expect(alpha.style.left).toBe('0px')
    expect(alpha.style.top).toBe('0px')
    expect(alpha.style.width).toBe('800px')
    expect(alpha.style.height).toBe('600px')
    // Stored normal-state geometry is untouched (IM-2 contract).
    expect(useWMStore.getState().windows[alphaId]!.geometry).toEqual(GEOM)

    fireEvent.click(within(alpha).getByRole('button', { name: 'Restore' }))
    expect(alpha.getAttribute('data-maximized')).toBe('false')
    expect(alpha.style.left).toBe('40px')
    expect(alpha.style.width).toBe('480px')
  })
})

describe('WindowHost · close + content slot', () => {
  it('close removes the window from the host and focuses the survivor', () => {
    renderHost()
    open('Alpha')
    open('Beta')

    fireEvent.click(within(dialogByName('Alpha')).getByRole('button', { name: 'Close' }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('dialog', { name: 'Alpha' })).toBeNull()
    expect(document.activeElement).toBe(dialogByName('Beta'))
  })

  it('renders contentFor nodes inside the window content slot', () => {
    renderHost((appId) => <p data-testid="slot">{`content:${appId}`}</p>)
    open('Alpha')

    expect(screen.getByTestId('slot').textContent).toBe('content:alpha')
  })

  it('renders a placeholder label naming the app when no resolver is given', () => {
    renderHost()
    open('Alpha')

    const alpha = dialogByName('Alpha')
    expect(within(alpha).getByText('alpha')).toBeTruthy()
    expect(within(alpha).getByText(/IM-3 app registry/)).toBeTruthy()
  })
})

describe('WindowHost · viewport clamp', () => {
  it('clamps offscreen stored geometry into the viewport at render', () => {
    renderHost()
    const id = open('Far', { x: -300, y: -200, w: 2000, h: 1500 })

    const far = dialogByName('Far')
    expect(far.style.left).toBe('0px')
    expect(far.style.top).toBe('0px')
    expect(far.style.width).toBe('800px')
    expect(far.style.height).toBe('600px')

    // The same clamp applies when a gesture commits an offscreen position (IM-4b path).
    actWM(() => useWMStore.getState().commitWindowGeometry(id, { x: 790, y: 590, w: 480, h: 320 }))
    expect(far.style.left).toBe('320px') // 800 - 480
    expect(far.style.top).toBe('280px') // 600 - 320
  })
})

/* ------------------- HU-2 · offscreen recovery + close veto ------------------ */

describe('WindowHost · HU-2 (f) offscreen window recovery on hydrate', () => {
  it('commits the clamped geometry into the STORE when a hydrated window sits outside the viewport', () => {
    renderHost()
    // A window saved on a 2560×1600 monitor, restored into an 800×600 viewport.
    const saved = {
      id: 'saved-offscreen',
      appId: 'notepad',
      instanceId: 'file:spc-1',
      geometry: { x: 2000, y: 1200, w: 1600, h: 1200 },
      z: 1,
      minimized: false,
      maximized: false,
      title: 'FIELD NOTES.TXT',
      openedAt: 1,
    }
    actWM(() => useWMStore.getState().hydrate({ windows: [saved] }))

    // The STORE record itself is recovered — persisted geometry, drag math and
    // the rendered frame now agree (no teleport on the first title-bar grab).
    expect(useWMStore.getState().windows['saved-offscreen']!.geometry).toEqual({
      x: 0,
      y: 0,
      w: 800,
      h: 600,
    })
    // And the recovery is what a persisted reload would carry forward.
    const dialog = dialogByName('FIELD NOTES.TXT')
    expect(dialog.style.left).toBe('0px')
    expect(dialog.style.width).toBe('800px')
  })

  it('leaves on-screen windows untouched (no recovery commits, geometry verbatim)', () => {
    renderHost()
    const id = open('Near', { x: 100, y: 80, w: 480, h: 320 })
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({
      x: 100,
      y: 80,
      w: 480,
      h: 320,
    })
  })

  it('recovers a minimized window too (its restore must land on-screen)', () => {
    renderHost()
    const saved = {
      id: 'stowed-offscreen',
      appId: 'notepad',
      instanceId: 'auto:stowed-offscreen',
      geometry: { x: 4000, y: 2400, w: 720, h: 480 },
      z: 1,
      minimized: true,
      maximized: false,
      title: 'Stowed',
      openedAt: 1,
    }
    actWM(() => useWMStore.getState().hydrate({ windows: [saved] }))
    expect(useWMStore.getState().windows['stowed-offscreen']!.geometry).toEqual({
      x: 80, // 800 − 720
      y: 120, // 600 − 480
      w: 720,
      h: 480,
    })
  })
})

describe('WindowHost · HU-2 (a) close-request veto seam', () => {
  it('the title-bar ✕ asks the close guard first: a veto keeps the window open', () => {
    const vetoes = new Set<string>()
    render(<WindowHost viewport={VIEWPORT} closeGuard={(win) => vetoes.has(win.id)} />)
    const id = open('guarded')
    vetoes.add(id)

    fireEvent.click(within(dialogByName('guarded')).getByRole('button', { name: 'Close' }))
    expect(useWMStore.getState().windows[id]).toBeDefined() // vetoed — still open

    vetoes.delete(id)
    fireEvent.click(within(dialogByName('guarded')).getByRole('button', { name: 'Close' }))
    expect(useWMStore.getState().windows[id]).toBeUndefined() // no veto → closed
  })

  it('an unclaimed Esc rides the same seam (veto honored, then close)', () => {
    let veto = true
    cleanup()
    render(<WindowHost viewport={VIEWPORT} closeGuard={() => veto} />)
    const id = open('guarded')

    fireEvent.keyDown(dialogByName('guarded'), { key: 'Escape' })
    expect(useWMStore.getState().windows[id]).toBeDefined() // vetoed

    veto = false
    fireEvent.keyDown(dialogByName('guarded'), { key: 'Escape' })
    expect(useWMStore.getState().windows[id]).toBeUndefined() // closed
  })

  it('no closeGuard prop = the default contract: ✕ closes immediately', () => {
    renderHost()
    const id = open('plain')
    fireEvent.click(within(dialogByName('plain')).getByRole('button', { name: 'Close' }))
    expect(useWMStore.getState().windows[id]).toBeUndefined()
  })
})
