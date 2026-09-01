/**
 * Docent callouts (UI-3) — first-visit leader-line hints.
 *
 * The brief's challenger raise: a DOCENT annotates the hold on the visitor's
 * first boot — parchment annotation cards with drawn leader lines pointing at
 * the specimens they describe. Shown only when the surface says so (first
 * visit && !docentDismissed); dismissal is the surface's job (any interaction
 * on the stage, or the × on a card — persisted via the settings store).
 *
 * Cards are parchment content surfaces (the duality: light reading surface,
 * serif face); leader lines are brass-in-shadow ink drawn in one shared SVG.
 * Anchors are NODE IDS resolved against the live slots — a hint whose anchor
 * was deleted simply doesn't render. One gentle fade-in is the only motion;
 * the global reduced-motion kill-switch collapses it to instant.
 */

import type { GridPosition } from '../../lib/fs'
import { DESKTOP_GRID, cellCenter } from './grid'

interface DocentHintSpec {
  /** Node id the hint points at (rendered only while that node is on the field). */
  readonly anchorId: string
  readonly text: string
}

/**
 * The shipped hints (product copy, in-world docent voice):
 * open / rearrange / the archive remembers — the three things a first-time
 * visitor should try, in the order they should try them. Anchors sit where a
 * straight leader from the right-hand margin travels CLEAR space to the
 * specimen (the nameplate IS the invitation; the charter is a loose
 * specimen to drag; the archive drawer tells the persistence story).
 */
const HINTS: readonly DocentHintSpec[] = [
  { anchorId: 'nameplate', text: 'Double-click a specimen to open it.' },
  {
    anchorId: 'charter',
    text: 'Drag to rearrange the hold — the fitting arrives with the next module.',
  },
  { anchorId: 'archive', text: 'The archive remembers: reload the console and your desk persists.' },
]

export interface DocentCalloutsProps {
  /** Resolved desktop slots (nodeId → grid position) — hint anchors. */
  readonly slots: Readonly<Record<string, GridPosition>>
  /** The × (the stage also dismisses on any interaction — both routes land here). */
  readonly onDismiss: () => void
}

export function DocentCallouts({ slots, onDismiss }: DocentCalloutsProps) {
  const placed = HINTS.flatMap((hint) => {
    const slot = slots[hint.anchorId]
    return slot ? [{ ...hint, slot }] : []
  })

  // Cards hang in the margin RIGHT of the pinned field — one column past the
  // furthest occupied slot — so an annotation never occludes the specimen it
  // describes (or any neighbor); the leader line carries the association.
  const fieldRight = placed.reduce(
    (max, hint) => Math.max(max, DESKTOP_GRID.originX + (hint.slot.x + 1) * DESKTOP_GRID.cellW),
    0,
  )
  const cardLeft = fieldRight + 20
  const cardTop = (slot: GridPosition) =>
    DESKTOP_GRID.originY + slot.y * DESKTOP_GRID.cellH + 24

  return (
    <div className="docent" data-docent>
      <svg className="docent-leaders" aria-hidden="true" focusable="false">
        {placed.map((hint) => {
          const point = cellCenter(hint.slot)
          return (
            <line
              key={hint.anchorId}
              className="docent-leader"
              x1={cardLeft - 3}
              y1={cardTop(hint.slot) + 28}
              // The tip stops just off the glyph plate's shoulder — pointing
              // AT the specimen, never striking through the drawn glyph.
              x2={point.x + 34}
              y2={point.y - 6}
            />
          )
        })}
      </svg>
      {placed.map((hint, index) => (
        <aside
          key={hint.anchorId}
          className="docent-card parchment-surface"
          role="note"
          data-docent-hint={hint.anchorId}
          style={{
            left: cardLeft,
            top: cardTop(hint.slot),
            animationDelay: `${index * 90}ms`,
          }}
        >
          <p className="docent-text">{hint.text}</p>
          <button
            type="button"
            className="docent-close"
            aria-label="Dismiss hint"
            onClick={onDismiss}
          >
            ×
          </button>
        </aside>
      ))}
    </div>
  )
}
