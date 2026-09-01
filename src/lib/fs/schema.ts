/**
 * Schema envelope + migration harness (MF-1).
 *
 * The ENVELOPE is the wire/persistence shape (what MF-2 structured-clones
 * into IndexedDB per RQ-1): version + the catalog tree + desktop icon
 * positions + a savedAt stamp. Runtime state (FSState) is always at the
 * current schema version — `version`/`savedAt` live only on the envelope.
 *
 *   toEnvelope(state)  ─▶ wire      migrate(raw)  ─▶ current envelope
 *   fromEnvelope(env)  ─▶ runtime   validateEnvelope(raw)  ─▶ asserts / throws
 *
 * Migration pattern (this is the template every future bump follows):
 * 1. Bump CURRENT_SCHEMA_VERSION.
 * 2. Append one Migration record to MIGRATIONS (from → to, pure apply).
 * 3. The harness walks the chain stepwise; unknown/future/negative versions
 *    throw FSError('unknown-schema-version') — never a silent reset.
 *
 * v0 is the IM-2 fs-store placeholder shape (flat rootId/nodes, no accession
 * codes, no savedAt). v0→v1 wraps it into the envelope and backfills every
 * node's catalog label: accession code per series, accessionedAt 0 (time
 * unknown — honest for migrated records), empty content/src/appId. Nothing
 * was ever persisted at v0, so this step exists to PROVE the pattern.
 */

import { ACCESSION_PREFIXES, formatAccession } from './accession'
import { FSError } from './errors'
import {
  FS_NODE_KINDS,
  ROOT_ACCESSION,
  type FSNode,
  type FSNodeKind,
  type FSState,
  type FSTree,
  type IconPositionMap,
} from './types'

/** Schema version this console writes and understands. */
export const CURRENT_SCHEMA_VERSION = 1

/** The persisted envelope — the single structured-clone unit (RQ-1). */
export interface FSEnvelope {
  readonly version: number
  readonly fs: FSTree
  readonly iconPositions: IconPositionMap
  readonly savedAt: number
}

/** Stamp runtime state onto the wire. `savedAt` defaults to now. */
export function toEnvelope(state: FSState, savedAt: number = Date.now()): FSEnvelope {
  return {
    version: CURRENT_SCHEMA_VERSION,
    fs: { rootId: state.rootId, nodes: state.nodes },
    iconPositions: state.iconPositions,
    savedAt,
  }
}

/** Unwrap a current-version envelope into runtime state (drops version/savedAt). */
export function fromEnvelope(envelope: FSEnvelope): FSState {
  return {
    rootId: envelope.fs.rootId,
    nodes: envelope.fs.nodes,
    iconPositions: envelope.iconPositions,
  }
}

/* --------------------------------------------------------------------------
 * Narrowing helpers (migrations consume untrusted parsed JSON — never `any`)
 * ------------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readVersion(input: unknown): number {
  if (!isRecord(input)) {
    throw new FSError('invalid-envelope', 'envelope is not an object')
  }
  const version = input['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new FSError(
      'unknown-schema-version',
      `unreadable schema version ${String(version)} (this console writes v${CURRENT_SCHEMA_VERSION})`,
    )
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new FSError(
      'unknown-schema-version',
      `schema v${version} belongs to a newer console (this one writes v${CURRENT_SCHEMA_VERSION}) — refusing to open it`,
    )
  }
  return version
}

/* --------------------------------------------------------------------------
 * Migration chain
 * ------------------------------------------------------------------------ */

interface Migration {
  readonly from: number
  readonly to: number
  readonly description: string
  readonly apply: (input: unknown) => unknown
}

/** v0 node: the IM-2 placeholder shape. */
interface V0Node {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly kind: FSNodeKind
}

function v0Node(raw: unknown): V0Node {
  if (
    !isRecord(raw) ||
    typeof raw['id'] !== 'string' ||
    (typeof raw['parentId'] !== 'string' && raw['parentId'] !== null) ||
    typeof raw['name'] !== 'string' ||
    typeof raw['kind'] !== 'string' ||
    !FS_NODE_KINDS.includes(raw['kind'] as FSNodeKind)
  ) {
    throw new FSError('invalid-envelope', `v0 node is malformed: ${JSON.stringify(raw)}`)
  }
  return {
    id: raw['id'],
    parentId: raw['parentId'],
    name: raw['name'],
    kind: raw['kind'] as FSNodeKind,
  }
}

function v0ToV1(input: unknown): unknown {
  if (!isRecord(input)) throw new FSError('invalid-envelope', 'v0 envelope is not an object')
  const rootId = input['rootId']
  const rawNodes = input['nodes']
  const rawPositions = input['iconPositions']
  if (typeof rootId !== 'string' || !isRecord(rawNodes) || !isRecord(rawPositions)) {
    throw new FSError('invalid-envelope', 'v0 envelope is missing rootId/nodes/iconPositions')
  }

  // Backfill catalog labels: one counter per accession series, keys order
  // (deterministic; v0 was never persisted so this only needs reproducibility).
  const counters = new Map<string, number>()
  const allocate = (kind: FSNodeKind): string => {
    const prefix = ACCESSION_PREFIXES[kind]
    const serial = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, serial)
    return formatAccession(prefix, serial)
  }

  const nodes: Record<string, FSNode> = {}
  for (const [key, raw] of Object.entries(rawNodes)) {
    const v0 = v0Node(raw)
    const isRoot = v0.id === rootId
    const base = {
      id: v0.id,
      parentId: v0.parentId,
      name: v0.name,
      accession: isRoot ? ROOT_ACCESSION : allocate(v0.kind),
      accessionedAt: 0,
    }
    let node: FSNode
    switch (v0.kind) {
      case 'folder':
        node = { ...base, kind: 'folder' }
        break
      case 'text':
        node = { ...base, kind: 'text', content: '' }
        break
      case 'image':
        node = { ...base, kind: 'image', src: '' }
        break
      case 'app-link':
        node = { ...base, kind: 'app-link', appId: '' }
        break
    }
    nodes[key] = node
  }

  return { version: 1, fs: { rootId, nodes }, iconPositions: rawPositions, savedAt: 0 }
}

