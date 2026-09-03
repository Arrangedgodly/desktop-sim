/**
 * Relay model (batch 2, brief 3) — the pure, React-free, DOM-free math behind
 * SURVEY RELAY, the hold's mail wire. Everything testable without a browser
 * lives here; the surface only ticks a clock and renders what these functions
 * return:
 *
 *   arrivedLetters / due / nextArrivalDelayMs   the pure drip schedule
 *   formatWatch / formatDelay / mailCountReadout  the instrument readouts
 *   freshWatch / readRelayState                 the watch's window appState
 *   relayDrawerId / specimenText / fileLetter   filing a letter into the
 *                                               archive (drawer bootstrap +
 *                                               real text specimen, through
 *                                               lib/fs's pure ops)
 *
 * THE RELAY CLOCK (hidden-pause by construction): due() is pure over
 * timestamps — it never reads a timer. The caller keeps ONE clock, the
 * ACCRUED VISIBLE WATCH TIME since the relay was first opened, and advances
 * it only while the document is visible; the surface's tick pauses accrual
 * under document.hidden, so "timers pause hidden" needs no model code and no
 * timer test — the schedule simply cannot see hidden time. `openedAt` is the
 * clock's anchor (elapsed = now - openedAt on whatever timeline the caller
 * feeds; the relay's own anchor is RELAY_CLOCK_ORIGIN, a fresh watch's 0).
 *
 * Import discipline (docs/APP-CONTRACT.md): FSState/FSError come from lib/fs
 * the way chart-plate's save model uses them (imports are sanctioned reads);
 * no store access, no DOM, no timers in this module.
 */

import { createNode, FSError, type FSState, type FSTree, type FSTextNode } from '../../lib/fs'
import { RELAY_LETTERS, type RelayLetter } from './relay-letters'

/* --------------------------------------------------------------------------
 * The drip schedule — pure over timestamps
 * ------------------------------------------------------------------------ */

/** The corpus in arrival order (offsets are strictly increasing — corpus law). */
export const RELAY_CORPUS: readonly RelayLetter[] = RELAY_LETTERS

/** Total letters the wire will ever carry this watch (readout denominator). */
export const RELAY_CORPUS_COUNT = RELAY_CORPUS.length

/** A fresh watch's anchor on the relay clock (accrued time starts at zero). */
export const RELAY_CLOCK_ORIGIN = 0

/**
 * Every letter whose drip offset has elapsed by `now` — arrival order, each
 * letter exactly once (a filter over a frozen corpus: duplicates are
 * impossible by construction). `now - openedAt` is elapsed time on the
 * caller's ONE clock (see module header).
 */
export function arrivedLetters(now: number, openedAt: number): readonly RelayLetter[] {
  const elapsed = now - openedAt
  return RELAY_CORPUS.filter((letter) => letter.offsetMs <= elapsed)
}

/**
 * The UNREAD queue — what the operator currently OWES attention to: letters
 * that have arrived and are not in the read set, in arrival order. This is
 * the arrival lamp and the unread count's whole truth; the ledger renders
 * `arrivedLetters` and dims what the read set already holds.
 */
export function due(
  now: number,
  openedAt: number,
  readSet: ReadonlySet<string>,
): readonly RelayLetter[] {
  return arrivedLetters(now, openedAt).filter((letter) => !readSet.has(letter.id))
}

/**
 * Milliseconds until the next arrival on this clock, or null when the whole
 * corpus has landed (the "NEXT —" readout). Never negative; exact at the
 * boundary (the letter at exactly `elapsed` has already arrived).
 */
export function nextArrivalDelayMs(now: number, openedAt: number): number | null {
  const elapsed = now - openedAt
  const next = RELAY_CORPUS.find((letter) => letter.offsetMs > elapsed)
  return next === undefined ? null : next.offsetMs - elapsed
}

/* --------------------------------------------------------------------------
 * Instrument readouts (B612 strings — digits ride the mono face by law)
 * ------------------------------------------------------------------------ */

/** Accrued watch time as the hold's `HH:MM:SS` clock (B612, tabular). */
export function formatWatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

