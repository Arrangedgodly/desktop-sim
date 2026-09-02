/**
 * Storage-notice model (HU-1) — the pure view-model that turns MF-2's status
 * surfaces (`recovery`, `lastFailure`) into the one bottom-right notice card,
 * plus the one-time "view the vault readout" link's session state.
 *
 * CARD LAW (dispatch): dismiss-only (no auto-expire), MAX ONE visible, NEWEST
 * WINS — the card shows the most recent of the live recovery / failure
 * surfaces; dismissing it clears THAT surface and the other (if still live)
 * may then take the slot. Copy is honest per kind — no generic text over a
 * specific failure.
 */

import type { RecoveryNotice, StorageFailure } from '../../lib/storage'

/** The two notice families the card renders. */
export type StorageNoticeKind = 'recovery' | 'failure'

export interface StorageNoticeView {
  readonly kind: StorageNoticeKind
  /** 'recovery' | 'quota' | 'unavailable' — the specific surface. */
  readonly surface: string
  readonly title: string
  readonly message: string
  readonly at: number
}

const RECOVERY_COPY: Readonly<Record<RecoveryNotice['kind'], string>> = {
  reseeded: 'catalog reseeded from the seed collection',
  'restored-from-backup': 'catalog reseeded from backup',
  'unknown-version': 'stored archive was unreadable — catalog reseeded',
  'storage-unavailable': 'storage is unavailable — this session runs in memory only',
}

const FAILURE_COPY: Readonly<Record<StorageFailure['kind'], { title: string; message: string }>> = {
  quota: {
    title: 'ARCHIVE AT CAPACITY',
    message: 'changes may not persist',
  },
  unavailable: {
    title: 'ARCHIVE OFFLINE',
    message: 'storage refused the write — changes may not persist',
  },
  corrupt: {
    title: 'ARCHIVE FAULT',
    message: 'the last write was refused — changes may not persist',
  },
  'unknown-version': {
    title: 'ARCHIVE FAULT',
    message: 'the last write was refused — changes may not persist',
  },
}

function recoveryView(recovery: RecoveryNotice): StorageNoticeView {
  return {
    kind: 'recovery',
    surface: recovery.kind,
    title: 'ARCHIVE RECOVERED',
    message: RECOVERY_COPY[recovery.kind],
    at: recovery.at,
  }
}

function failureView(failure: StorageFailure): StorageNoticeView {
  const copy = FAILURE_COPY[failure.kind]
  return {
    kind: 'failure',
    surface: failure.kind,
    title: copy.title,
    message: copy.message,
    at: failure.at,
  }
}

/**
 * The one card to show right now: the NEWEST live surface (recovery wins a
 * timestamp tie — it is the boot-time event a failure would post-date), or
 * null when both are clear/dismissed.
 */
export function selectStorageNotice(
  recovery: RecoveryNotice | null,
  failure: StorageFailure | null,
): StorageNoticeView | null {
  if (recovery !== null && (failure === null || recovery.at >= failure.at)) {
    return recoveryView(recovery)
  }
  if (failure !== null) return failureView(failure)
  return null
}

/* --------------------------------------------------------------------------
 * The one-time vault link (recovery notices only): clicking it opens Console
 * Settings AT the vault readout once per session; afterwards the link hides
 * (the notice itself stays until dismissed). Module state — a reload clears
 * it with every other per-session memory.
 * ------------------------------------------------------------------------ */

let vaultLinkUsed = false

/** Has the vault link already been used this session? */
export function vaultLinkConsumed(): boolean {
  return vaultLinkUsed
}

/** Consume the one-time link (the click handler). Returns false if already used. */
export function consumeVaultLink(): boolean {
  if (vaultLinkUsed) return false
  vaultLinkUsed = true
  return true
}

/** Test seam: restore the one-time link. */
export function resetVaultLink(): void {
  vaultLinkUsed = false
}
