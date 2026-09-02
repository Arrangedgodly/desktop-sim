// @vitest-environment jsdom
// AP-1 · explorer — the drawer-module app through its real seams: the
// registration manifest, the per-folder window dedupe (via openApp + the real
// explorer manifest), the surface itself (breadcrumb navigation, catalog
// order in BOTH views, open routing from inside a drawer, empty state,
// context menus composed from the platform builders, inline rename, the
// listbox keyboard floor), and the pure model helpers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createNode, deleteNode, SEED_EPOCH, type FSNode } from '../../lib/fs'
import { buildStoredState } from '../../lib/storage/stored-state'
import { MenuProvider } from '../../platform/menus'
import { buildSpecimenMenuItems } from '../../platform/menus'
import {
  resetAppRegistry,
  registerApp,
  registerApps,
  openApp,
  type AppLaunchContext,
} from '../../platform/app-registry'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { DemoIcon } from '../demo/DemoIcon'
import { apps } from '../index'
import { explorerApp } from './index'
import { ExplorerIcon } from './ExplorerIcon'
import ExplorerSurface from './ExplorerSurface'
import {
  childOpenTarget,
  drawerCrumbs,
  formatLabelStamp,
  initialDrawerId,
  resolveDrawer,
  setSessionView,
  sessionView,
} from './explorer-model'

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  setSessionView('grid')
  resetAppRegistry()
  // A text-owning probe registered BEFORE the fleet so routing assertions
  // observe it rather than whichever fleet app happens to declare `text`
  // (the demo module also declares text — routing takes the FIRST declaring
  // registration, by the contract's one-liner).
  registerApp({
    id: 'probe',
    name: 'Probe Module',
    icon: DemoIcon,
    mount: () => null,
    acceptedFileTypes: ['text'],
  } as const)
  registerApps(apps) // the REAL startup registration (demo + explorer)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* -------------------------------- helpers --------------------------------- */

const node = (id: string) => useFSStore.getState().fs.nodes[id]

const fileLaunch = (id: string) => ({ source: 'file' as const, file: node(id)! })

function mountSurface(launch: AppLaunchContext = fileLaunch('projects')) {
  return render(
    <MenuProvider>
      <ExplorerSurface windowId="w-test" launch={launch} />
    </MenuProvider>,
  )
}

const option = (id: string): HTMLElement => {
  const el = document.querySelector(`[data-explorer-option="${id}"]`)
  if (!(el instanceof HTMLElement)) throw new Error(`option "${id}" not rendered`)
  return el
}

const optionIds = (): string[] =>
  [...document.querySelectorAll('[data-explorer-listbox] [data-explorer-option]')].map(
    (el) => (el as HTMLElement).dataset.explorerOption!,
  )

const crumbs = (): string[] =>
  [...document.querySelectorAll('[data-explorer-crumb]')].map(
    (el) => (el as HTMLElement).dataset.explorerCrumb!,
  )

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

const openItemMenu = (id: string): void => {
  fireEvent.contextMenu(option(id), { clientX: 200, clientY: 200 })
}

const openGroundMenu = (): void => {
  const content = document.querySelector('[data-explorer-content]')
  if (!(content instanceof HTMLElement)) throw new Error('content not rendered')
  fireEvent.contextMenu(content, { clientX: 120, clientY: 300 })
}

const windowCount = (): number => Object.keys(useWMStore.getState().windows).length

/* ------------------------------ the manifest ------------------------------- */

