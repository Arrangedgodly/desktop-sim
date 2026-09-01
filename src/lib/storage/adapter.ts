/**
 * The production `StorageAdapter` (MF-2) — IndexedDB via idb-keyval v6, per the
 * committed RQ-1 decision (research/rq1-storage.md): single structured-clone
 * envelope, one fixed key, ~0.3–0.6 KB gz library cost, async writes off the
 * render path, quota headroom a fraction of disk instead of localStorage's
 * hard 5 MiB wall.
 *
 * Storage layout (one object store, two keys):
 *   desktop-sim/state          the current envelope (atomic single-key puts)
 *   desktop-sim/state:backup   snapshot of the last pre-migration blob
 *
 * Failure classification lives in errors.ts — every rejection that escapes
 * this adapter is a typed StorageError. A put is one IDB transaction, so a
 * mid-write interruption (tab kill, crash) either lands the whole envelope or
 * leaves the previous one untouched — the corruption window this layer can
 * open is "stale", never "torn".
 */

import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval'
import { classifyStorageError } from './errors'
import type { StorageAdapter, StoredState } from './types'

export const STATE_DB_NAME = 'desktop-sim'
export const STATE_STORE_NAME = 'state'
export const STATE_KEY = 'desktop-sim/state'
export const BACKUP_KEY = 'desktop-sim/state:backup'

export interface IDBStorageAdapterOptions {
  /**
   * Pre-built idb-keyval store (from `createStore`). Tests and HU-1 fault
   * injection use this to aim the adapter at an isolated fake-indexeddb
   * database; production uses the default store below.
   */
  readonly store?: UseStore
}

async function wrap<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw classifyStorageError(error)
  }
}

export class IDBStorageAdapter implements StorageAdapter {
  private readonly store: UseStore

  constructor(options: IDBStorageAdapterOptions = {}) {
    this.store = options.store ?? createStore(STATE_DB_NAME, STATE_STORE_NAME)
  }

  load(): Promise<StoredState | null> {
    return wrap(async () => {
      const value = (await get(STATE_KEY, this.store)) as StoredState | undefined
      return value === undefined ? null : value
    })
  }

  save(state: StoredState): Promise<void> {
    return wrap(() => set(STATE_KEY, state, this.store))
  }

  saveBackup(raw: unknown): Promise<void> {
    return wrap(() => set(BACKUP_KEY, raw, this.store))
  }

  loadBackup(): Promise<StoredState | null> {
    return wrap(async () => {
      const value = (await get(BACKUP_KEY, this.store)) as StoredState | undefined
      return value === undefined ? null : value
    })
  }

  async clear(): Promise<void> {
    // clear() wipes the whole store (both keys) in one transaction — the Reset
    // desktop seam wants exactly that.
    return wrap(() => clear(this.store))
  }

  /** Remove only the backup key (kept for symmetry/debugging). */
  deleteBackup(): Promise<void> {
    return wrap(() => del(BACKUP_KEY, this.store))
  }
}

/** The adapter the app boots with unless a test/fault-injector passes one in. */
export const defaultIDBAdapter: IDBStorageAdapter = new IDBStorageAdapter()

/**
 * AP-4 readout seam: usage/quota via `navigator.storage.estimate()` (Chrome 61+,
 * Firefox 57+, Safari 17+). Feature-detected — `null` when unsupported, never a
 * throw. Values are the browser's best-effort estimates, not promises.
 */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const storage = globalThis.navigator?.storage
    if (!storage?.estimate) return null
    const { usage = 0, quota = 0 } = await storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}

/**
 * RQ-1 note 6: best-effort `navigator.storage.persist()` (engagement-gated in
 * Chrome, promptless in Safari 17+) to shield the archive from best-effort LRU
 * eviction under disk pressure. Fire-and-forget; resolves false when
 * unsupported/denied. Call ONCE after the first meaningful interaction
 * (UI-2/UI-3 own that moment — not boot, which proves nothing about intent).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = globalThis.navigator?.storage
    if (!storage?.persist) return false
    return await storage.persist()
  } catch {
    return false
  }
}
