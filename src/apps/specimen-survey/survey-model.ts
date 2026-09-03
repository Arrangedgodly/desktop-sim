/**
 * Specimen Survey model — the pure, React-free board math behind the
 * archive's dig game (batch 2, brief 5). Minesweeper wearing the world: a
 * grid of survey plots over a field of buried specimens; reveal clear plots,
 * chisel numerals report proximity, brass pins mark plots for review, and
 * the dig ends CLEARED (every specimen found) or DISTURBED (one lost).
 *
 * EVERYTHING here is DOM-free and deterministic given its inputs (the rng is
 * injectable; prod passes nothing and gets Math.random) — the surface is a
 * thin skin over these functions:
 *
 *   freshSurvey(preset)            the un-dealt board (specimens unplaced)
 *   placeSpecimens(…, safeIndex)   burial EXCLUDING the first plot and its
 *                                  whole neighborhood — first click is safe
 *                                  BY CONSTRUCTION, not by retry-luck
 *   revealPlot(board, index)       places on the first reveal, flood-fills
 *                                  zero-proximity regions, detects both ends
 *   markPlot(board, index)         toggles a brass pin (never on a revealed
 *                                  plot, never after the dig has ended)
 *   liveElapsedMs / reanchorSurvey the dig clock: epoch-anchored while
 *                                  digging, frozen at both end states, and
 *                                  RE-ANCHORED on resume so time the page
 *                                  spent closed never counts against the dig
 *   serializeSurvey / readSurveyState   the per-window appState envelope and
 *                                  its hostile-input validator (the payload
 *                                  crossed the persistence boundary — every
 *                                  field is checked; any doubt → null → the
 *                                  surface deals a fresh board)
 *
 * Import discipline (docs/APP-CONTRACT.md — notepad/explorer precedent): no
 * store access, no DOM, no timers in this module; `Date.now` and
 * `Math.random` appear only as DEFAULT parameters the tests override.
 */

/* ------------------------------- presets --------------------------------- */

export type PresetId = 'field' | 'survey' | 'excavation'

export interface SurveyPreset {
  readonly id: PresetId
  /** Engraved selector legend. */
  readonly name: string
  readonly width: number
  readonly height: number
  readonly specimens: number
}

/** The three dealt surveys — brief 5's fixed presets (no custom sizes). */
export const SURVEY_PRESETS: readonly SurveyPreset[] = [
  { id: 'field', name: 'Field', width: 8, height: 8, specimens: 8 },
  { id: 'survey', name: 'Survey', width: 12, height: 12, specimens: 20 },
  { id: 'excavation', name: 'Excavation', width: 16, height: 16, specimens: 40 },
]

const PRESET_BY_ID: Readonly<Record<PresetId, SurveyPreset>> = Object.freeze({
  field: SURVEY_PRESETS[0]!,
  survey: SURVEY_PRESETS[1]!,
  excavation: SURVEY_PRESETS[2]!,
})

export function surveyPreset(id: PresetId): SurveyPreset {
  return PRESET_BY_ID[id]
}

export const DEFAULT_PRESET_ID: PresetId = 'field'

/* Timing law (the surface's constants live here so tests pin them — the
   notepad's NOTEPAD_AUTOSAVE_DELAY_MS precedent):
   · MIRROR: trailing debounce for the window-record appState write
   · HEARTBEAT: a slow running-dig re-mirror so the clock stays honest
   · TICK: the elapsed readout's redraw cadence (snap redraws) */
export const SURVEY_MIRROR_DELAY_MS = 400
export const SURVEY_HEARTBEAT_MS = 5_000
export const SURVEY_TICK_MS = 500

/* -------------------------------- board ---------------------------------- */

export type SurveyStatus = 'digging' | 'cleared' | 'disturbed'

export interface SurveyBoard {
  readonly presetId: PresetId
  readonly width: number
  readonly height: number
  readonly specimenCount: number
  /**
   * True where a specimen is buried. EMPTY (all false) until the first
   * reveal deals the field — that is what makes the first click safe by
   * construction: nothing is buried yet when it lands.
   */
  readonly specimens: readonly boolean[]
  readonly revealed: readonly boolean[]
  readonly marked: readonly boolean[]
  readonly status: SurveyStatus
  /** The plot whose specimen was disturbed (null until a loss). */
  readonly disturbedAt: number | null
  /** Accumulated dig time (ms) at the last anchor. */
  readonly elapsedMs: number
  /** Epoch-ms anchor while the dig runs; null once frozen or not started. */
  readonly runningSince: number | null
}

export type Rng = () => number

export function plotCount(board: SurveyBoard): number {
  return board.width * board.height
}

/** True once the first reveal has dealt the specimens. */
export function isPlaced(board: SurveyBoard): boolean {
  return board.specimens.includes(true)
}

