/**
 * Storage status surface (MF-2) — the ONE place downstream tasks read the
 * persistence subsystem's health. This is deliberately state, not UI:
 *
 * - HU-1 renders `recovery` (corruption recovery screen offering Reset) and
 *   `lastFailure` (quota toast) later.
 * - AP-4 renders `lastSavedAt` / `lastFailure` as its storage readout.
 * - UI-2 reads `firstVisit` (also available synchronously via `readBootFlag()`
 *   for the pre-boot pacing decision).
 *
 * Zustand + subscribeWithSelector, per the house store pattern; owned by
 * persistence.ts (only that module writes lifecycle fields).
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { StorageFailure } from './errors'
import type { RecoveryNotice } from './types'

export type StoragePhase = 'idle' | 'loading' | 'ready'

/** Where the hydrated session came from (AP-4 readout / diagnostics). */
export type BootOrigin = 'stored' | 'migrated' | 'seed' | 'backup'

export interface StorageStatusState {
  /** Boot lifecycle: idle → loading (bootPersistence started) → ready (hydrated). */
  readonly phase: StoragePhase
  /**
   * True until a return visit is proven (boot flag read). UI-2 paces the full
   * boot on this; data-wise it is a HINT, never proof (see boot-flag.ts).
   */
  readonly firstVisit: boolean
  readonly bootOrigin: BootOrigin | null
  /** Epoch ms of the last successful write, if any. */
  readonly lastSavedAt: number | null
  /** Count of successful writes this session (AP-4 diagnostics). */
  readonly saveCount: number
  /** Last write/boot failure (quota/unavailable/…). Cleared by the next
   *  successful save — a failed save never discards the in-memory session. */
  readonly lastFailure: StorageFailure | null
  /** Recovery notice from the last boot (corruption/unavailable). Persists
   *  until dismissed — HU-1 renders it; `dismissRecovery()` is its seam. */
  readonly recovery: RecoveryNotice | null

  /** MF-2 internal — lifecycle writer. */
  setBoot: (patch: { phase?: StoragePhase; firstVisit?: boolean; bootOrigin?: BootOrigin }) => void
  /** MF-2 internal — successful write bookkeeping. */
  noteSaved: (at: number) => void
  /** MF-2 internal — failure bookkeeping. */
  noteFailure: (failure: StorageFailure) => void
  /** MF-2 internal — recovery notice writer (also clears lastFailure context). */
  noteRecovery: (recovery: RecoveryNotice) => void
  /** HU-1 seam — dismiss the recovery notice. */
  dismissRecovery: () => void
  /** HU-1 seam — dismiss the failure toast. */
  clearFailure: () => void
}

export const useStorageStatusStore = create<StorageStatusState>()(
  subscribeWithSelector((set, get) => ({
    phase: 'idle',
    firstVisit: true,
    bootOrigin: null,
    lastSavedAt: null,
    saveCount: 0,
    lastFailure: null,
    recovery: null,

    setBoot: (patch) => set(patch),
    noteSaved: (at) => set({ lastSavedAt: at, saveCount: get().saveCount + 1, lastFailure: null }),
    noteFailure: (failure) => set({ lastFailure: failure }),
    noteRecovery: (recovery) => set({ recovery }),
    dismissRecovery: () => set({ recovery: null }),
    clearFailure: () => set({ lastFailure: null }),
  })),
)
