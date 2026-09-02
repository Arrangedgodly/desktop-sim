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
 *
 * Refinement #5 (`onboard`): a FOURTH annotation points at the console itself,
 * not a specimen — the drawer rail carries the keyboard map's three essential
 * chords (F6 / Enter / Esc). It rides the same first-visit gate, the same × ,
 * the same settle; only its anchor differs (the rail, furniture that never
 * leaves), so it is docked above the rail by CSS rather than slot math.
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
    text: 'Drag to rearrange the hold — drop a specimen on a drawer to file it inside.',
  },
  { anchorId: 'archive', text: 'The archive remembers: reload the console and your desk persists.' },
]

/**
 * The console's own annotation (refinement #5): the keyboard is the machine's,
 * so its card points at the RAIL — the console's furniture — instead of a
 * specimen, and is seated above the rail (CSS bottom anchoring, no slot math).
 * Key tokens ride the mono face inside the docent's serif sentence: a keycap
 * is a readout (the measuring law), and the three chords it names are the
 * ones the map cannot leave unknown. The full condensed map lives in the
 * About colophon (CONSOLE KEYS); the complete law in docs/KEYBOARD.md.
 */
const RAIL_HINT_GAP = 24 /** Clearance between the card and the rail it annotates. */

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
      {/* The rail annotation's leader: a short vertical drop from the card's
          foot to the rail's top edge (CSS-seated above the rail, so no slot
          math — the rail is furniture, not a specimen). */}
      <svg
        className="docent-leaders docent-leaders--rail"
        aria-hidden="true"
        focusable="false"
        style={{ left: cardLeft + 12 }}
      >
        <line className="docent-leader" x1={12} y1={0} x2={12} y2={RAIL_HINT_GAP} />
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
      <aside
        className="docent-card docent-card--rail parchment-surface"
        role="note"
        data-docent-hint="rail"
        style={{ left: cardLeft, animationDelay: `${placed.length * 90}ms` }}
      >
        <p className="docent-text">
          This console answers the keyboard — <kbd className="docent-key">F6</kbd> travels ·{' '}
          <kbd className="docent-key">Enter</kbd> opens · <kbd className="docent-key">Esc</kbd>{' '}
          closes.
        </p>
        <button
          type="button"
          className="docent-close"
          aria-label="Dismiss hint"
          onClick={onDismiss}
        >
          ×
        </button>
      </aside>
    </div>
  )
}
