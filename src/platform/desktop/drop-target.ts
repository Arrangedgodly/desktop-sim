/**
 * Drop-on-folder validation (IM-5) — the PURE decision half of the drop.
 *
 * `resolveDropTarget` answers "may `draggedId` be filed into `targetId`?"
 * against the live FS state, with no DOM anywhere: the gesture hook
 * (use-specimen-drag.ts) owns the hit-testing (elementFromPoint under a
 * pointer-transparent ghost, RQ-3) and consults this for BOTH the live folder
 * highlight and the pointerup commit, so the affordance and the commit can
 * never disagree.
 *
 * The rules mirror `moveNode` (MF-1) — the commit op re-enforces every one of
 * them as defense in depth:
 * - only folders receive drops (a specimen is not a drawer);
 * - nothing files into its own subtree (cycle prevention — this is the rule
 *   that rejects a drawer dropped on its own child);
 * - no no-op "already filed here" drops (same-location);
 * - nothing drops onto itself (the ghost is pointer-transparent, so this is
 *   defensive — but a defensive rule at the seam is cheaper than a surprise).
 *
 * Rejections are SOFT by contract: the caller bounces the specimen back to its
 * slot with the in-world shake; no store write ever happens.
 */

import { isFolderNode, isWithinSubtree, type FSState } from '../../lib/fs'

/** Why a drop was refused. Each maps to a `moveNode` refusal (or self-drop). */
export type DropRejectReason = 'self' | 'not-a-folder' | 'descendant-of-self' | 'same-location'

export type DropResolution =
  /** No specimen under the pointer — a bare-plate drop (grid-snap reposition). */
  | { readonly status: 'none' }
  /** A drawer that will receive the specimen — highlight it, commit moveNode. */
  | { readonly status: 'folder'; readonly targetId: string }
  /** A specimen was under the pointer but may not receive — shake and bounce. */
  | { readonly status: 'rejected'; readonly targetId: string; readonly reason: DropRejectReason }

/**
 * Validate a candidate drop. `targetId === null` means the hit-test found no
 * specimen (bare desktop). An unknown target id (deleted mid-gesture) reads as
 * `none`, not `rejected` — there is nothing under the pointer to shake AT.
 */
export function resolveDropTarget(
  state: FSState,
  draggedId: string,
  targetId: string | null,
): DropResolution {
  if (targetId === null) return { status: 'none' }
  if (targetId === draggedId) return { status: 'rejected', targetId, reason: 'self' }

  const dragged = state.nodes[draggedId]
  const target = state.nodes[targetId]
  if (!dragged || !target) return { status: 'none' }

  if (!isFolderNode(target)) return { status: 'rejected', targetId, reason: 'not-a-folder' }
  if (isWithinSubtree(state, targetId, draggedId)) {
    return { status: 'rejected', targetId, reason: 'descendant-of-self' }
  }
  if (dragged.parentId === targetId) {
    return { status: 'rejected', targetId, reason: 'same-location' }
  }
  return { status: 'folder', targetId }
}
