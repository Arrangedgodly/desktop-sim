/**
 * Field Notes surface (batch 2, brief 6) — the READING ROOM, mounted lazy in
 * its own chunk. The notepad writes specimens; this module TYPESETS them: a
 * text specimen's body runs through the hand-written markdown-subset parser
 * (field-notes-markdown.ts) and renders as React elements from the AST — no
 * HTML string and no raw-injection API anywhere; markup-shaped specimen text
 * is escaped BY CONSTRUCTION (it becomes text nodes React prints as ink).
 *
 * Anatomy — the console/archive duality, reading side:
 *
 *   ┌ toolbar (dark console chrome) ─────────────────────────────┐
 *   │ SPECIMEN NAME        [SPC-0000]        [ CATALOG ]          │
 *   └──────────────────────────────────────────────────────────────┘
 *   ┌ content (parchment — THE reading surface, scrolls itself) ──┐
 *   │  a Lora-typeset sheet at a 60ch measure: headings, emphasis,│
 *   │  lists, quotes, rules, external links … or the CATALOG panel │
 *   │  (the painter's picker pattern: engraved ledger, B612        │
 *   │  accessions) … or the empty-state / removed notices …        │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * - THE CATALOG is in-app (the brief's law): an overlay ledger listing every
 *   text specimen by accession + name. It keeps the menu law — arrows walk,
 *  Tab stays inside, Esc closes (the surface's one claim on Esc), Enter opens.
 * - Keyboard floor: Backspace returns from a specimen to the ledger (the
 *   atlas's page law); an unclaimed Esc (catalog closed) closes the window —
 *   the reading room claims nothing else.
 * - External links ride target=_blank rel="noopener noreferrer", the parser
 *   having admitted http(s) URLs only.
 * - External deletion while reading swaps the sheet for an in-world SPECIMEN
 *   REMOVED notice with a return to the ledger.
 * - The ONE authored moment: the sheet settles onto the desk when a specimen
 *   opens (240ms exponential ease-out from a visible default; collapsed to
 *   its end-state under reduced motion by the global kill-switch).
 * - No appState is written: a reader holds nothing worth persisting (the
 *   specimen's content IS the archive's truth — a reload reopens the room,
 *   fresh, by design).
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { playCue } from '../../lib/audio'
import { useFSStore, useWMStore } from '../../platform/stores'
import { getApp, type AppSurfaceProps } from '../../platform/app-registry'
import {
  EMPTY_CATALOG_LINE,
  listTextSpecimens,
  textSpecimen,
  type TextSpecimenRef,
} from './field-notes-model'
import type { MdDocument, MdInline } from './field-notes-markdown'
import { parseDocument } from './field-notes-markdown'
import './field-notes.css'

/** A hand-routed file launch selects its specimen at mount (honored, rare). */
function initialSelection(launch: AppSurfaceProps['launch']): string | null {
  return launch.source === 'file' && launch.file.kind === 'text' ? launch.file.id : null
}

