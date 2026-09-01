// @vitest-environment jsdom
// The desktop's two context menus through the real surface (UI-5): ground
// menu creates drawers/specimens with deduped labels via the FS ops, Arrange
// re-grids by accession, the specimen menu drives the inline rename (commit,
// collision refusal + shake, Escape cancel) and the two-step delete.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createNode } from '../../lib/fs'
import { buildStoredState } from '../../lib/storage/stored-state'
import { useFSStore } from '../stores/fs-store'
import { useWMStore } from '../stores/wm-store'
import { useSettingsStore } from '../stores/settings-store'
import { resetAppRegistry, registerApp } from '../app-registry'
import { DemoIcon } from '../../apps/demo/DemoIcon'
import { DesktopSurface } from '../desktop/DesktopSurface'
import { DESKTOP_GRID } from '../desktop/grid'

vi.mock('../../lib/storage/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/adapter')>()
  return { ...actual, requestPersistentStorage: vi.fn().mockResolvedValue(true) }
})

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  resetAppRegistry()
  registerApp({
    id: 'probe',
    name: 'Probe Module',
    icon: DemoIcon,
    mount: () => null,
  } as const)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* ------------------------------ helpers --------------------------------- */

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

const menu = (): HTMLElement => {
  const el = document.querySelector('[data-menu-root]')
  if (!(el instanceof HTMLElement)) throw new Error('menu not open')
  return el
}

const menuItem = (id: string): HTMLButtonElement => {
  const el = document.querySelector(`[data-menu-item="${id}"]`)
  if (!(el instanceof HTMLButtonElement)) throw new Error(`menu row "${id}" not rendered`)
  return el
}

/** Right-click the bare plate at a clear point. */
function contextMenuGround(): void {
  fireEvent.contextMenu(stage(), { clientX: 420, clientY: 360 })
}

/** Right-click a specimen icon. */
function contextMenuIcon(id: string): void {
  fireEvent.contextMenu(icon(id), { clientX: 200, clientY: 200 })
}

const node = (id: string) => useFSStore.getState().fs.nodes[id]

/* ------------------------------ ground menu ------------------------------- */

describe('UI-5 · ground menu', () => {
  it('opens on ground right-click: role=menu with the three commands', () => {
    render(<DesktopSurface />)
    contextMenuGround()

    expect(menu().getAttribute('role')).toBe('menu')
    expect(menu().getAttribute('aria-label')).toBe('Hold menu')
    expect(menuItem('new-drawer')).toBeDefined()
    expect(menuItem('new-specimen')).toBeDefined()
    expect(menuItem('arrange')).toBeDefined()
    // Reset Desktop… is CUT (AP-4/HU-1 scope) — nothing else rides the menu.
    expect(document.querySelectorAll('[data-menu-root] [data-menu-item]')).toHaveLength(3)
  })

  it('New Drawer accessions a drawer into the root under the plain base label', () => {
    render(<DesktopSurface />)
    contextMenuGround()
    fireEvent.click(menuItem('new-drawer'))

    const created = Object.values(useFSStore.getState().fs.nodes).find((n) => n.name === 'New Drawer')
    expect(created).toMatchObject({ kind: 'folder', parentId: 'root', accession: 'DRW-0004' })
    expect(icon(created!.id)).not.toBeNull() // reflects instantly on the hold
  })

  it('New Specimen accessions an empty text specimen', () => {
    render(<DesktopSurface />)
    contextMenuGround()
    fireEvent.click(menuItem('new-specimen'))

    const created = Object.values(useFSStore.getState().fs.nodes).find(
      (n) => n.name === 'New Specimen',
    )
    expect(created).toMatchObject({ kind: 'text', content: '', parentId: 'root', accession: 'SPC-0006' })
    expect(icon(created!.id)).not.toBeNull()
  })

  it('repeated creates dedupe with numeric suffixes (New Drawer, New Drawer 2)', () => {
    render(<DesktopSurface />)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      contextMenuGround()
      fireEvent.click(menuItem('new-drawer'))
    }
    const names = Object.values(useFSStore.getState().fs.nodes)
      .filter((n) => n.parentId === 'root' && n.kind === 'folder')
      .map((n) => n.name)
      .filter((name) => name.startsWith('New Drawer'))
    expect(names).toEqual(['New Drawer', 'New Drawer 2', 'New Drawer 3'])
  })

  it('Arrange by Accession re-grids the hold in catalog order', () => {
    render(<DesktopSurface />)

    // Seed positions: drawers column 0 rows 0-2, charter (1,0), nameplate (1,1).
    expect(icon('nameplate').style).toMatchObject({
      left: `${DESKTOP_GRID.originX + DESKTOP_GRID.cellW}px`,
      top: `${DESKTOP_GRID.originY + DESKTOP_GRID.cellH}px`,
    })

    contextMenuGround()
    fireEvent.click(menuItem('arrange'))

    // Catalog order: DRW-0001..3 then MOD-0001 (nameplate) then SPC-0005
    // (charter) — column-major: the nameplate drops to (0,3), charter (0,4).
    const positions = useFSStore.getState().fs.iconPositions
    expect(positions['projects']).toEqual({ x: 0, y: 0 })
    expect(positions['field-notes']).toEqual({ x: 0, y: 1 })
    expect(positions['archive']).toEqual({ x: 0, y: 2 })
    expect(positions['nameplate']).toEqual({ x: 0, y: 3 })
    expect(positions['charter']).toEqual({ x: 0, y: 4 })
    expect(icon('nameplate').style.left).toBe(`${DESKTOP_GRID.originX}px`)
  })

  it('a right-click inside a window never opens the ground menu', () => {
    render(<DesktopSurface />)
    // A registered module link on the desktop (the seeded nameplate targets
    // 'about', unregistered until AP-5 — its window never opens).
    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(
        createNode(fs, { id: 'probe-link', parentId: 'root', name: 'Probe Link', kind: 'app-link', appId: 'probe' }),
      )
    })
    fireEvent.doubleClick(icon('probe-link'))
    const windowEl = document.querySelector('[data-window-id]')
    expect(windowEl).not.toBeNull()
    fireEvent.contextMenu(windowEl!, { clientX: 300, clientY: 300 })
    expect(document.querySelector('[data-menu-root]')).toBeNull()
  })

  it('the menu closes after a command runs (one command per opening)', () => {
    render(<DesktopSurface />)
    contextMenuGround()
    fireEvent.click(menuItem('new-drawer'))
    expect(document.querySelector('[data-menu-root]')).toBeNull()
  })
})

