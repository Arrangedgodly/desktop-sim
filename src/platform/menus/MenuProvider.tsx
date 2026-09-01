/**
 * MenuProvider (UI-5) — the console's ONE menu host and the composable
 * `openMenu(items, anchor)` seam every surface shares:
 *
 *   const { openMenu } = useConsoleMenu()
 *   openMenu(items, { kind: 'point', x: event.clientX, y: event.clientY })
 *
 * The desktop's ground/specimen menus (desktop-menus.ts) are the first
 * client; AP-1's explorer passes its own item lists through this same call
 * — the shell renders whatever it is handed (menu-items.ts contract).
 *
 * Mounted by the desktop surface around its whole subtree: menus are OS
 * furniture, in reach of the ground, the icons, AND window content (React
 * context flows through portals, so explorer windows inherit it).
 *
 * Focus law: the invoker (activeElement at open) is captured on the
 * session; the shell decides `restoreFocus` per close reason and the
 * provider applies it BEFORE the portal unmounts — focusing first means
 * the unmount removes unfocused nodes and never yanks focus to <body>.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { MenuAnchor, MenuItem } from './menu-items'
import { MenuContext } from './menu-context'
import type { ConsoleMenu, OpenMenuOptions } from './menu-context'
import { MenuShell } from './MenuShell'
import type { MenuSession } from './MenuShell'

export function MenuProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<MenuSession | null>(null)
  // Live mirror of the open session so the stable close() reads fresh state
  // (never a setState updater side effect — StrictMode runs them twice).
  const sessionRef = useRef<MenuSession | null>(null)

  const openMenu = useCallback<ConsoleMenu['openMenu']>(
    (items: readonly MenuItem[], anchor: MenuAnchor, options: OpenMenuOptions) => {
      const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const next: MenuSession = { items, anchor, ariaLabel: options.ariaLabel, invoker }
      sessionRef.current = next
      setSession(next) // a new open replaces any live menu
    },
    [],
  )

  const closeMenu = useCallback<ConsoleMenu['closeMenu']>((restoreFocus = false) => {
    const current = sessionRef.current
    sessionRef.current = null
    if (restoreFocus && current?.invoker && current.invoker.isConnected) {
      current.invoker.focus() // before unmount — see the header's focus law
    }
    setSession(null)
  }, [])

  const value = useMemo<ConsoleMenu>(() => ({ openMenu, closeMenu }), [openMenu, closeMenu])

  return (
    <MenuContext.Provider value={value}>
      {children}
      {session && <MenuShell session={session} onClose={closeMenu} />}
    </MenuContext.Provider>
  )
}
