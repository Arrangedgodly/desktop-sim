/**
 * Specimen Survey model tests (batch 2, brief 5 — acceptance 1 + 5): the
 * pure board math, DOM-free in the node environment. First-click safety BY
 * CONSTRUCTION, cascade correctness at edges and corners, win/lose laws,
 * the epoch clock, and the appState validator's hostile battery — every
 * malformed shape a hostile or corrupt payload could carry reads as null.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRESET_ID,
  SURVEY_PRESETS,
  type SurveyBoard,
  type SurveyPersistState,
  formatElapsed,
  freshSurvey,
  isClearedBoard,
  isPlaced,
  liveElapsedMs,
  markPlot,
  neighborsOf,
  peekSurveyTestFixture,
  plotCount,
  placeSpecimens,
  proximityAt,
  proximityMap,
  readSurveyState,
  reanchorSurvey,
  revealPlot,
  serializeSurvey,
  setSurveyTestFixture,
} from './survey-model'

/* ------------------------------- helpers --------------------------------- */

/** Deterministic rng: a plain LCG — enough to pin a deal for equality checks. */
const seededRng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const indices = (flags: readonly boolean[]): number[] =>
  flags.flatMap((flag, index) => (flag ? [index] : []))

/**
 * Build a board with an EXACT layout through the public validation gate
 * (`readSurveyState` over a hand-packed persisted shape) — the same road the
 * e2e fixture travels, so tests can never drift from what persistence sees.
 */
function layoutBoard(specimenIndices: readonly number[], preset = DEFAULT_PRESET_ID): SurveyBoard {
  const dims = SURVEY_PRESETS.find((p) => p.id === preset)!
  const total = dims.width * dims.height
  const specimens = new Array<string>(total).fill('0')
  for (const index of specimenIndices) specimens[index] = '1'
  const state: SurveyPersistState = {
    v: 1,
    presetId: preset,
    specimens: specimens.join(''),
    revealed: '0'.repeat(total),
    marked: '0'.repeat(total),
    status: 'digging',
    disturbedAt: null,
    elapsedMs: 0,
    runningSince: null,
  }
  const board = readSurveyState(state)
  if (board === null) throw new Error('test layout failed its own validation gate')
  return board
}

/** FIELD 8×8 with every specimen buried in the bottom row (indices 56–63). */
const bottomRowField = (): SurveyBoard => layoutBoard([56, 57, 58, 59, 60, 61, 62, 63])

/* ------------------------------- presets --------------------------------- */

describe('survey · presets (brief 5 floor)', () => {
  it('deals exactly the three fixed surveys with the brief\'s dimensions', () => {
    expect(SURVEY_PRESETS).toHaveLength(3)
    expect(SURVEY_PRESETS[0]).toMatchObject({ id: 'field', name: 'Field', width: 8, height: 8, specimens: 8 })
    expect(SURVEY_PRESETS[1]).toMatchObject({ id: 'survey', name: 'Survey', width: 12, height: 12, specimens: 20 })
    expect(SURVEY_PRESETS[2]).toMatchObject({ id: 'excavation', name: 'Excavation', width: 16, height: 16, specimens: 40 })
  })
})

/* ------------------------------ neighbors -------------------------------- */

describe('survey · neighborsOf (edge + corner discipline)', () => {
  it('a corner has 3, an edge 5, the center 8 — on every family of cell', () => {
    // 8×8: corners
    expect(neighborsOf(8, 8, 0)).toEqual([1, 8, 9])
    expect(neighborsOf(8, 8, 7)).toEqual([6, 14, 15])
    expect(neighborsOf(8, 8, 56)).toEqual([48, 49, 57])
    expect(neighborsOf(8, 8, 63)).toEqual([54, 55, 62])
    // edges (not corners)
    expect(neighborsOf(8, 8, 4)).toEqual([3, 5, 11, 12, 13]) // top edge
    expect(neighborsOf(8, 8, 60)).toEqual([51, 52, 53, 59, 61]) // bottom edge
    expect(neighborsOf(8, 8, 32)).toEqual([24, 25, 33, 40, 41]) // left edge
    expect(neighborsOf(8, 8, 39)).toHaveLength(5) // right edge
    // center
    expect(neighborsOf(8, 8, 27)).toEqual([18, 19, 20, 26, 28, 34, 35, 36])
  })

  it('is pure — calling twice yields equal arrays', () => {
    expect(neighborsOf(12, 12, 65)).toEqual(neighborsOf(12, 12, 65))
  })
})

