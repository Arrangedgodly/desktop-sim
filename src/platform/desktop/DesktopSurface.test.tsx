// @vitest-environment jsdom
// UI-3 desktop surface, component-level: specimen grid from the FS root,
// selection, grid placement, roving tabindex, wallpaper seam, docent hints
// (first visit, dismissal, persistence), the open seam (double-click +
// Enter), and the first-interaction wiring (requestPersistentStorage once).
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createNode, emptyFSState } from '../../lib/fs'
import { buildStoredState } from '../../lib/storage/stored-state'
import { useFSStore } from '../stores/fs-store'
import { useWMStore } from '../stores/wm-store'
import { useSettingsStore } from '../stores/settings-store'
import { registerApp, resetAppRegistry } from '../app-registry'
import { readBootTimeline, resetBootTimeline } from '../../lib/perf/boot-timeline'
import { DemoIcon } from '../../apps/demo/DemoIcon'
import { DesktopSurface } from './DesktopSurface'
import { DESKTOP_GRID } from './grid'

vi.mock('../../lib/storage/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/adapter')>()
  return { ...actual, requestPersistentStorage: vi.fn().mockResolvedValue(true) }
})

import { requestPersistentStorage } from '../../lib/storage/adapter'

/* ------------------------------ fixtures --------------------------------- */

const probeApp = {
  id: 'probe',
  name: 'Probe Module',
  icon: DemoIcon,
  mount: () => null,
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
  registerApp(probeApp)
  resetBootTimeline()
  vi.mocked(requestPersistentStorage).mockClear()
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

function stage(): HTMLElement {
  const el = document.querySelector('[data-desktop-stage]')
  if (!(el instanceof HTMLElement)) throw new Error('desktop stage not rendered')
  return el
}

function withRootChild(input: Parameters<typeof createNode>[1]): void {
  act(() => {
    useFSStore.getState().commit(createNode(useFSStore.getState().fs, input))
  })
}

/* ------------------------------ tests ------------------------------------ */

describe('DesktopSurface · specimen grid renders from the FS root', () => {
  it('renders every seeded root child with name + accession on the label', () => {
    render(<DesktopSurface />)

    for (const id of ['projects', 'field-notes', 'archive', 'charter', 'nameplate']) {
      expect(icon(id)).not.toBeNull()
    }
    expect(screen.getByText('Projects')).toBeDefined()
    expect(screen.getByText('DRW-0001')).toBeDefined()
    expect(screen.getByText('SPC-0005')).toBeDefined() // the charter specimen
    expect(screen.getByText('MOD-0001')).toBeDefined() // the nameplate module ref
  })

  it('icons are buttons whose aria-label reads name, accession, kind', () => {
    render(<DesktopSurface />)

    expect(screen.getByRole('button', { name: 'Projects, DRW-0001, drawer' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Field Notes, DRW-0002, drawer' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Archive, DRW-0003, drawer' })).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'accession-charter.txt, SPC-0005, specimen' }),
    ).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Science Officer Nameplate, MOD-0001, module' }),
    ).toBeDefined()
  })

  it('reflects a live FS commit (a new root child appears)', () => {
    render(<DesktopSurface />)
    expect(screen.queryByRole('button', { name: 'New Drawer, DRW-0004, drawer' })).toBeNull()

    withRootChild({ id: 'new-drawer', parentId: 'root', name: 'New Drawer', kind: 'folder' })

    expect(screen.getByRole('button', { name: 'New Drawer, DRW-0004, drawer' })).toBeDefined()
  })
})

describe('DesktopSurface · grid placement', () => {
  it('applies iconPositions as grid-snapped pixel offsets', () => {
    render(<DesktopSurface />)

    const px = (v: number) => `${v}px`
    const at = (x: number, y: number) => ({
      left: px(DESKTOP_GRID.originX + x * DESKTOP_GRID.cellW),
      top: px(DESKTOP_GRID.originY + y * DESKTOP_GRID.cellH),
    })

    expect(icon('projects').style).toMatchObject(at(0, 0))
    expect(icon('field-notes').style).toMatchObject(at(0, 1))
    expect(icon('charter').style).toMatchObject(at(1, 0))
    expect(icon('nameplate').style).toMatchObject(at(1, 1))
  })

  it('gives an unpositioned root child the first free slot', () => {
    render(<DesktopSurface />)
    withRootChild({ id: 'loose', parentId: 'root', name: 'loose.txt', kind: 'text' })

    // Seed holds (0,0)–(0,2) and (1,0)–(1,1); first free is (0,3).
    expect(icon('loose').style.left).toBe(`${DESKTOP_GRID.originX}px`)
    expect(icon('loose').style.top).toBe(
      `${DESKTOP_GRID.originY + 3 * DESKTOP_GRID.cellH}px`,
    )
  })
})

