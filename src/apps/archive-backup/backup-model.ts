/**
 * Archive Backup model — the pure, DOM-free, store-free math behind the
 * vault utility (batch-2 brief 10). Everything testable without a mount
 * lives here; the surface owns only timing and the two commit gestures.
 *
 *   readImportText(text)        untrusted file text ─▶ ImportResult (NEVER throws)
 *   validateImportedEnvelope()  untrusted parsed JSON ─▶ ImportResult (NEVER throws)
 *   summarize()                 validated envelope ─▶ the vault readout's facts
 *   serializeBackup()           StoredState ─▶ the export file's exact bytes
 *   exportFileName()            (version, now) ─▶ the download's honest name
 *
 * The trust boundary is the FILE. Imported text is hostile until proven
 * otherwise: not-JSON, not-an-object, prototype-pollution key shapes
 * (`__proto__` / `constructor` / `prototype` as own keys where the platform's
 * maps would later index by them), absurd node counts, and wrong/future schema
 * versions are all REFUSED as typed codes — a refusal never throws and never
 * mutates a single store. Structural heavy lifting is delegated to the
 * platform's own hardened reader (`readStoredState`, src/lib/storage/validate)
 * whose typed `StorageError`s are mapped onto the same refusal codes, so this
 * validator and the boot path agree on what a good envelope is.
 *
 * The guarded restore itself is NOT here — it is the surface's two-step
 * oxide commit calling the platform's public `hydrateStores` seam
 * (src/lib/storage). See the session log's seam finding.
 */

import { isStorageError, readStoredState, type StoredState } from '../../lib/storage'

/**
 * Hard ceiling on imported file size. The real envelope is kilobytes; a file
 * past this is not an archive but an attack (or an accident) — refused before
 * JSON.parse ever runs.
 */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024

/**
 * Hard ceiling on claimed catalog nodes. Beyond this the harness's per-node
 * validation alone is a denial-of-service vector; the seed ships ~15.
 */
export const MAX_CATALOG_NODES = 50_000

/** Own keys the platform's Record-keyed maps must never be handed verbatim. */
const HOSTILE_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype']

/** Every way an import can be refused — the typed error the surface renders. */
export type BackupRefusalCode =
  | 'empty'
  | 'not-json'
  | 'too-large'
  | 'not-an-archive'
  | 'hostile-envelope'
  | 'corrupt'
  | 'unknown-version'

/** In-world readout line per refusal (B612, in the well; oxide only renders it). */
export const REFUSAL_LABELS: Readonly<Record<BackupRefusalCode, string>> = {
  empty: 'EMPTY FILE',
  'not-json': 'NOT JSON',
  'too-large': 'FILE EXCEEDS THE VAULT DOOR',
  'not-an-archive': 'NOT AN ARCHIVE ENVELOPE',
  'hostile-envelope': 'HOSTILE ENVELOPE REFUSED',
  corrupt: 'CORRUPT ENVELOPE',
  'unknown-version': 'UNKNOWN SCHEMA VERSION',
}

/** The manifest facts the vault readout engraves for a good envelope. */
export interface BackupSummary {
  readonly version: number
  readonly savedAt: number
  /** Drawers incl. the root hold (folders are drawers). */
  readonly drawers: number
  /** Every non-folder node — the specimens proper. */
  readonly specimens: number
  readonly windows: number
  /** Serialized size in bytes (carried by the caller: file length or export length). */
  readonly bytes: number
}

/** The validator's verdict. `ok: false` carries a typed code — never a throw. */
export type ImportResult =
  | { readonly ok: true; readonly state: StoredState; readonly summary: BackupSummary }
  | {
      readonly ok: false
      readonly code: BackupRefusalCode
      readonly message: string
    }

