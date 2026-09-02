/**
 * MenuShell (UI-5) — the ONE popup menu component. Portal-rendered at the
 * pointer (or at an invoker element for keyboard opens), recessed console
 * chrome with engraved rows.
 *
 * A11y floor (this lane's hotspot; DD-1 does the surrounding map):
 * - `role="menu"` + accessible name; rows are real buttons wearing
 *   `role="menuitem"` / `"menuitemradio"` (`aria-checked`), grooves are
 *   `role="separator"`. Separators and disabled rows are never focusable.
 * - Keyboard: ArrowDown/ArrowUp rove with wrap, Home/End jump, Enter/Space
 *   activate natively, Escape closes (a guarded step steps back first), and
 *   Tab/Shift+Tab walk the rows too (DD-1's map: a menu keeps focus within
 *   itself; Escape is the close key — same law as the taskbar drawer).
 * - Focus opens ON the first enabled row, never leaves while open (arrows
 *   wrap, Tab closes), and returns to the invoker via the provider's close
 *   path (Escape/Tab, and selection when the command kept focus inside the
 *   menu). Outside pointerdown closes without forcing focus back — the
 *   operator's click lands where they aimed.
 * - Edge flip (menu-position.ts): a menu never opens off-screen, so focus
 *   inside it is always visible.
 *
 * Two-step confirm: an action carrying `confirm` swaps the SAME menu to a
 * guarded step (prompt + cancel/commit rows) instead of running the
 * command — no dialog system; the commit row wears the oxide surface.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import type { MenuAction, MenuAnchor, MenuItem } from './menu-items'
import { emitMenuEvent } from './menu-events'
import { computeMenuPlacement, MENU_VIEWPORT_MARGIN } from './menu-position'
import './menus.css'

/** What the provider tracks for one open menu. */
export interface MenuSession {
  readonly items: readonly MenuItem[]
  readonly anchor: MenuAnchor
  readonly ariaLabel: string
  /** Element focused when the menu opened (the provider's focus-return target). */
  readonly invoker: HTMLElement | null
}

export interface MenuShellProps {
  readonly session: MenuSession
  /** Close request; `restoreFocus` per the header's focus law. */
  readonly onClose: (restoreFocus: boolean) => void
}

/* Estimating fallbacks (first paint + jsdom's 0×0 rects). */
const ESTIMATED_WIDTH = 232
const ESTIMATED_ROW_HEIGHT = 34
const ESTIMATED_SEPARATOR_HEIGHT = 11
const ESTIMATED_PADDING = 12
const ESTIMATED_PROMPT_HEIGHT = 64

function estimateHeight(items: readonly MenuItem[], prompt: boolean): number {
  const rows = items.reduce(
    (sum, item) =>
      sum + (item.kind === 'separator' ? ESTIMATED_SEPARATOR_HEIGHT : ESTIMATED_ROW_HEIGHT),
    ESTIMATED_PADDING + (prompt ? ESTIMATED_PROMPT_HEIGHT : 0),
  )
  return rows
}

/** Viewport point an anchor resolves to (element anchors hang below-left). */
function anchorPoint(anchor: MenuAnchor): { x: number; y: number } {
  if (anchor.kind === 'point') return { x: anchor.x, y: anchor.y }
  const rect = anchor.element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return { x: 0, y: 0 } // jsdom
  return { x: rect.left, y: rect.bottom + 2 }
}

/** A rendered row: an action/radio item, or one of the confirm-step buttons. */
interface Row {
  readonly id: string
  readonly label: string
  readonly destructive: boolean
  readonly disabled: boolean
  readonly radioChecked: boolean | null
  /** Guarded original item (shows the confirm step); null = run directly. */
  readonly confirmOf: MenuAction | null
  readonly onSelect?: () => void
  /** The guarded commit row (oxide surface). */
  readonly commit?: boolean
}

/** What the panel renders, in order: grooves and focusable rows. */
type Entry =
  | { readonly kind: 'sep'; readonly id: string }
  | { readonly kind: 'row'; readonly row: Row; readonly slot: number }

