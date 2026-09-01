/**
 * Persistence layer (MF-2) — IndexedDB via idb-keyval v6 per the committed
 * RQ-1 decision (docs/ultron/research/rq1-storage.md, "Implementation
 * consequences" is normative for this barrel):
 *
 * - ONE structured-clone envelope under ONE key (`desktop-sim/state`), schema
 *   `version` inside the payload, migrations via MF-1's `migrate()` in app
 *   code — no IDB-native schema upgrades. A pre-migration snapshot lives at
 *   `desktop-sim/state:backup`.
 * - Debounced trailing autosave (~500 ms) wired to the three IM-2 stores'
 *   `subscribeWithSelector` seams, with flush-on-hidden/pagehide. A failed
 *   save never discards the in-memory session.
 * - Boot: localStorage flag (`ds:boot`) paces UI-2's animation; the data path
 *   always asks IDB and never destroys a good state because the flag was
 *   missing. Absent state (first visit OR Safari ITP 7-day purge) seeds.
 * - Recovery surfaces as STATE, not UI: `useStorageStatusStore` carries
 *   `recovery` / `lastFailure` / `lastSavedAt` for HU-1 (notice + toast) and
 *   AP-4 (readout + Reset) to render later.
 * - `resetDesktop()` is AP-4's Reset seam: clear → reseed → rehydrate →
 *   immediate write.
 *
 * Module map:
 *   types.ts        StoredState, StorageAdapter, RecoveryNotice, PersistedSettings
 *   errors.ts       StorageError (quota/corrupt/unknown-version/unavailable)
 *   validate.ts     readStoredState — validate + migrate + sanitize untrusted blobs
 *   boot-flag.ts    the synchronous UI-2 seam (defensive localStorage)
 *   adapter.ts      IDBStorageAdapter (idb-keyval) + estimate/persist helpers
 *   stored-state.ts stores ↔ envelope composition + seedStoredState + hydrateStores
 *   autosave.ts     debounced writer, quota trim-retry, page-flush
 *   persistence.ts  bootPersistence / resetDesktop (the only orchestrators)
 *   status.ts       useStorageStatusStore — the recovery/status signal surface
 *
 * LAYERING: the one `src/lib/**` module family that imports from
 * `src/platform/stores` — persistence is defined by the store seams it serves,
 * and the dependency stays one-directional (stores never import storage).
 */

export {
  StorageError,
  isStorageError,
  classifyStorageError,
  toFailureSummary,
  type StorageErrorKind,
  type StorageFailure,
} from './errors'
export {
  defaultPersistedSettings,
  type PersistedSettings,
  type RecoveryKind,
  type RecoveryNotice,
  type SessionWindowState,
  type StorageAdapter,
  type StoredState,
} from './types'
export { readStoredState, sanitizeSettings, sanitizeWindows } from './validate'
export { BOOT_FLAG_KEY, clearBootFlag, readBootFlag, writeBootFlag } from './boot-flag'
export {
  BACKUP_KEY,
  IDBStorageAdapter,
  STATE_DB_NAME,
  STATE_KEY,
  STATE_STORE_NAME,
  defaultIDBAdapter,
  estimateStorage,
  requestPersistentStorage,
  type IDBStorageAdapterOptions,
} from './adapter'
export {
  STORED_SCHEMA_VERSION,
  STORED_SEED_EPOCH,
  buildStoredState,
  hydrateStores,
  seedStoredState,
} from './stored-state'
export {
  DEFAULT_AUTOSAVE_DELAY_MS,
  attachAutosave,
  createAutosave,
  getActiveAdapter,
  registerActiveAdapter,
  stopAutosave,
  type AutosaveHandle,
  type AutosaveOptions,
} from './autosave'
export {
  bootPersistence,
  resetDesktop,
  type BootOptions,
  type BootResult,
  type ResetResult,
} from './persistence'
export {
  useStorageStatusStore,
  type BootOrigin,
  type StoragePhase,
  type StorageStatusState,
} from './status'
