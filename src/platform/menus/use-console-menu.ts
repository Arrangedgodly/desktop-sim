/**
 * The composable menu seam (UI-5): any surface inside a MenuProvider opens
 * the console's ONE menu with its own items. The desktop's ground/specimen
 * menus are the first clients; AP-1's explorer passes its own item lists
 * through the same call.
 */

import { useContext } from 'react'
import { MenuContext } from './menu-context'
import type { ConsoleMenu } from './menu-context'

/** Throws when mounted outside MenuProvider — a missing host is a wiring bug. */
export function useConsoleMenu(): ConsoleMenu {
  const value = useContext(MenuContext)
  if (!value) throw new Error('useConsoleMenu requires <MenuProvider> above it in the tree')
  return value
}
