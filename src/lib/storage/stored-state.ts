/**
 * Store ↔ envelope composition (MF-2). The three IM-2 stores are the single
 * runtime truth; this module is the only place they fold into a `StoredState`
 * and the only place a validated `StoredState` unfolds back into them.
 *
 *   buildStoredState()  stores → envelope (savedAt stamped per write)
 *   seedStoredState()   the MF-1 placeholder catalog as a first-visit envelope
 *   hydrateStores()     validated envelope → stores (one atomic set per store)
 *
 * Hydration happens BEFORE autosave attaches (bootPersistence orchestrates),
 * so restoring a session never triggers a spurious save of the state it just
 * read.
 */

import { CURRENT_SCHEMA_VERSION, SEED_EPOCH, fromEnvelope, seedEnvelope, toEnvelope } from '../fs'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { defaultPersistedSettings, type StoredState } from './types'

/** Fold the three stores into the persisted envelope. `savedAt` stamps per write. */
export function buildStoredState(now: number = Date.now()): StoredState {
  const fsEnvelope = toEnvelope(useFSStore.getState().fs, now)
  const wm = useWMStore.getState()
  // zOrder IS the persisted stacking order (bottom → top); windows map lookups
  // are total because the store keeps them in lockstep.
  const windows = wm.zOrder.flatMap((id) => {
    const record = wm.windows[id]
    return record ? [record] : []
  })
  const settings = useSettingsStore.getState()
  return {
    version: fsEnvelope.version,
    savedAt: fsEnvelope.savedAt,
    fs: fsEnvelope.fs,
    iconPositions: fsEnvelope.iconPositions,
    windows,
    settings: {
      wallpaper: settings.wallpaper,
      soundsEnabled: settings.soundsEnabled,
      reducedMotionFollow: settings.reducedMotionFollow,
      docentDismissed: settings.docentDismissed,
    },
  }
}

/** The deterministic first-visit/reset envelope (MF-1 seed, empty session, defaults). */
export function seedStoredState(): StoredState {
  const envelope = seedEnvelope()
  return {
    version: envelope.version,
    savedAt: envelope.savedAt, // SEED_EPOCH — deterministic; stamped fresh on save
    fs: envelope.fs,
    iconPositions: envelope.iconPositions,
    windows: [],
    settings: defaultPersistedSettings(),
  }
}

/** Unfold a validated `StoredState` into the three stores (atomic per store). */
export function hydrateStores(state: StoredState): void {
  useFSStore
    .getState()
    .init(
      fromEnvelope({
        version: state.version,
        fs: state.fs,
        iconPositions: state.iconPositions,
        savedAt: state.savedAt,
      }),
    )
  useWMStore.getState().hydrate({ windows: state.windows })
  const settings = useSettingsStore.getState()
  settings.setWallpaper(state.settings.wallpaper)
  settings.setSoundsEnabled(state.settings.soundsEnabled)
  settings.setReducedMotionFollow(state.settings.reducedMotionFollow)
  if (state.settings.docentDismissed) settings.dismissDocent() // one-way, never un-dismissed
}

/** Exposed for diagnostics/AP-4: the schema version this whole envelope rides. */
export const STORED_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION

/** Exposed for tests: the deterministic seed clock (asserts seed determinism). */
export const STORED_SEED_EPOCH = SEED_EPOCH
