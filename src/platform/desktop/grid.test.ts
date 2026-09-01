// UI-3 desktop grid math — pure slot resolution (node env, no DOM).
import { describe, expect, it } from 'vitest'
import { createNode, emptyFSState, setIconPosition, type FSState } from '../../lib/fs'
import { DESKTOP_GRID, cellCenter, cellOrigin, resolveDesktopSlots } from './grid'

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