export default function FieldNotesSurface({ windowId, launch }: AppSurfaceProps) {
  const fs = useFSStore((s) => s.fs)
  const specimens = useMemo(() => listTextSpecimens(fs), [fs])

  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelection(launch))
  const [pickerOpen, setPickerOpen] = useState(() => initialSelection(launch) === null)

  const specimen = textSpecimen(fs, selectedId)
  const removed = selectedId !== null && specimen === null
  const document_ = useMemo(() => parseDocument(specimen?.content ?? ''), [specimen?.content])

  /* --------------------------- window title -------------------------------- */

  // The title bar reads the open specimen's LIVE name (renames elsewhere
  // follow in); with nothing open it falls back to the module's own name.
  const moduleTitle = getApp('field-notes')?.name ?? 'Field Notes'
  useEffect(() => {
    useWMStore.getState().setWindowTitle(windowId, specimen?.name ?? moduleTitle)
  }, [windowId, specimen?.name, moduleTitle])

  /* ------------------------------ focus seats ------------------------------- */

  const sheetRef = useRef<HTMLElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // The room's focus law, in one seat: the OPEN ledger seats its first row
  // (unless a row already holds focus); a closed ledger seats the open sheet.
  // With nothing open the desk's own action button self-seats on its mount,
  // and the removed notice seats its return — every state owns a seat.
  useEffect(() => {
    if (!pickerOpen) {
      if (specimen) sheetRef.current?.focus()
      return
    }
    const panel = pickerRef.current
    if (panel?.contains(document.activeElement)) return // a row already seated
    rowRefs.current.get(specimens[0]?.id ?? '')?.focus()
  }, [pickerOpen, specimen, specimens])

  /* ------------------------------- catalog ---------------------------------- */

  const openSpecimen = (node: TextSpecimenRef): void => {
    setSelectedId(node.id)
    setPickerOpen(false)
    playCue('menu-select') // the console's select tick; a no-op while muted
  }

  const backToLedger = (): void => {
    setSelectedId(null)
    setPickerOpen(true)
    playCue('menu-open')
  }

  const toggleCatalog = (): void => {
    setPickerOpen((open) => {
      playCue(open ? 'minimize' : 'menu-open') // the panel withdraws / presents
      return !open
    })
  }

  /* ------------------------------- keyboard --------------------------------- */

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return // OS chords stand
    if (event.key === 'Escape' && pickerOpen) {
      // The reading room's ONE claim on Esc: the open catalog closes and
      // keeps its seat. With the catalog closed an Esc is the OS's (close).
      event.preventDefault()
      event.stopPropagation()
      setPickerOpen(false)
      return
    }
    if (event.key === 'Backspace' && specimen && !pickerOpen) {
      // The atlas's page law: Backspace returns to the ledger.
      event.preventDefault()
      backToLedger()
    }
  }

  /** The catalog keeps the menu law: arrows walk, Tab stays, Home/End jump. */
  const handlePickerKeys = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab') {
      event.preventDefault() // the panel keeps focus within itself (DD-2)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
      return
    }
    event.preventDefault()
    const ids = specimens.map((s) => s.id)
    if (ids.length === 0) return
    const active = document.activeElement as HTMLButtonElement | null
    const index = ids.indexOf(active?.dataset['fieldNotesPick'] ?? '')
    const next =
      event.key === 'ArrowDown'
        ? index === -1 || index === ids.length - 1
          ? 0
          : index + 1
        : event.key === 'ArrowUp'
          ? index <= 0
            ? ids.length - 1
            : index - 1
          : event.key === 'Home'
            ? 0
            : ids.length - 1
    rowRefs.current.get(ids[next]!)?.focus()
  }

  /* -------------------------------- render ---------------------------------- */

  return (
    <div className="field-notes" data-field-notes-surface onKeyDown={handleKeyDown}>
      <div className="field-notes-toolbar">
        <span className="field-notes-label engraved" data-field-notes-label>
          {specimen ? specimen.name : 'Catalog'}
        </span>
        <span className="field-notes-accession well" data-field-notes-accession>
          {specimen?.accession ?? '—'}
        </span>
        <button
          type="button"
          className="field-notes-catalog-btn"
          data-field-notes-catalog
          aria-expanded={pickerOpen}
          onClick={toggleCatalog}
        >
          Catalog
        </button>
      </div>

      <div className="field-notes-content parchment-surface">
        {removed ? (
          <RemovedNotice onBack={backToLedger} />
        ) : specimen ? (
          <article
            key={specimen.id}
            ref={sheetRef}
            className="field-notes-sheet"
            data-field-notes-document
            tabIndex={-1}
            aria-label={`Field note — ${specimen.name}`}
          >
            <BlockNodes blocks={document_} />
          </article>
        ) : !pickerOpen ? (
          <ReadingDesk empty={specimens.length === 0} onOpenCatalog={toggleCatalog} />
        ) : null}

        {pickerOpen && (
          <div
            ref={pickerRef}
            className="field-notes-picker"
            data-field-notes-picker
            onKeyDown={handlePickerKeys}
          >
            <p className="field-notes-picker-head engraved">Catalogued specimens</p>
            {specimens.length === 0 ? (
              <p className="field-notes-picker-empty">{EMPTY_CATALOG_LINE}</p>
            ) : (
              <div className="field-notes-picker-list" role="listbox" aria-label="Text specimens">
                {specimens.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className="field-notes-picker-row"
                    data-field-notes-pick={node.id}
                    role="option"
                    aria-selected={node.id === selectedId}
                    ref={(el) => {
                      if (el) rowRefs.current.set(node.id, el)
                      else rowRefs.current.delete(node.id)
                    }}
                    onClick={() => openSpecimen(node)}
                  >
                    <span className="field-notes-picker-accession">{node.accession}</span>
                    <span className="field-notes-picker-name">{node.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * The typesetter: AST → React elements. The ONLY renderer — the parser
 * produces no HTML, so nothing but React text nodes ever carries specimen
 * ink (raw HTML is escaped by construction).
 * ------------------------------------------------------------------------ */

function InlineNodes({ nodes }: { readonly nodes: readonly MdInline[] }): ReactNode {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'text':
            return <Fragment key={i}>{node.text}</Fragment>
          case 'strong':
            return (
              <strong key={i} className="field-notes-strong">
                <InlineNodes nodes={node.children} />
              </strong>
            )
          case 'em':
            return (
              <em key={i} className="field-notes-em">
                <InlineNodes nodes={node.children} />
              </em>
            )
          case 'code':
            return (
              <code key={i} className="field-notes-code">
                {node.text}
              </code>
            )
          case 'link':
            return (
              <a
                key={i}
                className="field-notes-link"
                href={node.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {node.label}
              </a>
            )
        }
      })}
    </>
  )
}

function BlockNodes({ blocks }: { readonly blocks: MdDocument }): ReactNode {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Tag = (block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3'
            return (
              <Tag key={i} className={`field-notes-heading field-notes-heading--${block.level}`}>
                <InlineNodes nodes={block.inline} />
              </Tag>
            )
          }
          case 'paragraph':
            return (
              <p key={i} className="field-notes-p">
                <InlineNodes nodes={block.inline} />
              </p>
            )
          case 'list':
            return block.ordered ? (
              <ol
                key={i}
                className="field-notes-list field-notes-list--ordered"
                start={block.start !== 1 ? block.start : undefined}
              >
                {block.items.map((item, j) => (
                  <li key={j} className="field-notes-li">
                    <InlineNodes nodes={item.inline} />
                    {item.children.length > 0 && <BlockNodes blocks={item.children} />}
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="field-notes-list">
                {block.items.map((item, j) => (
                  <li key={j} className="field-notes-li">
                    <InlineNodes nodes={item.inline} />
                    {item.children.length > 0 && <BlockNodes blocks={item.children} />}
                  </li>
                ))}
              </ul>
            )
          case 'blockquote':
            return (
              <blockquote key={i} className="field-notes-quote">
                <BlockNodes blocks={block.children} />
              </blockquote>
            )
          case 'hr':
            return <hr key={i} className="field-notes-hr" />
        }
      })}
    </>
  )
}

/* --------------------------------------------------------------------------
 * The reading desk with nothing on it — the honest empty states.
 * ------------------------------------------------------------------------ */

function ReadingDesk({
  empty,
  onOpenCatalog,
}: {
  readonly empty: boolean
  readonly onOpenCatalog: () => void
}) {
  const catalogRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    catalogRef.current?.focus() // the desk's one action is the focus seat
  }, [])

  return (
    <div className="field-notes-desk" data-field-notes-desk>
      <span className="field-notes-desk-glyph" aria-hidden="true">
        {/* an open folio at rest — the module's own mark, drawn inline */}
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 6.2 C10.2 4.9 7.4 4.7 4.8 5.6 V17.6 C7.4 16.7 10.2 16.9 12 18.2 C13.8 16.9 16.6 16.7 19.2 17.6 V5.6 C16.6 4.7 13.8 4.9 12 6.2 Z" />
          <line x1="12" y1="6.2" x2="12" y2="18.2" />
          <line x1="7" y1="9.2" x2="10" y2="9.2" />
          <line x1="7" y1="12.2" x2="10" y2="12.2" />
          <line x1="14" y1="9.2" x2="17" y2="9.2" />
          <line x1="14" y1="12.2" x2="17.2" y2="12.2" />
        </svg>
      </span>
      <p className="field-notes-desk-line">
        {empty ? EMPTY_CATALOG_LINE : 'Choose a specimen from the catalog to read.'}
      </p>
      <button
        ref={catalogRef}
        type="button"
        className="field-notes-desk-open"
        data-field-notes-desk-open
        onClick={onOpenCatalog}
      >
        Open catalog
      </button>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * The decommissioned-specimen notice: the node was deleted elsewhere while
 * this room held it open. Return to the ledger is the only action.
 * ------------------------------------------------------------------------ */

function RemovedNotice({ onBack }: { readonly onBack: () => void }) {
  const backRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    backRef.current?.focus()
  }, [])

  return (
    <div className="field-notes-removed" data-field-notes-removed role="alert">
      <p className="field-notes-removed-title">Specimen removed from catalog</p>
      <p className="field-notes-removed-hint">
        The specimen was decommissioned elsewhere in the archive. The reading room holds no copy.
      </p>
      <button
        ref={backRef}
        type="button"
        className="field-notes-removed-back"
        data-field-notes-removed-back
        onClick={onBack}
      >
        Back to catalog
      </button>
    </div>
  )
}
