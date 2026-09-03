/**
 * Field Notes model — the pure, React-free catalog math behind the reading
 * room: the text-specimen listing the picker renders (the paint picker's
 * `listPlates` shape, for text) and the empty-catalog line. No store access,
 * no DOM — the surface feeds it the live FS state.
 *
 * Import discipline (docs/APP-CONTRACT.md — notepad/paint are the
 * references): TYPES ride the app-registry contract (`FSNodeRef`); the only
 * structural assumption is the catalog tree shape `{ rootId, nodes }`.
 */

import { listChildren } from '../../lib/fs'
import type { FSNodeRef } from '../../platform/app-registry'

/**
 * The catalog tree shape this module reads — structurally the FS domain
 * state, typed through the contract's node (the fleet's shared discipline).
 */
export interface CatalogSheet {
  readonly rootId: string
  readonly nodes: Readonly<Record<string, FSNodeRef>>
}

/** A text specimen through the contract's node union (content-carrying kind). */
export type TextSpecimenRef = Extract<FSNodeRef, { kind: 'text' }>

/** The picker's empty-catalog line — the brief's exact wording. */
export const EMPTY_CATALOG_LINE = 'No field notes in the catalog'

/**
 * Every text specimen in the catalog, in the catalog's own reading order
 * (depth-first, `listChildren` accession order per drawer — the painter's
 * `listPlates` walk, for text): the reading room's ledger.
 */
export function listTextSpecimens(sheet: CatalogSheet): readonly TextSpecimenRef[] {
  const specimens: TextSpecimenRef[] = []
  const walk = (id: string): void => {
    for (const node of listChildren(sheet, id)) {
      if (node.kind === 'text') specimens.push(node)
      if (node.kind === 'folder') walk(node.id)
    }
  }
  walk(sheet.rootId)
  return specimens
}

/**
 * The live text specimen behind an id, or null — gone (decommissioned
 * elsewhere) or not a text specimen. The surface renders its SPECIMEN
 * REMOVED notice on the gone case.
 */
export function textSpecimen(sheet: CatalogSheet, id: string | null): TextSpecimenRef | null {
  if (id === null) return null
  const node = sheet.nodes[id]
  return node && node.kind === 'text' ? node : null
}
