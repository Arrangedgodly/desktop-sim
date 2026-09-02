// @vitest-environment jsdom
// The DD-1 OS keyboard map, end-to-end on the real desktop surface: 2D arrow
// walks on the icon field, Space-select/Enter-open split, keyboard-opened
// ground menu, F6 zone cycling (order + reverse + skip-empty), Alt+Esc window
// walking, Esc-close routing (guards: text entry, claimed keys, app
// precedence), focus-into-window on open, and the last-window focus re-seat.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useFSStore } from '../stores/fs-store'
import { useWMStore } from '../stores/wm-store'
import { useSettingsStore } from '../stores/settings-store'
import { openApp, registerApp, resetAppRegistry } from '../app-registry'
import { DemoIcon } from '../../apps/demo/DemoIcon'
import { DesktopSurface } from '../desktop/DesktopSurface'

vi.mock('../../lib/storage/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/adapter')>()
  return { ...actual, requestPersistentStorage: vi.fn().mockResolvedValue(true) }
})

/* ------------------------------ fixtures --------------------------------- */

/** A plain app: content is a focusable seat, claims nothing. */
function PlainSurface() {
  return <div data-plain-seat tabIndex={-1} aria-label="Plain module seat" />
}

/** An app that CLAIMS Escape (preventDefault, never stops the frame). */
function ClaimingSurface() {
  return (
    <div
      data-claiming-seat
      tabIndex={-1}
      aria-label="Claiming module seat"
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.preventDefault()
      }}
    />
  )
}

/** An app whose content is a text entry — the input-field law's target. */
function TextEntrySurface() {
  return <textarea data-text-entry aria-label="Notes field" />
}

const plainApp = {
  id: 'plain',
  name: 'Plain Module',
  icon: DemoIcon,
  mount: PlainSurface,
} as const

const claimingApp = {
  id: 'claiming',
  name: 'Claiming Module',
  icon: DemoIcon,
  mount: ClaimingSurface,
} as const

const textApp = {
  id: 'texty',
  name: 'Text Module',
  icon: DemoIcon,
  mount: TextEntrySurface,
} as const

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  resetAppRegistry()
  registerApp(plainApp)
  registerApp(claimingApp)
  registerApp(textApp)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* ------------------------------ helpers ---------------------------------- */

function icon(id: string): HTMLElement {
  const el = document.querySelector(`[data-specimen-id="${id}"]`)
  if (!(el instanceof HTMLElement)) throw new Error(`specimen "${id}" not rendered`)
  return el
}

function field(): HTMLElement {
  const el = document.querySelector('[data-icon-field]')
  if (!(el instanceof HTMLElement)) throw new Error('icon field not rendered')
  return el
}

function openWindow(appId: string): string {
  const id = openApp(appId)
  if (id === null) throw new Error(`openApp(${appId}) returned null`)
  return id
}

function activeZone(): string {
  const active = document.activeElement
  if (active?.closest('[data-taskbar]')) return 'taskbar'
  if (active?.closest('[data-wm-host]')) return 'window'
  if (active?.closest('[data-desktop-stage]')) return 'desktop'
  return 'other'
}

const openWindowIds = (): string[] => Object.keys(useWMStore.getState().windows)

/* ------------------------------ tests ------------------------------------ */