/* --------------------------- specimen placement --------------------------- */

describe('survey · placeSpecimens (first-click safety by construction)', () => {
  it('buries the exact count, never inside the safe plot or its neighborhood — EVERY plot, EVERY preset', () => {
    for (const preset of SURVEY_PRESETS) {
      const total = preset.width * preset.height
      for (let safe = 0; safe < total; safe++) {
        const safeZone = new Set([safe, ...neighborsOf(preset.width, preset.height, safe)])
        const placed = placeSpecimens(preset.width, preset.height, preset.specimens, safe)
        let buried = 0
        for (let i = 0; i < total; i++) {
          if (placed[i]) {
            buried++
            expect(safeZone.has(i), `${preset.id} safe=${safe} violated at ${i}`).toBe(false)
          }
        }
        expect(buried, `${preset.id} safe=${safe}`).toBe(preset.specimens)
      }
    }
  })

  it('is deterministic under a seeded rng (the same seed deals the same field)', () => {
    const first = placeSpecimens(8, 8, 8, 27, seededRng(42))
    const second = placeSpecimens(8, 8, 8, 27, seededRng(42))
    expect(first).toEqual(second)
    expect(indices(first)).not.toEqual(indices(placeSpecimens(8, 8, 8, 27, seededRng(7))))
  })

  it('refuses an infeasible field rather than dealing a lie', () => {
    // 3×3 with 9 specimens: the safe zone always leaves at most 6 eligible.
    expect(() => placeSpecimens(3, 3, 9, 4)).toThrow(/infeasible survey/)
  })
})

/* ------------------------------ reveal ----------------------------------- */

describe('survey · revealPlot (placement + cascade + ends)', () => {
  it('the FIRST reveal deals the field: the clicked plot opens clear, its whole neighborhood opens, and nothing open is a specimen', () => {
    for (const attempt of [0, 1, 2, 3]) {
      const board = freshSurvey('field')
      const opened = revealPlot(board, 27, seededRng(100 + attempt), 1_000)
      expect(opened.revealed[27]).toBe(true)
      expect(opened.specimens[27]).toBe(false)
      expect(proximityAt(opened.specimens, 8, 8, 27)).toBe(0)
      for (const neighbor of neighborsOf(8, 8, 27)) {
        expect(opened.revealed[neighbor], `neighbor ${neighbor} of the safe click`).toBe(true)
      }
      for (let i = 0; i < 64; i++) {
        if (opened.revealed[i]) expect(opened.specimens[i]).toBe(false)
      }
      expect(opened.status).toBe('digging')
      expect(opened.runningSince).toBe(1_000) // the clock started
    }
  })

  it('cascade: a clear region above a specimen row opens whole — rows 0–5 by flood, row 6 as the numbered rim, edges and corners included — and CLEARS the dig', () => {
    const board = bottomRowField()
    const opened = revealPlot(board, 0, Math.random, 5_000)

    // Every non-specimen plot (indices 0–55) opens: rows 0–5 by the flood,
    // row 6 as the numbered rim it drags along. The specimen row stays sealed.
    for (let i = 0; i < 56; i++) expect(opened.revealed[i], `plot ${i}`).toBe(true)
    for (let i = 56; i < 64; i++) expect(opened.revealed[i]).toBe(false)
    // Corners and edges fell to the same flood, no wraparound leaks.
    expect(opened.revealed[0]).toBe(true) // NW corner
    expect(opened.revealed[7]).toBe(true) // NE corner
    expect(opened.revealed[55]).toBe(true) // rim's SE edge
    // WIN: every non-specimen open, every specimen auto-pinned, clock frozen.
    expect(opened.status).toBe('cleared')
    expect(isClearedBoard(opened)).toBe(true)
    for (let i = 56; i < 64; i++) expect(opened.marked[i]).toBe(true)
    expect(opened.runningSince).toBeNull()
  })

  it('a numbered plot opens ALONE — no cascade past a proximity rim', () => {
    // All 8 neighbors of plot 27 buried: 27 reports 8 and opens by itself.
    const board = layoutBoard([18, 19, 20, 26, 28, 34, 35, 36])
    const opened = revealPlot(board, 27)
    expect(indices(opened.revealed)).toEqual([27])
    expect(proximityMap(opened)[27]).toBe(8)
    expect(opened.status).toBe('digging')
  })

  it('a pinned plot is NOT revealable — the pin is the operator\'s lock', () => {
    const board = bottomRowField()
    const pinned = markPlot(board, 20)
    const opened = revealPlot(pinned, 20)
    expect(opened.revealed[20]).toBe(false)
    expect(opened.marked[20]).toBe(true)
    // Unpinning restores the reveal path.
    const unpinned = markPlot(opened, 20)
    expect(revealPlot(unpinned, 20).revealed[20]).toBe(true)
  })

  it('DISTURB: revealing a specimen ends the dig — every specimen lies open, the disturbed plot is named, prior work survives', () => {
    // A restored dig with the clock anchored: the disturb at 9s freezes 8s.
    // Prior work that must survive: one rim plot open (48, proximity 2 — a
    // numbered plot opens alone) and a pin at 10.
    const started: SurveyBoard = { ...bottomRowField(), runningSince: 1_000 }
    const opened = revealPlot(started, 48, Math.random, 1_000)
    expect(indices(opened.revealed)).toEqual([48]) // rim plot: no cascade
    const pinned = markPlot(opened, 10)
    const lost = revealPlot(pinned, 58, Math.random, 9_000)

    expect(lost.status).toBe('disturbed')
    expect(lost.disturbedAt).toBe(58)
    for (let i = 56; i < 64; i++) expect(lost.revealed[i], `specimen ${i}`).toBe(true)
    expect(lost.revealed[48]).toBe(true) // the earlier open survived
    expect(lost.revealed[10]).toBe(false) // the pinned plot stayed sealed
    expect(lost.marked[10]).toBe(true) // pins survive the loss
    expect(lost.runningSince).toBeNull() // the clock froze…
    expect(lost.elapsedMs).toBe(8_000) // …after 9s − 1s of dig
    // The dig is over: no further move lands.
    expect(revealPlot(lost, 30)).toBe(lost)
    expect(markPlot(lost, 30)).toBe(lost)
  })

  it('no-ops: out-of-range indices, already-open plots, and ended digs return the SAME board', () => {
    const board = bottomRowField()
    expect(revealPlot(board, -1)).toBe(board)
    expect(revealPlot(board, 64)).toBe(board)
    const opened = revealPlot(board, 27)
    expect(revealPlot(opened, 27)).toBe(opened)
  })

  it('is deterministic: the same seed + clock deal and open identically', () => {
    const play = () => {
      let board = freshSurvey('survey')
      board = revealPlot(board, 65, seededRng(9), 1_000)
      board = markPlot(board, 3)
      board = revealPlot(board, 70, seededRng(9), 2_000)
      return board
    }
    expect(play()).toEqual(play())
  })
})

