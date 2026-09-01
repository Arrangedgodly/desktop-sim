/**
 * Pure FS operations (MF-1) — state in, state out, zero side effects.
 *
 * Usage pattern (the IM-2 seam, unchanged):
 *   useFSStore.getState().commit(moveNode(useFSStore.getState().fs, id, target))
 * Nothing here touches a store, the DOM, or persistence (MF-2).
 *
 * Rules:
 * - Mutations THROW `FSError` on rule violations (codes in errors.ts);
 *   queries (`findNode`, `pathOf`) return null on missing ids, never throw.
 * - Names are unique among siblings of the same parent, compared
 *   case-INSENSITIVELY after trimming (two labels may not differ only by
 *   case — keeps paths unambiguous).
 * - `moveNode` refuses: into a non-folder, into the node's own subtree
 *   (cycle prevention), and any move of the root; it also enforces the
 *   sibling-name rule in the destination drawer.
 * - `deleteNode` is recursive for folders and prunes the subtree's icon
 *   positions. `moveNode` prunes the moved subtree's positions too — a
 *   position is a desktop placement, and a moved node re-contextualizes.
 * - The root is protected: it cannot be renamed, moved, or deleted.
 */

import { compareAccessions, nextAccessionCode } from './accession'
import { FSError } from './errors'
import {
  ROOT_ACCESSION,
  ROOT_ID,
  ROOT_NAME,
  type FSFolderNode,
  type FSNode,
  type FSNodeKind,
  type FSState,
  type FSTree,
  type GridPosition,
  type IconPositionMap,
} from './types'

/* --------------------------------------------------------------------------
 * Roots and empty state
 * ------------------------------------------------------------------------ */

/** The catalog root: the hold itself, outside every accession series. */
export function createRootNode(now: number): FSFolderNode {
  return {
    id: ROOT_ID,
    parentId: null,
    name: ROOT_NAME,
    kind: 'folder',
    accession: ROOT_ACCESSION,
    accessionedAt: now,
  }
}

/** Root-only state — the empty catalog. Seed (seed.ts) grows from this. */
export function emptyFSState(now: number = 0): FSState {
  return {
    rootId: ROOT_ID,
    nodes: { [ROOT_ID]: createRootNode(now) },
    iconPositions: {},
  }
}

/* --------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/** Node by id, or null. Never throws. */
export function findNode(tree: FSTree, id: string): FSNode | null {
  return tree.nodes[id] ?? null
}

/**
 * Direct children of a drawer, in catalog order (accession series, then
 * serial). Listing a non-folder throws `not-a-folder` — that is a caller bug.
 */
export function listChildren(tree: FSTree, parentId: string): FSNode[] {
  const parent = tree.nodes[parentId]
  if (!parent) throw new FSError('not-found', `no node ${JSON.stringify(parentId)}`)
  if (parent.kind !== 'folder') {
    throw new FSError(
      'not-a-folder',
      `${parent.accession} ${JSON.stringify(parent.name)} is not a drawer`,
    )
  }
  return Object.values(tree.nodes)
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => compareAccessions(a.accession, b.accession))
}

/**
 * Label path from the root, `/'-joined: `/Hold/Projects/exhibit-01.txt`.
 * Null when the id is unknown or the parent chain is broken.
 */
export function pathOf(tree: FSTree, id: string): string | null {
  const segments: string[] = []
  let current = tree.nodes[id]
  while (current) {
    segments.unshift(current.name)
    if (current.parentId === null) {
      return `/${segments.join('/')}`
    }
    current = tree.nodes[current.parentId]
  }
  return null
}

/* --------------------------------------------------------------------------
 * Mutations
 * ------------------------------------------------------------------------ */

export interface CreateNodeInput {
  readonly parentId: string
  readonly name: string
  readonly kind: FSNodeKind
  /** Explicit id (tests/seed determinism); default crypto.randomUUID(). */
  readonly id?: string
  /** Injectable clock (tests/seed determinism); default Date.now(). */
  readonly now?: number
  /** text specimens: initial content (default ''). */
  readonly content?: string
  /** image specimens: required src (URL or data URI). */
  readonly src?: string
  /** app links: required target AppManifest id. */
  readonly appId?: string
}

