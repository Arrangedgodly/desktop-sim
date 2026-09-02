// @vitest-environment jsdom
// Taskbar rail (IM-4c), component-level: the LED strip mirrors the open-window
// registry (multi-instance suffixes, focused/minimized states, the IM-3
// module-unavailable state), clicks restore/toggle, the launcher lists the
// REGISTRY (never a hardcoded roster) and launches through openApp, the drawer
// closes on Esc/outside/Tab with keyboard roving inside, and the rail marks
// the taskbar-ready milestone exactly once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useWMStore } from '../stores/wm-store'
import {
  openApp,
  registerApp,
  resetAppRegistry,
  unregisterApp,
} from '../app-registry'
import { readBootTimeline, resetBootTimeline } from '../../lib/perf/boot-timeline'
import { DemoIcon } from '../../apps/demo/DemoIcon'
import { TaskbarRail } from './TaskbarRail'

/* ------------------------------ fixtures --------------------------------- */

const probeApp = {
  id: 'probe',
  name: 'Probe Module',
  icon: DemoIcon,
  mount: () => null,
} as const

const singleApp = {
  id: 'single',
  name: 'Singleton Module',
  icon: DemoIcon,
  mount: () => null,
  singleton: true,
} as const

const goneApp = {
  id: 'gone',
  name: 'Departed Module',
  icon: DemoIcon,
  mount: () => null,
} as const

/* ------------------------- store/module hygiene --------------------------- */

const initialWM = useWMStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  registerApp(probeApp)
  registerApp(singleApp)
  resetBootTimeline()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* ------------------------------ helpers ---------------------------------- */

function leds(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-window-led]'))
}

function ledByApp(appId: string): HTMLElement {
  const el = document.querySelector(`[data-window-led][data-app-id="${appId}"]`)
  if (!(el instanceof HTMLElement)) throw new Error(`no LED for app "${appId}"`)
  return el
}

function pull(): HTMLElement {
  return screen.getByRole('button', { name: 'Module drawer — launch a module' })
}

function menu(): HTMLElement {
  const el = document.querySelector('[data-launcher-menu]')
  if (!(el instanceof HTMLElement)) throw new Error('launcher menu not open')
  return el
}

function openWindow(appId: string): string {
  const id = openApp(appId)
  if (id === null) throw new Error(`openApp(${appId}) returned null`)
  return id
}

/* ------------------------------ tests ------------------------------------ */

