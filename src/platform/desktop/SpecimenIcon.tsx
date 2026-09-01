/**
 * Specimen icon (UI-3 + IM-5) — one pinned specimen card on the hold's surface.
 *
 * Anatomy (the brief's archive grammar): a drawn kind glyph above a PARCHMENT
 * catalog label carrying the engraved name + accession code; the label's
 * frame is brass (label frames are a sanctioned hardware touchpoint). It is a
 * real `<button>`: aria-label reads "name, accession, kind"; click SELECTS
 * (single-select, the surface owns the state); double-click and Enter both
 * dispatch the open seam (`open-specimen.ts`); roving tabindex is applied by
 * the surface.
 *
 * Drag (IM-5): the button spreads `useSpecimenDrag`'s pointer props — the
 * committed RQ-3 gesture. Transform-only while armed (React-owned left/top
 * frozen), ONE commit at pointerup: a grid-snapped `setIconPosition`, or a
 * `moveNode` when released over a drawer (the dragged card becomes a
 * pointer-transparent ghost so the drop hit-test sees through it). A drag
 * suppresses the very next click/dblclick (`consumeDragged`) so releasing a
 * drag can never read as an open.
 */

import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { useRef } from 'react'
import type { FSNode, GridPosition } from '../../lib/fs'
import type { ViewportSize } from '../wm'
import { KIND_GLYPHS, KIND_WORDS } from './specimen-kinds'
import { cellOrigin } from './grid'
import { useSpecimenDrag } from './use-specimen-drag'

export interface SpecimenIconProps {
  readonly node: FSNode
  readonly slot: GridPosition
  readonly selected: boolean
  /** Roving tabindex: true on exactly one icon in the field (surface decides). */
  readonly tabbable: boolean
  /** Viewport for the drag clamp + snap caps (measured once by the surface). */
  readonly viewport: ViewportSize
  readonly onSelect: (id: string) => void
  /** The double-click seam (also fired by Enter — see open-specimen.ts). */
  readonly onOpen: (node: FSNode) => void
}

export function SpecimenIcon({
  node,
  slot,
  selected,
  tabbable,
  viewport,
  onSelect,
  onOpen,
}: SpecimenIconProps) {
  const Glyph = KIND_GLYPHS[node.kind]
  const origin = cellOrigin(slot)
  const style: CSSProperties = { left: origin.left, top: origin.top }
  const kindWord = KIND_WORDS[node.kind]
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const drag = useSpecimenDrag({ node, slot, viewport, iconRef: buttonRef })

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation() // ground-click clears selection; this click selects
    onSelect(node.id)
  }

  const handleDoubleClick = () => {
    if (drag.consumeDragged()) return // a released drag is never an open
    onOpen(node)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      // The keyboard floor (DD-1 does the full map): Enter opens, like a
      // double-click. Space stays a plain click (native button behavior).
      event.preventDefault()
      onOpen(node)
    }
  }

  return (
    <button
      type="button"
      className="specimen-icon"
      data-specimen-id={node.id}
      data-kind={node.kind}
      data-selected={selected}
      aria-label={`${node.name}, ${node.accession}, ${kindWord}`}
      title={node.name} // long labels clamp; the hover carries the full name
      tabIndex={tabbable ? 0 : -1}
      style={style}
      ref={buttonRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      {...drag.pointerProps}
    >
      <span className="specimen-plate" aria-hidden="true">
        <Glyph size={40} />
        <span className="specimen-marks" data-selected={selected} />
      </span>
      <span className="specimen-label" aria-hidden="true">
        <span className="specimen-name">{node.name}</span>
        <span className="specimen-accession">{node.accession}</span>
      </span>
    </button>
  )
}
