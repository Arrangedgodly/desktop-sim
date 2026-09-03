/**
 * Archive Backup manifest (batch-2 brief 10) — THE HONEST UTILITY: take the
 * whole living archive home as one JSON file, and bring it back. Standard
 * registration path (`src/apps/index.ts`, one line) — the integrator wires
 * it; this module only declares itself.
 *
 * Instance rule: SINGLETON — there is one vault door on the console; every
 * open raises + focuses it (registry dedupe, nothing to manage here).
 *
 * No `acceptedFileTypes`: the desktop's double-click routing owns the four
 * kinds; the vault's import is an IN-APP file pick against JSON the platform
 * has no node kind for. Declaring none is the honest declaration.
 *
 * No `titleForLaunch` / `onCloseRequest`: launcher-only surface, and nothing
 * in a vault session is loseable — a reload loses no archive (the archive IS
 * the persisted thing; the surface deliberately keeps no window appState).
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes)
 * rides the eager bundle; the surface ships as its own chunk (TH-2 budget).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { BackupIcon } from './BackupIcon'

const BackupSurface = retryableLazy(() => import('./BackupSurface'))

export const archiveBackupApp: AppManifest = {
  id: 'archive-backup',
  name: 'Archive Backup',
  icon: BackupIcon,
  mount: BackupSurface,
  singleton: true,
  defaultGeometry: { w: 540, h: 560 },
}
