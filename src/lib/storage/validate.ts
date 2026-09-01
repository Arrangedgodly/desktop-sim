/**
 * Envelope reading for MF-2: turn an untrusted persisted blob into a
 * `StoredState`, via MF-1's migration harness.
 *
 *   readStoredState(raw) ─▶ StoredState at CURRENT_SCHEMA_VERSION
 *                           or throws StorageError('corrupt' | 'unknown-version')
 *
 * Failure blast radii are deliberate (Hulk lens):
 * - The FS tree + icon positions are irreplaceable user data → any structural
 *   corruption there is a `corrupt`/`unknown-version` StorageError and the
 *   caller (persistence.ts) runs the recovery path (backup → seed + notice).
 * - The WM session and settings are replaceable derived data → malformed
 *   slices degrade in place: junk window entries are dropped, junk settings
 *   fields fall back to defaults, and the catalog still hydrates. Losing the
 *   user's files over a bad window record would be the real failure.
 */

import { isFSError, migrate, CURRENT_SCHEMA_VERSION, type FSEnvelope, type FSNode } from '../fs'
import type { AppLaunchContext } from '../../platform/app-registry/contract'
import type { WindowGeometry, WindowRecord } from '../../platform/stores/wm-store'
import { StorageError } from './errors'
import { defaultPersistedSettings, type PersistedSettings, type StoredState } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Re-run MF-1's harness (migrate walks the chain, validate asserts the end state). */
function runFSHarness(candidate: unknown): FSEnvelope {
  try {
    return migrate(candidate)
  } catch (error) {
    if (isFSError(error)) {
      if (error.code === 'unknown-schema-version') {
        throw new StorageError('unknown-version', error.message, error)
      }
      throw new StorageError('corrupt', error.message, error)
    }
    throw new StorageError('corrupt', 'the persisted catalog envelope failed validation', error)
  }
}

/** Narrow a persisted launch context; anything unreadable degrades to launcher. */
function sanitizeLaunch(raw: unknown): AppLaunchContext | undefined {
  if (!isRecord(raw)) return undefined
  if (raw['source'] === 'launcher') return { source: 'launcher' }
  if (raw['source'] === 'file' && isRecord(raw['file']) && typeof raw['file']['id'] === 'string') {
    // Verbatim snapshot, trusted only as far as `file.id` (checked above): apps
    // resolve the LIVE node from the restored tree by id; the rest of the
    // snapshot is display fallback. Launch-less restore is worse than stale.
    // (Double cast: an unvalidated record crossing a trust boundary.)
    return { source: 'file', file: raw['file'] as unknown as FSNode }
  }
  return undefined
}

function sanitizeGeometry(raw: unknown): WindowGeometry | null {
  if (!isRecord(raw)) return null
  const { x, y, w, h } = raw
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
    return null
  }
  return { x, y, w, h }
}

/**
 * Drop junk window entries, backfill optional fields on keepers, dedupe ids.
 * Input `undefined` (v0 envelope, predating session persistence) → `[]`.
 */
export function sanitizeWindows(raw: unknown): WindowRecord[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const windows: WindowRecord[] = []
  raw.forEach((entry, index) => {
    if (!isRecord(entry)) return
    const { id, appId } = entry
    if (typeof id !== 'string' || typeof appId !== 'string' || seen.has(id)) return
    const geometry = sanitizeGeometry(entry['geometry'])
    if (!geometry) return // a window without sane geometry is not worth restoring
    seen.add(id)
    windows.push({
      id,
      appId,
      instanceId: typeof entry['instanceId'] === 'string' ? entry['instanceId'] : `auto:${id}`,
      geometry,
      z: isFiniteNumber(entry['z']) ? entry['z'] : index,
      minimized: entry['minimized'] === true,
      maximized: entry['maximized'] === true,
      title: typeof entry['title'] === 'string' ? entry['title'] : appId,
      launch: sanitizeLaunch(entry['launch']),
      openedAt: isFiniteNumber(entry['openedAt']) ? entry['openedAt'] : 0,
    })
  })
  return windows
}

/** Per-field defaults; the settings slice never fails a boot on its own. */
export function sanitizeSettings(raw: unknown): PersistedSettings {
  const defaults = defaultPersistedSettings()
  if (!isRecord(raw)) return defaults
  return {
    wallpaper: typeof raw['wallpaper'] === 'string' ? raw['wallpaper'] : defaults.wallpaper,
    soundsEnabled:
      typeof raw['soundsEnabled'] === 'boolean' ? raw['soundsEnabled'] : defaults.soundsEnabled,
    reducedMotionFollow:
      typeof raw['reducedMotionFollow'] === 'boolean'
        ? raw['reducedMotionFollow']
        : defaults.reducedMotionFollow,
  }
}

/**
 * Validate + migrate an untrusted stored blob into a current `StoredState`.
 * Version semantics follow MF-1 exactly: unreadable / negative / future
 * versions throw `StorageError('unknown-version')` — never a silent reset;
 * the unreadable blob is left in place for the recovery path to reason about.
 */
export function readStoredState(raw: unknown): StoredState {
  if (!isRecord(raw)) {
    throw new StorageError('corrupt', 'the persisted state is not an object')
  }

  const version = raw['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new StorageError(
      'unknown-version',
      `unreadable schema version ${String(version)} (this console writes v${CURRENT_SCHEMA_VERSION})`,
    )
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new StorageError(
      'unknown-version',
      `schema v${version} belongs to a newer console (this one writes v${CURRENT_SCHEMA_VERSION})`,
    )
  }

  // v0 is the IM-2 flat placeholder (no session, no settings — those default).
  // v1+ nests the catalog envelope under fs/iconPositions/savedAt; older v1+
  // payloads are stepped forward by MF-1's chain, which also re-validates.
  const envelope =
    version === 0
      ? runFSHarness(raw)
      : runFSHarness({
          version,
          fs: raw['fs'],
          iconPositions: raw['iconPositions'],
          savedAt: raw['savedAt'],
        })

  return {
    version: envelope.version,
    savedAt: envelope.savedAt,
    fs: envelope.fs,
    iconPositions: envelope.iconPositions,
    windows: version === 0 ? [] : sanitizeWindows(raw['windows']),
    settings: version === 0 ? defaultPersistedSettings() : sanitizeSettings(raw['settings']),
  }
}
