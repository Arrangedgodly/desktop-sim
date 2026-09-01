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
 *
 * IM-5 adds the drag-commit math: `slotForPoint` (pixel → snapped slot),
 * `slotLimitsFor` (viewport caps), `clampIconOrigin` (viewport clamp for the
 * icon box — distinct from the WM clamp, which floors at window minimums).
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

/** Rows per grid column before the walk moves right (UI-5's arrange shares it). */
export const MAX_GRID_ROWS = 8

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
  // (Shared constant — UI-5's arrange-by-accession re-grids the same way.)
  const MAX_ROWS = MAX_GRID_ROWS
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

/* --------------------------------------------------------------------------
 * Drag math (IM-5) — pixel ↔ slot for the icon-drag commit path.
 * Deliberately NOT reusing wm/geometry's `clampGeometryToViewport`: that clamp
 * floors sizes at the WINDOW minimums (320×200), which would inflate an icon
 * (92px wide) and mis-clamp its origin near the right/bottom edges.
 * ------------------------------------------------------------------------ */

/** Caps for a committed slot so the whole cell stays on-screen. */
export interface SlotLimits {
  readonly maxX: number
  readonly maxY: number
}

/**
 * Slot caps for a viewport: the last column/row whose FULL cell fits inside.
 * Structural viewport (`{w, h}`) keeps this module free of wm imports.
 */
export function slotLimitsFor(
  viewport: { readonly w: number; readonly h: number },
  metrics: GridMetrics = DESKTOP_GRID,
): SlotLimits {
  return {
    maxX: Math.max(0, Math.floor((viewport.w - metrics.originX - metrics.cellW) / metrics.cellW)),
    maxY: Math.max(0, Math.floor((viewport.h - metrics.originY - metrics.cellH) / metrics.cellH)),
  }
}

/**
 * Grid slot for a pixel point (the drag-commit snap): the slot whose cell
 * ORIGIN is nearest the point, floored at 0 and capped by `limits`
 * (viewport-derived) — a committed icon can never land off-screen.
 */
export function slotForPoint(
  left: number,
  top: number,
  limits?: SlotLimits,
  metrics: GridMetrics = DESKTOP_GRID,
): GridPosition {
  const x = Math.round((left - metrics.originX) / metrics.cellW)
  const y = Math.round((top - metrics.originY) / metrics.cellH)
  return {
    x: limits ? Math.min(Math.max(0, x), limits.maxX) : Math.max(0, x),
    y: limits ? Math.min(Math.max(0, y), limits.maxY) : Math.max(0, y),
  }
}

/**
 * Clamp an icon's pixel origin so the icon box stays fully inside the viewport
 * (the transient paint path and the commit path both route through here, so
 * they can never disagree). An icon larger than the viewport pins to 0.
 */
export function clampIconOrigin(
  left: number,
  top: number,
  size: { readonly w: number; readonly h: number },
  viewport: { readonly w: number; readonly h: number },
): { left: number; top: number } {
  const w = Math.min(size.w, viewport.w)
  const h = Math.min(size.h, viewport.h)
  return {
    left: Math.min(Math.max(left, 0), Math.max(0, viewport.w - w)),
    top: Math.min(Math.max(top, 0), Math.max(0, viewport.h - h)),
  }
}
