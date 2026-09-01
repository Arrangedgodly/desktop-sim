// Catalog ops behind the desktop menus (UI-5): deduped accession-time
// naming for fresh drawers/specimens, and the arrange-by-accession re-grid.
// Pure FS math through the REAL domain ops (MF-1), no React.
import { describe, expect, it } from 'vitest'
import { emptyFSState } from '../../lib/fs'
import type { FSState } from '../../lib/fs'
import { createNode, setIconPosition } from '../../lib/fs'
import {
  arrangeByAccession,
  createCatalogEntry,
  dedupeName,
  NEW_DRAWER_LABEL,
  NEW_SPECIMEN_LABEL,
} from './catalog-ops'
import { MAX_GRID_ROWS } from '../desktop/grid'

/* ------------------------------ fixtures --------------------------------- */

/** A small seeded hold: two drawers + one specimen, scrambled grid slots. */
function fixtureState(): FSState {
  let state = emptyFSState(0)
  state = createNode(state, { id: 'b-drawer', parentId: 'root', name: 'b-drawer', kind: 'folder' })
  state = createNode(state, { id: 'a-specimen', parentId: 'root', name: 'a.txt', kind: 'text' })
  state = createNode(state, { id: 'z-drawer', parentId: 'root', name: 'z-drawer', kind: 'folder' })
  // Deliberately NOT catalog order on the grid.
  state = setIconPosition(state, 'z-drawer', { x: 3, y: 1 })
  state = setIconPosition(state, 'b-drawer', { x: 2, y: 0 })
  state = setIconPosition(state, 'a-specimen', { x: 1, y: 2 })
  return state
}

/* ------------------------------ dedupe ----------------------------------- */

describe('dedupeName', () => {
  it('returns the base when no sibling carries it', () => {
    expect(dedupeName('New Drawer', ['Projects', 'Field Notes'])).toBe('New Drawer')
  })

  it('takes the next free numeric suffix on collision', () => {
    expect(dedupeName('New Drawer', ['New Drawer'])).toBe('New Drawer 2')
    expect(dedupeName('New Drawer', ['New Drawer', 'New Drawer 2'])).toBe('New Drawer 3')
  })

  it('fills the first GAP in the suffix series', () => {
    expect(dedupeName('New Specimen', ['New Specimen', 'New Specimen 3'])).toBe('New Specimen 2')
  })

  it('matches case-insensitively (the FS sibling-name rule)', () => {
    expect(dedupeName('New Drawer', ['new drawer'])).toBe('New Drawer 2')
  })

  it('trims sibling labels before comparing', () => {
    expect(dedupeName('New Drawer', ['  New Drawer  '])).toBe('New Drawer 2')
  })
})

/* ------------------------------ creation --------------------------------- */

describe('createCatalogEntry', () => {
  it('creates a fresh drawer under the plain base label with a DRW accession', () => {
    const next = createCatalogEntry(fixtureState(), 'root', 'folder', NEW_DRAWER_LABEL)
    const created = Object.values(next.nodes).find((n) => n.name === 'New Drawer')
    expect(created).toMatchObject({ kind: 'folder', parentId: 'root', accession: 'DRW-0003' })
  })

  it('creates a fresh text specimen with empty content and an SPC accession', () => {
    const next = createCatalogEntry(fixtureState(), 'root', 'text', NEW_SPECIMEN_LABEL)
    const created = Object.values(next.nodes).find((n) => n.name === 'New Specimen')
    expect(created).toMatchObject({ kind: 'text', content: '', parentId: 'root', accession: 'SPC-0002' })
  })

  it('dedupes against existing sibling labels', () => {
    let state = fixtureState()
    state = createCatalogEntry(state, 'root', 'folder', NEW_DRAWER_LABEL)
    state = createCatalogEntry(state, 'root', 'folder', NEW_DRAWER_LABEL)
    const names = Object.values(state.nodes)
      .filter((n) => n.parentId === 'root' && n.name.startsWith('New Drawer'))
      .map((n) => n.name)
    expect(names).toEqual(['New Drawer', 'New Drawer 2'])
  })

  it('scopes the dedupe to the destination drawer (nested create)', () => {
    const state = fixtureState()
    const next = createCatalogEntry(state, 'b-drawer', 'folder', NEW_DRAWER_LABEL)
    // Root already has no "New Drawer", but we file into b-drawer: plain base.
    const created = Object.values(next.nodes).find((n) => n.name === 'New Drawer')
    expect(created?.parentId).toBe('b-drawer')
  })
})

/* ------------------------------ arrange ---------------------------------- */

describe('arrangeByAccession', () => {
  it('re-grids root children in catalog (accession) order, column-major', () => {
    const next = arrangeByAccession(fixtureState())

    // Catalog order for the fixture: DRW-0001 b-drawer, DRW-0002 z-drawer,
    // SPC-0001 a-specimen — the grid walks down each column in that order.
    expect(next.iconPositions['b-drawer']).toEqual({ x: 0, y: 0 })
    expect(next.iconPositions['z-drawer']).toEqual({ x: 0, y: 1 })
    expect(next.iconPositions['a-specimen']).toEqual({ x: 0, y: 2 })
  })

  it('moves right one column only after the shared row cap', () => {
    let state = emptyFSState(0)
    for (let i = 0; i < MAX_GRID_ROWS + 2; i += 1) {
      state = createNode(state, {
        id: `n${i}`,
        parentId: 'root',
        name: `n${i}.txt`,
        kind: 'text',
      })
    }
    const next = arrangeByAccession(state)
    expect(next.iconPositions['n0']).toEqual({ x: 0, y: 0 })
    expect(next.iconPositions[`n${MAX_GRID_ROWS - 1}`]).toEqual({ x: 0, y: MAX_GRID_ROWS - 1 })
    expect(next.iconPositions[`n${MAX_GRID_ROWS}`]).toEqual({ x: 1, y: 0 })
    expect(next.iconPositions[`n${MAX_GRID_ROWS + 1}`]).toEqual({ x: 1, y: 1 })
  })

  it('is idempotent — arranging an arranged hold changes nothing', () => {
    const once = arrangeByAccession(fixtureState())
    expect(arrangeByAccession(once).iconPositions).toEqual(once.iconPositions)
  })

  it('leaves the node map untouched (positions only)', () => {
    const state = fixtureState()
    const next = arrangeByAccession(state)
    expect(next.nodes).toBe(state.nodes) // structural sharing: same reference
  })
})
