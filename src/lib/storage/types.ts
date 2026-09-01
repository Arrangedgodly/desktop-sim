/**
 * Persistence contracts (MF-2) — the single structured-clone envelope per RQ-1.
 *
 * ONE value under ONE key holds the whole console: schema version + savedAt +
 * the MF-1 catalog envelope (fs tree + icon positions) + the WM session
 * (window records in stacking order, `launch` contexts riding per IM-3) +
 * settings. Structured clone (not JSON) keeps the payload fidelity; the
 * `version` field lives INSIDE the payload, so migrations run in plain app
 * code (MF-1's `migrate()`) after load — no IDB-native schema upgrades.
 *
 * Layering note: this is the one `src/lib/**` module that deliberately imports
 * from `src/platform/stores` — persistence is defined BY the store seams it
 * serves (fs `init`/`commit`, wm `hydrate`, settings setters). The dependency
 * is one-directional; the stores never import storage.
 */

import type { FSTree, IconPositionMap } from '../fs'
import type { WindowRecord } from '../../platform/stores/wm-store'
import { DEFAULT_WALLPAPER } from '../../platform/stores/settings-store'

/**
 * A window record as persisted. Aliased (not re-declared) so the persisted
 * shape can never drift from the WM store's record — including the optional
 * IM-3 `launch` context, which rides on the record and survives persistence.
 */
export type SessionWindowState = WindowRecord

/** The persisted settings slice — the settings store minus its actions. */
export interface PersistedSettings {
  /** Wallpaper plate id (UI-4's archive plates). */
  readonly wallpaper: string
  /** UI-6's WebAudio console bleeps — muted by default (town-hall). */
  readonly soundsEnabled: boolean
  /** Follow the OS `prefers-reduced-motion` preference (UI-1/DD-2). */
  readonly reducedMotionFollow: boolean
  /** UI-3 docent hints dismissed (one-way once true). */
  readonly docentDismissed: boolean
}

/** Defaults for fields a loaded (v0/migrated/partial) envelope may not carry. */
export function defaultPersistedSettings(): PersistedSettings {
  return {
    wallpaper: DEFAULT_WALLPAPER,
    soundsEnabled: false,
    reducedMotionFollow: true,
    docentDismissed: false,
  }
}

/**
 * THE persisted state — everything that survives a reload. `version` is MF-1's
 * `CURRENT_SCHEMA_VERSION` (one version for the whole envelope; the FS chain
 * in `src/lib/fs/schema.ts` owns the migration steps). `windows` is ordered
 * bottom → top (the persisted z-order).
 */
export interface StoredState {
  readonly version: number
  /** Epoch ms of the last successful write — stamped fresh per write. */
  readonly savedAt: number
  readonly fs: FSTree
  readonly iconPositions: IconPositionMap
  readonly windows: readonly SessionWindowState[]
  readonly settings: PersistedSettings
}

/** Why the console needed a recovery on boot (HU-1 renders the notice later). */
export type RecoveryKind =
  /** Envelope failed validation and no usable backup existed → fresh seed. */
  | 'reseeded'
  /** Main envelope failed validation; the pre-migration backup was good. */
  | 'restored-from-backup'
  /** Envelope carries a schema version this console cannot read (e.g. a newer
   *  console wrote it) → fresh seed; the unreadable blob stays untouched. */
  | 'unknown-version'
  /** Storage is unusable (private mode / blocked / SecurityError) — session
   *  runs fully in memory; nothing can be persisted this visit. */
  | 'storage-unavailable'

export interface RecoveryNotice {
  readonly kind: RecoveryKind
  readonly message: string
  readonly at: number
}

/**
 * The transport contract (RQ-1 interface shape). The idb-keyval adapter in
 * `adapter.ts` is the production implementation; tests and HU-1 fault
 * injection inject fakes.
 *
 * CONTRACT: `load()`/`loadBackup()` return whatever blob sits under the key,
 * typed as `StoredState | null` — the type asserts the KEY's ownership, not
 * the blob's integrity. Callers MUST pass the result through
 * `readStoredState()` (validate.ts) before trusting it. `null` means absent:
 * a fresh visitor OR an eviction (Safari ITP 7-day purge) — both seed.
 *
 * All methods reject with typed `StorageError`s (quota/corrupt/unavailable);
 * `save` never partially writes — one key, one atomic IDB transaction.
 */
export interface StorageAdapter {
  /** Read the state blob. `null` when nothing was ever persisted here. */
  load(): Promise<StoredState | null>
  /** Write the state blob atomically (single-key put). Stamps nothing — the
   *  caller stamps `savedAt` per write. Rejects with a typed StorageError. */
  save(state: StoredState): Promise<void>
  /** Snapshot the pre-migration blob under the backup key (best-effort). */
  saveBackup(raw: unknown): Promise<void>
  /** Read the backup blob. `null` when no backup exists. */
  loadBackup(): Promise<StoredState | null>
  /** Remove state AND backup. Rejects with a typed StorageError. */
  clear(): Promise<void>
}