/* ------------------------------- marking --------------------------------- */

describe('survey · markPlot (the brass pin)', () => {
  it('toggles on sealed plots only', () => {
    const board = bottomRowField()
    const pinned = markPlot(board, 12)
    expect(pinned.marked[12]).toBe(true)
    expect(markPlot(pinned, 12).marked[12]).toBe(false)
  })

  it('refuses open plots and out-of-range indices', () => {
    const opened = revealPlot(bottomRowField(), 0, Math.random, 1_000)
    expect(markPlot(opened, 5).marked[5]).toBe(false) // plot 5 is open
    expect(markPlot(opened, -3)).toBe(opened)
    expect(markPlot(opened, 64)).toBe(opened)
  })
})

/* -------------------------------- clock ---------------------------------- */

describe('survey · the dig clock', () => {
  it('starts at the first reveal, accumulates wall time, freezes at the end', () => {
    let board = freshSurvey('field')
    expect(liveElapsedMs(board, 10_000)).toBe(0) // idle before the first move
    board = revealPlot(board, 27, seededRng(1), 1_000)
    expect(board.runningSince).toBe(1_000)
    board = revealPlot(board, 30, seededRng(1), 4_000) // moves never restart the clock
    expect(board.runningSince).toBe(1_000)
    expect(liveElapsedMs(board, 6_000)).toBe(5_000)
    expect(liveElapsedMs(board, 500)).toBe(0) // clamps, never negative
  })

  it('reanchorSurvey: a restored dig keeps its time but re-anchors NOW (closed time never counts)', () => {
    const board = revealPlot(freshSurvey('field'), 27, seededRng(2), 1_000)
    const resumed = reanchorSurvey(board, 50_000)
    expect(resumed.elapsedMs).toBe(49_000)
    expect(resumed.runningSince).toBe(50_000)
    expect(liveElapsedMs(resumed, 51_000)).toBe(50_000)
    // Frozen boards stay frozen; never-started digs stay idle.
    const frozenBoard = { ...board, status: 'disturbed' as const, runningSince: null, elapsedMs: 3_000 }
    expect(reanchorSurvey(frozenBoard, 99_000)).toMatchObject({ elapsedMs: 3_000, runningSince: null })
    expect(reanchorSurvey(freshSurvey('field'), 99_000).runningSince).toBeNull()
  })

  it('formatElapsed: MM:SS, padded, clamped at the classic ceiling', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(59_999)).toBe('00:59')
    expect(formatElapsed(65_000)).toBe('01:05')
    expect(formatElapsed(3_723_000)).toBe('62:03')
    expect(formatElapsed(600_000_000)).toBe('99:59')
    expect(formatElapsed(-5_000)).toBe('00:00')
  })
})