/** A pending delay as `MM:SS` (readouts clamp past 99 minutes to `99:59+`). */
export function formatDelay(ms: number): string {
  if (ms >= 100 * 60_000) return '99:59+'
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** The mail readout: `ARRIVED/TOTAL`, both zero-padded to an instrument's fixed width (min 2). */
export function mailCountReadout(arrived: number, total: number): string {
  const width = Math.max(2, String(total).length)
  return `${String(arrived).padStart(width, '0')}/${String(total).padStart(width, '0')}`
}

/* --------------------------------------------------------------------------
 * The watch's window state (rides the WM record's opaque appState)
 * ------------------------------------------------------------------------ */

export const RELAY_STATE_VERSION = 1

/**
 * The persisted watch payload (structured-clone-safe by shape):
 *   · openedAt — the WALL-CLOCK stamp of the watch's first open. Provenance
 *     only (the schedule never reads it; it anchors the record honestly and
 *     doubles as a hostile-payload tell alongside elapsedMs).
 *   · elapsedMs — the RELAY CLOCK: accrued visible watch time. This, not
 *     wall time, is what the drip schedule runs on.
 *   · read / filed — letter id sets as arrays (the brief's readSet/filed ids).
 */
export interface RelayWindowState {
  readonly version: 1
  readonly openedAt: number
  readonly elapsedMs: number
  readonly read: readonly string[]
  readonly filed: readonly string[]
}

/** A fresh watch: anchored at `now` (wall clock), relay clock at zero. */
export function freshWatch(now: number): RelayWindowState {
  return { version: RELAY_STATE_VERSION, openedAt: now, elapsedMs: 0, read: [], filed: [] }
}

/** Upper bound a sane watch could accrue (400 days) — beyond it, hostile. */
const ELAPSED_MAX_MS = 400 * 24 * 3_600_000

const KNOWN_IDS: ReadonlySet<string> = new Set(RELAY_CORPUS.map((letter) => letter.id))

/**
 * Read a string-set array (`read`/`filed`) off an untrusted payload: every
 * entry must be a KNOWN letter id, with no duplicates and no absurd counts.
 * Null = refuse the array (and with it, the whole payload — hostile input
 * never partially loads; one bad field refuses everything, the cursor's law).
 */
function readIdArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > RELAY_CORPUS_COUNT) return null
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string' || !KNOWN_IDS.has(raw)) return null
    if (seen.has(raw)) return null // duplicate ids → hostile
    seen.add(raw)
  }
  return [...seen]
}

/**
 * Defensively read the watch off an UNTRUSTED `appState` (it crossed the
 * persistence boundary; validate.ts carries it verbatim). `null` = absent,
 * malformed, or not the relay's payload — callers fall back to a fresh
 * watch. Only plain-object shapes with exactly the known fields load; the
 * result is a freshly constructed plain object (a `__proto__`-shaped payload
 * carries nothing across). Absent read/fileed fields default to empty (an
 * early payload may predate them), but a PRESENT malformed one refuses.
 */
export function readRelayState(appState: unknown): RelayWindowState | null {
  if (typeof appState !== 'object' || appState === null || Array.isArray(appState)) return null
  const record = appState as Record<string, unknown>
  if (record['version'] !== RELAY_STATE_VERSION) return null
  const openedAt = record['openedAt']
  if (typeof openedAt !== 'number' || !Number.isFinite(openedAt) || openedAt < 0) return null
  const elapsedMs = record['elapsedMs']
  if (
    typeof elapsedMs !== 'number' ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > ELAPSED_MAX_MS
  ) {
    return null
  }
  const read = 'read' in record ? readIdArray(record['read']) : []
  if (read === null) return null
  const filed = 'filed' in record ? readIdArray(record['filed']) : []
  if (filed === null) return null
  return { version: RELAY_STATE_VERSION, openedAt, elapsedMs, read, filed }
}

/* --------------------------------------------------------------------------
 * Filing — a letter becomes a REAL text specimen in the archive
 * ------------------------------------------------------------------------ */

/** The drawer correspondence files under, on the hold's ground. */
export const RELAY_DRAWER_NAME = 'Relay'

/**
 * The `Relay` drawer's node id, if it exists on the hold's ground — matched
 * by kind + case-insensitive name (the catalog's own collision convention),
 * so an operator-renamed drawer is honored rather than duplicated. Null when
 * no such drawer exists yet (first file bootstraps it).
 */
