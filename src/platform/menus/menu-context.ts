/**
 * The menu context seam (UI-5) — the context object itself, split from the
 * component files so each stays component-only (the react-refresh lint
 * contract, same discipline as specimen-glyphs/kinds).
 */

import { createContext } from 'react'
import type { MenuAnchor, MenuItem } from './menu-items'

export interface OpenMenuOptions {
  /** Accessible name for the open menu (each surface names its own). */
  readonly ariaLabel: string
}

export interface ConsoleMenu {
  /** Open (or replace) the console menu. Items render as given, verbatim. */
  readonly openMenu: (
    items: readonly MenuItem[],
    anchor: MenuAnchor,
    options: OpenMenuOptions,
  ) => void
  /** Close the menu if open (`restoreFocus` follows the shell's law). */
  readonly closeMenu: (restoreFocus?: boolean) => void
}

export const MenuContext = createContext<ConsoleMenu | null>(null)