describe('DesktopSurface · selection', () => {
  it('click selects (single), click on another switches, bare-stage click clears', () => {
    render(<DesktopSurface />)

    fireEvent.click(icon('projects'))
    expect(icon('projects').getAttribute('data-selected')).toBe('true')
    expect(icon('archive').getAttribute('data-selected')).toBe('false')

    fireEvent.click(icon('archive'))
    expect(icon('archive').getAttribute('data-selected')).toBe('true')
    expect(icon('projects').getAttribute('data-selected')).toBe('false')

    fireEvent.click(stage()) // the bare plate
    expect(icon('archive').getAttribute('data-selected')).toBe('false')
  })

  it('roving tabindex: exactly one tabbable icon — the selected one, else the first', () => {
    render(<DesktopSurface />)

    const tabbable = () => document.querySelectorAll('.icon-field [data-specimen-id][tabindex="0"]')
    expect(tabbable()).toHaveLength(1)
    expect(tabbable()[0]!.getAttribute('data-specimen-id')).toBe('projects') // catalog order

    fireEvent.click(icon('archive'))
    expect(tabbable()).toHaveLength(1)
    expect(tabbable()[0]!.getAttribute('data-specimen-id')).toBe('archive')
  })
})

describe('DesktopSurface · open seam (double-click + Enter)', () => {
  it('double-clicking an app-link dispatches through the registry (window opens)', () => {
    render(<DesktopSurface />)
    withRootChild({
      id: 'probe-link',
      parentId: 'root',
      name: 'Probe Link',
      kind: 'app-link',
      appId: 'probe',
    })

    fireEvent.doubleClick(icon('probe-link'))

    const windows = Object.values(useWMStore.getState().windows)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.appId).toBe('probe')
    expect(windows[0]!.launch).toMatchObject({ source: 'file', file: { id: 'probe-link' } })
  })

  it('Enter triggers the same seam (keyboard floor; Space stays a plain click)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<DesktopSurface />)

    // 'about' is not registered until AP-5 — the seam still DISPATCHED: the
    // registry's soft-fail warn fires and no window exists (open-specimen.test
    // covers the registered path end-to-end).
    fireEvent.keyDown(icon('nameplate'), { key: 'Enter' })
    expect(warn).toHaveBeenCalled()
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)
    warn.mockRestore()

    withRootChild({
      id: 'probe-link',
      parentId: 'root',
      name: 'Probe Link',
      kind: 'app-link',
      appId: 'probe',
    })
    fireEvent.keyDown(icon('probe-link'), { key: 'Enter' })
    expect(Object.values(useWMStore.getState().windows)[0]!.appId).toBe('probe')
  })

  it('double-clicking a drawer routes to the explorer id (soft-fail until AP-1 registers it)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<DesktopSurface />)

    fireEvent.doubleClick(icon('projects'))
    // The IM-5 routing table dispatched to the RESERVED explorer id; with no
    // explorer registered yet, openApp warns (soft) and opens nothing.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![1])).toBe('explorer')
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)
  })
})

describe('DesktopSurface · wallpaper seam', () => {
  it('renders the default star-chart plate, switches by id, unknown ids fall back to default', () => {
    render(<DesktopSurface />)

    const resolved = () => document.querySelector('[data-wallpaper]')!.getAttribute('data-wallpaper')

    // The settings default 'star-chart' is now UI-4's registered authored plate.
    expect(resolved()).toBe('star-chart')
    // …and it is authored vector art, not a blank layer.
    expect(document.querySelector('[data-wallpaper="star-chart"] svg')).not.toBeNull()

    // Switching rides the existing seam: settings id → registry → layer.
    for (const id of ['anatomy', 'phytograph', 'survey']) {
      act(() => useSettingsStore.getState().setWallpaper(id))
      expect(resolved()).toBe(id)
      expect(document.querySelector(`[data-wallpaper="${id}"] svg`)).not.toBeNull()
    }

    // An unknown id resolves to the default plate — never a blank ground.
    act(() => useSettingsStore.getState().setWallpaper('unknown-plate'))
    expect(resolved()).toBe('star-chart')
  })
})