export function relayDrawerId(tree: FSTree): string | null {
  for (const node of Object.values(tree.nodes)) {
    if (node.parentId === tree.rootId && node.kind === 'folder' && node.name.toLowerCase() === RELAY_DRAWER_NAME.toLowerCase()) {
      return node.id
    }
  }
  return null
}

/** The specimen body a letter files as — a transcript, header ruled off. */
export function specimenText(letter: RelayLetter): string {
  const lines = [
    'FILED CORRESPONDENCE — SURVEY RELAY',
    `FROM:    ${letter.from} (${letter.fromCode})`,
    `SUBJECT: ${letter.subject}`,
    `SENT:    ${letter.stamp}`,
    '',
    ...letter.paragraphs,
    '',
    '— TRANSCRIPT ENDS —',
  ]
  return lines.join('\n')
}

/** Injectable seams for deterministic filing (ids/clock — tests and prod differ). */
export interface FileLetterPorts {
  /** The text specimen's node id. */
  readonly id: string
  /** The drawer's node id, when it must be bootstrapped (optional). */
  readonly drawerId?: string
  /** Accession clock (tests inject; prod passes Date.now()). */
  readonly now: number
}

/** Filing's outcome — `fs` is the tree to commit (the input itself when a no-op). */
export type FileLetterResult =
  | { readonly status: 'filed'; readonly fs: FSState; readonly drawerId: string; readonly accession: string }
  | {
      readonly status: 'already-catalogued'
      readonly fs: FSState
      readonly drawerId: string
      readonly accession: string
    }

/**
 * File one letter into the archive: find (or bootstrap) the `Relay` drawer on
 * the hold's ground, then accession the transcript as a REAL text specimen
 * through lib/fs's pure createNode — the same seam every catalog mutation
 * rides, so persistence picks it up with zero relay-specific wiring.
 *
 * Idempotent by label: if the drawer already holds a text specimen of this
 * letter's filedName (a prior watch filed it before its window state was
 * lost), nothing new is created — `already-catalogued` returns the existing
 * accession and the SAME tree (the caller skips the commit). FSError still
 * escapes for true collisions (an operator-made node squatting the name) —
 * the surface catches it and renders the in-world refusal.
 */
export function fileLetter(fs: FSState, letter: RelayLetter, ports: FileLetterPorts): FileLetterResult {
  let state = fs
  let drawerId = relayDrawerId(fs)
  if (drawerId === null) {
    drawerId = ports.drawerId ?? crypto.randomUUID()
    state = createNode(state, {
      id: drawerId,
      parentId: fs.rootId,
      name: RELAY_DRAWER_NAME,
      kind: 'folder',
      now: ports.now,
    })
  }

  const existing = Object.values(state.nodes).find(
    (node) =>
      node.parentId === drawerId &&
      node.kind === 'text' &&
      node.name.toLowerCase() === letter.filedName.toLowerCase(),
  )
  if (existing) {
    return {
      status: 'already-catalogued',
      fs, // unchanged — the archive already holds this transcript
      drawerId,
      accession: existing.accession,
    }
  }

  const withLetter = createNode(state, {
    id: ports.id,
    parentId: drawerId,
    name: letter.filedName,
    kind: 'text',
    now: ports.now,
    content: specimenText(letter),
  })
  const node = withLetter.nodes[ports.id]
  if (!node || node.kind !== 'text') {
    // unreachable through createNode's contract; the belt keeps the result honest
    throw new FSError('invalid-data', `filing ${letter.filedName} lost its specimen`)
  }
  return { status: 'filed', fs: withLetter, drawerId, accession: node.accession }
}

/** The live filed specimen for a letter, or null (the surface's FILED chip reads it). */
export function filedSpecimen(tree: FSTree, letter: RelayLetter): FSTextNode | null {
  const drawerId = relayDrawerId(tree)
  if (drawerId === null) return null
  const node = Object.values(tree.nodes).find(
    (candidate) =>
      candidate.parentId === drawerId &&
      candidate.kind === 'text' &&
      candidate.name.toLowerCase() === letter.filedName.toLowerCase(),
  )
  return node && node.kind === 'text' ? node : null
}