/** Trim and validate a catalog label. Throws `invalid-name`. */
function normalizeName(raw: string): string {
  const name = raw.trim()
  if (name.length === 0) {
    throw new FSError('invalid-name', 'a catalog label may not be empty')
  }
  if (name.includes('/')) {
    throw new FSError(
      'invalid-name',
      `label ${JSON.stringify(name)} may not contain '/' (path separator)`,
    )
  }
  return name
}

function assertNoSiblingCollision(
  nodes: Readonly<Record<string, FSNode>>,
  parentId: string,
  name: string,
  ignoreId?: string,
): void {
  const clash = Object.values(nodes).find(
    (node) =>
      node.parentId === parentId &&
      node.id !== ignoreId &&
      node.name.toLowerCase() === name.toLowerCase(),
  )
  if (clash) {
    throw new FSError(
      'name-collision',
      `${JSON.stringify(name)} is already catalogued in this drawer (${clash.accession})`,
    )
  }
}

/** All ids in the subtree rooted at `id`, inclusive. Desktop-scale O(n·depth). */
function subtreeIds(nodes: Readonly<Record<string, FSNode>>, id: string): string[] {
  const doomed: string[] = []
  const queue: string[] = [id]
  while (queue.length > 0) {
    const current = queue.shift()!
    doomed.push(current)
    for (const node of Object.values(nodes)) {
      if (node.parentId === current) queue.push(node.id)
    }
  }
  return doomed
}

/** Is `candidateId` inside the subtree rooted at `ancestorId` (inclusive)? */
function isWithinSubtree(
  nodes: Readonly<Record<string, FSNode>>,
  candidateId: string,
  ancestorId: string,
): boolean {
  let current: FSNode | undefined = nodes[candidateId]
  while (current) {
    if (current.id === ancestorId) return true
    current = current.parentId === null ? undefined : nodes[current.parentId]
  }
  return false
}

function omitKeys<T>(
  record: Readonly<Record<string, T>>,
  keys: readonly string[],
): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) {
    if (!keys.includes(key)) next[key] = value
  }
  return next
}

function prunePositions(state: FSState, ids: readonly string[]): IconPositionMap {
  return omitKeys(state.iconPositions, ids)
}

/** Accession a new node into a drawer. See {@link CreateNodeInput}. */
export function createNode(state: FSState, input: CreateNodeInput): FSState {
  const parent = state.nodes[input.parentId]
  if (!parent) throw new FSError('not-found', `no drawer ${JSON.stringify(input.parentId)}`)
  if (parent.kind !== 'folder') {
    throw new FSError(
      'not-a-folder',
      `${parent.accession} ${JSON.stringify(parent.name)} is not a drawer`,
    )
  }

  const name = normalizeName(input.name)
  assertNoSiblingCollision(state.nodes, input.parentId, name)

  const id = input.id ?? crypto.randomUUID()
  if (state.nodes[id]) {
    throw new FSError('invalid-data', `node id ${JSON.stringify(id)} already exists`)
  }

  const accession = nextAccessionCode(state.nodes, input.kind)
  const accessionedAt = input.now ?? Date.now()
  const base = { id, parentId: input.parentId, name, accession, accessionedAt }

  let node: FSNode
  switch (input.kind) {
    case 'folder':
      if (input.content !== undefined || input.src !== undefined || input.appId !== undefined) {
        throw new FSError('invalid-data', 'drawers carry no content/src/appId')
      }
      node = { ...base, kind: 'folder' }
      break
    case 'text':
      if (input.src !== undefined || input.appId !== undefined) {
        throw new FSError('invalid-data', 'text specimens carry no src/appId')
      }
      node = { ...base, kind: 'text', content: input.content ?? '' }
      break
    case 'image':
      if (input.content !== undefined || input.appId !== undefined) {
        throw new FSError('invalid-data', 'plates carry no content/appId')
      }
      if (typeof input.src !== 'string' || input.src.length === 0) {
        throw new FSError('invalid-data', 'a plate requires a src (URL or data URI)')
      }
      node = { ...base, kind: 'image', src: input.src }
      break
    case 'app-link':
      if (input.content !== undefined || input.src !== undefined) {
        throw new FSError('invalid-data', 'module refs carry no content/src')
      }
      if (typeof input.appId !== 'string' || input.appId.length === 0) {
        throw new FSError('invalid-data', 'a module reference requires an appId')
      }
      node = { ...base, kind: 'app-link', appId: input.appId }
      break
  }

  return { ...state, nodes: { ...state.nodes, [id]: node } }
}

