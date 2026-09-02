/**
 * Notepad surface (AP-2) — the SPECIMEN-LABEL EDITOR, mounted lazy in its own
 * chunk. One window PER SPECIMEN: the registry's file-instance dedupe
 * (`instanceId = file:<nodeId>`) makes `openApp('notepad', …)` focus an
 * already-open specimen instead of duplicating it — this component never
 * manages that itself (docs/APP-CONTRACT.md instance rules). A launcher open
 * (no file) is an UNTITLED draft: no node exists until the first save, which
 * OFFERS THE NAME (the inline label-edit) and accessions the specimen into
 * the hold in the same commit.
 *
 * Anatomy — the design brief's console/archive duality, writing side:
 *
 *   ┌ toolbar (dark console chrome) ──────────────────────────────┐
 *   │ SPECIMEN NAME ⟲relabel     [SPC-0000]  ●lamp  [ SAVE ]      │
 *   └──────────────────────────────────────────────────────────────┘
 *   ┌ content (parchment — THE reading/writing surface) ───────────┐
 *   │  a Lora-typeset ledger sheet: ink-dark text on ruled parchment│
 *   │  … or SPECIMEN REMOVED FROM CATALOG (close-only) …            │
 *   │  … or the unsaved-changes strip (Keep editing / Discard) …    │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * - THE PARCHMENT SURFACE is the brief's duality centerpiece: a reading/
 *   writing area on the archive's light side — Lora (never mono), generous
 *   leading, ruled ledger baselines that scroll with the text. Not a terminal.
 * - Autosave is DEBOUNCED (notepad-model's delay): content edits commit
 *   through the FS store's single atomic seam exactly like every other op,
 *   so MF-2 persistence picks them up with zero special wiring. The lamp
 *   stays lit until that commit lands, then dims.
 * - The dirty lamp: a small recessed lamp — lit = unsaved changes. Starting a
 *   close with changes pending makes it FLARE and interposes an in-window
 *   confirm strip ("Catalog unsaved changes? Keep editing / Discard") — no
 *   browser dialogs, ever. While the guard is open the autosave is suspended:
 *   the console asked; the archive waits. (The platform title-bar close is a
 *   WM-seam with no veto hook — documented follow-up; this surface owns the
 *   Esc-initiated close path per the AP-2 keyboard floor.)
 * - Renaming rides the same inline label-edit the desktop/explorer use:
 *   Enter commits (FSError collisions shake in-world and keep editing),
 *   Escape cancels, blur commits. On an UNTITLED draft the same edit IS the
 *   save flow: Enter accessions the specimen (name + body, one commit).
 * - External deletion (delete from the desktop/explorer while open): the
 *   live-store lookup goes null and the window swaps to an in-world
 *   "SPECIMEN REMOVED FROM CATALOG" notice with a close-only action.
 * - Keyboard floor: the textarea is naturally focusable; window-level
 *   Ctrl/Cmd+S saves (preventDefault — the browser's save dialog never
 *   shows), Escape starts a close (the guard applies when dirty).
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createNode, FSError, renameNode } from '../../lib/fs'
import { useFSStore, useWMStore } from '../../platform/stores'
import type { AppSurfaceProps } from '../../platform/app-registry'
import {
  NOTEPAD_AUTOSAVE_DELAY_MS,
  UNFILED_ACCESSION,
  UNTITLED_LABEL,
  specimenId,
  textSpecimen,
  withTextContent,
} from './notepad-model'
import { NotepadIcon } from './NotepadIcon'
import './notepad.css'

/** How long a rejected relabel shakes (CSS: 320ms animation, explorer's law). */
const RENAME_REJECT_ATTR_MS = 400

/** Focus + select the whole label, scrolled to its start (long labels). */
function focusAndSelectFromStart(input: HTMLInputElement | null): void {
  if (!input) return
  input.focus()
  input.select()
  input.scrollLeft = 0
}