describe('DD-1 · desktop arrows + selection keys', () => {
  it('arrows walk the grid 2D: selection AND focus follow', () => {
    render(<DesktopSurface />)
    field().focus()

    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(icon('field-notes'))
    expect(icon('field-notes').getAttribute('data-selected')).toBe('true')

    fireEvent.keyDown(icon('field-notes'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(icon('nameplate'))
    expect(icon('nameplate').getAttribute('data-selected')).toBe('true')

    fireEvent.keyDown(icon('nameplate'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(icon('charter'))

    fireEvent.keyDown(icon('charter'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(icon('projects'))
  })

  it('edges hold focus (no wrap, no fall-through)', () => {
    render(<DesktopSurface />)
    icon('projects').focus()
    fireEvent.keyDown(icon('projects'), { key: 'ArrowLeft' })
    fireEvent.keyDown(icon('projects'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(icon('projects'))
  })

  it('Space does not open (Enter does) — the select-without-opening split', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<DesktopSurface />)
    icon('projects').focus()

    fireEvent.keyDown(icon('projects'), { key: ' ' })
    expect(openWindowIds()).toHaveLength(0) // selection yes (native click), window no

    fireEvent.keyDown(icon('projects'), { key: 'Enter' })
    expect(warn).toHaveBeenCalledTimes(1) // explorer not registered in this suite
    warn.mockRestore()
  })

  it('the Menu key opens the SPECIMEN menu on an icon, the HOLD menu on the ground', () => {
    render(<DesktopSurface />)

    icon('projects').focus()
    fireEvent.keyDown(icon('projects'), { key: 'ContextMenu' })
    const specimenMenu = document.querySelector('[data-menu-root]')
    expect(specimenMenu?.getAttribute('aria-label')).toBe('Specimen menu — Projects')
    fireEvent.keyDown(specimenMenu!, { key: 'Escape' })

    // The recorded gap, closed: the ground has a keyboard-open path now.
    field().focus()
    fireEvent.keyDown(field(), { key: 'ContextMenu' })
    expect(document.querySelector('[data-menu-root]')?.getAttribute('aria-label')).toBe(
      'Hold menu',
    )
  })

  it('Shift+F10 opens both menus too (the floor the Menu key shares)', () => {
    render(<DesktopSurface />)

    field().focus()
    fireEvent.keyDown(field(), { key: 'F10', shiftKey: true })
    expect(document.querySelector('[data-menu-root]')?.getAttribute('aria-label')).toBe(
      'Hold menu',
    )
    fireEvent.keyDown(document.querySelector('[data-menu-root]')!, { key: 'Escape' })

    icon('archive').focus()
    fireEvent.keyDown(icon('archive'), { key: 'F10', shiftKey: true })
    expect(document.querySelector('[data-menu-root]')?.getAttribute('aria-label')).toBe(
      'Specimen menu — Archive',
    )
  })

  it('a live label edit owns its arrows (the input-field law)', () => {
    render(<DesktopSurface />)

    icon('projects').focus()
    fireEvent.contextMenu(icon('projects'))
    const menu = document.querySelector('[data-menu-root]')
    expect(menu?.getAttribute('aria-label')).toBe('Specimen menu — Projects')
    fireEvent.click(menu!.querySelector('[data-menu-item="rename"]')!)

    const input = icon('projects').querySelector('[data-rename-input]') as HTMLInputElement
    expect(input).not.toBeNull()
    fireEvent.keyDown(input, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(input) // the caret moved; focus did not
    expect(icon('field-notes').getAttribute('data-selected')).toBe('false')
  })
})

describe('DD-1 · F6 zone cycling', () => {
  it('walks desktop → taskbar → window and wraps; Shift walks it backwards', () => {
    render(<DesktopSurface />)
    act(() => {
      openWindow('plain')
    })
    field().focus()
    expect(activeZone()).toBe('desktop')

    fireEvent.keyDown(document, { key: 'F6' })
    expect(activeZone()).toBe('taskbar')
    expect(document.activeElement?.getAttribute('data-launcher-pull')).not.toBeNull()

    fireEvent.keyDown(document, { key: 'F6' })
    expect(activeZone()).toBe('window')
    expect(document.activeElement?.closest('.wm-window[data-focused="true"]')).not.toBeNull()

    fireEvent.keyDown(document, { key: 'F6' })
    expect(activeZone()).toBe('desktop') // the ring wraps
    expect(document.activeElement).toBe(icon('projects')) // the tabbable icon

    fireEvent.keyDown(document, { key: 'F6', shiftKey: true })
    expect(activeZone()).toBe('window')
    fireEvent.keyDown(document, { key: 'F6', shiftKey: true })
    expect(activeZone()).toBe('taskbar')
    fireEvent.keyDown(document, { key: 'F6', shiftKey: true })
    expect(activeZone()).toBe('desktop')
  })

  it('skips the window zone when no window is open', () => {
    render(<DesktopSurface />)
    field().focus()

    fireEvent.keyDown(document, { key: 'F6' })
    expect(activeZone()).toBe('taskbar')
    fireEvent.keyDown(document, { key: 'F6' })
    expect(activeZone()).toBe('desktop') // window zone skipped, not a dead stop
  })

  it('F6 is a GLOBAL chord — it fires from a text entry too (non-typing key)', () => {
    render(<DesktopSurface />)
    act(() => {
      openWindow('texty')
    })
    const textarea = document.querySelector('[data-text-entry]') as HTMLTextAreaElement
    textarea.focus()
    expect(activeZone()).toBe('window')

    fireEvent.keyDown(textarea, { key: 'F6' })
    expect(activeZone()).toBe('desktop') // the pane-cycling convention, global
  })
})

describe('DD-1 · Alt+Esc window walking', () => {
  it('Alt+Esc walks down the stack, Alt+Shift+Esc back up', () => {
    render(<DesktopSurface />)
    let first = ''
    let second = ''
    act(() => {
      first = openWindow('plain')
      second = openWindow('claiming')
    })
    expect(useWMStore.getState().focusedId).toBe(second)

    fireEvent.keyDown(document, { key: 'Escape', altKey: true })
    expect(useWMStore.getState().focusedId).toBe(first)
    expect(useWMStore.getState().zOrder.at(-1)).toBe(first) // focused = raised

    fireEvent.keyDown(document, { key: 'Escape', altKey: true, shiftKey: true })
    expect(useWMStore.getState().focusedId).toBe(second)
  })

  it('a stowed window the walk lands on is restored', () => {
    render(<DesktopSurface />)
    let first = ''
    act(() => {
      first = openWindow('plain')
      openWindow('claiming')
    })
    act(() => {
      useWMStore.getState().minimizeWindow(first)
    })

    fireEvent.keyDown(document, { key: 'Escape', altKey: true })
    expect(useWMStore.getState().focusedId).toBe(first)
    expect(useWMStore.getState().windows[first]?.minimized).toBe(false)
  })

  it('one window (or none) is a no-op; Alt+Esc fires from a text entry (global chord)', () => {
    render(<DesktopSurface />)
    let plain = ''
    let texty = ''
    act(() => {
      plain = openWindow('plain')
    })
    fireEvent.keyDown(document, { key: 'Escape', altKey: true })
    expect(useWMStore.getState().focusedId).toBe(plain) // one window: nowhere to walk
    act(() => {
      texty = openWindow('texty') // focused + top
    })

    fireEvent.keyDown(document, { key: 'Escape', altKey: true })
    expect(useWMStore.getState().focusedId).toBe(plain) // walked down to it

    // From inside the sheet: Alt+Esc still walks (non-typing global chord).
    const textarea = document.querySelector('[data-text-entry]') as HTMLTextAreaElement
    textarea.focus()
    fireEvent.keyDown(textarea, { key: 'Escape', altKey: true })
    expect(useWMStore.getState().focusedId).toBe(texty)
  })
})

describe('DD-1 · Esc closes the window focus is in (once unclaimed)', () => {
  it('an unclaimed Esc closes the focused window', () => {
    render(<DesktopSurface />)
    let id = ''
    act(() => {
      id = openWindow('plain')
    })

    fireEvent.keyDown(document.querySelector('[data-plain-seat]')!, { key: 'Escape' })
    expect(openWindowIds()).toHaveLength(0)
    expect(id).toBeTruthy()
  })

  it('Esc from the title bar closes too (bubbles from chrome)', () => {
    render(<DesktopSurface />)
    act(() => {
      openWindow('plain')
    })
    const closeButton = document.querySelector(
      '.wm-window .wm-control-close',
    ) as HTMLButtonElement
    closeButton.focus()

    fireEvent.keyDown(closeButton, { key: 'Escape' })
    expect(openWindowIds()).toHaveLength(0)
  })

  it('a text entry keeps its Escape (the sheet is the field\'s)', () => {
    render(<DesktopSurface />)
    act(() => {
      openWindow('texty')
    })
    const textarea = document.querySelector('[data-text-entry]') as HTMLTextAreaElement
    textarea.focus()

    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(openWindowIds()).toHaveLength(1)
  })

  it('an Esc another surface already claimed (preventDefault) does not close', () => {
    render(<DesktopSurface />)
    act(() => {
      openWindow('claiming')
    })

    fireEvent.keyDown(document.querySelector('[data-claiming-seat]')!, { key: 'Escape' })
    expect(openWindowIds()).toHaveLength(1)
  })

  it('Alt+Esc never doubles as close (the modifier guard)', () => {
    render(<DesktopSurface />)
    let first = ''
    act(() => {
      first = openWindow('plain')
      openWindow('claiming')
    })

    fireEvent.keyDown(document.querySelector('[data-claiming-seat]')!, {
      key: 'Escape',
      altKey: true,
    })
    expect(openWindowIds()).toHaveLength(2) // nothing closed — it walked instead
    expect(useWMStore.getState().focusedId).toBe(first)
  })

  it('the notepad\'s dirty guard outranks the OS close (app precedence, real surface)', async () => {
    const { default: NotepadSurface } = await import('../../apps/notepad/NotepadSurface')
    const { WindowHost } = await import('../wm')
    const { LAUNCHER_LAUNCH } = await import('../app-registry')
    // The real frame + the real editor surface, composed as the OS composes
    // them (WindowHost contentFor) — the Esc-close seam under test.
    render(
      <WindowHost
        contentFor={(win) => <NotepadSurface windowId={win.id} launch={LAUNCHER_LAUNCH} />}
      />,
    )
    let id = ''
    act(() => {
      id = useWMStore.getState().openWindow({ appId: 'notepad', title: 'Specimen Notepad' })
    })

    const textarea = () => document.querySelector('[data-notepad-textarea]') as HTMLTextAreaElement
    textarea().focus()

    // Dirty: Esc interposes the guard strip — the window survives.
    fireEvent.change(textarea(), { target: { value: 'field notes' } })
    fireEvent.keyDown(textarea(), { key: 'Escape' })
    expect(document.querySelector('[data-notepad-strip]')).not.toBeNull()
    expect(openWindowIds()).toHaveLength(1)

    // The strip's own Esc keeps editing (safe default) — still no close.
    fireEvent.keyDown(document.querySelector('[data-notepad-keep]')!, { key: 'Escape' })
    expect(document.querySelector('[data-notepad-strip]')).toBeNull()
    expect(openWindowIds()).toHaveLength(1)

    // Clean: the same Esc now closes (the notepad's own requestClose path).
    fireEvent.change(textarea(), { target: { value: '' } })
    fireEvent.keyDown(textarea(), { key: 'Escape' })
    expect(openWindowIds()).toHaveLength(0)
    expect(id).toBeTruthy()
  })
})

describe('DD-1 · focus decency', () => {
  it('focus moves into the window when it opens', () => {
    render(<DesktopSurface />)
    icon('projects').focus()
    expect(activeZone()).toBe('desktop')

    act(() => {
      openWindow('plain')
    })
    expect(activeZone()).toBe('window')
  })

  it('closing the last window re-seats focus on the ground, never <body>', async () => {
    render(<DesktopSurface />)
    let id = ''
    act(() => {
      id = openWindow('plain')
    })
    expect(activeZone()).toBe('window')

    act(() => {
      useWMStore.getState().closeWindow(id)
    })
    await Promise.resolve() // the re-seat rides a microtask (post-unmount)

    expect(document.activeElement).toBe(field())
  })
})