/** The 3–8 in-bounds neighbors of a plot (row-major index). Pure. */
export function neighborsOf(width: number, height: number, index: number): number[] {
  const x = index % width
  const y = Math.floor(index / width)
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      out.push(ny * width + nx)
    }
  }
  return out
}

/** Specimens adjacent to one plot (the chisel numeral the plot reports). */
export function proximityAt(
  specimens: readonly boolean[],
  width: number,
  height: number,
  index: number,
): number {
  let count = 0
  for (const neighbor of neighborsOf(width, height, index)) {
    if (specimens[neighbor]) count++
  }
  return count
}

/** The whole proximity map (rendered numerals; memoized by the surface). */
export function proximityMap(board: SurveyBoard): number[] {
  const out = new Array<number>(plotCount(board))
  for (let i = 0; i < out.length; i++) {
    out[i] = proximityAt(board.specimens, board.width, board.height, i)
  }
  return out
}

/**
 * Deal `count` specimens over the field, EXCLUDING the safe plot and every
 * one of its neighbors — the first click and its whole neighborhood come up
 * clear BY CONSTRUCTION (stronger than the classic regenerate-until-lucky
 * loop: burial simply never touches the safe zone). Fisher–Yates over the
 * eligible pool with the injectable rng, so a seeded rng pins the deal.
 * Throws only if the safe zone leaves fewer plots than specimens (no preset
 * can do this — the feasibility sweep in the tests proves it for EVERY plot
 * of every preset).
 */
export function placeSpecimens(
  width: number,
  height: number,
  count: number,
  safeIndex: number,
  rng: Rng = Math.random,
): boolean[] {
  const total = width * height
  const forbidden = new Set<number>([safeIndex, ...neighborsOf(width, height, safeIndex)])
  const pool: number[] = []
  for (let i = 0; i < total; i++) {
    if (!forbidden.has(i)) pool.push(i)
  }
  if (pool.length < count) {
    throw new Error(
      `infeasible survey: ${count} specimens over ${total - pool.length} eligible plots`,
    )
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swap = pool[i]!
    pool[i] = pool[j]!
    pool[j] = swap
  }
  const placed = new Array<boolean>(total).fill(false)
  for (let i = 0; i < count; i++) placed[pool[i]!] = true
  return placed
}

/** The un-dealt board: every plot sealed, clock idle, status digging. */
export function freshSurvey(presetId: PresetId): SurveyBoard {
  const preset = surveyPreset(presetId)
  const total = preset.width * preset.height
  return {
    presetId,
    width: preset.width,
    height: preset.height,
    specimenCount: preset.specimens,
    specimens: new Array<boolean>(total).fill(false),
    revealed: new Array<boolean>(total).fill(false),
    marked: new Array<boolean>(total).fill(false),
    status: 'digging',
    disturbedAt: null,
    elapsedMs: 0,
    runningSince: null,
  }
}

/* ------------------------------ the clock -------------------------------- */

/**
 * The live dig time: accumulated + the run in flight (never negative). Keys
 * off `runningSince` alone — NOT the status — because `frozen()` runs on a
 * board whose status has just flipped to its end state while the anchor is
 * still in flight; both end states null the anchor (a validated invariant).
 */
export function liveElapsedMs(board: SurveyBoard, now: number = Date.now()): number {
  if (board.runningSince !== null) {
    return board.elapsedMs + Math.max(0, now - board.runningSince)
  }
  return board.elapsedMs
}

/** Freeze the clock into `elapsedMs` (both end states land here). */
function frozen(board: SurveyBoard, now: number): SurveyBoard {
  return { ...board, elapsedMs: liveElapsedMs(board, now), runningSince: null }
}

/**
 * Re-anchor a restored dig: adopt the accumulated time, start a fresh epoch
 * anchor NOW — time the page spent closed never counts (the resume path the
 * surface runs once at mount; bounded drift: the last mirror's debounce).
 */
export function reanchorSurvey(board: SurveyBoard, now: number = Date.now()): SurveyBoard {
  if (board.status !== 'digging' || board.runningSince === null) {
    return { ...board, elapsedMs: board.elapsedMs, runningSince: null }
  }
  return { ...board, elapsedMs: liveElapsedMs(board, now), runningSince: now }
}

