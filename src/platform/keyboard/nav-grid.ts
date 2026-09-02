/**
 * 2D grid arrow navigation (DD-1) — the pure math behind "arrows walk the
 * icon field". Given the desktop's resolved slots (`grid.ts` keeps nodes on
 * integer column/row coordinates) and the icon focus sits on, `arrowNavigate`
 * answers "which icon is in that direction".
 *
 * Scoring is the standard spatial-navigation rule: candidates strictly inside
 * the direction's half-plane, ranked by squared Euclidean distance from the
 * origin, ties broken by the smaller PERPENDICULAR offset (due-next beats
 * diagonal). Pure: no React, no stores, no DOM — the surface applies the
 * answer (select + focus), this module never touches focus itself.
 */

/** The four arrow directions, as focus-move intents. */
export type NavDirection = 'up' | 'down' | 'left' | 'right'

/** One navigable grid cell: an id plus its column/row slot. */
export interface NavSlot {
  readonly id: string
  readonly x: number
  readonly y: number
}

/**
 * The next id in `direction` from `fromId`, or null at the field's edge (no
 * candidate sits that way — the caller leaves focus where it was). Unknown
 * `fromId` also answers null (nothing to navigate from).
 */
export function arrowNavigate(
  slots: readonly NavSlot[],
  fromId: string | null,
  direction: NavDirection,
): string | null {
  if (fromId === null) return null
  const from = slots.find((slot) => slot.id === fromId)
  if (!from) return null

  let best: { id: string; dist: number; perp: number } | null = null
  for (const candidate of slots) {
    if (candidate.id === fromId) continue
    const dx = candidate.x - from.x
    const dy = candidate.y - from.y
    if (direction === 'right' && dx <= 0) continue
    if (direction === 'left' && dx >= 0) continue
    if (direction === 'down' && dy <= 0) continue
    if (direction === 'up' && dy >= 0) continue
    const dist = dx * dx + dy * dy
    const perp = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
    // Strictly better wins; exact ties keep the first candidate in list order
    // (slot lists are deterministic — catalog order — so navigation is too).
    if (best === null || dist < best.dist || (dist === best.dist && perp < best.perp)) {
      best = { id: candidate.id, dist, perp }
    }
  }
  return best?.id ?? null
}