/* ------------------------------ specimen menu ----------------------------- */

describe('UI-5 · specimen menu', () => {
  it('opens on icon right-click: Rename + oxide Delete; the icon selects', () => {
    render(<DesktopSurface />)
    contextMenuIcon('charter')

    expect(menu().getAttribute('aria-label')).toBe('Specimen menu — accession-charter.txt')
    expect(menuItem('rename')).toBeDefined()
    expect(menuItem('delete').getAttribute('data-destructive')).toBe('true')
    expect(icon('charter').getAttribute('data-selected')).toBe('true')
  })

  it('a drawer\'s delete confirm names the subtree consequence', () => {
    render(<DesktopSurface />)
    contextMenuIcon('projects')
    fireEvent.click(menuItem('delete'))

    expect(menu().textContent).toContain('Delete “Projects”?')
    expect(menu().textContent).toContain('Everything inside the drawer is deleted with it.')
  })
})

/* ------------------------------ inline rename ----------------------------- */

describe('UI-5 · inline rename', () => {
  function beginRename(id: string): HTMLInputElement {
    contextMenuIcon(id)
    fireEvent.click(menuItem('rename'))
    const input = document.querySelector('[data-rename-input]')
    if (!(input instanceof HTMLInputElement)) throw new Error('rename field not rendered')
    return input
  }

  it('Rename turns the icon itself into a label-edit field seeded with the name', () => {
    render(<DesktopSurface />)
    const input = beginRename('charter')

    expect(input.value).toBe('accession-charter.txt')
    expect(document.activeElement).toBe(input) // typing starts immediately
    expect(icon('charter').getAttribute('data-editing')).toBe('true')
    expect(document.querySelector('[data-menu-root]')).toBeNull() // menu gone
  })

  it('Enter commits: label changes in the FS and on the icon', () => {
    render(<DesktopSurface />)
    const input = beginRename('charter')
    fireEvent.change(input, { target: { value: 'field-manual.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(node('charter')!.name).toBe('field-manual.txt')
    expect(document.querySelector('[data-rename-input]')).toBeNull() // edit ended
    expect(icon('charter').textContent).toContain('field-manual.txt')
    // FS truth is the persisted shape too (autosave reads the store).
    expect(buildStoredState().fs.nodes['charter']!.name).toBe('field-manual.txt')
  })

  it('a collision REFUSES in-world: shake attribute, still editing, name intact', () => {
    render(<DesktopSurface />)
    const input = beginRename('charter')
    fireEvent.change(input, { target: { value: 'Projects' } }) // sibling drawer name
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(node('charter')!.name).toBe('accession-charter.txt') // FS untouched
    const stillEditing = document.querySelector('[data-rename-input]')
    expect(stillEditing).not.toBeNull()
    expect(document.activeElement).toBe(stillEditing) // keeps editing, focused
    expect(icon('charter').getAttribute('data-drop-rejected')).toBe('true') // the shake
  })

  it('an empty label refuses the same way (invalid-name)', () => {
    render(<DesktopSurface />)
    const input = beginRename('charter')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(node('charter')!.name).toBe('accession-charter.txt')
    expect(document.querySelector('[data-rename-input]')).not.toBeNull()
  })

  it('Escape cancels: nothing changes, the field closes, the icon regains focus', () => {
    render(<DesktopSurface />)
    const input = beginRename('charter')
    fireEvent.change(input, { target: { value: 'never-committed.txt' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(node('charter')!.name).toBe('accession-charter.txt')
    expect(document.querySelector('[data-rename-input]')).toBeNull()
    expect(document.activeElement).toBe(icon('charter'))
  })

  it('blur commits the draft (desktop convention: leaving the field keeps it)', () => {
    render(<DesktopSurface />)
    const input = beginRename('charter')
    fireEvent.change(input, { target: { value: 'blurred-in.txt' } })
    fireEvent.blur(input)

    expect(node('charter')!.name).toBe('blurred-in.txt')
    expect(document.querySelector('[data-rename-input]')).toBeNull()
  })
})

/* ------------------------------ two-step delete --------------------------- */

describe('UI-5 · two-step delete', () => {
  it('Delete swaps the menu to the guarded step; Confirm decommissions the node', () => {
    render(<DesktopSurface />)
    contextMenuIcon('charter')

    fireEvent.click(menuItem('delete'))
    expect(document.querySelector('[data-menu-confirm]')).not.toBeNull()
    expect(menu().textContent).toContain('Delete “accession-charter.txt”?')
    expect(node('charter')).toBeDefined() // command held back

    fireEvent.click(menuItem('delete__go'))
    expect(node('charter')).toBeUndefined() // gone from the FS…
    expect(document.querySelector('[data-specimen-id="charter"]')).toBeNull() // …and the hold
    expect(document.querySelector('[data-menu-root]')).toBeNull()
  })

  it('Cancel steps back without deleting', () => {
    render(<DesktopSurface />)
    contextMenuIcon('charter')
    fireEvent.click(menuItem('delete'))
    fireEvent.click(menuItem('delete__cancel'))

    expect(document.querySelector('[data-menu-confirm]')).toBeNull()
    expect(node('charter')).toBeDefined()
  })

  it('deleting a drawer takes its whole subtree', () => {
    render(<DesktopSurface />)
    contextMenuIcon('projects')
    fireEvent.click(menuItem('delete'))
    fireEvent.click(menuItem('delete__go'))

    expect(node('projects')).toBeUndefined()
    const survivors = Object.values(useFSStore.getState().fs.nodes).filter((n) =>
      n.id.startsWith('project-') || n.id === 'reference-plate',
    )
    expect(survivors).toEqual([]) // exhibits + plate went with the drawer
  })

  it('the persisted envelope reflects the delete (reload truth)', () => {
    render(<DesktopSurface />)
    contextMenuIcon('field-notes')
    fireEvent.click(menuItem('delete'))
    fireEvent.click(menuItem('delete__go'))

    expect(buildStoredState().fs.nodes['field-notes']).toBeUndefined()
    expect(buildStoredState().fs.nodes['field-log']).toBeUndefined()
  })
})

/* ------------------------------ keyboard open ----------------------------- */

describe('UI-5 · keyboard menu open (Menu key / Shift+F10)', () => {
  it('the Menu key opens the specimen menu anchored at the icon', () => {
    render(<DesktopSurface />)
    icon('charter').focus()
    fireEvent.keyDown(icon('charter'), { key: 'ContextMenu' })

    expect(document.querySelector('[data-menu-root]')).not.toBeNull()
    expect(document.activeElement).toBe(menuItem('rename')) // focus opens on a row
  })

  it('Shift+F10 opens it too; Escape returns focus to the icon', () => {
    render(<DesktopSurface />)
    icon('charter').focus()
    fireEvent.keyDown(icon('charter'), { key: 'F10', shiftKey: true })
    expect(document.querySelector('[data-menu-root]')).not.toBeNull()

    fireEvent.keyDown(menu(), { key: 'Escape' })
    expect(document.querySelector('[data-menu-root]')).toBeNull()
    expect(document.activeElement).toBe(icon('charter'))
  })
})

/* ------------------------------ live-state guard -------------------------- */

describe('UI-5 · menus commit against live state', () => {
  it('a drawer created mid-session lands after one already auto-placed', () => {
    render(<DesktopSurface />)

    // Create one out-of-band (e.g. another surface did it), then via menu.
    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(createNode(fs, { id: 'band', parentId: 'root', name: 'New Drawer', kind: 'folder' }))
    })

    contextMenuGround()
    fireEvent.click(menuItem('new-drawer'))

    const created = Object.values(useFSStore.getState().fs.nodes).find(
      (n) => n.name === 'New Drawer 2',
    )
    expect(created).toMatchObject({ kind: 'folder', accession: 'DRW-0005' })
  })
})