describe('AP-1 · registration manifest', () => {
  it('rides the startup apps array under the RESERVED id "explorer"', () => {
    expect(apps).toContain(explorerApp)
    expect(explorerApp.id).toBe('explorer')
    expect(explorerApp.name).toBe('Catalog Explorer')
  })

  it('declares multi-instance (no singleton), folder capability, and geometry hints', () => {
    expect(explorerApp.singleton).toBeUndefined() // one window PER DRAWER, not one ever
    expect(explorerApp.acceptedFileTypes).toEqual(['folder'])
    expect(explorerApp.defaultGeometry).toEqual({ w: 680, h: 460 })
  })

  it('mounts a LAZY surface (own chunk) and a render-only icon', () => {
    // lazy(() => import(...)) produces a lazy exotic component object.
    expect(typeof explorerApp.mount).toBe('object')
    expect(explorerApp.icon).toBe(ExplorerIcon)
    // The icon renders without any store — svg only, aria-hidden.
    const { container } = render(<ExplorerIcon size={20} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('listApps carries it after startup registration', () => {
    const ids = registerApps(apps) // re-registering is rejected wholesale…
    expect(ids).toBe(0) // …first registration wins (already landed in beforeEach)
  })
})

/* ------------------------ per-folder window dedupe ------------------------- */

describe('AP-1 · one window per drawer (openApp instance rules)', () => {
  it('opening the same drawer twice focuses ONE window; different drawers get their own', () => {
    const projects = openApp('explorer', fileLaunch('projects'))!
    const again = openApp('explorer', fileLaunch('projects'))
    const archive = openApp('explorer', fileLaunch('archive'))!

    expect(again).toBe(projects)
    expect(archive).not.toBe(projects)
    expect(windowCount()).toBe(2)
    const windows = useWMStore.getState().windows
    expect(windows[projects]!.instanceId).toBe('file:projects')
    expect(windows[archive]!.instanceId).toBe('file:archive')
  })

  it('re-opening a minimized drawer window restores + focuses it (no duplicate)', () => {
    const projects = openApp('explorer', fileLaunch('projects'))!
    act(() => {
      useWMStore.getState().minimizeWindow(projects)
    })
    const again = openApp('explorer', fileLaunch('projects'))

    expect(again).toBe(projects)
    expect(windowCount()).toBe(1)
    expect(useWMStore.getState().windows[projects]!.minimized).toBe(false)
    expect(useWMStore.getState().focusedId).toBe(projects)
  })
})

/* ------------------------------- the surface -------------------------------- */

describe('AP-1 · drawer contents', () => {
  it('opens at the launch drawer; children render in CATALOG (accession) order', () => {
    mountSurface()

    expect(crumbs()).toEqual(['root', 'projects'])
    // listChildren's law: PLT-0001 sorts before SPC-0001/0002 (series, serial).
    expect(optionIds()).toEqual(['reference-plate', 'exhibit-01', 'exhibit-02'])
    expect(document.querySelector('.explorer-accession')!.textContent).toBe('DRW-0001')
  })

  it('a launcher open (no file) lands on the hold root', () => {
    mountSurface({ source: 'launcher' })
    expect(crumbs()).toEqual(['root'])
    expect(optionIds()).toEqual([
      'projects',
      'field-notes',
      'archive',
      'nameplate',
      'charter',
    ])
  })

  it('the ledger view lists the same accession order with readout columns', () => {
    mountSurface()
    fireEvent.click(document.querySelector('[data-explorer-view="list"]')!)

    const rows = [...document.querySelectorAll('.explorer-row')]
    expect(rows).toHaveLength(3)
    // Accession column rides the mono digits; order is the catalog's.
    expect(
      rows.map((row) => row.querySelector('.explorer-row-accession')!.textContent),
    ).toEqual(['PLT-0001', 'SPC-0001', 'SPC-0002'])
    expect(rows[0]!.querySelector('.explorer-row-kind')!.textContent).toBe('plate')
    expect(rows[0]!.querySelector('.explorer-row-stamp')!.textContent).toBe('2087-03-14 09:32')
  })

  it('an empty drawer shows the in-world empty state, not a listbox', () => {
    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(createNode(fs, { id: 'empty-drawer', parentId: 'root', name: 'Empty', kind: 'folder' }))
    })
    mountSurface(fileLaunch('empty-drawer'))

    const empty = document.querySelector('[data-explorer-empty]')
    expect(empty).not.toBeNull()
    expect(empty!.textContent).toContain('No specimens catalogued')
    expect(empty!.textContent).toContain('Right-click to accession')
    expect(document.querySelector('[data-explorer-listbox]')).toBeNull()
  })
})

describe('AP-1 · breadcrumb + back/up navigation', () => {
  it('double-clicking a drawer navigates INSIDE this window (no new window)', () => {
    mountSurface()
    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(
        createNode(fs, { id: 'sub', parentId: 'projects', name: 'Sub Drawer', kind: 'folder' }),
      )
    })
    fireEvent.doubleClick(option('sub'))

    expect(crumbs()).toEqual(['root', 'projects', 'sub'])
    expect(windowCount()).toBe(0) // navigation is internal — openApp never ran
  })

  it('a crumb click jumps straight to that drawer (root crumb AND mid-path)', () => {
    mountSurface(fileLaunch('field-notes'))
    expect(crumbs()).toEqual(['root', 'field-notes'])

    fireEvent.click(document.querySelector('[data-explorer-crumb="root"]')!)
    expect(crumbs()).toEqual(['root'])

    // A mid-path jump: root → projects → sub, then land on the Projects crumb.
    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(
        createNode(fs, { id: 'sub', parentId: 'projects', name: 'Sub Drawer', kind: 'folder' }),
      )
    })
    fireEvent.doubleClick(option('projects'))
    fireEvent.doubleClick(option('sub'))
    expect(crumbs()).toEqual(['root', 'projects', 'sub'])

    fireEvent.click(document.querySelector('[data-explorer-crumb="projects"]')!)
    expect(crumbs()).toEqual(['root', 'projects'])
    // Catalog order sorts by series: the fresh DRW drawer leads the listing.
    expect(optionIds()).toEqual(['sub', 'reference-plate', 'exhibit-01', 'exhibit-02'])
  })

  it('back returns through history; up climbs one drawer; both disable at their ends', () => {
    mountSurface()
    const back = document.querySelector<HTMLButtonElement>('[data-explorer-back]')!
    const up = document.querySelector<HTMLButtonElement>('[data-explorer-up]')!
    expect(back.disabled).toBe(true)
    expect(up.disabled).toBe(false)

    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(
        createNode(fs, { id: 'sub', parentId: 'projects', name: 'Sub Drawer', kind: 'folder' }),
      )
    })
    fireEvent.doubleClick(option('sub'))
    expect(crumbs()).toEqual(['root', 'projects', 'sub'])
    expect(back.disabled).toBe(false)

    fireEvent.click(up)
    expect(crumbs()).toEqual(['root', 'projects'])

    fireEvent.click(back) // history: [projects(cursor was pushed by up)] → sub
    expect(crumbs()).toEqual(['root', 'projects', 'sub'])

    fireEvent.click(document.querySelector('[data-explorer-crumb="root"]')!)
    expect(crumbs()).toEqual(['root'])
    expect(up.disabled).toBe(true) // the hold has no parent drawer
  })
})

