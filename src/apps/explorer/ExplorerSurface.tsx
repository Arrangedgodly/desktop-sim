/**
 * Explorer surface (AP-1) — the DRAWER-MODULE window, mounted lazy in its own
 * chunk. One window PER DRAWER: the registry's file-instance dedupe
 * (`instanceId = file:<folderId>`) is what makes `openApp('explorer', …)`
 * focus an already-open drawer instead of duplicating it — this component
 * never manages that itself (docs/APP-CONTRACT.md instance rules).
 *
 * Anatomy — the design brief's console/archive duality in one module:
 *
 *   ┌ toolbar (dark console chrome) ──────────────────────────────┐
 *   │ ‹ ˄  Hold / Projects / …        [ARC-0000]  ▦ ≡ (grid|ledger)│
 *   └──────────────────────────────────────────────────────────────┘
 *   ┌ content (parchment catalog surface) ─────────────────────────┐
 *   │  specimen cards (grid)  ·  ledger rows (list)  ·  empty state│
 *   └──────────────────────────────────────────────────────────────┘
 *
 * - Breadcrumb: every crumb root→current is navigable; the accession readout
 *   rides B612 in a recessed well (digits always ride the mono face).
 * - Children list in CATALOG (accession) order — `listChildren`'s law.
 * - Open routing from inside a drawer: drawers navigate INSIDE this window;
 *   specimens/plates open their OWNING app (acceptedFileTypes consultation,
 *   explorer-model.ts); module references open their own appId. Unregistered
 *   targets soft-fail inside `openApp` (warn + no window, never a throw).
 * - Context menus ride the platform shell (`useConsoleMenu` + openMenu):
 *   drawer menu = New Drawer / New Specimen scoped to the VIEWED drawer
 *   (explorer-menus.ts, composed from the platform's catalog ops); specimen
 *   rows = the platform's `buildSpecimenMenuItems` VERBATIM (Rename inline,
 *   two-step oxide Delete) — no forked menu code anywhere in this app.
 * - Keyboard floor (DD-1 owns the full map): the content is a listbox with
 *   roving tabindex — arrows/Home/End move selection (and focus), Enter
 *   opens, Menu key / Shift+F10 opens the specimen menu at the row.
 * - One authored motion: navigating a drawer pulls the new listing in
 *   (transform+opacity, console ease; the global reduced-motion kill-switch
 *   collapses it to the visible end-state).
 */

import { useEffect, useReducer, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { FSError, isFolderNode, listChildren, renameNode } from '../../lib/fs'
import { KIND_GLYPHS, KIND_WORDS } from '../../platform/desktop'
import { buildSpecimenMenuItems, useConsoleMenu } from '../../platform/menus'
import type { MenuAnchor } from '../../platform/menus'
import {
  listApps,
  openApp,
  type AppSurfaceProps,
  type FSNodeRef,
} from '../../platform/app-registry'
import { useFSStore } from '../../platform/stores'
import {
  childOpenTarget,
  drawerCrumbs,
  formatLabelStamp,
  initialDrawerId,
  resolveDrawer,
  sessionView,
  setSessionView,
  type ExplorerView,
} from './explorer-model'
import { buildDrawerMenuItems } from './explorer-menus'
import { ExplorerIcon } from './ExplorerIcon'
import './explorer.css'

/* --------------------------------------------------------------------------
 * Navigation history (back affordance; no forward stack — opening a drawer
 * from anywhere pushes, crumbs jump by pushing, back pops the pointer)
 * ------------------------------------------------------------------------ */

interface NavState {
  readonly entries: readonly string[]
  readonly cursor: number
}

type NavAction = { readonly type: 'push'; readonly id: string } | { readonly type: 'back' }

function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'push': {
      if (action.id === state.entries[state.cursor]) return state
      return { entries: [...state.entries.slice(0, state.cursor + 1), action.id], cursor: state.cursor + 1 }
    }
    case 'back':
      return state.cursor === 0 ? state : { ...state, cursor: state.cursor - 1 }
  }
}

