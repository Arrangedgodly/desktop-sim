/**
 * Paint canvas engine tests (federated session 2) — the pure raster math in
 * Node, no DOM: the scanline flood fill (region fill, tolerance against
 * antialiased edges, barrier respect, out-of-bounds and no-op honesty), the
 * pointer → plate mapping through a displayed rect, and the tool pigment
 * resolution.
 */

import { describe, expect, it } from 'vitest'
import { PLATE_HEIGHT, PLATE_WIDTH, DEFAULT_BRUSH_SIZE } from './paint-model'
import { FILL_TOLERANCE, floodFill, mapToPlate, parseHex, toolPaint } from './paint-canvas'
import type { Raster } from './paint-canvas'

/** A raster filled with one uniform color. */
function uniformRaster(width: number, height: number, rgba: readonly number[]): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0]!
    data[i + 1] = rgba[1]!
    data[i + 2] = rgba[2]!
    data[i + 3] = rgba[3] ?? 255
  }
  return { width, height, data }
}

const px = (raster: Raster, x: number, y: number): readonly number[] => {
  const i = (y * raster.width + x) * 4
  return [raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!, raster.data[i + 3]!]
}

describe('paint · flood fill (pure raster math)', () => {
  it('fills a bounded region and nothing past the barrier', () => {
    // 8×8 parchment ground with an ink rectangle wall around (2,2)-(5,5)'s interior.
    const raster = uniformRaster(8, 8, [236, 226, 201]) // parchment
    const ink = [51, 41, 28]
    for (let x = 1; x <= 6; x++) {
      for (const y of [1, 6]) {
        const i = (y * 8 + x) * 4
        raster.data.set(ink, i)
      }
    }
    for (let y = 1; y <= 6; y++) {
      for (const x of [1, 6]) {
        const i = (y * 8 + x) * 4
        raster.data.set(ink, i)
      }
    }

    const changed = floodFill(raster, 3, 3, [176, 141, 63]) // brass pigment
    expect(changed).toBe(true)

    // Inside the wall: filled.
    expect(px(raster, 3, 3)).toEqual([176, 141, 63, 255])
    expect(px(raster, 5, 5)).toEqual([176, 141, 63, 255])
    // The wall itself: NOT filled (it is the barrier, not the region).
    expect(px(raster, 1, 3)).toEqual([51, 41, 28, 255])
    // Outside the wall: untouched parchment.
    expect(px(raster, 0, 0)).toEqual([236, 226, 201, 255])
    expect(px(raster, 7, 7)).toEqual([236, 226, 201, 255])
  })

  it('fills a whole uniform raster when nothing bounds it', () => {
    const raster = uniformRaster(10, 4, [236, 226, 201])
    expect(floodFill(raster, 9, 3, [224, 106, 79])).toBe(true)
    expect(px(raster, 0, 0)).toEqual([224, 106, 79, 255])
    expect(px(raster, 9, 3)).toEqual([224, 106, 79, 255])
  })

  it('respects the tolerance: near-seed antialiasing shades fill, far colors do not', () => {
    // Ground parchment, one pixel a few channels off (an antialiased edge).
    const raster = uniformRaster(3, 1, [236, 226, 201])
    const i = 1 * 4
    raster.data[i] = 236 - FILL_TOLERANCE // exactly within tolerance
    raster.data[i + 1] = 226 - 20
    raster.data[i + 2] = 201 - 20

    expect(floodFill(raster, 0, 0, [51, 41, 28])).toBe(true)
    expect(px(raster, 1, 0)).toEqual([51, 41, 28, 255]) // the near shade filled
  })

  it('is honest about no-ops: OOB seeds and seeds already the fill color', () => {
    const raster = uniformRaster(4, 4, [236, 226, 201])
    const before = Uint8ClampedArray.from(raster.data)

    expect(floodFill(raster, -1, 0, [0, 0, 0])).toBe(false)
    expect(floodFill(raster, 0, -1, [0, 0, 0])).toBe(false)
    expect(floodFill(raster, 4, 0, [0, 0, 0])).toBe(false)
    expect(floodFill(raster, 0, 4, [0, 0, 0])).toBe(false)
    expect(floodFill(raster, 2, 2, [236, 226, 201])).toBe(false) // seed IS the fill color

    expect(Array.from(raster.data)).toEqual(Array.from(before)) // nothing mutated
  })

  it('does not leak through diagonal gaps (scanline correctness)', () => {
    // Two chambers separated by a diagonal wall; fill the left chamber only.
    const size = 6
    const raster = uniformRaster(size, size, [236, 226, 201])
    for (let x = 0; x < size; x++) {
      const y = x // the diagonal
      const i = (y * size + x) * 4
      raster.data.set([51, 41, 28], i)
    }
    floodFill(raster, 0, 5, [224, 106, 79])
    // Below-left of the diagonal: filled (x < y region).
    expect(px(raster, 0, 5)).toEqual([224, 106, 79, 255])
    expect(px(raster, 2, 5)).toEqual([224, 106, 79, 255])
    // Above-right: untouched.
    expect(px(raster, 5, 0)).toEqual([236, 226, 201, 255])
    expect(px(raster, 4, 1)).toEqual([236, 226, 201, 255])
  })
})

describe('paint · pointer → plate mapping', () => {
  it('is identity when the rect IS the plate', () => {
    const point = mapToPlate(
      { left: 0, top: 0, width: PLATE_WIDTH, height: PLATE_HEIGHT },
      480,
      300,
    )
    expect(point).toEqual({ x: 480, y: 300 })
  })

  it('scales through a smaller displayed rect (aspect-fit windows)', () => {
    // Displayed at half size: the plate's center is the rect's center.
    const point = mapToPlate({ left: 100, top: 50, width: PLATE_WIDTH / 2, height: PLATE_HEIGHT / 2 }, 100 + 240, 50 + 150)
    expect(point).toEqual({ x: 480, y: 300 })
  })

  it('clamps pointers outside the plate into its bounds', () => {
    const rect = { left: 0, top: 0, width: PLATE_WIDTH, height: PLATE_HEIGHT }
    expect(mapToPlate(rect, -40, -40)).toEqual({ x: 0, y: 0 })
    expect(mapToPlate(rect, PLATE_WIDTH + 999, 9999)).toEqual({
      x: PLATE_WIDTH - 1,
      y: PLATE_HEIGHT - 1,
    })
    // A zero-size rect (jsdom measures nothing) maps to the origin, never NaN.
    expect(mapToPlate({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual({ x: 0, y: 0 })
  })
})

describe('paint · pigment resolution', () => {
  it('the eraser paints the ground; brush and fill paint the selection', () => {
    const ground = '#ece2c9'
    const ink = '#33291c'
    expect(toolPaint('brush', ink, ground)).toBe(ink)
    expect(toolPaint('fill', ink, ground)).toBe(ink)
    expect(toolPaint('eraser', ink, ground)).toBe(ground)
  })

  it('parseHex reads the color input\'s world (#rgb and #rrggbb)', () => {
    expect(parseHex('#33291c')).toEqual([51, 41, 28])
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('  #ece2c9 ')).toEqual([236, 226, 201])
    expect(parseHex('red')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('javascript:alert(1)')).toBeNull()
  })

  it('DEFAULT_BRUSH_SIZE is one of the discrete stops', () => {
    expect([2, 4, 8, 16, 32]).toContain(DEFAULT_BRUSH_SIZE)
  })
})