export function MenuShell({ session, onClose }: MenuShellProps) {
  const { items, anchor, ariaLabel } = session
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  /** The guarded step, when a confirm-carrying action was triggered. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null)

  const confirming =
    confirmingId === null
      ? null
      : ((items.find((item) => item.id === confirmingId && item.kind === 'action') as
          MenuAction | undefined) ?? null)

  const entries: readonly Entry[] = confirming
    ? [
        {
          kind: 'row' as const,
          slot: 0,
          row: {
            id: `${confirming.id}__cancel`,
            label: confirming.confirm!.cancelLabel,
            destructive: false,
            disabled: false,
            radioChecked: null,
            confirmOf: null,
            onSelect: () => setConfirmingId(null),
          },
        },
        {
          kind: 'row' as const,
          slot: 1,
          row: {
            id: `${confirming.id}__go`,
            label: confirming.confirm!.confirmLabel,
            destructive: confirming.destructive === true,
            disabled: false,
            radioChecked: null,
            confirmOf: null,
            onSelect: confirming.onSelect,
            commit: true,
          },
        },
      ]
    : items.flatMap((item, slot): Entry[] => {
        if (item.kind === 'separator') return [{ kind: 'sep', id: item.id }]
        return [
          {
            kind: 'row',
            slot,
            row: {
              id: item.id,
              label: item.label,
              destructive: item.kind === 'action' && item.destructive === true,
              disabled: item.disabled === true,
              radioChecked: item.kind === 'radio' ? item.checked : null,
              confirmOf: item.kind === 'action' && item.confirm ? item : null,
              onSelect: item.onSelect,
            },
          },
        ]
      })

  // Focus lands on the first enabled row on open AND on every list swap
  // (items → guarded step → back): keyboard operators are never stranded.
  useLayoutEffect(() => {
    itemRefs.current.find((el) => el instanceof HTMLButtonElement && !el.disabled)?.focus()
  }, [items, confirmingId])

  // Measure once mounted (real pixels; jsdom keeps the estimate).
  useLayoutEffect(() => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) {
      setMeasured({ width: rect.width, height: rect.height })
    }
  }, [items, confirmingId])

  // Outside pointerdown stows the menu (no forced focus return — the click
  // is the operator's next intent). Resize reflows placement, so the menu
  // closes instead of drifting: transient chrome never lingers stale.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        onClose(false)
      }
    }
    const onResize = (): void => onClose(false)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
    }
  }, [onClose])

  const point = anchorPoint(anchor)
  const size = measured ?? {
    width: ESTIMATED_WIDTH,
    height: estimateHeight(items, confirming !== null),
  }
  const placement = computeMenuPlacement(
    point,
    size,
    { width: window.innerWidth, height: window.innerHeight },
    MENU_VIEWPORT_MARGIN,
  )

  /** The focusable rows in DOM order (grooves + disabled rows never join). */
  const focusableRows = useCallback((): HTMLButtonElement[] => {
    return itemRefs.current.filter(
      (el): el is HTMLButtonElement => el instanceof HTMLButtonElement && !el.disabled,
    )
  }, [])

  const focusRow = useCallback(
    (index: number): void => {
      const focusable = focusableRows()
      if (focusable.length === 0) return
      const wrapped = ((index % focusable.length) + focusable.length) % focusable.length
      focusable[wrapped]!.focus()
    },
    [focusableRows],
  )

  /** Focused row's position within the FOCUSABLE list (arrow deltas share its space). */
  const focusedRowIndex = useCallback((): number => {
    const active = document.activeElement
    return focusableRows().findIndex((el) => el === active)
  }, [focusableRows])

  /**
   * Selection law: run the command, then read where focus stands and close —
   * the provider restores invoker focus only when the command left focus
   * inside this menu (did nothing with it). A command that moved focus (the
   * inline rename input) keeps it.
   */
  const activate = useCallback(
    (row: Row): void => {
      emitMenuEvent('select') // UI-6 bus — every row the operator throws
      if (row.confirmOf) {
        setConfirmingId(row.id) // guarded: show the confirm step
        return
      }
      row.onSelect?.()
      const active = document.activeElement
      const focusMovedOut =
        active instanceof HTMLElement &&
        active !== document.body &&
        rootRef.current?.contains(active) === false
      onClose(!focusMovedOut)
    },
    [onClose],
  )

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (confirming !== null) {
        setConfirmingId(null) // a guarded step steps back first
        return
      }
      onClose(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusRow(focusedRowIndex() + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusRow(focusedRowIndex() - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusRow(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusRow(-1)
    } else if (event.key === 'Tab') {
      // DD-1 map: a menu keeps focus WITHIN itself — Tab walks the rows like
      // the arrows (Shift walks back); Escape is the menu's close key.
      event.preventDefault()
      focusRow(focusedRowIndex() + (event.shiftKey ? -1 : 1))
    }
  }
  return createPortal(
    <div
      ref={rootRef}
      className="ctx-menu"
      data-menu-root
      role="menu"
      aria-label={confirming ? confirming.confirm!.prompt : ariaLabel}
      style={{ left: `${placement.left}px`, top: `${placement.top}px` }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {confirming ? (
        <div className="ctx-confirm" data-menu-confirm>
          <p className="ctx-confirm-prompt">{confirming.confirm!.prompt}</p>
          {confirming.confirm!.detail && (
            <p className="ctx-confirm-detail">{confirming.confirm!.detail}</p>
          )}
          <div className="ctx-confirm-row">
            {entries.map((entry) =>
              entry.kind === 'row' ? (
                <MenuRow
                  key={entry.row.id}
                  row={entry.row}
                  index={entry.slot}
                  itemRefs={itemRefs}
                  onActivate={activate}
                />
              ) : null,
            )}
          </div>
        </div>
      ) : (
        entries.map((entry) =>
          entry.kind === 'sep' ? (
            <hr key={entry.id} className="ctx-sep" role="separator" />
          ) : (
            <MenuRow
              key={entry.row.id}
              row={entry.row}
              index={entry.slot}
              itemRefs={itemRefs}
              onActivate={activate}
            />
          ),
        )
      )}
    </div>,
    document.body,
  )
}

interface MenuRowProps {
  readonly row: Row
  readonly index: number
  readonly itemRefs: RefObject<(HTMLButtonElement | null)[]>
  readonly onActivate: (row: Row) => void
}

function MenuRow({ row, index, itemRefs, onActivate }: MenuRowProps) {
  return (
    <button
      type="button"
      role={row.radioChecked === null ? 'menuitem' : 'menuitemradio'}
      aria-checked={row.radioChecked ?? undefined}
      className="ctx-item"
      data-menu-item={row.id}
      data-destructive={row.destructive || undefined}
      data-commit={row.commit || undefined}
      disabled={row.disabled}
      ref={(el) => {
        itemRefs.current[index] = el
      }}
      onClick={() => onActivate(row)}
    >
      {row.radioChecked !== null && (
        <span className="ctx-radio" aria-hidden="true" data-checked={row.radioChecked} />
      )}
      <span className="ctx-item-label">{row.label}</span>
    </button>
  )
}
