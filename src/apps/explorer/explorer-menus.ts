/**
 * Explorer menu items (AP-1) — composed from the PLATFORM menu module
 * (src/platform/menus), never forked:
 *
 * - The drawer (ground) menu here reuses `createCatalogEntry` and the shared
 *   NEW_* labels — the same pure catalog ops the desktop's ground menu uses —
 *   scoped to the drawer being VIEWED instead of the desktop root. Arrange-by-
 *   accession stays desktop-only (icon positions are hold furniture).
 * - The specimen rows (Rename / guarded Delete) are NOT rebuilt here at all:
 *   the surface calls the platform's `buildSpecimenMenuItems` verbatim, so
 *   explorer menus and desktop menus can never drift apart.
 * - Rendering, keyboard, focus law, oxide confirm — all the ONE MenuShell's
 *   (reached through `useConsoleMenu`; this module produces data only).
 */

import { FSError, type FSState } from '../../lib/fs'
import {
  createCatalogEntry,
  NEW_DRAWER_LABEL,
  NEW_SPECIMEN_LABEL,
} from '../../platform/menus'
import type { MenuItem } from '../../platform/menus'
import { useFSStore } from '../../platform/stores'

/** One atomic store commit; FSErrors soft-fail (menus never crash the OS). */
function commitOrSoftFail(next: () => FSState): void {
  try {
    useFSStore.getState().commit(next())
  } catch (error) {
    if (!(error instanceof FSError)) throw error
    // e.g. the drawer vanished while the menu was open — nothing to do
  }
}

/**
 * The viewed drawer's own menu: accession a new drawer or a new text specimen
 * into THIS drawer, under the shared deduped base labels. Executed against
 * live store state at select time (the same law as the desktop's builders).
 */
export function buildDrawerMenuItems(drawerId: string): MenuItem[] {
  return [
    {
      kind: 'action',
      id: 'new-drawer',
      label: NEW_DRAWER_LABEL,
      onSelect: () =>
        commitOrSoftFail(() => {
          const { fs } = useFSStore.getState()
          return createCatalogEntry(fs, drawerId, 'folder', NEW_DRAWER_LABEL)
        }),
    },
    {
      kind: 'action',
      id: 'new-specimen',
      label: NEW_SPECIMEN_LABEL,
      onSelect: () =>
        commitOrSoftFail(() => {
          const { fs } = useFSStore.getState()
          return createCatalogEntry(fs, drawerId, 'text', NEW_SPECIMEN_LABEL)
        }),
    },
  ]
}