describe('TaskbarRail · rail chrome', () => {
  it('renders the HOLD/OS legend, the version chip and a live HH:MM:SS readout', () => {
    render(<TaskbarRail />)

    expect(screen.getByText('HOLD/OS')).toBeDefined()
    const chip = document.querySelector('[data-os-version]')
    expect(chip?.textContent).toMatch(/^v?\d+\.\d+\.\d+$/)
    expect(chip?.textContent).toBe('0.1.0')

    const readout = document.querySelector('[data-timecode]')
    expect(readout?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('marks taskbar-ready exactly once (StrictMode-style double mount)', () => {
    render(<TaskbarRail />)
    cleanup()
    render(<TaskbarRail />)

    expect(readBootTimeline().filter((m) => m.name === 'taskbar-ready')).toHaveLength(1)
  })
})

describe('TaskbarRail · open-window LEDs', () => {
  it('no open windows, no LEDs', () => {
    render(<TaskbarRail />)
    expect(leds()).toHaveLength(0)
  })

  it('the strip mirrors the registry: one LED per window, multi-instance suffixes', () => {
    render(<TaskbarRail />)
    act(() => {
      openWindow('probe')
      openWindow('probe')
      openWindow('single')
    })

    expect(leds()).toHaveLength(3)
    const probeLeds = document.querySelectorAll('[data-window-led][data-app-id="probe"]')
    expect(probeLeds[0]!.textContent).toBe('Probe Module 1')
    expect(probeLeds[1]!.textContent).toBe('Probe Module 2')
    expect(ledByApp('single').textContent).toBe('Singleton Module')
  })

  it('closing a window removes its LED', () => {
    render(<TaskbarRail />)
    let id = ''
    act(() => {
      id = openWindow('probe')
    })
    expect(leds()).toHaveLength(1)

    act(() => {
      useWMStore.getState().closeWindow(id)
    })
    expect(leds()).toHaveLength(0)
  })

  it('focus lights exactly one lamp: data-focused and the lit lamp follow focusedId', () => {
    render(<TaskbarRail />)
    let first = ''
    act(() => {
      first = openWindow('probe')
      openWindow('single') // steals focus
    })

    const probeLed = ledByApp('probe')
    const singleLed = ledByApp('single')
    expect(singleLed.getAttribute('data-focused')).toBe('true')
    expect(singleLed.querySelector('[data-lit="true"]')).not.toBeNull()
    expect(probeLed.getAttribute('data-focused')).toBe('false')
    expect(probeLed.querySelector('[data-lit="true"]')).toBeNull()

    act(() => {
      useWMStore.getState().focusWindow(first)
    })
    expect(probeLed.getAttribute('data-focused')).toBe('true')
    expect(singleLed.getAttribute('data-focused')).toBe('false')
  })

  it('a minimized window keeps its LED, dimmed', () => {
    render(<TaskbarRail />)
    let id = ''
    act(() => {
      id = openWindow('probe')
    })

    act(() => {
      useWMStore.getState().minimizeWindow(id)
    })
    const led = ledByApp('probe')
    expect(led.getAttribute('data-minimized')).toBe('true')
    expect(led.querySelector('.tb-led-lamp')?.getAttribute('data-dim')).toBe('true')
  })

  it('clicking a minimized LED restores + focuses the window', () => {
    render(<TaskbarRail />)
    let id = ''
    act(() => {
      id = openWindow('probe')
    })
    act(() => {
      useWMStore.getState().minimizeWindow(id)
    })

    fireEvent.click(ledByApp('probe'))

    const win = useWMStore.getState().windows[id]
    expect(win?.minimized).toBe(false)
    expect(useWMStore.getState().focusedId).toBe(id)
  })

  it('clicking a background (open, unfocused) LED raises + focuses it', () => {
    render(<TaskbarRail />)
    let first = ''
    act(() => {
      first = openWindow('probe')
      openWindow('single') // steals focus
    })
    expect(useWMStore.getState().focusedId).not.toBe(first)

    fireEvent.click(ledByApp('probe'))

    expect(useWMStore.getState().focusedId).toBe(first)
    expect(useWMStore.getState().zOrder.at(-1)).toBe(first) // raised to the top
  })

  it('clicking the FOCUSED LED stows the window (toggle)', () => {
    render(<TaskbarRail />)
    let id = ''
    act(() => {
      id = openWindow('probe')
    })
    expect(useWMStore.getState().focusedId).toBe(id)

    fireEvent.click(ledByApp('probe'))

    const win = useWMStore.getState().windows[id]
    expect(win?.minimized).toBe(true)
    expect(useWMStore.getState().focusedId).not.toBe(id)
  })

  it('a window whose app unregistered shows the MODULE UNAVAILABLE state', () => {
    registerApp(goneApp)
    render(<TaskbarRail />)
    let id = ''
    act(() => {
      id = openWindow('gone')
    })

    act(() => {
      unregisterApp('gone')
    })

    const led = ledByApp('gone')
    expect(led.textContent).toBe('MODULE UNAVAILABLE')
    expect(led.getAttribute('data-module-unavailable')).toBe('true')
    // the window itself is untouched — still listed, still closable
    expect(useWMStore.getState().windows[id]).toBeDefined()
  })
})

describe('TaskbarRail · module launcher', () => {
  it('the pull opens a drawer listing the REGISTRY (not a hardcoded roster)', () => {
    render(<TaskbarRail />)

    fireEvent.click(pull())
    const items = Array.from(menu().querySelectorAll('[data-launch-app]'))
    expect(items.map((el) => el.getAttribute('data-launch-app'))).toEqual(['probe', 'single'])

    // a late registration lights up without any rail edit — the registry IS the list
    act(() => {
      registerApp(goneApp)
    })
    const after = Array.from(menu().querySelectorAll('[data-launch-app]'))
    expect(after.map((el) => el.getAttribute('data-launch-app'))).toEqual([
      'probe',
      'single',
      'gone',
    ])

    // and an unregistration removes the entry (launcher entries disappear, IM-3)
    act(() => {
      unregisterApp('gone')
    })
    expect(menu().querySelectorAll('[data-launch-app]')).toHaveLength(2)
  })

  it('launching from the drawer opens the app through openApp and closes it', () => {
    render(<TaskbarRail />)
    fireEvent.click(pull())

    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Probe Module' }),
    )

    const windows = Object.values(useWMStore.getState().windows)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.appId).toBe('probe')
    expect(windows[0]!.launch).toEqual({ source: 'launcher' })
    expect(document.querySelector('[data-launcher-menu]')).toBeNull() // drawer closed
  })

  it('a singleton relaunch focuses the existing window instead of duplicating', () => {
    render(<TaskbarRail />)

    fireEvent.click(pull())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Singleton Module' }))
    fireEvent.click(pull())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Singleton Module' }))

    expect(Object.values(useWMStore.getState().windows)).toHaveLength(1)
  })

  it('Escape closes the drawer and returns focus to the pull', () => {
    render(<TaskbarRail />)
    fireEvent.click(pull())
    expect(document.querySelector('[data-launcher-menu]')).not.toBeNull()

    fireEvent.keyDown(menu(), { key: 'Escape' })

    expect(document.querySelector('[data-launcher-menu]')).toBeNull()
    expect(document.activeElement).toBe(pull())
  })

  it('a pointerdown outside the anchor closes the drawer', () => {
    render(<TaskbarRail />)
    fireEvent.click(pull())

    fireEvent.pointerDown(document.body)

    expect(document.querySelector('[data-launcher-menu]')).toBeNull()
  })

  it('arrow keys rove focus through the module list', () => {
    render(<TaskbarRail />)
    fireEvent.click(pull())

    const items = () => Array.from(menu().querySelectorAll('[data-launch-app]'))
    // opening focuses the first item
    expect(document.activeElement).toBe(items()[0])

    fireEvent.keyDown(menu(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items()[1])

    fireEvent.keyDown(menu(), { key: 'ArrowUp' }) // wraps back to the first
    expect(document.activeElement).toBe(items()[0])

    fireEvent.keyDown(menu(), { key: 'End' })
    expect(document.activeElement).toBe(items()[1])

    fireEvent.keyDown(menu(), { key: 'Home' })
    expect(document.activeElement).toBe(items()[0])
  })

  it('Tab walks the rows WITHIN the drawer (a menu keeps its focus; Esc closes)', () => {
    render(<TaskbarRail />)
    fireEvent.click(pull())

    const items = () => Array.from(menu().querySelectorAll('[data-launch-app]'))
    fireEvent.keyDown(menu(), { key: 'Tab' })
    expect(document.activeElement).toBe(items()[1])
    expect(document.querySelector('[data-launcher-menu]')).not.toBeNull() // still open

    fireEvent.keyDown(menu(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(items()[0])
    expect(document.querySelector('[data-launcher-menu]')).not.toBeNull()
  })

  it('an empty registry states its emptiness honestly', () => {
    resetAppRegistry()
    render(<TaskbarRail />)
    fireEvent.click(pull())

    expect(screen.getByText('No modules registered with the archive.')).toBeDefined()
    expect(menu().querySelectorAll('[data-launch-app]')).toHaveLength(0)
  })
})

describe('TaskbarRail · rail keyboard map (DD-1: one toolbar stop, arrow roving)', () => {
  it('the rail announces as a toolbar', () => {
    render(<TaskbarRail />)
    expect(document.querySelector('[data-taskbar]')?.getAttribute('role')).toBe('toolbar')
  })

  it('the pull is the rail\'s tab stop until an arrow lands on an LED (roving tabindex)', () => {
    render(<TaskbarRail />)
    act(() => {
      openWindow('probe')
      openWindow('single')
    })

    const pullEl = pull()
    const probeLed = ledByApp('probe')
    expect(pullEl.getAttribute('tabindex')).toBe('0')
    expect(probeLed.getAttribute('tabindex')).toBe('-1')

    probeLed.focus()
    fireEvent.keyDown(probeLed, { key: 'ArrowLeft' }) // focus → the pull, stop moves
    expect(document.activeElement).toBe(pullEl)
    expect(pullEl.getAttribute('tabindex')).toBe('0')
    expect(probeLed.getAttribute('tabindex')).toBe('-1')

    fireEvent.keyDown(pullEl, { key: 'ArrowRight' }) // focus → probe LED
    expect(document.activeElement).toBe(probeLed)
    expect(probeLed.getAttribute('tabindex')).toBe('0') // the stop roved with it
    expect(pullEl.getAttribute('tabindex')).toBe('-1')
  })

  it('arrows walk pull ↔ LEDs with wrap; Home/End jump the ends', () => {
    render(<TaskbarRail />)
    act(() => {
      openWindow('probe')
      openWindow('single')
    })

    const probeLed = ledByApp('probe')
    const singleLed = ledByApp('single')
    probeLed.focus()

    fireEvent.keyDown(probeLed, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(singleLed)

    fireEvent.keyDown(singleLed, { key: 'ArrowRight' }) // wraps to the pull
    expect(document.activeElement).toBe(pull())

    fireEvent.keyDown(pull(), { key: 'ArrowLeft' }) // wraps back to the last LED
    expect(document.activeElement).toBe(singleLed)

    fireEvent.keyDown(singleLed, { key: 'Home' })
    expect(document.activeElement).toBe(pull())

    fireEvent.keyDown(pull(), { key: 'End' })
    expect(document.activeElement).toBe(singleLed)
  })

  it('LED activation is the native button contract — the click Enter/Space produce (e2e presses the keys for real)', () => {
    // jsdom does not synthesize the click a real browser fires for Enter/Space
    // on a focused button; the contract under test is that the LED IS that
    // button. The keyboard journey (tests/e2e/keyboard.spec.ts) presses Enter
    // on a stowed LED in real Chromium to close the loop.
    render(<TaskbarRail />)
    let id = ''
    act(() => {
      id = openWindow('probe')
    })
    act(() => {
      useWMStore.getState().minimizeWindow(id)
    })
    const led = ledByApp('probe')
    expect(led.tagName).toBe('BUTTON')

    fireEvent.click(led) // what the browser's Enter synthesizes
    expect(useWMStore.getState().windows[id]?.minimized).toBe(false)
    expect(useWMStore.getState().focusedId).toBe(id)

    fireEvent.click(led) // now the FOCUSED LED — the same Enter stows (toggle)
    expect(useWMStore.getState().windows[id]?.minimized).toBe(true)
  })

  it('a closed window takes its roving stop back to the pull', () => {
    render(<TaskbarRail />)
    let first = ''
    act(() => {
      first = openWindow('probe')
      openWindow('single')
    })
    const probeLed = ledByApp('probe')
    pull().focus()
    fireEvent.keyDown(pull(), { key: 'ArrowRight' }) // stop roves onto the first LED
    expect(document.activeElement).toBe(probeLed)
    expect(probeLed.getAttribute('tabindex')).toBe('0')
    expect(pull().getAttribute('tabindex')).toBe('-1')

    act(() => {
      useWMStore.getState().closeWindow(first) // that LED — and its stop — go
    })

    expect(pull().getAttribute('tabindex')).toBe('0')
    expect(document.querySelector('[data-window-led][data-app-id="probe"]')).toBeNull()
  })

  it('the open drawer owns its keys — rail arrows stand down inside it', () => {
    render(<TaskbarRail />)
    act(() => {
      openWindow('probe')
    })
    fireEvent.click(pull())

    const items = () => Array.from(menu().querySelectorAll('[data-launch-app]'))
    expect(document.activeElement).toBe(items()[0])

    fireEvent.keyDown(menu(), { key: 'ArrowLeft' }) // would walk the rail — must not
    expect(document.activeElement).toBe(items()[0])
    expect(document.querySelector('[data-launcher-menu]')).not.toBeNull()
  })
})