function refusal(code: BackupRefusalCode, message: string): ImportResult {
  return { ok: false, code, message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True when a key would be lethal where the platform indexes Records by it. */
function isHostileKey(key: string): boolean {
  return HOSTILE_KEYS.includes(key)
}

/**
 * Scan one untrusted record's own keys for prototype-pollution shapes.
 * Returns the first hostile key found, or null. JSON.parse itself never
 * pollutes (it defines own properties), but a hostile own `__proto__` key
 * that later reaches a bracket-assignment (`map[id] = record`) WOULD — so it
 * is refused at the door, before the platform reader ever sees it.
 */
function firstHostileKey(record: Record<string, unknown>, where: string): string | null {
  for (const key of Object.keys(record)) {
    if (isHostileKey(key)) return `${where} carries the key "${key}"`
  }
  return null
}

/** The summary over a VALIDATED envelope — pure counting, no validation. */
export function summarize(state: StoredState, bytes: number): BackupSummary {
  let drawers = 0
  let specimens = 0
  for (const node of Object.values(state.fs.nodes)) {
    if (node.kind === 'folder') drawers += 1
    else specimens += 1
  }
  return {
    version: state.version,
    savedAt: state.savedAt,
    drawers,
    specimens,
    windows: state.windows.length,
    bytes,
  }
}

/**
 * Validate an untrusted PARSED import. Never throws — even the scans are
 * guarded, because in-memory callers can hand this a Proxy. Order matters:
 * cheap lethal checks (shape, hostile keys, absurd counts) run BEFORE the
 * platform harness touches the payload.
 */
export function validateImportedEnvelope(raw: unknown, bytes: number): ImportResult {
  try {
    if (!isRecord(raw)) {
      return refusal('not-an-archive', 'the file does not hold a JSON object')
    }

    // v1+ nests the catalog under `fs`; v0 (the IM-2 placeholder) was flat.
    // Both node maps get the same door checks.
    const nodeMaps: Array<[Record<string, unknown>, string]> = []
    if (isRecord(raw['fs']) && isRecord(raw['fs']['nodes'])) {
      nodeMaps.push([raw['fs']['nodes'], 'fs.nodes'])
    }
    if (isRecord(raw['nodes'])) {
      nodeMaps.push([raw['nodes'], 'nodes'])
    }
    for (const [nodes, where] of nodeMaps) {
      const hostile = firstHostileKey(nodes, where)
      if (hostile) return refusal('hostile-envelope', hostile)
      const count = Object.keys(nodes).length
      if (count > MAX_CATALOG_NODES) {
        return refusal(
          'hostile-envelope',
          `the file claims ${count} catalog nodes (this console refuses beyond ${MAX_CATALOG_NODES})`,
        )
      }
    }

    if (isRecord(raw['iconPositions'])) {
      const hostile = firstHostileKey(raw['iconPositions'], 'iconPositions')
      if (hostile) return refusal('hostile-envelope', hostile)
    }
    if (Array.isArray(raw['windows'])) {
      for (const entry of raw['windows']) {
        if (isRecord(entry) && typeof entry['id'] === 'string' && isHostileKey(entry['id'])) {
          return refusal('hostile-envelope', `a window record carries the id "${entry['id']}"`)
        }
      }
    }
    if (typeof raw['rootId'] === 'string' && isHostileKey(raw['rootId'])) {
      return refusal('hostile-envelope', `the catalog root is named "${raw['rootId']}"`)
    }
    const hostileTop = firstHostileKey(raw, 'the envelope')
    if (hostileTop) return refusal('hostile-envelope', hostileTop)

    // Door checks passed — hand the payload to the platform's hardened reader
    // (migration chain + structural validation + slice sanitizers). Its typed
    // StorageErrors map onto refusal codes; nothing escapes as a throw.
    try {
      const state = readStoredState(raw)
      return { ok: true, state, summary: summarize(state, bytes) }
    } catch (error) {
      if (isStorageError(error) && error.kind === 'unknown-version') {
        return refusal('unknown-version', error.message)
      }
      const message = isStorageError(error) ? error.message : 'the envelope failed validation'
      return refusal('corrupt', message)
    }
  } catch {
    // Paranoia net (e.g. a Proxy throwing inside a scan): refuse, never throw.
    return refusal('hostile-envelope', 'the file could not be examined safely')
  }
}

/**
 * The import pipeline's whole read side: file text ─▶ verdict. Size-bounded
 * before parse, parsed before validation, validated before anything is
 * rendered as fact. NEVER throws, NEVER mutates.
 */
export function readImportText(text: string): ImportResult {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return refusal('empty', 'the file holds nothing')
  }
  if (text.length > MAX_IMPORT_BYTES) {
    return refusal(
      'too-large',
      `the file is ${formatBytes(text.length)} (this console refuses beyond ${formatBytes(MAX_IMPORT_BYTES)})`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ''
    return refusal('not-json', `the file is not valid JSON${detail}`)
  }
  return validateImportedEnvelope(parsed, text.length)
}

/** The export file's exact bytes — pretty-printed JSON plus a trailing newline. */
export function serializeBackup(state: StoredState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

/** `holdos-archive-v1-20260902-041755.json` — version and UTC stamp, honest. */
export function exportFileName(version: number, now: number): string {
  const d = new Date(now)
  const p = (n: number, w: number): string => String(n).padStart(w, '0')
  const stamp =
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}` +
    `-${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}`
  return `holdos-archive-v${version}-${stamp}.json`
}

/** `2026-09-02 04:17:55` — UTC, for the SAVED line in the vault readout. */
export function formatStamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w: number): string => String(n).padStart(w, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1, 2)}-${p(d.getUTCDate(), 2)}` +
    ` ${p(d.getUTCHours(), 2)}:${p(d.getUTCMinutes(), 2)}:${p(d.getUTCSeconds(), 2)}`
  )
}

/** `13.7 KB` — one decimal past KiB/MiB, whole bytes below. Readout-only. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
