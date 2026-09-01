/**
 * Desktop grid math (UI-3) — where a catalog slot becomes a pixel.
 *
 * The FS model (MF-1) stores icon positions as GRID coordinates
 * (`iconPositions`: x = column, y = row) so persisted placements stay sane
 * across font/DPI changes. This module is the single place that turns a
 * `GridPosition` into CSS pixel offsets for the icon field, and the single
 * place that assigns fallback slots to root children that have no position
 * yet (a node created on the desktop — UI-5's context menu — renders in the
 * first free slot until a drag (IM-5) pins it).
 *
 * Pure: no React, no stores, no DOM.
 */

import type { GridPosition, IconPositionMap } from '../../lib/fs'

/** The icon field's metrics: where column/row 0 sits and how big a slot is. */
export interface GridMetrics {
  readonly originX: number
  readonly originY: number
  readonly cellW: number
  readonly cellH: number
}

/**
 * Committed metrics (px). A cell holds one specimen card (glyph + parchment
 * label, up to three wrapped label lines) plus the gutter to its neighbor;
 * origin leaves room for the plate's margin. Taskbar rail (IM-4c) docks to a
 * screen edge not covered by column 0.
 */
export const DESKTOP_GRID: GridMetrics = { originX: 28, originY: 28, cellW: 104, cellH: 132 }

/** Pixel origin (top-left) of one grid slot. */
export function cellOrigin(position: GridPosition, metrics: GridMetrics = DESKTOP_GRID): {
  left: number
  top: number
} {
  return {
    left: metrics.originX + position.x * metrics.cellW,
    top: metrics.originY + position.y * metrics.cellH,
  }
}

/** Center point of one grid slot (leader lines aim here). */
export function cellCenter(
  position: GridPosition,
  metrics: GridMetrics = DESKTOP_GRID,
): { x: number; y: number } {
  const origin = cellOrigin(position, metrics)
  return { x: origin.left + metrics.cellW / 2, y: origin.top + metrics.cellH / 2 }
}

/**
 * Resolve a desktop slot for EVERY root child: positioned nodes keep their
 * slot verbatim; unpositioned nodes fill the first FREE slot in column-major
 * order (down each column, then the next column — matching the seed's shape).
 * Occupied = a slot claimed by a positioned node. Deterministic in catalog
 * order, so the same tree always lays out the same way.
 */
export function resolveDesktopSlots(
  rootChildren: readonly { readonly id: string }[],
  positions: IconPositionMap,
): Readonly<Record<string, GridPosition>> {
  const slots: Record<string, GridPosition> = {}
  const taken = new Set<string>()
  for (const node of rootChildren) {
    const position = positions[node.id]
    if (!position) continue
    slots[node.id] = position
    taken.add(`${position.x}:${position.y}`)
  }

  // Column-major walk with a row cap: fill down a column, then move right.
  // 8 rows keeps auto-placed icons above the taskbar-rail territory (IM-4c).
  const MAX_ROWS = 8
  let x = 0
  let y = 0
  const nextFree = (): GridPosition => {
    for (;;) {
      const candidate = { x, y }
      y += 1
      if (y >= MAX_ROWS) {
        y = 0
        x += 1
      }
      if (!taken.has(`${candidate.x}:${candidate.y}`)) return candidate
    }
  }

  for (const node of rootChildren) {
    if (slots[node.id]) continue
    const slot = nextFree()
    slots[node.id] = slot
    taken.add(`${slot.x}:${slot.y}`)
  }
  return slots
}
