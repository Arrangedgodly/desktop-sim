/**
 * POST line composition (UI-2) — turns REAL subsystem readings into the amber
 * lines the power-on self test types. Nothing here is decorative copy: every
 * status word is derived from the persistence boot result (MF-2), the app
 * registry (IM-3), or the FS store (MF-1) at boot time.
 *
 * Line order is the check order (design brief FIRST VIEWPORT):
 *   ARCHIVE INTEGRITY → MODULE REGISTRY → PLUGIN BUS → CONSOLE → HOLD/OS banner
 */

import type { BootOrigin } from '../../lib/storage/status'
import type { RecoveryNotice } from '../../lib/storage/types'
import { OS_NAME, OS_VERSION } from './os'
import type { PostLine } from './post-machine'

/** Column the dot-leader pads labels to — all lines share one status gutter. */
const LABEL_COLUMN = 22

function padLabel(label: string): string {
  return `${`${label} `.padEnd(LABEL_COLUMN, '.')} `
}

/** Everything the ARCHIVE INTEGRITY / MODULE REGISTRY lines report. */
export interface PostSubsystemReport {
  /** MF-2 boot origin: where the hydrated session came from. */
  readonly bootOrigin: BootOrigin | null
  /** Schema version of the hydrated envelope (v1 today). */
  readonly schemaVersion: number
  /** Catalog entries EXCLUDING the root hold itself. */
  readonly nodeCount: number
  /** Registered app manifests (IM-3 registry length). */
  readonly moduleCount: number
  /** Recovery notice from the boot, if persistence had to recover (HU-1 renders it later). */
  readonly recovery: RecoveryNotice | null
}

/**
 * The ARCHIVE INTEGRITY verdict. A recovery notice OVERRIDES the origin word —
 * it is the more specific truth about what the boot actually did to the data.
 */
function archiveStatus(report: PostSubsystemReport): string {
  const items = `${report.nodeCount} ITEMS`
  const version = `V${report.schemaVersion}`

  switch (report.recovery?.kind) {
    case 'storage-unavailable':
      return `MEMORY ONLY · ${items}` // session is live; nothing persists this visit
    case 'restored-from-backup':
      return `RESTORED FROM BACKUP · ${items} · ${version}`
    case 'reseeded':
      return `RESEEDED · ${items} · ${version}`
    case 'unknown-version':
      return `RECOVERED · RESEEDED · ${items}`
    case undefined:
      break
  }

  switch (report.bootOrigin) {
    case 'migrated':
      return `MIGRATED · ${items} · ${version}`
    case 'seed':
      return `SEEDED · ${items} · ${version}`
    case 'backup':
      return `RESTORED · ${items} · ${version}`
    case 'stored':
      return `VERIFIED · ${items} · ${version}`
    default:
      return `VERIFIED · ${version}`
  }
}

function moduleStatus(moduleCount: number): string {
  return moduleCount === 1 ? '1 MODULE REGISTERED' : `${moduleCount} MODULES REGISTERED`
}

/** The five real-subsystem POST lines, in check order. */
export function buildPostLines(report: PostSubsystemReport): PostLine[] {
  return [
    {
      id: 'archive-integrity',
      text: `${padLabel('ARCHIVE INTEGRITY')}${archiveStatus(report)}`,
    },
    {
      id: 'module-registry',
      text: `${padLabel('MODULE REGISTRY')}${moduleStatus(report.moduleCount)}`,
    },
    { id: 'plugin-bus', text: `${padLabel('PLUGIN BUS')}READY` },
    { id: 'console', text: `${padLabel('CONSOLE')}ONLINE` },
    {
      id: 'os-banner',
      role: 'banner',
      text: `${OS_NAME} ${OS_VERSION} · SURVEY ARCHIVE`,
    },
  ]
}

/** The single return-visit line (boot flag seen): ≤200ms RESUME flash. */
export function buildResumeLine(): PostLine {
  return { id: 'resume', text: 'RESUME' }
}
