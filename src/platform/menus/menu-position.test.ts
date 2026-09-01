// Menu placement math (UI-5) — the viewport flip law, pure numbers:
// a menu never opens off-screen (focus inside it must stay visible).
import { describe, expect, it } from 'vitest'
import { computeMenuPlacement, MENU_VIEWPORT_MARGIN } from './menu-position'

const VIEWPORT = { width: 1280, height: 800 }

describe('computeMenuPlacement', () => {
  it('opens at the anchor when the whole menu fits', () => {
    expect(computeMenuPlacement({ x: 400, y: 300 }, { width: 220, height: 120 }, VIEWPORT)).toEqual({
      left: 400,
      top: 300,
    })
  })

  it('slides left when the menu would cross the right edge', () => {
    const placement = computeMenuPlacement({ x: 1200, y: 100 }, { width: 220, height: 120 }, VIEWPORT)
    expect(placement.left).toBe(VIEWPORT.width - MENU_VIEWPORT_MARGIN - 220)
    expect(placement.top).toBe(100) // vertically fine — untouched
    expect(placement.left + 220).toBeLessThanOrEqual(VIEWPORT.width - MENU_VIEWPORT_MARGIN)
  })

  it('flips up when the menu would cross the bottom edge', () => {
    const placement = computeMenuPlacement({ x: 100, y: 750 }, { width: 220, height: 120 }, VIEWPORT)
    expect(placement.top).toBe(VIEWPORT.height - MENU_VIEWPORT_MARGIN - 120)
    expect(placement.left).toBe(100) // horizontally fine — untouched
    expect(placement.top + 120).toBeLessThanOrEqual(VIEWPORT.height - MENU_VIEWPORT_MARGIN)
  })

  it('flips on BOTH axes near the bottom-right corner', () => {
    const placement = computeMenuPlacement({ x: 1260, y: 780 }, { width: 220, height: 120 }, VIEWPORT)
    expect(placement).toEqual({
      left: VIEWPORT.width - MENU_VIEWPORT_MARGIN - 220,
      top: VIEWPORT.height - MENU_VIEWPORT_MARGIN - 120,
    })
  })

  it('pins to the margin when the menu is larger than the viewport (graceful overflow)', () => {
    const tiny = { width: 200, height: 150 }
    expect(computeMenuPlacement({ x: 500, y: 500 }, { width: 300, height: 250 }, tiny)).toEqual({
      left: MENU_VIEWPORT_MARGIN,
      top: MENU_VIEWPORT_MARGIN,
    })
  })

  it('honors a custom margin', () => {
    const placement = computeMenuPlacement({ x: 100, y: 790 }, { width: 100, height: 100 }, VIEWPORT, 24)
    expect(placement.top).toBe(VIEWPORT.height - 24 - 100)
  })
})