export default function NotepadSurface({ windowId, launch }: AppSurfaceProps) {
  const fs = useFSStore((s) => s.fs)

  /* ------------------------------ binding -------------------------------- */

  const launchFileId = specimenId(launch)
  /** The specimen this window CREATED (an untitled draft's first save). */
  const [createdId, setCreatedId] = useState<string | null>(null)
  /** The draft body. Seeded once, from the bound specimen at mount. */
  const [draft, setDraft] = useState<string>(
    () => textSpecimen(fs, specimenId(launch))?.content ?? '',
  )

  const boundId = launchFileId ?? createdId
  const specimen = textSpecimen(fs, boundId)
  const savedContent = specimen?.content ?? ''
  const dirty = draft !== savedContent

  /* --------------------------- editor chrome ------------------------------ */

  /** Inline relabel (the header's engraved name becomes a field). */
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameRejected, setNameRejected] = useState(false)
  /** The unsaved-changes close guard (the confirm strip). */
  const [guardOpen, setGuardOpen] = useState(false)

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const keepButtonRef = useRef<HTMLButtonElement | null>(null)
  // Escape already ended the edit by the time the input unmounts; the
  // blur-commit path must not fire for a cancel (explorer's pattern).
  const nameCancelledRef = useRef(false)

  const displayName = specimen?.name ?? UNTITLED_LABEL
  const untitled = boundId === null

  const closeWindow = (): void => {
    useWMStore.getState().closeWindow(windowId)
  }

  /* ------------------------------ commits --------------------------------- */

  /** Commit the draft body into the bound specimen (the FS store seam). */
  const commitContent = (): void => {
    if (boundId === null) return // an untitled draft has no specimen yet
    const { fs: current, commit } = useFSStore.getState()
    const next = withTextContent(current, boundId, draft)
    if (next) commit(next) // null = deleted mid-debounce; the notice owns it
  }

  /**
   * Commit the label edit. On a BOUND specimen: a relabel (content rides
   * along untouched — renameNode spreads the node). On an UNTITLED draft:
   * this IS the save — the specimen is accessioned into the hold with the
   * offered name and the whole draft body, one commit. False = FSError
   * (empty/collision) — the field shakes and keeps editing.
   */
  const commitName = (): boolean => {
    const name = nameDraft.trim()
    const { fs: current, commit } = useFSStore.getState()
    try {
      if (boundId === null) {
        if (name.length === 0) throw new FSError('invalid-name', 'a catalog label may not be empty')
        const id = crypto.randomUUID()
        commit(
          createNode(current, { id, parentId: current.rootId, name, kind: 'text', content: draft }),
        )
        setCreatedId(id) // bind the window to the specimen it just accessioned
      } else {
        commit(renameNode(current, boundId, name))
      }
      setEditingName(false)
      return true
    } catch (error) {
      if (!(error instanceof FSError)) throw error
      return false // in-world refusal: shake, keep editing
    }
  }

  /** Save (button / Ctrl+S). A bound specimen commits now; an untitled draft
   *  gets its NAME offered first — the accession happens on that commit. A
   *  label edit already in flight IS the save (Enter/blur commits it); the
   *  input keeps its focus and its keys. */
  const save = (): void => {
    if (editingName) return
    if (boundId === null) {
      startNameEdit() // "offer name on save": the label edit is the save
      return
    }
    commitContent()
  }

  /* --------------------------- autosave (debounced) ------------------------ */

  // Trailing debounce on the DRAFT: each keystroke re-arms, the commit lands
  // NOTEPAD_AUTOSAVE_DELAY_MS after the LAST edit, and the lamp (dirty)
  // dims the moment the store carries the content. Suspended while the close
  // guard is open (the operator is deciding) and for untitled drafts (nothing
  // to commit into — the draft is guarded by the close strip instead).
  useEffect(() => {
    if (boundId === null || !dirty || guardOpen) return
    const timer = window.setTimeout(() => {
      const { fs: current, commit } = useFSStore.getState()
      const next = withTextContent(current, boundId, draft)
      if (next) commit(next) // null = deleted mid-debounce; the notice owns it
    }, NOTEPAD_AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draft, dirty, boundId, guardOpen])

  // The guard closes itself the moment the draft is no longer dirty (an
  // explicit Ctrl+S while it is open resolves the question).
  useEffect(() => {
    if (guardOpen && !dirty) setGuardOpen(false)
  }, [guardOpen, dirty])

  /* ------------------------------ close guard ------------------------------ */

  const requestClose = (): void => {
    if (dirty) {
      setGuardOpen(true) // the lamp flares with the strip (CSS: data-flare)
      return
    }
    closeWindow()
  }

  /* ------------------------------ name edit -------------------------------- */

  const startNameEdit = (): void => {
    setNameDraft(displayName)
    setNameRejected(false)
    nameCancelledRef.current = false
    setEditingName(true)
  }

  // Entering the edit selects the whole label (the field mounts focused).
  useEffect(() => {
    if (editingName) focusAndSelectFromStart(nameInputRef.current)
  }, [editingName])

  const rejectNameEdit = (): void => {
    setNameRejected(true)
    window.setTimeout(() => setNameRejected(false), RENAME_REJECT_ATTR_MS)
    focusAndSelectFromStart(nameInputRef.current)
  }

  /* --------------------------- guard strip focus ---------------------------- */

  // The strip takes focus when it interposes (Keep editing = the safe
  // default); leaving it returns focus to the sheet.
  useEffect(() => {
    if (guardOpen) keepButtonRef.current?.focus()
    else if (!editingName) textareaRef.current?.focus()
  }, [guardOpen, editingName])

  /* ------------------------------ keyboard floor ---------------------------- */

  const handleKeyDown = (event: ReactKeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
      event.preventDefault() // never the browser's save dialog
      save()
      return
    }
    if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      // Modifier Escapes are the OS's (Alt+Esc walks windows — DD-1), not the
      // guard's. A plain Escape the notepad FULLY owns: the guard (or a clean
      // close) runs here and the WM's Esc-close never also fires — app guard
      // precedence over the OS chord.
      event.preventDefault()
      event.stopPropagation()
      if (guardOpen) {
        setGuardOpen(false) // the strip's own Escape keeps editing (safe default)
        return
      }
      requestClose() // dirty → the guard interposes; clean → close now
    }
  }

  /* ------------------------------ render ----------------------------------- */

  return (
    <div className="notepad" data-notepad-surface onKeyDown={handleKeyDown}>
      <header className="notepad-toolbar">
        {editingName ? (
          <input
            ref={nameInputRef}
            className="notepad-name-field"
            data-rename-input
            data-rename-rejected={nameRejected || undefined}
            value={nameDraft}
            aria-label={untitled ? 'Name this specimen' : `Relabel ${displayName}`}
            spellCheck={false}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation() // the surface never sees the field's keys
              if (event.key === 'Enter') {
                event.preventDefault()
                if (!commitName()) rejectNameEdit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                nameCancelledRef.current = true
                setEditingName(false)
                textareaRef.current?.focus()
              }
            }}
            onBlur={() => {
              if (nameCancelledRef.current) return
              if (!commitName()) rejectNameEdit() // desktop convention: blur keeps the label
            }}
          />
        ) : (
          <button
            type="button"
            className="notepad-name"
            data-notepad-name
            title={untitled ? 'Name this specimen' : 'Relabel specimen'}
            onClick={startNameEdit}
          >
            {displayName}
          </button>
        )}
        {/* The accession readout — digits ride B612 in a recessed well. */}
        <span className="notepad-accession well">{specimen?.accession ?? UNFILED_ACCESSION}</span>
        {/* The dirty lamp: lit = unsaved changes; flares under the close guard. */}
        <span
          className="notepad-lamp"
          data-lit={dirty}
          data-flare={guardOpen && dirty}
          aria-hidden="true"
        />
        <button
          type="button"
          className="notepad-save"
          data-notepad-save
          disabled={!dirty && !untitled}
          title={untitled ? 'Save — name and accession this specimen' : 'Save specimen'}
          onClick={save}
        >
          Save
        </button>
      </header>

      <div className="notepad-content parchment-surface" data-notepad-content>
        {boundId !== null && specimen === null ? (
          <RemovedNotice onClose={closeWindow} />
        ) : (
          <>
            <div className="notepad-sheetwrap">
              <textarea
                ref={textareaRef}
                className="notepad-sheet"
                data-notepad-textarea
                value={draft}
                aria-label={`Specimen body — ${displayName}`}
                placeholder="Record the specimen…"
                spellCheck={false}
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
            {guardOpen && (
              <div
                className="notepad-strip"
                data-notepad-strip
                role="alertdialog"
                aria-labelledby="notepad-strip-title"
                aria-describedby="notepad-strip-body"
              >
                <p className="notepad-strip-title" id="notepad-strip-title">
                  Catalog unsaved changes?
                </p>
                <p className="notepad-strip-body" id="notepad-strip-body">
                  This specimen has entries not yet committed to the archive.
                </p>
                <div className="notepad-strip-actions">
                  <button
                    ref={keepButtonRef}
                    type="button"
                    className="notepad-strip-keep"
                    data-notepad-keep
                    onClick={() => setGuardOpen(false)}
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    className="notepad-strip-discard"
                    data-notepad-discard
                    onClick={closeWindow}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {/* Lamp state for assistive tech (the lamp itself is decorative). */}
      <span className="notepad-sr" role="status">
        {dirty ? 'Unsaved changes' : 'Saved to the archive'}
      </span>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * The decommissioned-specimen notice: the fs node was deleted elsewhere
 * (desktop/explorer) while this window held it. Close is the only action —
 * the draft dies with the specimen; the archive already decided.
 * ------------------------------------------------------------------------ */

function RemovedNotice({ onClose }: { readonly onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // The notice is terminal: focus lands on its single action.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div className="notepad-removed" data-notepad-removed role="alert">
      <span className="notepad-removed-glyph" aria-hidden="true">
        <NotepadIcon size={30} />
      </span>
      <p className="notepad-removed-title">Specimen removed from catalog</p>
      <p className="notepad-removed-hint">
        The specimen was decommissioned elsewhere in the archive. This module can only close.
      </p>
      <button
        ref={closeRef}
        type="button"
        className="notepad-removed-close"
        data-notepad-removed-close
        onClick={onClose}
      >
        Close module
      </button>
    </div>
  )
}
