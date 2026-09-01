/**
 * Boot orchestration + recovery + reset (MF-2) — the module main.tsx (post
 * UI-2) and AP-4 call. Owns every load-or-reseed decision.
 *
 * BOOT (per RQ-1 notes 1–3, 5):
 *   1. status.phase = loading; read the localStorage boot flag SYNCHRONOUSLY
 *      (UI-2 paces the full ≤2s boot on `firstVisit`; the flag is a hint,
 *      never proof — see boot-flag.ts).
 *   2. adapter.load():
 *        null                       → first visit or ITP eviction → seed
 *        raw → readStoredState()    → validate → migrate (MF-1 chain) → hydrate
 *                                    (a pre-migration backup is written first)
 *   3. hydrateStores() → writeBootFlag() → attachAutosave() (hydration BEFORE
 *      autosave so restoring never schedules a spurious write).
 *
 * RECOVERY (Hulk lens — everything fails eventually):
 *   - corrupt / unknown-version   → try the backup key → else fresh seed;
 *                                   either way a RecoveryNotice lands on the
 *                                   status store (HU-1 renders it later). A
 *                                   future-version blob is preserved as the
 *                                   backup before reseeding, for the day the
 *                                   newer console returns.
 *   - unavailable (private mode /
 *     SecurityError / IDB blocked) → seed IN MEMORY, notice, no IDB reads or
 *                                   writes attempted beyond the failed one —
 *                                   the session stays fully usable and every
 *                                   autosave failure keeps surfacing.
 *   - quota (save-time only)       → handled in autosave.ts (trim + retry);
 *     boot-time save failures are surfaced, never fatal.
 *   - mid-write interruption       → single-key atomic puts mean the envelope
 *     is stale-or-whole, never torn; flush-on-pagehide narrows the stale window.
 *
 * RESET (AP-4 seam): clear storage + flag → reseed → rehydrate → immediate
 * write (not debounced — a reset must survive a crash within the debounce
 * window). If the crash lands between clear and write, the next boot simply
 * sees a first visit and seeds — the same outcome, by construction.
 */

import { CURRENT_SCHEMA_VERSION } from '../fs'
import { classifyStorageError, toFailureSummary, type StorageFailure } from './errors'
import type { RecoveryKind, StorageAdapter, StoredState } from './types'
import { buildStoredState, hydrateStores, seedStoredState } from './stored-state'
import { useStorageStatusStore, type BootOrigin } from './status'
import { clearBootFlag, readBootFlag, writeBootFlag } from './boot-flag'
import { attachAutosave, getActiveAdapter, registerActiveAdapter } from './autosave'
import { readStoredState } from './validate'

export interface BootOptions {
  /** Default: the production idb-keyval adapter (or the last booted one). */
  readonly adapter?: StorageAdapter
  readonly now?: () => number
  /** Attach the debounced autosave after hydration (default). `false`, or a
   *  `{ delayMs }` override, for tests/e2e pacing. */
  readonly autosave?: boolean | { delayMs?: number }
}

export interface BootResult {
  /** Boot-flag verdict for UI-2 pacing (hint, not proof — see boot-flag.ts). */
  readonly firstVisit: boolean
  readonly origin: BootOrigin
  readonly state: StoredState
}