describe('DesktopSurface · docent callouts', () => {
  it('shows the leader-line hints on a first visit', () => {
    render(<DesktopSurface firstVisit />)

    expect(document.querySelector('[data-docent]')).not.toBeNull()
    expect(screen.getByText('Double-click a specimen to open it.')).toBeDefined()
    expect(screen.getByText(/Drag to rearrange the hold/)).toBeDefined()
    expect(screen.getByText(/The archive remembers/)).toBeDefined()
    // leader lines drawn for every rendered hint (the specimen hints here;
    // the console's own rail annotation is proven by its own test below)
    expect(
      document.querySelectorAll('[data-docent-hint]:not([data-docent-hint="rail"])'),
    ).toHaveLength(3)
  })

  it('shows the fourth annotation — the keyboard hint, docked at the rail (refinement #5)', () => {
    render(<DesktopSurface firstVisit />)

    // The console's own card rides the same first-visit gate and × dismissal.
    const rail = document.querySelector('[data-docent-hint="rail"]')
    expect(rail).not.toBeNull()
    expect(rail!.getAttribute('role')).toBe('note')
    expect(rail!.textContent).toContain('This console answers the keyboard')
    // Keycap tokens ride the mono face (the measuring law — a key is a readout)
    const keys = Array.from(rail!.querySelectorAll('.docent-key'))
    expect(keys.map((key) => key.textContent)).toEqual(['F6', 'Enter', 'Esc'])
    // ...and its leader drops to the rail (4 leaders total: 3 specimens + rail)
    expect(document.querySelectorAll('.docent-leader')).toHaveLength(4)
  })

  it('hidden on a return visit (firstVisit false)', () => {
    render(<DesktopSurface firstVisit={false} />)
    expect(document.querySelector('[data-docent]')).toBeNull()
  })

  it('hidden once dismissed — and dismissal persists through the settings slice', () => {
    render(<DesktopSurface firstVisit />)

    // every card carries the ×; one click retires the whole docent
    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss hint' })
    expect(dismissButtons).toHaveLength(4)
    fireEvent.click(dismissButtons[0]!)

    expect(document.querySelector('[data-docent]')).toBeNull()
    expect(useSettingsStore.getState().docentDismissed).toBe(true)
    expect(buildStoredState().settings.docentDismissed).toBe(true) // persisted shape
  })

  it('any interaction on the stage dismisses the docent', () => {
    render(<DesktopSurface firstVisit />)

    fireEvent.pointerDown(stage())
    expect(document.querySelector('[data-docent]')).toBeNull()
    expect(useSettingsStore.getState().docentDismissed).toBe(true)
  })

  it('never renders when the settings carry a prior dismissal', () => {
    useSettingsStore.getState().dismissDocent()
    render(<DesktopSurface firstVisit />)
    expect(document.querySelector('[data-docent]')).toBeNull()
  })

  it('a hold with nothing to point at renders no hints', () => {
    useFSStore.getState().init(emptyFSState(0)) // empty catalog → no anchors
    render(<DesktopSurface firstVisit />)
    expect(document.querySelector('[data-docent]')).toBeNull()
  })
})

describe('DesktopSurface · first meaningful interaction (UI-2 deviation 2)', () => {
  it('requests persistent storage ONCE, after the first pointer interaction', () => {
    render(<DesktopSurface />)

    fireEvent.pointerDown(stage())
    fireEvent.pointerDown(stage())
    fireEvent.keyDown(stage(), { key: 'Escape' })

    expect(requestPersistentStorage).toHaveBeenCalledTimes(1)
  })

  it('a keydown on the stage also triggers the one-time request', () => {
    render(<DesktopSurface />)
    fireEvent.keyDown(stage(), { key: 'Tab' })
    expect(requestPersistentStorage).toHaveBeenCalledTimes(1)
  })

  it('no interaction, no request (boot proves nothing about intent)', () => {
    render(<DesktopSurface />)
    expect(requestPersistentStorage).not.toHaveBeenCalled()
  })
})

describe('DesktopSurface · boot milestone', () => {
  it('marks desktop-ready once on mount', () => {
    render(<DesktopSurface />)
    cleanup() // a second surface (StrictMode-style double mount)
    render(<DesktopSurface />)

    expect(readBootTimeline().filter((m) => m.name === 'desktop-ready')).toHaveLength(1)
  })
})


/* ============================== HU-2 edges ================================ */

describe('HU-2 (d) · a very long specimen name on the desktop icon', () => {
  it('the icon carries the full name in title + aria-label; the label clamps (CSS law)', () => {
    const LONG =
      'SPECIMEN-WITH-AN-UNBOUNDED-CATALOG-LABEL-THAT-RUNS-PAST-THE-ICON-PLATE-' +
      'AND-MUST-CLAMP-TO-THE-RULED-LINES-2087.txt'
    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(createNode(fs, { id: 'long-name', parentId: 'root', name: LONG, kind: 'text' }))
    })
    render(<DesktopSurface />)

    const icon = document.querySelector('[data-specimen-id="long-name"]') as HTMLElement
    expect(icon.getAttribute('title')).toBe(LONG) // hover carries the whole label
    expect(icon.getAttribute('aria-label')).toContain(LONG) // AT is never truncated

    // CSS law: the parchment label clamps to its ruled lines (3-line -webkit
    // clamp), it never grows the icon cell unbounded.
    const css = readFileSync('src/platform/desktop/desktop.css', 'utf8')
    const nameBlock = css.split('.specimen-name {')[1]!.split('}')[0]!
    expect(nameBlock).toContain('-webkit-line-clamp')
    expect(nameBlock).toContain('overflow: hidden')
  })
})
