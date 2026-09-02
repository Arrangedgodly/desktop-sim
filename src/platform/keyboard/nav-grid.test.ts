// nav-grid (DD-1) — the pure 2D arrow-walk math over the desktop's slots.
import { describe, expect, it } from 'vitest'
import { arrowNavigate, type NavSlot } from './nav-grid'

// The seeded hold's shape (catalog order): a 2-column field.
const SEED: readonly NavSlot[] = [
  { id: 'projects', x: 0, y: 0 },
  { id: 'field-notes', x: 0, y: 1 },
  { id: 'archive', x: 0, y: 2 },
  { id: 'charter', x: 1, y: 0 },
  { id: 'nameplate', x: 1, y: 1 },
]

describe('arrowNavigate · 2D walks on the grid', () => {
  it('right/down from the top of column 0 stay axial (not diagonal)', () => {
    expect(arrowNavigate(SEED, 'projects', 'right')).toBe('charter')
    expect(arrowNavigate(SEED, 'projects', 'down')).toBe('field-notes')
  })

  it('right from mid-column picks the nearest candidate by distance', () => {
    // From (0,1): right candidates are (1,0) d²=2 and (1,1) d²=1 → nameplate.
    expect(arrowNavigate(SEED, 'field-notes', 'right')).toBe('nameplate')
  })

  it('equal distances break to the smaller perpendicular offset', () => {
    // From (0,0): (1,2) and (2,1) both sit d²=5 away; going right the
    // perpendicular is |dy| → (2,1) wins; going down it is |dx| → (1,2).
    const slots: readonly NavSlot[] = [
      { id: 'from', x: 0, y: 0 },
      { id: 'high', x: 1, y: 2 },
      { id: 'low', x: 2, y: 1 },
    ]
    expect(arrowNavigate(slots, 'from', 'right')).toBe('low')
    expect(arrowNavigate(slots, 'from', 'down')).toBe('high')
  })

  it('left/up walk back where right/down came from', () => {
    expect(arrowNavigate(SEED, 'nameplate', 'left')).toBe('field-notes')
    expect(arrowNavigate(SEED, 'nameplate', 'up')).toBe('charter')
    expect(arrowNavigate(SEED, 'charter', 'left')).toBe('projects')
    expect(arrowNavigate(SEED, 'archive', 'up')).toBe('field-notes')
  })

  it('edges answer null (no candidate sits that way)', () => {
    expect(arrowNavigate(SEED, 'projects', 'left')).toBeNull()
    expect(arrowNavigate(SEED, 'projects', 'up')).toBeNull()
    expect(arrowNavigate(SEED, 'archive', 'down')).toBeNull()
    expect(arrowNavigate(SEED, 'nameplate', 'right')).toBeNull()
  })

  it('unknown anchor and null anchor answer null', () => {
    expect(arrowNavigate(SEED, 'gone', 'right')).toBeNull()
    expect(arrowNavigate(SEED, null, 'down')).toBeNull()
  })

  it('a single icon field has nowhere to walk', () => {
    expect(arrowNavigate([{ id: 'only', x: 3, y: 3 }], 'only', 'right')).toBeNull()
  })
})