export interface ResetResult {
  /** True when storage was cleared AND the reseeded envelope persisted. */
  readonly ok: boolean
  readonly failure: StorageFailure | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Cheap version peek for the pre-migration backup decision. null = unreadable. */
function peekVersion(raw: unknown): number | null {
  if (!isRecord(raw)) return null
  const version = raw['version']
  return typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : null
}

/**
 * Persist the current (just-hydrated) stores immediately — boot-time writes
 * (first-visit seed, migrated state, recovery reseed). Typed failures are
 * surfaced on the status store; they are NEVER fatal: the session continues
 * in memory and autosave keeps retrying.
 */
async function persistNow(adapter: StorageAdapter, now: () => number): Promise<boolean> {
  const state = buildStoredState(now())
  try {
    await adapter.save(state)
    useStorageStatusStore.getState().noteSaved(state.savedAt)
    return true
  } catch (error) {
    useStorageStatusStore
      .getState()
      .noteFailure(toFailureSummary(classifyStorageError(error), now()))
    return false
  }
}

function noteRecovery(kind: RecoveryKind, message: string, now: () => number): void {
  useStorageStatusStore.getState().noteRecovery({ kind, message, at: now() })
}

/** Strip the `[kind] ` prefix classifyStorageError adds, for notice messages. */
function plainMessage(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(/^\[\w[\w-]*\]\s*/, '')
}

/**
 * Recovery for a blob that exists but cannot be read (corrupt / unknown-version):
 * try the backup key; else reseed. A future-version blob is snapshotted into
 * the backup key before the reseed overwrites the main key — good data from a
 * newer console stays recoverable.
 */
async function recoverFromEnvelopeError(
  adapter: StorageAdapter,
  raw: unknown,
  error: unknown,
  firstVisit: boolean,
  now: () => number,
): Promise<BootResult> {
  const typed = classifyStorageError(error)
  const message = plainMessage(typed)

  let restored: StoredState | null = null
  try {
    const backupRaw = await adapter.loadBackup()
    if (backupRaw !== null) restored = readStoredState(backupRaw)
  } catch {
    restored = null // unreadable/unusable backup → seed
  }

  if (restored !== null) {
    hydrateStores(restored)
    writeBootFlag(restored.version)
    await persistNow(adapter, now) // self-heal: promote the backup to the state key
    noteRecovery('restored-from-backup', message, now)
    return { firstVisit, origin: 'backup', state: restored }
  }

  if (typed.kind === 'unknown-version') {
    try {
      await adapter.saveBackup(raw)
    } catch {
      // best-effort preservation only
    }
  }

  const state = seedStoredState()
  hydrateStores(state)
  writeBootFlag(state.version)
  await persistNow(adapter, now)
  noteRecovery(typed.kind === 'unknown-version' ? 'unknown-version' : 'reseeded', message, now)
  return { firstVisit, origin: 'seed', state }
}

export async function bootPersistence(options: BootOptions = {}): Promise<BootResult> {
  const adapter = options.adapter ?? getActiveAdapter()
  registerActiveAdapter(adapter)
  const now = options.now ?? Date.now
  const status = useStorageStatusStore.getState()

  status.setBoot({ phase: 'loading' })
  const firstVisit = readBootFlag() === null
  status.setBoot({ firstVisit })

  let result: BootResult

  let raw: StoredState | null = null
  let loadError: unknown = null
  try {
    raw = await adapter.load()
  } catch (error) {
    loadError = error // e.g. StorageError('unavailable') from a blocked IDB
  }

  if (loadError !== null) {
    // Storage itself is unusable: seed in memory, surface the notice, do not
    // touch storage again this boot (writes would fail identically).
    const state = seedStoredState()
    hydrateStores(state)
    noteRecovery('storage-unavailable', plainMessage(loadError), now)
    result = { firstVisit, origin: 'seed', state }
  } else if (raw === null) {
    // Fresh visitor OR Safari ITP 7-day purge (both script-writable stores
    // evaporate together) — indistinguishable, and both mean: seed.
    const state = seedStoredState()
    hydrateStores(state)
    writeBootFlag(state.version)
    await persistNow(adapter, now)
    result = { firstVisit, origin: 'seed', state }
  } else {
    const version = peekVersion(raw)
    if (version !== null && version < CURRENT_SCHEMA_VERSION) {
      try {
        await adapter.saveBackup(raw) // RQ-1 note 3: snapshot before migrating
      } catch {
        // Best-effort only — the migration proceeds regardless.
      }
    }
    try {
      const state = readStoredState(raw) // validates + migrates (throws typed)
      hydrateStores(state)
      writeBootFlag(state.version)
      const migrated = version !== null && version < CURRENT_SCHEMA_VERSION
      if (migrated) await persistNow(adapter, now) // write the migrated state forward
      result = { firstVisit, origin: migrated ? 'migrated' : 'stored', state }
    } catch (error) {
      result = await recoverFromEnvelopeError(adapter, raw, error, firstVisit, now)
    }
  }

  useStorageStatusStore.getState().setBoot({ phase: 'ready', bootOrigin: result.origin })
  if (options.autosave !== false) {
    attachAutosave({
      ...(typeof options.autosave === 'object' ? options.autosave : {}),
      adapter,
      now,
    })
  }
  return result
}

/**
 * Reset desktop (AP-4 seam): clear persisted state + backup + boot flag,
 * reseed, rehydrate, persist immediately. The in-memory reset proceeds even
 * when storage clearing/writing fails (private mode) — the typed failure is
 * returned AND surfaced for the Settings readout.
 */
export async function resetDesktop(
  options: { adapter?: StorageAdapter; now?: () => number } = {},
): Promise<ResetResult> {
  const adapter = options.adapter ?? getActiveAdapter()
  registerActiveAdapter(adapter)
  const now = options.now ?? Date.now
  let failure: StorageFailure | null = null

  try {
    await adapter.clear() // state + backup, one transaction
  } catch (error) {
    failure = toFailureSummary(classifyStorageError(error), now())
  }
  clearBootFlag() // next boot paces as a first visit (docent hints may replay)
  hydrateStores(seedStoredState())
  useStorageStatusStore.getState().dismissRecovery() // a reset resolves the notice that asked for it

  const persisted = await persistNow(adapter, now)
  return { ok: failure === null && persisted, failure }
}