/** How long a rejected relabel shakes (CSS: 320ms animation). */
const RENAME_REJECT_ATTR_MS = 400

/** Focus + select the whole label, scrolled to its start (long labels). */
function focusAndSelectFromStart(input: HTMLInputElement | null): void {
  if (!input) return
  input.focus()
  input.select()
  input.scrollLeft = 0
}

export default function ExplorerSurface({ launch }: AppSurfaceProps) {
  const fs = useFSStore((s) => s.fs)
  const { openMenu } = useConsoleMenu()
  const [nav, dispatchNav] = useReducer(navReducer, launch, (ctx) => ({
    entries: [initialDrawerId(ctx, fs)],
    cursor: 0,
  }))
  const [view, setView] = useState<ExplorerView>(() => sessionView())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Inline rename (the specimen menu's Rename command) on one child. */
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const listboxRef = useRef<HTMLDivElement>(null)

  const folderId = resolveDrawer(fs, nav.entries[nav.cursor]!)
  const folderNode = fs.nodes[folderId]
  if (!folderNode || folderNode.kind !== 'folder') {
    // resolveDrawer guarantees the root fallback; this is a type-level bail.
    return null
  }
  const children = listChildren(fs, folderId)
  const crumbs = drawerCrumbs(fs, folderId)
  const tabbableId =
    selectedId !== null && children.some((node) => node.id === selectedId)
      ? selectedId
      : (children[0]?.id ?? null)

  /* ------------------------------ navigation ------------------------------ */

  const navigate = (targetId: string): void => {
    if (targetId === folderId) return
    setSelectedId(null)
    setRenamingId(null)
    dispatchNav({ type: 'push', id: targetId })
  }

  const goBack = (): void => {
    if (nav.cursor === 0) return
    setSelectedId(null)
    setRenamingId(null)
    dispatchNav({ type: 'back' })
  }

  const goUp = (): void => {
    if (folderNode.parentId !== null) navigate(folderNode.parentId)
  }

  /* ------------------------------ open routing ---------------------------- */

  const openChild = (node: FSNodeRef): void => {
    if (isFolderNode(node)) {
      navigate(node.id) // folders recurse INSIDE this window
      return
    }
    const target = childOpenTarget(node, listApps())
    if (target) openApp(target, { source: 'file', file: node }) // soft-fail aware
  }

  /* ------------------------------ context menus --------------------------- */

  // The drawer's own menu (right-click the parchment anywhere in this module).
  const openGroundMenu = (event: ReactMouseEvent): void => {
    event.preventDefault() // the console replaces the native menu
    openMenu(
      buildDrawerMenuItems(folderId),
      { kind: 'point', x: event.clientX, y: event.clientY },
      { ariaLabel: `${folderNode.name} menu` },
    )
  }

  // Specimen rows: the PLATFORM builder, verbatim (no forked menu code).
  const openItemMenu = (node: FSNodeRef, anchor: MenuAnchor): void => {
    setSelectedId(node.id)
    setRenamingId(null)
    openMenu(
      buildSpecimenMenuItems(node, {
        rename: () => {
          setSelectedId(node.id)
          setRenamingId(node.id)
        },
      }),
      anchor,
      { ariaLabel: `Specimen menu — ${node.name}` },
    )
  }

  /** Commit an inline relabel; false = FSError (the row shakes, keeps editing). */
  const commitRename = (id: string, name: string): boolean => {
    try {
      const { fs: current, commit } = useFSStore.getState()
      commit(renameNode(current, id, name))
      setRenamingId(null)
      return true
    } catch (error) {
      if (!(error instanceof FSError)) throw error
      return false // name-collision / invalid-name: in-world refusal
    }
  }

  /* ------------------------------ keyboard floor -------------------------- */

  const handleListKeyDown = (event: ReactKeyboardEvent): void => {
    // A rename input keeps its own arrow keys (editing beats navigation).
    if (event.target instanceof HTMLInputElement) return
    if (children.length === 0) return
    // Anchor on the FOCUSED option (selection follows focus in a listbox);
    // fall back to the selected option when focus sits outside the options.
    const focusedId = document.activeElement?.getAttribute('data-explorer-option')
    const anchorId = focusedId ?? selectedId
    const currentIndex = children.findIndex((node) => node.id === anchorId)
    let nextIndex: number
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % children.length
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        nextIndex =
          currentIndex < 0 ? children.length - 1 : (currentIndex - 1 + children.length) % children.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = children.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const next = children[nextIndex]!
    setSelectedId(next.id)
    const option = listboxRef.current?.querySelector<HTMLButtonElement>(
      `[data-explorer-option="${next.id}"]`,
    )
    option?.focus()
  }

  const switchView = (next: ExplorerView): void => {
    setView(next)
    setSessionView(next) // per-session memory: new drawers inherit it
  }

  /* ------------------------------ render ---------------------------------- */

  const listboxProps = {
    role: 'listbox' as const,
    'aria-label': `${folderNode.name} — drawer contents`,
    tabIndex: -1,
    onKeyDown: handleListKeyDown,
    ref: listboxRef,
  }

  return (
    <div className="explorer" data-explorer-surface onContextMenu={openGroundMenu}>
      <header className="explorer-toolbar">
        <button
          type="button"
          className="explorer-tool"
          data-explorer-back
          aria-label="Back — previous drawer"
          title="Back — previous drawer"
          disabled={nav.cursor === 0}
          onClick={goBack}
        >
          <ChevronLeftGlyph />
        </button>
        <button
          type="button"
          className="explorer-tool"
          data-explorer-up
          aria-label="Up one drawer"
          title="Up one drawer"
          disabled={folderNode.parentId === null}
          onClick={goUp}
        >
          <ChevronUpGlyph />
        </button>
        <nav className="explorer-crumbs" aria-label="Drawer path">
          {crumbs.map((crumb, index) => (
            <span className="explorer-crumb-slot" key={crumb.id}>
              {index > 0 && (
                <span className="explorer-crumb-sep" aria-hidden="true">
                  /
                </span>
              )}
              <button
                type="button"
                className="explorer-crumb"
                data-explorer-crumb={crumb.id}
                aria-current={index === crumbs.length - 1 ? 'location' : undefined}
                onClick={() => navigate(crumb.id)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        {/* The accession readout — digits ride B612 inside a recessed well. */}
        <span className="explorer-accession well">{folderNode.accession}</span>
        <div className="explorer-view" role="group" aria-label="View density">
          <button
            type="button"
            className="explorer-view-btn"
            data-explorer-view="grid"
            aria-label="Specimen cards"
            aria-pressed={view === 'grid'}
            onClick={() => switchView('grid')}
          >
            <CardsGlyph />
          </button>
          <button
            type="button"
            className="explorer-view-btn"
            data-explorer-view="list"
            aria-label="Ledger rows"
            aria-pressed={view === 'list'}
            onClick={() => switchView('list')}
          >
            <LedgerGlyph />
          </button>
        </div>
      </header>

      <div
        className="explorer-content parchment-surface"
        data-explorer-content
        onClick={(event) => {
          // Clicking the bare parchment (not a specimen) sets selection down.
          if ((event.target as Element).closest('[data-explorer-option]')) return
          setSelectedId(null)
        }}
      >
        {children.length === 0 ? (
          <div className="explorer-empty" data-explorer-empty>
            <span className="explorer-empty-glyph" aria-hidden="true">
              <ExplorerIcon size={30} />
            </span>
            <p className="explorer-empty-title">No specimens catalogued</p>
            <p className="explorer-empty-hint">
              Right-click to accession a drawer or specimen into this one.
            </p>
          </div>
        ) : view === 'grid' ? (
          <div {...listboxProps} className="explorer-grid explorer-pull" data-explorer-listbox>
            {children.map((node) => (
              <CatalogOption
                key={node.id}
                node={node}
                view="grid"
                selected={selectedId === node.id}
                tabbable={tabbableId === node.id}
                editing={renamingId === node.id}
                onSelect={setSelectedId}
                onOpen={openChild}
                onMenu={openItemMenu}
                onCommitRename={commitRename}
                onCancelRename={() => setRenamingId(null)}
              />
            ))}
          </div>
        ) : (
          <div className="explorer-ledger">
            <div className="explorer-ledger-head" aria-hidden="true">
              <span>Accession</span>
              <span>Name</span>
              <span>Kind</span>
              <span>Labelled</span>
            </div>
            <div {...listboxProps} className="explorer-list explorer-pull" data-explorer-listbox>
              {children.map((node) => (
                <CatalogOption
                  key={node.id}
                  node={node}
                  view="list"
                  selected={selectedId === node.id}
                  tabbable={tabbableId === node.id}
                  editing={renamingId === node.id}
                  onSelect={setSelectedId}
                  onOpen={openChild}
                  onMenu={openItemMenu}
                  onCommitRename={commitRename}
                  onCancelRename={() => setRenamingId(null)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * One catalogued child — a specimen card (grid) or a ledger row (list).
 * A real <button> wearing role="option": click selects, double-click and
 * Enter open, right-click / Menu key opens the platform specimen menu, and
 * the inline-rename state swaps the button for a label-edit field (the same
 * pattern as the desktop's SpecimenIcon — Enter commits, Escape cancels,
 * blur commits, an FSError refusal shakes in-world and keeps editing).
 * ------------------------------------------------------------------------ */

interface CatalogOptionProps {
  readonly node: FSNodeRef
  readonly view: ExplorerView
  readonly selected: boolean
  readonly tabbable: boolean
  readonly editing: boolean
  readonly onSelect: (id: string) => void
  readonly onOpen: (node: FSNodeRef) => void
  readonly onMenu: (node: FSNodeRef, anchor: MenuAnchor) => void
  readonly onCommitRename: (id: string, name: string) => boolean
  readonly onCancelRename: () => void
}

function CatalogOption({
  node,
  view,
  selected,
  tabbable,
  editing,
  onSelect,
  onOpen,
  onMenu,
  onCommitRename,
  onCancelRename,
}: CatalogOptionProps) {
  const Glyph = KIND_GLYPHS[node.kind]
  const kindWord = KIND_WORDS[node.kind]
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [draft, setDraft] = useState(node.name)
  const [rejected, setRejected] = useState(false)
  // Escape already ended the edit by the time the input unmounts; the
  // blur-commit path must not fire for a cancel.
  const cancelledRef = useRef(false)

  // Entering the edit seeds the field and selects the whole label.
  useEffect(() => {
    if (editing) {
      setDraft(node.name)
      cancelledRef.current = false
      focusAndSelectFromStart(inputRef.current)
    }
  }, [editing, node.name])

  // Leaving the edit (commit or cancel) returns focus to the option button.
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

  const commit = (): void => {
    if (!onCommitRename(node.id, draft.trim())) rejectEdit() // FSError: shake + keep editing
  }

  const optionClass = view === 'grid' ? 'explorer-card' : 'explorer-row'

  /* -- inline rename state -------------------------------------------------- */
  if (editing) {
    return (
      <div
        className={`${optionClass} explorer-editing`}
        data-explorer-option={node.id}
        data-kind={node.kind}
        data-editing="true"
        data-selected={selected}
        data-rename-rejected={rejected || undefined}
      >
        {view === 'grid' && (
          <span className="explorer-card-glyph" aria-hidden="true">
            <Glyph size={30} />
          </span>
        )}
        {view === 'list' && <span className="explorer-row-accession">{node.accession}</span>}
        <input
          ref={inputRef}
          className="explorer-rename-input"
          data-rename-input
          value={draft}
          aria-label={`Relabel ${node.name}`}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation() // the listbox never sees the field's keys
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              cancelledRef.current = true
              onCancelRename()
            }
          }}
          onBlur={() => {
            if (cancelledRef.current) return
            commit() // desktop convention: leaving the field keeps the label
          }}
        />
        {view === 'list' && <span className="explorer-row-kind">{kindWord}</span>}
      </div>
    )
  }

  /* -- listing state -------------------------------------------------------- */
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={optionClass}
      data-explorer-option={node.id}
      data-kind={node.kind}
      data-selected={selected}
      aria-label={`${node.name}, ${node.accession}, ${kindWord}`}
      title={node.name}
      tabIndex={tabbable ? 0 : -1}
      ref={buttonRef}
      onClick={(event) => {
        event.stopPropagation() // the bare-parchment click clears selection
        onSelect(node.id)
      }}
      onDoubleClick={() => onOpen(node)}
      onContextMenu={(event) => {
        event.preventDefault() // no native chrome menu over the console
        event.stopPropagation() // never also opens the drawer menu
        onSelect(node.id) // right-click engages the specimen, as a click would
        onMenu(node, { kind: 'point', x: event.clientX, y: event.clientY })
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          // Enter opens, like a double-click (Space stays a plain click).
          event.preventDefault()
          onOpen(node)
          return
        }
        // Keyboard context menu (UI-5 floor) at the row (element anchor).
        if (
          event.key === 'ContextMenu' ||
          event.key === 'Menu' ||
          (event.key === 'F10' && event.shiftKey)
        ) {
          event.preventDefault()
          if (buttonRef.current) onMenu(node, { kind: 'element', element: buttonRef.current })
        }
      }}
    >
      {view === 'grid' ? (
        <>
          <span className="explorer-card-glyph" aria-hidden="true">
            <Glyph size={30} />
          </span>
          <span className="explorer-card-label">
            <span className="explorer-card-name">{node.name}</span>
            <span className="explorer-card-accession">{node.accession}</span>
          </span>
        </>
      ) : (
        <>
          <span className="explorer-row-accession">{node.accession}</span>
          <span className="explorer-row-name">{node.name}</span>
          <span className="explorer-row-kind">{kindWord}</span>
          <span className="explorer-row-stamp">{formatLabelStamp(node.accessionedAt)}</span>
        </>
      )}
    </button>
  )
}

/* --------------------------------------------------------------------------
 * Toolbar chrome glyphs — same drawing discipline as the kind glyphs
 * (1.5px stroke, currentColor, 24 grid). Drawn, never unicode stand-ins.
 * ------------------------------------------------------------------------ */

const TOOL_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function ToolSvg({ children }: { readonly children: React.ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  )
}

function ChevronLeftGlyph() {
  return (
    <ToolSvg>
      <path {...TOOL_STROKE} d="M14.5 5.5 L8.5 12 L14.5 18.5" />
    </ToolSvg>
  )
}

function ChevronUpGlyph() {
  return (
    <ToolSvg>
      <path {...TOOL_STROKE} d="M5.5 14.5 L12 8.5 L18.5 14.5" />
    </ToolSvg>
  )
}

function CardsGlyph() {
  return (
    <ToolSvg>
      <g {...TOOL_STROKE}>
        <rect x="4.5" y="4.5" width="6.5" height="6.5" />
        <rect x="13" y="4.5" width="6.5" height="6.5" />
        <rect x="4.5" y="13" width="6.5" height="6.5" />
        <rect x="13" y="13" width="6.5" height="6.5" />
      </g>
    </ToolSvg>
  )
}

function LedgerGlyph() {
  return (
    <ToolSvg>
      <g {...TOOL_STROKE}>
        <line x1="5" y1="6.5" x2="19" y2="6.5" />
        <line x1="5" y1="12" x2="19" y2="12" />
        <line x1="5" y1="17.5" x2="19" y2="17.5" />
      </g>
    </ToolSvg>
  )
}
