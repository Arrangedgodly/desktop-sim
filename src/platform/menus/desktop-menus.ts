/**
 * The desktop's two context menus (UI-5) — item lists for the shared shell
 * (MenuProvider's `openMenu`), built against the LIVE store at execution
 * time so a menu opened seconds ago still commits against fresh state.
 *
 * Ground menu (right-click the bare hold): New Drawer, New Specimen,
 * Arrange by Accession. CUT at dispatch, recorded in production-log.md:
 * Reset Desktop… (owned by AP-4's guarded-cover dialog, HU-1 scope).
 *
 * Specimen menu (right-click / Menu key an icon): Rename (inline edit on
 * the icon itself — the surface owns that state via the `actions.rename`
 * seam), Delete (oxide, guarded by the shell's two-step confirm — a
 * drawer's whole subtree goes, the prompt says so). CUT at dispatch:
 * Properties (no panel surface exists; AP-1+ own any future readout).
 */

import { FSError, deleteNode, isFolderNode, type FSNode, type FSState } from '../../lib/fs'
import { useFSStore } from '../stores/fs-store'
import type { MenuItem } from './menu-items'
import {
  arrangeByAccession,
  createCatalogEntry,
  NEW_DRAWER_LABEL,
  NEW_SPECIMEN_LABEL,
} from './catalog-ops'

/** One atomic store commit; FSErrors soft-fail (menus never crash the OS). */
function commitOrSoftFail(next: () => FSState): void {
  try {
    useFSStore.getState().commit(next())
  } catch (error) {
    if (!(error instanceof FSError)) throw error
    // e.g. the node vanished while the menu was open — nothing to do
  }
}

/** The hold's ground menu items. */
export function buildGroundMenuItems(): MenuItem[] {
  return [
    {
      kind: 'action',
      id: 'new-drawer',
      label: NEW_DRAWER_LABEL,
      onSelect: () =>
        commitOrSoftFail(() => {
          const { fs } = useFSStore.getState()
          return createCatalogEntry(fs, fs.rootId, 'folder', NEW_DRAWER_LABEL)
        }),
    },
    {
      kind: 'action',
      id: 'new-specimen',
      label: NEW_SPECIMEN_LABEL,
      onSelect: () =>
        commitOrSoftFail(() => {
          const { fs } = useFSStore.getState()
          return createCatalogEntry(fs, fs.rootId, 'text', NEW_SPECIMEN_LABEL)
        }),
    },
    { kind: 'separator', id: 'ground-sep' },
    {
      kind: 'action',
      id: 'arrange',
      label: 'Arrange by Accession',
      onSelect: () =>
        commitOrSoftFail(() => arrangeByAccession(useFSStore.getState().fs)),
    },
  ]
}

export interface SpecimenMenuActions {
  /** Enter inline rename on the icon (the surface owns the editing state). */
  readonly rename: () => void
}

/** One specimen's/drawer's menu items. */
export function buildSpecimenMenuItems(node: FSNode, actions: SpecimenMenuActions): MenuItem[] {
  const kindWord = isFolderNode(node) ? 'drawer' : 'specimen'
  const quoted = `“${node.name}”`
  return [
    {
      kind: 'action',
      id: 'rename',
      label: 'Rename',
      onSelect: actions.rename,
    },
    { kind: 'separator', id: 'specimen-sep' },
    {
      kind: 'action',
      id: 'delete',
      label: 'Delete',
      destructive: true,
      confirm: {
        prompt: `Delete ${quoted}?`,
        detail: isFolderNode(node)
          ? 'Everything inside the drawer is deleted with it.'
          : `The ${kindWord} leaves the archive for good.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
      },
      onSelect: () => commitOrSoftFail(() => deleteNode(useFSStore.getState().fs, node.id)),
    },
  ]
}
