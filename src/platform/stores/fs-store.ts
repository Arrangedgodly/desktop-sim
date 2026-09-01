import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { seedFSState, type FSState } from '../../lib/fs'

export type { FSState }

/**
 * FS store (IM-2 seam, MF-1 model). The store owns NO filesystem logic:
 * every mutation is a PURE function from the domain model (`src/lib/fs`) —
 * createNode / renameNode / moveNode / deleteNode / setIconPosition — applied
 * through the single atomic commit:
 *
 *   useFSStore.getState().commit(moveNode(useFSStore.getState().fs, id, target))
 *
 * - `commit` is the ONLY mutation path: one atomic replace per operation (and
 *   per icon-drag pointerup, per the RQ-2 two-phase pattern — never at
 *   pointermove rate).
 * - Ops throw typed `FSError`s (code in `error.code`); the store stays
 *   untouched when an op throws — callers catch before committing.
 * - Until MF-2 injects persisted state via `init`, the store boots holding
 *   the SEEDED catalog (placeholder specimens awaiting the MF-3 content
 *   pack). MF-2 owns every load-or-reseed decision; this default only makes
 *   the seam alive for IM-5/UI-3 development.
 * - MF-2 subscribes via `useFSStore.subscribe(selector, listener)` and writes
 *   the versioned envelope (`toEnvelope`) on a debounce — persistence is NOT
 *   this module's job.
 */

/** Pristine seeded state the store boots with (referentially stable for tests). */
export const SEED_INITIAL_FS_STATE: FSState = seedFSState()

export interface FSStoreState {
  readonly fs: FSState
  /** Inject persisted or freshly-seeded state (MF-2 loader). Replaces the whole tree atomically. */
  init: (state: FSState) => void
  /** Single atomic replace — the only mutation path; fires store listeners exactly once. */
  commit: (next: FSState) => void
}

export const useFSStore = create<FSStoreState>()(
  subscribeWithSelector((set) => ({
    fs: SEED_INITIAL_FS_STATE,
    init: (state) => set({ fs: state }),
    commit: (next) => set({ fs: next }),
  })),
)
