/**
 * Context-menu item model (UI-5) — the composable contract every console
 * surface passes to `openMenu(items, anchor)`.
 *
 * The shell (MenuShell.tsx) knows NOTHING about the desktop: it renders
 * whatever items it is handed. The desktop's ground/specimen menus are one
 * client (desktop-menus.ts); AP-1's explorer builds its own item lists
 * against this same union later — including radio groups (view modes) and
 * guarded destructive commands (delete), both first-class here.
 *
 * Vocabulary (design-brief): the console owns the chrome. Menu rows are
 * ENGRAVED LEGENDS on a recessed panel — never parchment cards, never
 * phosphor text. Destructive rows carry oxide ink; the confirm step's
 * commit button is the guarded oxide surface.
 */

/** Where a menu opens: at the pointer, or at an element (keyboard opens). */
export type MenuAnchor =
  | { readonly kind: 'point'; readonly x: number; readonly y: number }
  | { readonly kind: 'element'; readonly element: HTMLElement }

/**
 * A guarded second step, rendered INSIDE the same menu (no dialog system):
 * the row's command is held back until the operator confirms. Used for
 * destructive commands (Delete) per the plan's "oxide-red confirm".
 */
export interface MenuConfirm {
  /** The question, e.g. `Delete field-log.txt?` */
  readonly prompt: string
  /** Optional consequence line, e.g. `Everything inside the drawer goes.` */
  readonly detail?: string
  readonly confirmLabel: string
  readonly cancelLabel: string
}

/** A command row. `role="menuitem"` (or menuitemradio for radio rows). */
export interface MenuAction {
  readonly kind: 'action'
  /** Stable id — also the DOM key; selectors in tests ride it. */
  readonly id: string
  /** Visible engraved legend (kept short; controls name their action). */
  readonly label: string
  readonly onSelect?: () => void
  /** Destructive command — oxide ink; pair with `confirm`. */
  readonly destructive?: boolean
  readonly disabled?: boolean
  readonly confirm?: MenuConfirm
}

/** A single-select toggle row (`role="menuitemradio"`, aria-checked). */
export interface MenuRadio {
  readonly kind: 'radio'
  readonly id: string
  readonly label: string
  readonly checked: boolean
  readonly onSelect?: () => void
  readonly disabled?: boolean
}

/** A groove between rows (`role="separator"`). */
export interface MenuSeparator {
  readonly kind: 'separator'
  readonly id: string
}

export type MenuItem = MenuAction | MenuRadio | MenuSeparator

/** Every focusable (action/radio) item; separators are never focusable. */
export function isFocusableItem(item: MenuItem): item is MenuAction | MenuRadio {
  return item.kind !== 'separator'
}