/** Relabel a specimen/drawer. Same name (already normalized) is a no-op. */
export function renameNode(state: FSState, id: string, nextName: string): FSState {
  const node = state.nodes[id]
  if (!node) throw new FSError('not-found', `no node ${JSON.stringify(id)}`)
  if (node.id === state.rootId) {
    throw new FSError('root-protected', 'the hold itself cannot be relabeled')
  }

  const name = normalizeName(nextName)
  if (name === node.name) return state // already labelled exactly so

  assertNoSiblingCollision(state.nodes, node.parentId!, name, id)
  return { ...state, nodes: { ...state.nodes, [id]: { ...node, name } } }
}

/**
 * Move a node into a drawer. Cycle prevention: a drawer may never move into
 * its own subtree (including itself); moves into non-folders are rejected.
 * Effective moves prune the moved subtree's icon positions (a position is a
 * desktop placement; the destination drawer re-contextualizes the node).
 */
export function moveNode(state: FSState, id: string, newParentId: string): FSState {
  const node = state.nodes[id]
  if (!node) throw new FSError('not-found', `no node ${JSON.stringify(id)}`)
  const target = state.nodes[newParentId]
  if (!target) throw new FSError('not-found', `no drawer ${JSON.stringify(newParentId)}`)
  if (node.id === state.rootId) {
    throw new FSError('root-protected', 'the hold itself cannot be moved')
  }
  if (target.kind !== 'folder') {
    throw new FSError(
      'not-a-folder',
      `${target.accession} ${JSON.stringify(target.name)} is a specimen, not a drawer`,
    )
  }
  if (isWithinSubtree(state.nodes, newParentId, id)) {
    throw new FSError(
      'cycle',
      `a drawer cannot be filed inside its own subtree (${node.accession} → ${target.accession})`,
    )
  }
  if (node.parentId === newParentId) return state // already filed there

  assertNoSiblingCollision(state.nodes, newParentId, node.name)

  const pruned = prunePositions(state, subtreeIds(state.nodes, id))
  return {
    ...state,
    nodes: { ...state.nodes, [id]: { ...node, parentId: newParentId } },
    iconPositions: pruned,
  }
}

/** Remove a node; folders take their whole subtree. Prunes icon positions. */
export function deleteNode(state: FSState, id: string): FSState {
  const node = state.nodes[id]
  if (!node) throw new FSError('not-found', `no node ${JSON.stringify(id)}`)
  if (node.id === state.rootId) {
    throw new FSError('root-protected', 'the hold itself cannot be decommissioned')
  }

  const doomed = subtreeIds(state.nodes, id)
  return {
    ...state,
    nodes: omitKeys(state.nodes, doomed),
    iconPositions: prunePositions(state, doomed),
  }
}

/** Pin a node to a desktop grid slot (integers, column/row ≥ 0). */
export function setIconPosition(state: FSState, id: string, position: GridPosition): FSState {
  const node = state.nodes[id]
  if (!node) throw new FSError('not-found', `no node ${JSON.stringify(id)}`)
  for (const axis of ['x', 'y'] as const) {
    const value = position[axis]
    if (!Number.isInteger(value) || value < 0) {
      throw new FSError(
        'invalid-data',
        `icon position ${axis} must be an integer ≥ 0 (got ${value})`,
      )
    }
  }
  return { ...state, iconPositions: { ...state.iconPositions, [id]: { ...position } } }
}
