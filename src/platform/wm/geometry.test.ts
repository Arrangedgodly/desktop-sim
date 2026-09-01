import { describe, expect, it } from 'vitest'
import {
  clampGeometryToViewport,
  maximizedGeometry,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
} from './geometry'

const VIEWPORT = { w: 1024, h: 768 }

describe('clampGeometryToViewport', () => {
  it('passes through geometry that already fits', () => {
    const g = { x: 100, y: 80, w: 480, h: 320 }
    expect(clampGeometryToViewport(g, VIEWPORT)).toEqual(g)
  })

  it('clamps position so the window stays fully on-screen', () => {
    expect(clampGeometryToViewport({ x: 900, y: 700, w: 480, h: 320 }, VIEWPORT)).toEqual({
      x: 1024 - 480,
      y: 768 - 320,
      w: 480,
      h: 320,
    })
    expect(clampGeometryToViewport({ x: -50, y: -40, w: 480, h: 320 }, VIEWPORT)).toEqual({
      x: 0,
      y: 0,
      w: 480,
      h: 320,
    })
  })

  it('floors size at the structural minimums', () => {
    expect(clampGeometryToViewport({ x: 0, y: 0, w: 10, h: 10 }, VIEWPORT)).toEqual({
      x: 0,
      y: 0,
      w: MIN_WINDOW_WIDTH,
      h: MIN_WINDOW_HEIGHT,
    })
  })

  it('caps size at the viewport', () => {
    expect(clampGeometryToViewport({ x: 0, y: 0, w: 5000, h: 4000 }, VIEWPORT)).toEqual({
      x: 0,
      y: 0,
      w: 1024,
      h: 768,
    })
  })

  it('keeps the window anchored top-left when the viewport is smaller than the minimums', () => {
    expect(clampGeometryToViewport({ x: 50, y: 50, w: 480, h: 320 }, { w: 200, h: 150 })).toEqual({
      x: 0,
      y: 0,
      w: MIN_WINDOW_WIDTH,
      h: MIN_WINDOW_HEIGHT,
    })
  })

  it('is idempotent (clamping a clamped result changes nothing)', () => {
    const once = clampGeometryToViewport({ x: 4000, y: -300, w: 5000, h: 10 }, VIEWPORT)
    expect(clampGeometryToViewport(once, VIEWPORT)).toEqual(once)
  })
})

describe('maximizedGeometry', () => {
  it('derives full-viewport bounds from the flag (store keeps normal geometry)', () => {
    expect(maximizedGeometry(VIEWPORT)).toEqual({ x: 0, y: 0, w: 1024, h: 768 })
  })
})