const MIGRATIONS: readonly Migration[] = [
  {
    from: 0,
    to: 1,
    description:
      'IM-2 flat placeholder → specimen-catalog envelope (wraps fs, backfills accession labels)',
    apply: v0ToV1,
  },
]

/**
 * Bring any envelope this console can understand up to CURRENT_SCHEMA_VERSION.
 * Throws FSError: 'invalid-envelope' (corrupt structure), 'unknown-schema-version'
 * (unreadable/negative/future version, or a gap in the migration chain).
 */
export function migrate(input: unknown): FSEnvelope {
  let version = readVersion(input)
  let data: unknown = input
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((migration) => migration.from === version)
    if (!step) {
      throw new FSError(
        'unknown-schema-version',
        `no migration step registered from v${version} (current v${CURRENT_SCHEMA_VERSION})`,
      )
    }
    data = step.apply(data)
    version = step.to
  }
  validateEnvelope(data)
  return data
}

/**
 * Structural validation of a current-version envelope. MF-2's corruption
 * fallback (reseed) catches here. Throws FSError('invalid-envelope').
 */
export function validateEnvelope(input: unknown): asserts input is FSEnvelope {
  if (!isRecord(input)) throw new FSError('invalid-envelope', 'envelope is not an object')
  if (input['version'] !== CURRENT_SCHEMA_VERSION) {
    throw new FSError(
      'invalid-envelope',
      `expected schema v${CURRENT_SCHEMA_VERSION}, found ${String(input['version'])} (migrate first)`,
    )
  }

  const fs = input['fs']
  if (!isRecord(fs)) throw new FSError('invalid-envelope', 'envelope.fs is missing')
  const rootId = fs['rootId']
  const rawNodes = fs['nodes']
  if (typeof rootId !== 'string' || !isRecord(rawNodes)) {
    throw new FSError('invalid-envelope', 'envelope.fs.rootId/nodes are malformed')
  }

  const root = rawNodes[rootId]
  if (!isRecord(root) || root['kind'] !== 'folder' || root['parentId'] !== null) {
    throw new FSError(
      'invalid-envelope',
      `root node ${JSON.stringify(rootId)} is missing or not a parentless drawer`,
    )
  }

  for (const [key, raw] of Object.entries(rawNodes)) {
    if (!isRecord(raw))
      throw new FSError('invalid-envelope', `node ${JSON.stringify(key)} is not an object`)
    if (raw['id'] !== key)
      throw new FSError(
        'invalid-envelope',
        `node ${JSON.stringify(key)} carries id ${JSON.stringify(raw['id'])}`,
      )
    if (typeof raw['name'] !== 'string' || typeof raw['accession'] !== 'string') {
      throw new FSError('invalid-envelope', `node ${JSON.stringify(key)} lacks name/accession`)
    }
    if (typeof raw['accessionedAt'] !== 'number') {
      throw new FSError('invalid-envelope', `node ${JSON.stringify(key)} lacks accessionedAt`)
    }
    const kind = raw['kind']
    if (typeof kind !== 'string' || !FS_NODE_KINDS.includes(kind as FSNodeKind)) {
      throw new FSError(
        'invalid-envelope',
        `node ${JSON.stringify(key)} has unknown kind ${JSON.stringify(kind)}`,
      )
    }
    if (kind === 'text' && typeof raw['content'] !== 'string') {
      throw new FSError('invalid-envelope', `text node ${JSON.stringify(key)} lacks content`)
    }
    if (kind === 'image' && typeof raw['src'] !== 'string') {
      throw new FSError('invalid-envelope', `image node ${JSON.stringify(key)} lacks src`)
    }
    if (kind === 'app-link' && typeof raw['appId'] !== 'string') {
      throw new FSError('invalid-envelope', `app-link node ${JSON.stringify(key)} lacks appId`)
    }
    const parentId = raw['parentId']
    if (parentId === null) {
      if (key !== rootId)
        throw new FSError('invalid-envelope', `node ${JSON.stringify(key)} is a second root`)
    } else if (typeof parentId !== 'string' || !isRecord(rawNodes[parentId])) {
      throw new FSError(
        'invalid-envelope',
        `node ${JSON.stringify(key)} has dangling parentId ${JSON.stringify(parentId)}`,
      )
    }
  }

  const rawPositions = input['iconPositions']
  if (!isRecord(rawPositions))
    throw new FSError('invalid-envelope', 'envelope.iconPositions is missing')
  for (const [key, raw] of Object.entries(rawPositions)) {
    if (!isRecord(raw) || typeof raw['x'] !== 'number' || typeof raw['y'] !== 'number') {
      throw new FSError('invalid-envelope', `icon position for ${JSON.stringify(key)} is malformed`)
    }
    if (!isRecord(rawNodes[key])) {
      throw new FSError(
        'invalid-envelope',
        `icon position references unknown node ${JSON.stringify(key)}`,
      )
    }
  }

  if (typeof input['savedAt'] !== 'number') {
    throw new FSError('invalid-envelope', 'envelope.savedAt is missing')
  }
}