/* ---------------------------- persistence -------------------------------- */

describe('survey · serializeSurvey / readSurveyState (round-trip)', () => {
  it('round-trips a fresh board, a mid-dig board, and both end states', () => {
    const fresh = freshSurvey('survey')
    expect(readSurveyState(serializeSurvey(fresh))).toEqual(fresh)

    let midDig = freshSurvey('field')
    midDig = revealPlot(midDig, 27, seededRng(3), 1_000)
    midDig = markPlot(midDig, 9)
    expect(readSurveyState(serializeSurvey(midDig))).toEqual(midDig)

    const won = revealPlot(bottomRowField(), 0, Math.random, 1_000)
    expect(readSurveyState(serializeSurvey(won))).toEqual(won)

    const lost = revealPlot(bottomRowField(), 60, Math.random, 1_000)
    expect(readSurveyState(serializeSurvey(lost))).toEqual(lost)
  })
})

describe('survey · readSurveyState hostile battery (acceptance 5)', () => {
  const valid = (): SurveyPersistState => ({
    v: 1,
    presetId: 'field',
    specimens: '0'.repeat(56) + '1'.repeat(8),
    revealed: '1'.repeat(56) + '0'.repeat(8),
    marked: '0'.repeat(64),
    status: 'cleared',
    disturbedAt: null,
    elapsedMs: 4_000,
    runningSince: null,
  })

  it('accepts the honest envelope', () => {
    expect(readSurveyState(valid())).not.toBeNull()
  })

  it('refuses non-objects, arrays, and wrong versions', () => {
    expect(readSurveyState(null)).toBeNull()
    expect(readSurveyState(undefined)).toBeNull()
    expect(readSurveyState(42)).toBeNull()
    expect(readSurveyState('v1')).toBeNull()
    expect(readSurveyState([])).toBeNull()
    expect(readSurveyState({ ...valid(), v: 2 })).toBeNull()
    expect(readSurveyState({ ...valid(), v: '1' })).toBeNull()
  })

  it('refuses unknown presets and malformed flag strings', () => {
    expect(readSurveyState({ ...valid(), presetId: 'mega' })).toBeNull()
    expect(readSurveyState({ ...valid(), presetId: null })).toBeNull()
    expect(readSurveyState({ ...valid(), specimens: '0'.repeat(55) + '1'.repeat(8) })).toBeNull() // wrong length
    expect(readSurveyState({ ...valid(), specimens: '0'.repeat(56) + '2'.repeat(8) })).toBeNull() // foreign char
    expect(readSurveyState({ ...valid(), revealed: null })).toBeNull()
    expect(readSurveyState({ ...valid(), marked: 1 })).toBeNull()
  })

  it('refuses a wrong specimen count for the preset', () => {
    const seven = '0'.repeat(57) + '1'.repeat(7)
    expect(readSurveyState({ ...valid(), specimens: seven, status: 'digging', revealed: '0'.repeat(64) })).toBeNull()
  })

  it('refuses invalid status and disturbedAt shapes', () => {
    expect(readSurveyState({ ...valid(), status: 'won' })).toBeNull()
    expect(readSurveyState({ ...valid(), status: undefined })).toBeNull()
    expect(readSurveyState({ ...valid(), disturbedAt: -1 })).toBeNull()
    expect(readSurveyState({ ...valid(), disturbedAt: 64 })).toBeNull()
    expect(readSurveyState({ ...valid(), disturbedAt: 1.5 })).toBeNull()
    expect(readSurveyState({ ...valid(), disturbedAt: '58' })).toBeNull()
    expect(readSurveyState({ ...valid(), status: 'digging', disturbedAt: 3 })).toBeNull() // named loss while digging
  })

  it('refuses absurd clocks', () => {
    expect(readSurveyState({ ...valid(), elapsedMs: -1 })).toBeNull()
    expect(readSurveyState({ ...valid(), elapsedMs: Number.NaN })).toBeNull()
    expect(readSurveyState({ ...valid(), elapsedMs: Number.POSITIVE_INFINITY })).toBeNull()
    expect(readSurveyState({ ...valid(), elapsedMs: 9e15 })).toBeNull()
    expect(readSurveyState({ ...valid(), runningSince: -5 })).toBeNull()
    expect(readSurveyState({ ...valid(), runningSince: 9e15 })).toBeNull()
  })

  it('refuses states that violate the board\'s own laws', () => {
    // A pin on an open plot (plot 20 open AND pinned).
    const overlapMarked = '0'.repeat(20) + '1' + '0'.repeat(43)
    expect(
      readSurveyState({
        ...valid(),
        status: 'digging',
        revealed: '1'.repeat(21) + '0'.repeat(43),
        marked: overlapMarked,
      }),
    ).toBeNull()
    // An open specimen while the dig still runs (specimen 56 open, digging).
    expect(
      readSurveyState({
        ...valid(),
        status: 'digging',
        revealed: '1'.repeat(57) + '0'.repeat(7),
      }),
    ).toBeNull()
    // "Cleared" with sealed clear plots.
    expect(
      readSurveyState({ ...valid(), revealed: '0'.repeat(64), status: 'cleared' }),
    ).toBeNull()
    // A frozen status with a still-running clock.
    expect(
      readSurveyState({ ...valid(), runningSince: 1_000 }),
    ).toBeNull()
    // disturbedAt pointing at a non-specimen plot.
    expect(
      readSurveyState({ ...valid(), status: 'disturbed', disturbedAt: 0 }),
    ).toBeNull()
  })

  it('refuses prototype-pollution and getter-heavy shapes without throwing', () => {
    const hostile = JSON.parse('{"__proto__": {"v": 1}, "v": 1, "presetId": "field"}')
    expect(readSurveyState(hostile)).toBeNull()
    expect(readSurveyState(Object.create({ v: 1 }))).toBeNull() // inherited props are not fields
  })
})

