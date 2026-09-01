/**
 * Context-menu platform module (UI-5) — the shared shell + provider and the
 * desktop's two clients. AP-1's explorer consumes `useConsoleMenu` and
 * builds its own items against the same contract (menu-items.ts).
 */
export { MenuProvider } from './MenuProvider'
export { useConsoleMenu } from './use-console-menu'
export type { ConsoleMenu, OpenMenuOptions } from './menu-context'
export { MenuShell } from './MenuShell'
export type { MenuSession } from './MenuShell'
export type {
  MenuAction,
  MenuAnchor,
  MenuConfirm,
  MenuItem,
  MenuRadio,
  MenuSeparator,
} from './menu-items'
export { computeMenuPlacement, MENU_VIEWPORT_MARGIN } from './menu-position'
export {
  arrangeByAccession,
  createCatalogEntry,
  dedupeName,
  NEW_DRAWER_LABEL,
  NEW_SPECIMEN_LABEL,
} from './catalog-ops'
export { buildGroundMenuItems, buildSpecimenMenuItems } from './desktop-menus'
export type { SpecimenMenuActions } from './desktop-menus'
