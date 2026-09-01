/**
 * Seeded catalog (MF-1) — PLACEHOLDER SPECIMENS, clearly marked.
 *
 * Everything in this tree is a stand-in awaiting the MF-3 content pack
 * (`content/author.template.md` output): every text body carries a
 * `[PLACEHOLDER SPECIMEN — REPLACE VIA CONTENT PACK (MF-3)]` header, and the
 * image plates are inline data-URI stubs that literally draw the words
 * "PLACEHOLDER PLATE". No fabricated facts — only catalog furniture
 * (drawers, charter, accession codes) is authored here.
 *
 * Determinism: fixed ids, a fixed mission-epoch clock, and allocation via
 * the pure ops mean `seedFSState()` always returns the same value —
 * MF-2's reset path (AP-4) can compare or re-seed freely. Wallpaper
 * alignment (settings default 'star-chart') is NOT this file's concern.
 */

import { createNode, emptyFSState, setIconPosition } from './ops'
import { CURRENT_SCHEMA_VERSION, type FSEnvelope } from './schema'
import type { FSState } from './types'

/** Fixed accession clock for the seed (2087-03-14T09:26Z) — deterministic, in-mission. */
export const SEED_EPOCH = Date.UTC(2087, 2, 14, 9, 26)

/** A tiny self-labeling placeholder plate (renders everywhere; zero assets). */
function placeholderPlate(label: string): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220">' +
    '<rect width="320" height="220" fill="#241d13"/>' +
    '<rect x="8" y="8" width="304" height="204" fill="none" stroke="#c98b2d" stroke-width="2"/>' +
    '<text x="160" y="96" text-anchor="middle" font-family="monospace" font-size="14" fill="#e8a33d">PLACEHOLDER PLATE</text>' +
    `<text x="160" y="122" text-anchor="middle" font-family="monospace" font-size="11" fill="#e8a33d">${label}</text>` +
    '<text x="160" y="160" text-anchor="middle" font-family="monospace" font-size="10" fill="#8f6a2a">REPLACE VIA CONTENT PACK (MF-3)</text>' +
    '</svg>'
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const REPLACE_ME = '[PLACEHOLDER SPECIMEN — REPLACE VIA CONTENT PACK (MF-3)]'

/**
 * The seeded catalog. Grown through the REAL ops (createNode/setIconPosition)
 * so seed integrity is enforced by the same rules every later mutation faces.
 */
export function seedFSState(): FSState {
  const t = (minutes: number): number => SEED_EPOCH + minutes * 60_000

  let state = emptyFSState(SEED_EPOCH)

  // Drawers on the desktop ------------------------------------------------
  state = createNode(state, {
    id: 'projects',
    parentId: 'root',
    name: 'Projects',
    kind: 'folder',
    now: t(1),
  })
  state = createNode(state, {
    id: 'field-notes',
    parentId: 'root',
    name: 'Field Notes',
    kind: 'folder',
    now: t(2),
  })
  state = createNode(state, {
    id: 'archive',
    parentId: 'root',
    name: 'Archive',
    kind: 'folder',
    now: t(3),
  })

  // Projects — catalogued exhibits (stubs until the content pack lands) ----
  state = createNode(state, {
    id: 'exhibit-01',
    parentId: 'projects',
    name: 'exhibit-01.txt',
    kind: 'text',
    now: t(4),
    content: `${REPLACE_ME}

EXHIBIT 01 — catalog stub.

Real content: one shipped project. Replace this specimen's body with the
project name, a one-line description, the technologies used, and a live
URL. The accession code stays; only the label text changes.`,
  })
  state = createNode(state, {
    id: 'exhibit-02',
    parentId: 'projects',
    name: 'exhibit-02.txt',
    kind: 'text',
    now: t(5),
    content: `${REPLACE_ME}

EXHIBIT 02 — catalog stub.

Second slot for a shipped project (see exhibit-01). Replace alongside it
when the content pack arrives, or delete this specimen outright.`,
  })
  state = createNode(state, {
    id: 'reference-plate',
    parentId: 'projects',
    name: 'reference-plate.png',
    kind: 'image',
    now: t(6),
    src: placeholderPlate('EXHIBIT REFERENCE'),
  })

  // Field Notes -------------------------------------------------------------
  state = createNode(state, {
    id: 'field-log',
    parentId: 'field-notes',
    name: 'field-log.txt',
    kind: 'text',
    now: t(7),
    content: `${REPLACE_ME}

FIELD LOG — standing observations.

Replace with the author's short bio / field notes from the content pack.
Delete this line when done.`,
  })
  state = createNode(state, {
    id: 'observation-plate',
    parentId: 'field-notes',
    name: 'observation-plate.png',
    kind: 'image',
    now: t(8),
    src: placeholderPlate('FIELD OBSERVATION'),
  })

  // Archive -----------------------------------------------------------------
  state = createNode(state, {
    id: 'decommissioned',
    parentId: 'archive',
    name: 'decommissioned-exhibit.txt',
    kind: 'text',
    now: t(9),
    content: `${REPLACE_ME}

DECOMMISSIONED — exhibit withdrawn from circulation.

Withdrawn work files here. Replace with real archive material or leave the
drawer empty; it persists either way.`,
  })

  // Desktop specimens --------------------------------------------------------
  state = createNode(state, {
    id: 'charter',
    parentId: 'root',
    name: 'accession-charter.txt',
    kind: 'text',
    now: t(10),
    content: `${REPLACE_ME}

ACCESSION CHARTER

This console catalogs the science officer's collection.
Drawers (folders) carry DRW-#### accession codes.
Specimens (text) carry SPC-####.
Plates (images) carry PLT-####.
Module references (app links) carry MOD-####.

Every specimen placed, relabelled, or decommissioned is
remembered by the archive.

Replace this charter's wording when the content pack arrives.`,
  })
  state = createNode(state, {
    id: 'nameplate',
    parentId: 'root',
    name: 'Science Officer Nameplate',
    kind: 'app-link',
    now: t(11),
    appId: 'about',
  })

  // Desktop grid: x = column, y = row (three drawers, then the invitation).
  state = setIconPosition(state, 'projects', { x: 0, y: 0 })
  state = setIconPosition(state, 'field-notes', { x: 0, y: 1 })
  state = setIconPosition(state, 'archive', { x: 0, y: 2 })
  state = setIconPosition(state, 'charter', { x: 1, y: 0 })
  state = setIconPosition(state, 'nameplate', { x: 1, y: 1 })

  return state
}

/** The seeded catalog on the wire — what a fresh install persists first. */
export function seedEnvelope(): FSEnvelope {
  const state = seedFSState()
  return {
    version: CURRENT_SCHEMA_VERSION,
    fs: { rootId: state.rootId, nodes: state.nodes },
    iconPositions: state.iconPositions,
    savedAt: SEED_EPOCH,
  }
}