/* ------------------------------- fixture --------------------------------- */

describe('survey · the e2e fixture channel', () => {
  it('peeks a VALIDATED board without consuming it (StrictMode double-inits)', () => {
    setSurveyTestFixture(serializeSurvey(bottomRowField()))
    const peeked = peekSurveyTestFixture()
    expect(peeked).not.toBeNull()
    expect(indices(peeked!.specimens)).toEqual([56, 57, 58, 59, 60, 61, 62, 63])
    // Non-destructive: the second peek (StrictMode's second initializer
    // pass) sees the same deterministic field.
    expect(peekSurveyTestFixture()).toEqual(peeked)
    setSurveyTestFixture(null) // the surface's mount-clear
    expect(peekSurveyTestFixture()).toBeNull()
  })

  it('an INVALID fixture reads as null — same gate as appState, no prod weakening', () => {
    setSurveyTestFixture({ ...serializeSurvey(freshSurvey('field')), specimens: 'xx' })
    expect(peekSurveyTestFixture()).toBeNull()
    setSurveyTestFixture(null)
    expect(peekSurveyTestFixture()).toBeNull()
  })
})

/* ------------------------------ invariants ------------------------------- */

describe('survey · board invariants', () => {
  it('a fresh board is unplaced, uncleared, and idle', () => {
    const fresh = freshSurvey('excavation')
    expect(isPlaced(fresh)).toBe(false)
    expect(isClearedBoard(fresh)).toBe(false)
    expect(plotCount(fresh)).toBe(256)
    expect(fresh.status).toBe('digging')
  })

  it('proximityMap agrees with proximityAt everywhere, and the safe click is a 0', () => {
    const board = revealPlot(freshSurvey('survey'), 65, seededRng(11), 1_000)
    const map = proximityMap(board)
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBe(proximityAt(board.specimens, 12, 12, i))
    }
    expect(map[65]).toBe(0)
  })
})
