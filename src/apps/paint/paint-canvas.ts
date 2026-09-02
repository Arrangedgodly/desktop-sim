/**
 * Paint canvas engine (federated session 2) — the pure-ISH canvas math: a
 * `Raster` shape structurally identical to `ImageData` (so a real canvas's
 * ImageData passes straight in) with a fully pure, Node-testable scanline
 * FLOOD FILL; the pointer → plate coordinate mapping through the displayed
 * CSS rect; and the tool pigment resolution. No React, no stores; the only
 * DOM-shaped inputs are passed in as plain data.
 *
 * The stroke primitives themselves (moveTo/lineTo arcs on a 2d context) stay
 * in the surface — they are three lines of Canvas API over this module's
 * resolved inputs, with nothing left to unit-test.
 */

import type { BrushSize, PaintTool } from './paint-model'
import { PLATE_HEIGHT, PLATE_WIDTH } from './paint-model'

/**
 * A raster image in RGBA order — the exact shape of the DOM's ImageData
 * (`width`, `height`, `data: Uint8ClampedArray`), typed locally so the flood
 * fill runs in Node without a DOM.
 */
export interface Raster {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/** Per-channel match tolerance — wide enough to swallow antialiased edges. */
export const FILL_TOLERANCE = 48

/** An RGB triple (alpha is written opaque — the plate is not translucent). */
export type RGB = readonly [number, number, number]

/** Parse `#rgb`/`#rrggbb` (the color input's world) into an RGB triple. */
export function parseHex(hex: string): RGB | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const digits = match[1]!
  if (digits.length === 3) {
    return [
      parseInt(digits[0]! + digits[0]!, 16),
      parseInt(digits[1]! + digits[1]!, 16),
      parseInt(digits[2]! + digits[2]!, 16),
    ]
  }
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ]
}

/** The four channels of the pixel at byte offset `i`. */
function pixelAt(data: Uint8ClampedArray, i: number): [number, number, number, number] {
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
}

/** True when the pixel at byte offset `i` matches `seed` within FILL_TOLERANCE. */
function matches(
  data: Uint8ClampedArray,
  i: number,
  seed: [number, number, number, number],
): boolean {
  const [r, g, b, a] = pixelAt(data, i)
  return (
    Math.abs(r - seed[0]) <= FILL_TOLERANCE &&
    Math.abs(g - seed[1]) <= FILL_TOLERANCE &&
    Math.abs(b - seed[2]) <= FILL_TOLERANCE &&
    Math.abs(a - seed[3]) <= FILL_TOLERANCE
  )
}

/**
 * Scanline flood fill over the raster, seeded at plate pixel (x, y), in
 * `color` (written opaque). Returns true when any pixel changed; false (and
 * NO mutation) for out-of-bounds seeds or a seed already within tolerance of
 * the fill color (nothing to do). Mutates `raster.data` in place — the
 * caller's ImageData on a real canvas, a plain array in tests.
 */
export function floodFill(raster: Raster, x: number, y: number, color: RGB): boolean {
  const { width, height, data } = raster
  if (x < 0 || y < 0 || x >= width || y >= height) return false

  const start = (y * width + x) * 4
  const [fr, fg, fb] = color
  // Seed already ~the fill color: a no-op fill, honestly reported.
  if (matches(data, start, [fr, fg, fb, 255])) return false

  const seed = pixelAt(data, start)

  const visited = new Uint8Array(width * height)
  const stack: number[] = [y * width + x]

  while (stack.length > 0) {
    const pixel = stack.pop()!
    if (visited[pixel]) continue

    // Walk the row left and right from the seed pixel while it matches.
    const row = Math.floor(pixel / width)
    let left = pixel % width
    let right = left
    while (
      left > 0 &&
      !visited[row * width + (left - 1)] &&
      matches(data, (row * width + left - 1) * 4, seed)
    ) {
      left--
    }
    while (
      right < width - 1 &&
      !visited[row * width + right + 1] &&
      matches(data, (row * width + right + 1) * 4, seed)
    ) {
      right++
    }

    for (let column = left; column <= right; column++) {
      const index = row * width + column
      if (visited[index]) continue
      visited[index] = 1
      const i = index * 4
      data[i] = fr
      data[i + 1] = fg
      data[i + 2] = fb
      data[i + 3] = 255

      // Seed the rows above and below for the next scanline pass.
      if (row > 0) {
        const up = (row - 1) * width + column
        if (!visited[up] && matches(data, up * 4, seed)) stack.push(up)
      }
      if (row < height - 1) {
        const down = (row + 1) * width + column
        if (!visited[down] && matches(data, down * 4, seed)) stack.push(down)
      }
    }
  }
  return true
}

/** The displayed plate box, in client coordinates (the canvas's CSS rect). */
export interface PlateRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** A point in plate space (0..PLATE_WIDTH × 0..PLATE_HEIGHT), clamped in-bounds. */
export interface PlatePoint {
  readonly x: number
  readonly y: number
}

/**
 * Map a pointer's client coordinates onto plate coordinates through the
 * displayed rect — the canvas may be displayed smaller than the plate
 * (aspect-fit inside the window), so this normalizes by rect fraction, then
 * clamps to the plate's own bounds.
 */
export function mapToPlate(rect: PlateRect, clientX: number, clientY: number): PlatePoint {
  const fx = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width
  const fy = rect.height <= 0 ? 0 : (clientY - rect.top) / rect.height
  return {
    x: Math.min(PLATE_WIDTH - 1, Math.max(0, Math.round(fx * PLATE_WIDTH))),
    y: Math.min(PLATE_HEIGHT - 1, Math.max(0, Math.round(fy * PLATE_HEIGHT))),
  }
}

/**
 * The pigment a tool paints with: the eraser repaints the GROUND (an honest
 * eraser on an opaque parchment plate); brush and fill paint the selection.
 */
export function toolPaint(tool: PaintTool, color: string, ground: string): string {
  return tool === 'eraser' ? ground : color
}

/** Stroke style for the 2d context: round caps/joins, the stepped diameter. */
export interface StrokeStyle {
  readonly strokeStyle: string
  readonly lineWidth: number
  readonly lineCap: 'round'
  readonly lineJoin: 'round'
}

export function strokeStyleFor(color: string, size: BrushSize): StrokeStyle {
  return { strokeStyle: color, lineWidth: size, lineCap: 'round', lineJoin: 'round' }
}
