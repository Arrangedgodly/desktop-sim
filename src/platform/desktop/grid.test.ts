// UI-3 desktop grid math — pure slot resolution + IM-5 drag-commit math.
import { describe, expect, it } from 'vitest'
import { createNode, emptyFSState, setIconPosition, type FSState } from '../../lib/fs'
import {
  DESKTOP_GRID,
  cellCenter,
  cellOrigin,
  clampIconOrigin,
  resolveDesktopSlots,
  slotForPoint,
  slotLimitsFor,
} from './grid'

describe('DESKTOP_GRID · committed metrics', () => {
  it('places slots at the field origin with room for a card per cell', () => {
    expect(DESKTOP_GRID.originX).toBeGreaterThan(0)
    expect(DESKTOP_GRID.cellW).toBeGreaterThanOrEqual(88) // a specimen card + gutter
    expect(DESKTOP_GRID.cellH).toBeGreaterThanOrEqual(100)
  })
})

describe('cellOrigin / cellCenter', () => {
  it('origin is the anchor plus column/row steps', () => {
    expect(cellOrigin({ x: 0, y: 0 })).toEqual({ left: 28, top: 28 })
    expect(cellOrigin({ x: 2, y: 3 })).toEqual({
      left: 28 + 2 * DESKTOP_GRID.cellW,
      top: 28 + 3 * DESKTOP_GRID.cellH,
    })
  })

  it('center is the cell midpoint (leader lines aim here)', () => {
    const center = cellCenter({ x: 1, y: 1 })
    expect(center.x).toBe(28 + DESKTOP_GRID.cellW + DESKTOP_GRID.cellW / 2)
    expect(center.y).toBe(28 + DESKTOP_GRID.cellH + DESKTOP_GRID.cellH / 2)
  })
})

describe('resolveDesktopSlots', () => {
  it('keeps positioned nodes verbatim', () => {
    const slots = resolveDesktopSlots([{ id: 'a' }, { id: 'b' }], {
      a: { x: 3, y: 1 },
      b: { x: 0, y: 5 },
    })
    expect(slots).toEqual({ a: { x: 3, y: 1 }, b: { x: 0, y: 5 } })
  })

  it('fills unpositioned nodes into the first FREE column-major slot', () => {
    // (0,0)–(0,2) and (1,0)–(1,1) taken (the seed's shape); a new root child
    // lands at (0,3) — down the first column, then right.
    const slots = resolveDesktopSlots([{ id: 'a' }, { id: 'b' }, { id: 'new' }], {
      a: { x: 0, y: 0 },
      b: { x: 0, y: 2 },
    })
    expect(slots['new']).toEqual({ x: 0, y: 1 })
  })

  it('never double-books a slot, positioned or filled', () => {
    const slots = resolveDesktopSlots(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } },
    )
    const seen = new Set(Object.values(slots).map((s) => `${s.x}:${s.y}`))
    expect(seen.size).toBe(4)
  })

  it('is total over the real seeded catalog (every root child gets a slot)', () => {
    let state: FSState = emptyFSState(0)
    for (const name of ['Projects', 'Field Notes', 'Archive']) {
      state = createNode(state, { parentId: 'root', name, kind: 'folder' })
    }
    const children = Object.values(state.nodes).filter((n) => n.parentId === 'root')
    const slots = resolveDesktopSlots(children, state.iconPositions)
    expect(Object.keys(slots)).toHaveLength(children.length)
  })

  it('mirrors the seed placements the e2e specs see', () => {
    // The committed seed slots — pinning them here catches accidental grid drift.
    const seedPositions = {
      projects: { x: 0, y: 0 },
      'field-notes': { x: 0, y: 1 },
      archive: { x: 0, y: 2 },
      charter: { x: 1, y: 0 },
      nameplate: { x: 1, y: 1 },
    } as const
    const ids = Object.keys(seedPositions)
    const slots = resolveDesktopSlots(ids.map((id) => ({ id })), seedPositions)
    expect(slots).toEqual(seedPositions)
  })

  it('setIconPosition-fed maps flow through unchanged (types compose)', () => {
    let state: FSState = emptyFSState(0)
    state = createNode(state, { id: 'x', parentId: 'root', name: 'X', kind: 'text' })
    state = setIconPosition(state, 'x', { x: 4, y: 2 })
    const slots = resolveDesktopSlots([{ id: 'x' }], state.iconPositions)
    expect(slots['x']).toEqual({ x: 4, y: 2 })
  })
})

/* --------------------------------------------------------------------------
 * IM-5 drag-commit math: slotForPoint / slotLimitsFor / clampIconOrigin
 * ------------------------------------------------------------------------ */

describe('slotLimitsFor', () => {
  it('caps at the last column/row whose FULL cell fits the viewport', () => {
    // 1280×720 (the e2e viewport): columns fit while 28 + (x+1)·104 ≤ 1280.
    expect(slotLimitsFor({ w: 1280, h: 720 })).toEqual({
      maxX: Math.floor((1280 - 28 - 104) / 104), // 11
      maxY: Math.floor((720 - 28 - 132) / 132), // 4
    })
  })

  it('never returns negative caps (tiny viewport → slot 0 only)', () => {
    expect(slotLimitsFor({ w: 100, h: 100 })).toEqual({ maxX: 0, maxY: 0 })
  })
})

describe('slotForPoint (the drag-commit snap)', () => {
  it('rounds to the nearest cell origin', () => {
    // Cell 1 spans left 132..236: 180 is nearer 132 → 1; 200 is nearer 236 → 2.
    expect(slotForPoint(180, 160)).toEqual({ x: 1, y: 1 })
    expect(slotForPoint(200, 160)).toEqual({ x: 2, y: 1 })
  })

  it('floors at slot 0 (points above/left of the field origin)', () => {
    expect(slotForPoint(-400, -400)).toEqual({ x: 0, y: 0 })
  })

  it('caps at the viewport limits when given', () => {
    const limits = slotLimitsFor({ w: 1280, h: 720 })
    expect(slotForPoint(5000, 5000, limits)).toEqual({ x: limits.maxX, y: limits.maxY })
    // Without limits the same point snaps far off-screen (caller's choice).
    expect(slotForPoint(5000, 5000).x).toBeGreaterThan(limits.maxX)
  })

  it('an exact cell origin snaps to that cell verbatim', () => {
    expect(slotForPoint(28 + 3 * 104, 28 + 2 * 132)).toEqual({ x: 3, y: 2 })
  })
})

describe('clampIconOrigin (viewport clamp for the icon box)', () => {
  it('keeps the box fully on-screen at every edge', () => {
    const size = { w: 92, h: 132 }
    const viewport = { w: 1280, h: 720 }
    expect(clampIconOrigin(-50, -50, size, viewport)).toEqual({ left: 0, top: 0 })
    expect(clampIconOrigin(5000, 5000, size, viewport)).toEqual({
      left: 1280 - 92,
      top: 720 - 132,
    })
    expect(clampIconOrigin(200, 200, size, viewport)).toEqual({ left: 200, top: 200 })
  })

  it('pins to 0 when the box outsizes the viewport (never negative)', () => {
    expect(clampIconOrigin(300, 300, { w: 2000, h: 2000 }, { w: 800, h: 600 })).toEqual({
      left: 0,
      top: 0,
    })
  })
})
