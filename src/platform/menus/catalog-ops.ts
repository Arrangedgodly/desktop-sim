/**
 * Catalog operations behind the desktop's context menus (UI-5) — pure FS
 * math, zero React. Everything routes through the REAL domain ops (MF-1):
 * the store's single atomic commit applies whatever these return.
 *
 * Naming law: a fresh drawer/specimen gets the plain base label ("New
 * Drawer" / "New Specimen"); a collision takes the next free numeric
 * suffix — compared case-insensitively, matching the sibling-name rule the
 * FS model itself enforces (ops.ts). The accession CODE on the parchment
 * label is allocated by createNode's series counters, untouched by naming.
 *
 * Arrange law: "Arrange by Accession" re-grids the hold's root children in
 * CATALOG order (the same accession sort every listing uses), column-major
 * with the grid's shared row cap — the same walk grid.ts uses for
 * auto-placed icons, so an arranged desktop and a freshly-auto-laid one
 * agree on shape. Only root children get positions (the invariant), and
 * every position change is one setIconPosition per node through the store
 * commit — the menu fires ONE commit for the whole arrangement.
 */

import {
  createNode,
  listChildren,
  setIconPosition,
  type FSState,
} from '../../lib/fs'
import { MAX_GRID_ROWS } from '../desktop/grid'

/** Base label for a fresh drawer (world vocabulary: drawers, not folders). */
export const NEW_DRAWER_LABEL = 'New Drawer'

/** Base label for a fresh text specimen. */
export const NEW_SPECIMEN_LABEL = 'New Specimen'

/**
 * First free label for a base among sibling names: the base itself, then
 * `base 2`, `base 3`, … (case-insensitive, matching the FS name rule).
 */
export function dedupeName(base: string, siblingNames: readonly string[]): string {
  const taken = new Set(siblingNames.map((name) => name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let serial = 2
  while (taken.has(`${base} ${serial}`.toLowerCase())) serial += 1
  return `${base} ${serial}`
}

/**
 * Create a fresh drawer/specimen in `parentId` under a deduped base label.
 * Pure: returns the next FSState. The accession code rides the node.
 */
export function createCatalogEntry(
  state: FSState,
  parentId: string,
  kind: 'folder' | 'text',
  baseLabel: string,
): FSState {
  const siblings = listChildren(state, parentId).map((node) => node.name)
  const name = dedupeName(baseLabel, siblings)
  return createNode(state, { parentId, name, kind, ...(kind === 'text' ? { content: '' } : {}) })
}

/**
 * Re-grid every root child in catalog (accession) order, column-major with
 * the grid's row cap. Positions for nodes that already sit exactly where
 * the walk puts them are re-pinned to the same value (set-stable).
 */
export function arrangeByAccession(state: FSState): FSState {
  const children = listChildren(state, state.rootId)
  let next = state
  children.forEach((node, index) => {
    next = setIconPosition(next, node.id, {
      x: Math.floor(index / MAX_GRID_ROWS),
      y: index % MAX_GRID_ROWS,
    })
  })
  return next
}