describe('AP-1 · open routing from inside a drawer', () => {
  it('a text child opens its OWNING app (acceptedFileTypes) with a file launch context', () => {
    mountSurface()
    fireEvent.doubleClick(option('exhibit-01'))

    expect(windowCount()).toBe(1)
    const record = Object.values(useWMStore.getState().windows)[0]!
    expect(record.appId).toBe('probe')
    expect(record.launch).toEqual({ source: 'file', file: node('exhibit-01') })
  })

  it('a module reference opens its own appId (soft-fail lands on the registry)', () => {
    mountSurface({ source: 'launcher' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fireEvent.doubleClick(option('nameplate')) // targets 'about' — unregistered

    expect(windowCount()).toBe(0) // openApp soft-failed: no window, no throw
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('an image child opens its OWNING app — the interim ended at AP-3 (image-viewer)', () => {
    // This was the "no registered app accepts images" honest-interim probe
    // until the viewer registered: same unfreeze class as the notepad's text
    // route. Now the plate opens its owner through the same consultation.
    mountSurface()
    fireEvent.doubleClick(option('reference-plate'))

    expect(windowCount()).toBe(1)
    const record = Object.values(useWMStore.getState().windows)[0]!
    expect(record.appId).toBe('image-viewer')
    expect(record.launch).toEqual({ source: 'file', file: node('reference-plate') })
  })
})

/* ----------------------------- context menus ------------------------------- */

describe('AP-1 · context menus reuse the platform shell + builders', () => {
  it('the drawer menu creates a New Drawer / New Specimen IN the viewed drawer', () => {
    mountSurface()
    openGroundMenu()

    expect(menu().getAttribute('role')).toBe('menu')
    expect(menu().getAttribute('aria-label')).toBe('Projects menu')
    fireEvent.click(menuItem('new-drawer'))

    const created = Object.values(useFSStore.getState().fs.nodes).find(
      (n) => n.name === 'New Drawer',
    )
    expect(created).toMatchObject({ kind: 'folder', parentId: 'projects', accession: 'DRW-0004' })
    expect(option(created!.id)).not.toBeNull() // reflects instantly in the listing
  })

  it('New Specimen accessions an empty text specimen into the viewed drawer', () => {
    mountSurface()
    openGroundMenu()
    fireEvent.click(menuItem('new-specimen'))

    const created = Object.values(useFSStore.getState().fs.nodes).find(
      (n) => n.name === 'New Specimen',
    )
    expect(created).toMatchObject({ kind: 'text', content: '', parentId: 'projects' })
  })

  it('specimen rows ARE the platform builder output — identical items, no fork', () => {
    mountSurface()
    openItemMenu('exhibit-01')

    const rendered = [...document.querySelectorAll('[data-menu-root] [data-menu-item]')]
    const expected = buildSpecimenMenuItems(node('exhibit-01')!, { rename: () => {} })
    // The platform builder emits Rename + sep + Delete; the shell renders rows
    // for focusable items only (separators are <hr>), so compare row-by-row.
    const expectedRows = expected.filter((item) => item.kind !== 'separator')
    expect(rendered).toHaveLength(expectedRows.length)
    expectedRows.forEach((item, index) => {
      const row = rendered[index]! as HTMLElement
      expect(row.dataset.menuItem).toBe(item.id)
      expect(row.textContent).toBe(item.label)
      if (item.kind === 'action' && item.destructive) {
        expect(row.dataset.destructive).toBe('true')
      }
    })
    // The guarded delete carries the platform's exact confirm vocabulary.
    fireEvent.click(menuItem('delete'))
    expect(menu().textContent).toContain('Delete “exhibit-01.txt”?')
    expect(menu().textContent).toContain('The specimen leaves the archive for good.')
  })

  it('Delete runs the platform two-step confirm and decommissions from the FS', () => {
    mountSurface()
    openItemMenu('exhibit-02')
    fireEvent.click(menuItem('delete'))

    expect(node('exhibit-02')).toBeDefined() // held back at the guarded step
    fireEvent.click(menuItem('delete__go'))
    expect(node('exhibit-02')).toBeUndefined()
    expect(document.querySelector('[data-explorer-option="exhibit-02"]')).toBeNull()
    expect(buildStoredState().fs.nodes['exhibit-02']).toBeUndefined() // persisted truth
  })

  it('no forked menu code: the app ships no portal/shell of its own and imports the barrel', () => {
    const read = (file: string): string =>
      readFileSync(new URL(file, import.meta.url), 'utf-8')
    for (const file of ['ExplorerSurface.tsx', 'explorer-menus.ts']) {
      const source = read(`./${file}`)
      expect(source).not.toContain('createPortal') // no private menu shell
      expect(source).not.toContain('role="menu"') // no private menu role
      expect(source).not.toMatch(/platform\/menus\//) // barrel-only imports
    }
    // The specimen rows come from the platform builder by import, verbatim.
    expect(read('./ExplorerSurface.tsx')).toContain('buildSpecimenMenuItems')
    expect(read('./explorer-menus.ts')).toContain('createCatalogEntry')
  })
})

/* ------------------------------- inline rename ------------------------------ */

describe('AP-1 · inline rename inside the drawer', () => {
  function beginRename(id: string): HTMLInputElement {
    openItemMenu(id)
    fireEvent.click(menuItem('rename'))
    const input = document.querySelector('[data-rename-input]')
    if (!(input instanceof HTMLInputElement)) throw new Error('rename field not rendered')
    return input
  }

  it('Rename turns the card into a label-edit field; Enter commits to the FS', () => {
    mountSurface()
    const input = beginRename('exhibit-01')

    expect(input.value).toBe('exhibit-01.txt')
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'renamed-exhibit.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(node('exhibit-01')!.name).toBe('renamed-exhibit.txt')
    expect(document.querySelector('[data-rename-input]')).toBeNull()
    expect(option('exhibit-01').textContent).toContain('renamed-exhibit.txt')
    expect(buildStoredState().fs.nodes['exhibit-01']!.name).toBe('renamed-exhibit.txt')
  })

  it('a collision REFUSES in-world: shake attribute, still editing, label intact', () => {
    mountSurface()
    const input = beginRename('exhibit-01')
    fireEvent.change(input, { target: { value: 'exhibit-02.txt' } }) // sibling specimen
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(node('exhibit-01')!.name).toBe('exhibit-01.txt')
    const stillEditing = document.querySelector('[data-rename-input]')!
    expect(stillEditing).not.toBeNull()
    expect(document.activeElement).toBe(stillEditing)
    expect(option('exhibit-01').getAttribute('data-rename-rejected')).toBe('true')
  })

  it('Escape cancels; the option button regains focus', () => {
    mountSurface()
    const input = beginRename('exhibit-01')
    fireEvent.change(input, { target: { value: 'never-committed.txt' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(node('exhibit-01')!.name).toBe('exhibit-01.txt')
    expect(document.querySelector('[data-rename-input]')).toBeNull()
    expect(document.activeElement).toBe(option('exhibit-01'))
  })
})

/* --------------------------- selection + keyboard floor --------------------- */

describe('AP-1 · selection + listbox keyboard floor', () => {
  it('click selects (single); bare-parchment click clears; roving tabindex follows', () => {
    mountSurface()
    fireEvent.click(option('exhibit-01'))

    expect(option('exhibit-01').getAttribute('aria-selected')).toBe('true')
    expect(option('exhibit-01').tabIndex).toBe(0)
    expect(option('exhibit-02').getAttribute('aria-selected')).toBe('false')
    expect(option('exhibit-02').tabIndex).toBe(-1)

    fireEvent.click(option('exhibit-02'))
    expect(option('exhibit-01').getAttribute('aria-selected')).toBe('false')
    expect(option('exhibit-02').tabIndex).toBe(0)

    fireEvent.click(document.querySelector('[data-explorer-content]')!)
    expect(option('exhibit-02').getAttribute('aria-selected')).toBe('false')
    // Selection down → the FIRST option carries the roving tab stop.
    expect(option('reference-plate').tabIndex).toBe(0)
  })

  it('arrows/Home/End move selection AND focus through the catalog order (wrap)', () => {
    mountSurface()
    const listbox = document.querySelector('[data-explorer-listbox]')!
    option('exhibit-01').focus()

    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(option('exhibit-02'))
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }) // wraps to the top
    expect(document.activeElement).toBe(option('reference-plate'))
    fireEvent.keyDown(listbox, { key: 'ArrowUp' }) // wraps back to the bottom
    expect(document.activeElement).toBe(option('exhibit-02'))
    fireEvent.keyDown(listbox, { key: 'Home' })
    expect(document.activeElement).toBe(option('reference-plate'))
    fireEvent.keyDown(listbox, { key: 'End' })
    expect(document.activeElement).toBe(option('exhibit-02'))
    // Horizontal arrows ride the same floor for the card grid.
    fireEvent.keyDown(listbox, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(option('exhibit-01'))
    // Arrow keys never leave the listbox while a rename field is focused.
    const input = (() => {
      openItemMenu('exhibit-01')
      fireEvent.click(menuItem('rename'))
      return document.querySelector('[data-rename-input]')! as HTMLInputElement
    })()
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // consumed by the field
    expect(document.activeElement).toBe(input)
  })

  it('Enter opens (like a double-click); Menu key opens the specimen menu at the row', () => {
    mountSurface()
    option('exhibit-01').focus()
    fireEvent.keyDown(option('exhibit-01'), { key: 'Enter' })

    expect(windowCount()).toBe(1) // probe owns text opens
    expect(Object.values(useWMStore.getState().windows)[0]!.appId).toBe('probe')

    fireEvent.keyDown(option('exhibit-02'), { key: 'ContextMenu' })
    expect(menu().getAttribute('aria-label')).toBe('Specimen menu — exhibit-02.txt')
  })
})

/* ------------------------------ view memory -------------------------------- */

describe('AP-1 · view density (per-session only)', () => {
  it('switching to ledger applies to this window AND seeds new windows this session', () => {
    const first = mountSurface()
    fireEvent.click(first.container.querySelector('[data-explorer-view="list"]')!)
    expect(document.querySelector('.explorer-row')).not.toBeNull()
    expect(sessionView()).toBe('list')

    // A second window in the SAME session inherits the last choice…
    mountSurface(fileLaunch('archive'))
    expect(document.querySelector('.explorer-row')).not.toBeNull()

    // …but nothing persisted: the stored envelope carries no view state.
    expect(buildStoredState()).not.toHaveProperty('explorerView')
    expect(JSON.stringify(buildStoredState())).not.toContain('explorerView')
  })
})

/* --------------------------- resilience floor ------------------------------- */

describe('AP-1 · deleted-drawer fallback', () => {
  it('viewing a drawer deleted elsewhere falls back to the hold (no crash)', () => {
    mountSurface()
    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(
        createNode(fs, { id: 'sub', parentId: 'projects', name: 'Sub Drawer', kind: 'folder' }),
      )
    })
    fireEvent.doubleClick(option('sub'))
    expect(crumbs()).toEqual(['root', 'projects', 'sub'])

    // Delete the drawer from OUTSIDE this window (another surface's op).
    act(() => {
      const { fs, commit } = useFSStore.getState()
      commit(deleteNode(fs, 'sub'))
    })

    expect(crumbs()).toEqual(['root'])
    expect(optionIds()).toEqual([
      'projects',
      'field-notes',
      'archive',
      'nameplate',
      'charter',
    ])
  })
})

/* ------------------------------ the pure model ------------------------------ */

describe('AP-1 · model helpers (pure)', () => {
  const tree = () => useFSStore.getState().fs

  it('formatLabelStamp renders the mission clock in UTC', () => {
    expect(formatLabelStamp(0)).toBe('1970-01-01 00:00')
    expect(formatLabelStamp(SEED_EPOCH)).toBe('2087-03-14 09:26')
    expect(formatLabelStamp(SEED_EPOCH + 61 * 60_000)).toBe('2087-03-14 10:27')
  })

  it('childOpenTarget: folders never route out; app-links route to their appId; declared owners win', () => {
    const appsList = [
      { id: 'explorer', acceptedFileTypes: ['folder'] as const },
      { id: 'probe', acceptedFileTypes: ['text'] as const },
    ]
    expect(childOpenTarget(node('projects')! as FSNode, appsList)).toBeNull() // navigate inside
    expect(childOpenTarget(node('nameplate')! as FSNode, appsList)).toBe('about')
    expect(childOpenTarget(node('charter')! as FSNode, appsList)).toBe('probe')
    expect(childOpenTarget(node('reference-plate')! as FSNode, appsList)).toBeNull()
  })

  it('initialDrawerId: file+live folder → that drawer; everything else → the root', () => {
    expect(initialDrawerId(fileLaunch('projects'), tree())).toBe('projects')
    expect(initialDrawerId(fileLaunch('charter'), tree())).toBe('root') // not a drawer
    expect(initialDrawerId({ source: 'launcher' }, tree())).toBe('root')
  })

  it('resolveDrawer: live drawer → itself; vanished id → the hold root', () => {
    expect(resolveDrawer(tree(), 'projects')).toBe('projects')
    expect(resolveDrawer(tree(), 'no-such-drawer')).toBe('root')
    expect(resolveDrawer(tree(), 'charter')).toBe('root') // a specimen is not a drawer
  })

  it('drawerCrumbs walks the live chain root → current', () => {
    expect(drawerCrumbs(tree(), 'projects')).toEqual([
      { id: 'root', name: 'Hold' },
      { id: 'projects', name: 'Projects' },
    ])
    expect(drawerCrumbs(tree(), 'root')).toEqual([{ id: 'root', name: 'Hold' }])
    expect(drawerCrumbs(tree(), 'gone')).toEqual([{ id: 'root', name: 'Hold' }])
  })
})