/** B612 readout form MM:SS, clamped at the classic 99:59 ceiling. */
export function formatElapsed(ms: number): string {
  const total = Math.min(Math.max(0, Math.floor(ms / 1000)), 99 * 60 + 59)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/* ------------------------------ the moves -------------------------------- */

/**
 * Reveal a plot. On the FIRST reveal the field is dealt with the clicked
 * plot as the safe zone (and the clock starts). A sealed-and-pinned plot is
 * not revealable (unpin first — the pin is the operator's own lock); a
 * specimen ends the dig DISTURBED with every specimen laid open, the clock
 * frozen, and `disturbedAt` naming the plot; otherwise the flood-fill
 * cascade opens the plot, its zero-proximity region, and the numbered rim.
 * Every move is a NEW board (purity for the tests, cheap for React).
 */
export function revealPlot(
  board: SurveyBoard,
  index: number,
  rng: Rng = Math.random,
  now: number = Date.now(),
): SurveyBoard {
  if (board.status !== 'digging') return board
  if (index < 0 || index >= plotCount(board)) return board
  if (board.revealed[index] || board.marked[index]) return board

  let specimens = board.specimens
  let runningSince = board.runningSince
  if (!isPlaced(board)) {
    specimens = placeSpecimens(board.width, board.height, board.specimenCount, index, rng)
  }
  // A dig over a placed field starts its clock too (a restored dig's first
  // post-reload move) — the FIRST move always starts the clock, whether or
  // not it is also the dealing move.
  runningSince = runningSince ?? now
  const withField: SurveyBoard = { ...board, specimens, runningSince }

  if (specimens[index]) {
    // DISTURBED: the whole field of specimens lies open, the clock freezes.
    const revealed = board.revealed.slice()
    for (let i = 0; i < revealed.length; i++) {
      if (specimens[i]) revealed[i] = true
    }
    const disturbed: SurveyBoard = {
      ...withField,
      revealed,
      status: 'disturbed',
      disturbedAt: index,
    }
    return frozen(disturbed, now)
  }

  // Flood-fill cascade: open the plot; a clear plot (no adjacent specimens)
  // drags its unrevealed, unpinned neighbors in with it — edges and corners
  // fall out of `neighborsOf`'s bounds discipline, no special cases.
  const revealed = board.revealed.slice()
  const queue: number[] = [index]
  while (queue.length > 0) {
    const current = queue.pop()!
    if (revealed[current]) continue
    revealed[current] = true
    if (proximityAt(specimens, board.width, board.height, current) === 0) {
      for (const neighbor of neighborsOf(board.width, board.height, current)) {
        if (!revealed[neighbor] && !board.marked[neighbor]) queue.push(neighbor)
      }
    }
  }
  return settle({ ...withField, revealed }, now)
}

/** Toggle a brass pin on a sealed plot while the dig runs. */
export function markPlot(board: SurveyBoard, index: number): SurveyBoard {
  if (board.status !== 'digging') return board
  if (index < 0 || index >= plotCount(board)) return board
  if (board.revealed[index]) return board
  const marked = board.marked.slice()
  marked[index] = !marked[index]
  return { ...board, marked }
}

/** True when every non-specimen plot is open — the dig is won. */
export function isClearedBoard(board: SurveyBoard): boolean {
  for (let i = 0; i < board.specimens.length; i++) {
    if (!board.specimens[i] && !board.revealed[i]) return false
  }
  return true
}

/**
 * Apply the win law: a fully-open field ends CLEARED with every specimen
 * auto-pinned (the pins now READ as the found catalog) and the clock frozen.
 */
function settle(board: SurveyBoard, now: number): SurveyBoard {
  if (!isClearedBoard(board)) return board
  const marked = board.specimens.slice()
  return frozen({ ...board, marked, status: 'cleared' }, now)
}

/* ------------------------ persistence (appState) -------------------------- */

/** The persisted-shape envelope (structured-clone-safe: strings + numbers). */
export interface SurveyPersistState {
  readonly v: 1
  readonly presetId: PresetId
  /** One '0'/'1' char per plot, row-major — specimens, then reveals, then pins. */
  readonly specimens: string
  readonly revealed: string
  readonly marked: string
  readonly status: SurveyStatus
  readonly disturbedAt: number | null
  readonly elapsedMs: number
  readonly runningSince: number | null
}

function pack(flags: readonly boolean[]): string {
  let out = ''
  for (const flag of flags) out += flag ? '1' : '0'
  return out
}

/** Serialize for the window record (the surface re-anchors time first). */
export function serializeSurvey(board: SurveyBoard): SurveyPersistState {
  return {
    v: 1,
    presetId: board.presetId,
    specimens: pack(board.specimens),
    revealed: pack(board.revealed),
    marked: pack(board.marked),
    status: board.status,
    disturbedAt: board.disturbedAt,
    elapsedMs: board.elapsedMs,
    runningSince: board.runningSince,
  }
}

/* Hostile-input bounds: a dig older/taller than these is not ours to resume. */
const MAX_ELAPSED_MS = 86_400_000 // one day — the readout caps at 99:59 anyway
const MAX_EPOCH_MS = 4_102_444_800_000 // 2100-01-01 — no future anchors

const STATUS_SET: ReadonlySet<string> = new Set(['digging', 'cleared', 'disturbed'])
const PRESET_ID_SET: ReadonlySet<string> = new Set(SURVEY_PRESETS.map((p) => p.id))
const FLAGS_RE = /^[01]+$/

function unpackFlags(
  chars: unknown,
  length: number,
): boolean[] | null {
  if (typeof chars !== 'string' || chars.length !== length || !FLAGS_RE.test(chars)) return null
  return Array.from(chars, (char) => char === '1')
}

function isCountInBounds(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < max
}

function isEpochInBounds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < MAX_EPOCH_MS
}

