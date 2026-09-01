/**
 * Specimen icon (UI-3 + IM-5 + UI-5) — one pinned specimen card on the hold's
 * surface.
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
 *
 * Context menu (UI-5): right-click (or the keyboard Menu key / Shift+F10 —
 * the keyboard floor) asks the surface to open the specimen menu at the
 * pointer (point anchor) or at this button (element anchor). While the icon
 * is in its INLINE RENAME state (the menu's Rename command), the card
 * swaps its button for a label-edit field: the parchment label becomes an
 * input, Enter commits, Escape cancels, blur commits, and a rejected label
 * (FSError — collision or empty) shakes the card IN-WORLD (the same refusal
 * shake as an invalid drop) and KEEPS editing. Focus returns to the icon
 * button when the edit ends either way.
 */

import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { FSNode, GridPosition } from '../../lib/fs'
import type { MenuAnchor } from '../menus'
import type { ViewportSize } from '../wm'
import { KIND_GLYPHS, KIND_WORDS } from './specimen-kinds'
import { cellOrigin } from './grid'
import { useSpecimenDrag } from './use-specimen-drag'

/** How long the rename-rejected shake attribute rides the icon (CSS: 320ms). */
const RENAME_REJECT_ATTR_MS = 400

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
  /** Open this specimen's context menu (UI-5) at a pointer or element anchor. */
  readonly onMenu: (node: FSNode, anchor: MenuAnchor) => void
  /** Inline rename (UI-5): true while this icon's label is being edited. */
  readonly editing?: boolean
  /** Commit a rename; false = rejected (shake + keep editing). */
  readonly onCommitRename: (name: string) => boolean
  /** Abandon the edit, label unchanged. */
  readonly onCancelRename: () => void
}

/** Focus + select the whole label, scrolled to its start (see effect note). */
function focusAndSelectFromStart(input: HTMLInputElement | null): void {
  if (!input) return
  input.focus()
  input.select()
  const toStart = (): void => {
    input.scrollLeft = 0
  }
  const raf = (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame })
    .requestAnimationFrame
  if (typeof raf === 'function') raf(() => toStart())
  else toStart()
}

export function SpecimenIcon({
  node,
  slot,
  selected,
  tabbable,
  viewport,
  onSelect,
  onOpen,
  onMenu,
  editing = false,
  onCommitRename,
  onCancelRename,
}: SpecimenIconProps) {
  const Glyph = KIND_GLYPHS[node.kind]
  const origin = cellOrigin(slot)
  const style: CSSProperties = { left: origin.left, top: origin.top }
  const kindWord = KIND_WORDS[node.kind]
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const drag = useSpecimenDrag({ node, slot, viewport, iconRef: buttonRef })
  const [draft, setDraft] = useState(node.name)
  const [rejected, setRejected] = useState(false)
  // Escape already ended the edit by the time the input unmounts; the
  // blur-commit path must not fire for a cancel.
  const cancelledRef = useRef(false)

  // Entering the edit seeds the field; landing in it selects the whole label
  // for immediate retyping (the console's fast path).
  useEffect(() => {
    if (editing) {
      setDraft(node.name)
      cancelledRef.current = false
      focusAndSelectFromStart(inputRef.current)
    }
  }, [editing, node.name])

  // Leaving the edit (commit or cancel) returns focus to the icon button —
  // keyboard continuity; the card goes back to being the tabbable thing.
  const wasEditingRef = useRef(false)
  useEffect(() => {
    if (wasEditingRef.current && !editing) buttonRef.current?.focus()
    wasEditingRef.current = editing
  }, [editing])

  const rejectEdit = (): void => {
    setRejected(true)
    window.setTimeout(() => setRejected(false), RENAME_REJECT_ATTR_MS)
    focusAndSelectFromStart(inputRef.current)
  }

  const commit = (): boolean => {
    // The surface decides: renameNode no-ops an identical label, FSErrors a
    // bad one; true ends the edit, false shakes and keeps editing.
    const ok = onCommitRename(draft.trim())
    if (!ok) {
      rejectEdit() // FSError (collision / empty): shake + keep editing
      return false
    }
    return true
  }

  // -- inline rename state ----------------------------------------------------
  if (editing) {
    return (
      <div
        className="specimen-icon"
        data-specimen-id={node.id}
        data-kind={node.kind}
        data-editing="true"
        data-selected={selected}
        data-drop-rejected={rejected || undefined}
        style={style}
      >
        <span className="specimen-plate" aria-hidden="true">
          <Glyph size={40} />
        </span>
        <input
          ref={inputRef}
          className="specimen-label specimen-rename-input"
          data-rename-input
          value={draft}
          aria-label={`Relabel ${node.name}`}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancelledRef.current = true
              onCancelRename()
            }
          }}
          onBlur={() => {
            if (cancelledRef.current) return
            commit() // desktop convention: leaving the field keeps the label
          }}
        />
      </div>
    )
  }

  // -- pinned specimen state --------------------------------------------------
  const handleClick = (event: MouseEvent) => {
    event.stopPropagation() // ground-click clears selection; this click selects
    onSelect(node.id)
  }

  const handleDoubleClick = () => {
    if (drag.consumeDragged()) return // a released drag is never an open
    onOpen(node)
  }

  const openMenuAtPointer = (event: MouseEvent) => {
    event.preventDefault() // no native chrome menu over the console
    event.stopPropagation() // never also opens the ground menu
    onSelect(node.id) // right-click engages the specimen, as a click would
    onMenu(node, { kind: 'point', x: event.clientX, y: event.clientY })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      // The keyboard floor (DD-1 does the full map): Enter opens, like a
      // double-click. Space stays a plain click (native button behavior).
      event.preventDefault()
      onOpen(node)
      return
    }
    // Keyboard context menu (UI-5 floor): Menu key or Shift+F10 opens the
    // specimen menu AT THE ICON (element anchor — there is no pointer).
    if (event.key === 'ContextMenu' || event.key === 'Menu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault()
      if (buttonRef.current) onMenu(node, { kind: 'element', element: buttonRef.current })
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
      aria-haspopup="menu"
      title={node.name} // long labels clamp; the hover carries the full name
      tabIndex={tabbable ? 0 : -1}
      style={style}
      ref={buttonRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={openMenuAtPointer}
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
