import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

/**
 * FS store — THIN TYPED PLACEHOLDER (IM-2). The real FS domain model lands in MF-1
 * (`src/lib/fs/`: node types, accession codes, schema version + migrations, pure
 * create/rename/move/delete ops with collision + cycle handling). Nothing here
 * duplicates that work; this module fixes only the SEAM:
 *
 *   injected FSState  ──init()──▶  store  ──commit(next)──▶  exactly one notification
 *                                     │
 *                                     └── MF-2 subscribes via useFSStore.subscribe(selector, listener)
 *
 * - `commit` is the ONLY mutation path: one atomic replace per operation (and per
 *   icon-drag pointerup, per the RQ-2 two-phase pattern — never at pointermove rate).
 * - The exported `*Placeholder` helpers are deliberately naive (no collision, cycle,
 *   or kind validation) and exist so callers/tests can exercise the commit seam
 *   before MF-1's real ops exist. MF-1's pure functions slot in unchanged:
 *   `useFSStore.getState().commit(moveNode(useFSStore.getState().fs, id, target))`.
 */

/**
 * PLACEHOLDER node shape — MF-1 replaces with the real domain model.
 * Kind union mirrors MF-1's specced set (folder/text/image/app-link) for typing only.
 */
export interface FSPlaceholderNode {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly kind: 'folder' | 'text' | 'image' | 'app-link'
}

/** PLACEHOLDER state shape — MF-1 lands the versioned schema + migration harness. */
export interface FSState {
  readonly version: number
  readonly rootId: string
  readonly nodes: Readonly<Record<string, FSPlaceholderNode>>
  readonly iconPositions: Readonly<Record<string, { readonly x: number; readonly y: number }>>
}

/** Root-only tree the store holds until MF-2 injects the persisted/seeded state. */
export function createEmptyFSState(): FSState {
  return {
    version: 0,
    rootId: 'root',
    nodes: { root: { id: 'root', parentId: null, name: 'Archive', kind: 'folder' } },
    iconPositions: {},
  }
}

export interface FSStoreState {
  readonly fs: FSState
  /** Inject persisted or seeded state (MF-2 loader). Replaces the whole tree atomically. */
  init: (state: FSState) => void
  /** Single atomic replace — the only mutation path; fires store listeners exactly once. */
  commit: (next: FSState) => void
}

export const useFSStore = create<FSStoreState>()(
  subscribeWithSelector((set) => ({
    fs: createEmptyFSState(),
    init: (state) => set({ fs: state }),
    commit: (next) => set({ fs: next }),
  })),
)

/* --------------------------------------------------------------------------
 * Naive placeholder ops (store-agnostic, pure). MF-1's real ops replace these;
 * signatures follow the same state-in/state-out shape so call sites survive.
 * ------------------------------------------------------------------------ */

export interface CreateNodePlaceholderInput {
  readonly parentId: string
  readonly name: string
  readonly kind: FSPlaceholderNode['kind']
  readonly id?: string
}

export function createNodePlaceholder(state: FSState, input: CreateNodePlaceholderInput): FSState {
  const id = input.id ?? crypto.randomUUID()
  const node: FSPlaceholderNode = {
    id,
    parentId: input.parentId,
    name: input.name,
    kind: input.kind,
  }
  return { ...state, nodes: { ...state.nodes, [id]: node } }
}

export function moveNodePlaceholder(state: FSState, id: string, parentId: string): FSState {
  const node = state.nodes[id]
  if (!node) return state
  return { ...state, nodes: { ...state.nodes, [id]: { ...node, parentId } } }
}

export function setIconPositionPlaceholder(
  state: FSState,
  id: string,
  position: { x: number; y: number },
): FSState {
  return { ...state, iconPositions: { ...state.iconPositions, [id]: position } }
}