/**
 * Defensively read a board off an UNTRUSTED `appState` (it crossed the
 * persistence boundary; validate.ts carries it verbatim — a hostile payload
 * must NEVER become a playable lie). Every field is shape-checked, then the
 * board's own laws are cross-checked (pin/reveal disjointness, specimen
 * count, end-state consistency). ANY doubt → null → the surface deals a
 * fresh board. This one function is also the e2e fixture's gate — there is
 * exactly one validation path into the game.
 */
export function readSurveyState(appState: unknown): SurveyBoard | null {
  if (typeof appState !== 'object' || appState === null) return null
  const raw = appState as Record<string, unknown>
  if (raw['v'] !== 1) return null
  if (typeof raw['presetId'] !== 'string' || !PRESET_ID_SET.has(raw['presetId'])) return null
  const preset = surveyPreset(raw['presetId'] as PresetId)
  const total = preset.width * preset.height

  const specimens = unpackFlags(raw['specimens'], total)
  const revealed = unpackFlags(raw['revealed'], total)
  const marked = unpackFlags(raw['marked'], total)
  if (specimens === null || revealed === null || marked === null) return null

  const status = raw['status']
  if (typeof status !== 'string' || !STATUS_SET.has(status)) return null

  const disturbedAt = raw['disturbedAt']
  if (disturbedAt !== null && !isCountInBounds(disturbedAt, total)) return null

  const elapsedMs = raw['elapsedMs']
  if (
    typeof elapsedMs !== 'number' ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > MAX_ELAPSED_MS
  ) {
    return null
  }
  const runningSince = raw['runningSince']
  if (runningSince !== null && !isEpochInBounds(runningSince)) return null

  // Cross-checks: the board's own invariants (see revealPlot/markPlot/settle).
  let buried = 0
  let openedPlots = 0
  let pinnedPlots = 0
  for (let i = 0; i < total; i++) {
    if (specimens[i]) buried++
    if (revealed[i]) openedPlots++
    if (marked[i]) pinnedPlots++
    if (revealed[i] && marked[i]) return null // a pin never sits on an open plot
    if (revealed[i] && specimens[i] && status !== 'disturbed') return null
  }
  if (buried === 0) {
    // The un-dealt envelope (a fresh survey mirrored before its first move —
    // it preserves the operator's chosen PRESET across a reload): legal only
    // as a completely sealed, running dig.
    if (status !== 'digging' || openedPlots > 0 || pinnedPlots > 0) return null
  } else if (buried !== preset.specimens) {
    return null // burial deals the exact count, never a partial field
  }
  if (status === 'disturbed') {
    if (disturbedAt === null || !specimens[disturbedAt]) return null
  } else if (disturbedAt !== null) {
    return null
  }
  if (status === 'cleared') {
    for (let i = 0; i < total; i++) {
      if (!specimens[i] && !revealed[i]) return null // "cleared" with sealed plots is a lie
    }
  }
  if (status !== 'digging' && runningSince !== null) return null // the clock freezes at both ends

  return {
    presetId: preset.id,
    width: preset.width,
    height: preset.height,
    specimenCount: preset.specimens,
    specimens,
    revealed,
    marked,
    status: status as SurveyStatus,
    disturbedAt,
    elapsedMs,
    runningSince,
  }
}

/* --------------------------- the e2e fixture ------------------------------ */

/**
 * Test fixture channel (brief 5's acceptance 8): a persisted-shape board the
 * NEXT mounted surface adopts instead of a fresh deal, so Playwright can pin
 * a deterministic field and script a win — a MODEL-LEVEL seam, not a prod
 * back door: it is null in production, the payload passes the same hostile
 * validation as the window record's appState, and the surface clears the
 * channel on mount (exactly one window can ever adopt it). The spec sets it
 * through a page-context dynamic import of this module (the
 * registerDemoModule pattern, tests/e2e/e2e-helpers.ts).
 *
 * The read is a PEEK (non-destructive) because React's StrictMode invokes
 * state initializers twice in development — both passes must see the same
 * deterministic field. Clearing is the surface's mount effect's job.
 */
let surveyFixture: unknown = null

export function setSurveyTestFixture(state: SurveyPersistState | null): void {
  surveyFixture = state
}

/** Peek the fixture without consuming it. Invalid payloads read as null. */
export function peekSurveyTestFixture(): SurveyBoard | null {
  return readSurveyState(surveyFixture)
}
