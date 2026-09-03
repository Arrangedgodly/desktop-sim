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
 * MF-3 join: the Projects drawer's exhibit specimens are DERIVED from the
 * author content pack (`getContent()` in lib/content) — one `.txt` specimen
 * per pack project, node id === project id, body composed from the pack
 * entry. While the pack is the placeholder default these stubs read as
 * marked placeholders; once a filled content/author.json is embedded, a
 * catalog RESET (AP-4) accessions the real exhibits. The About nameplate
 * module reference (id `nameplate` → app `about`) completes the content
 * wiring point: everything personal lives in the pack, not in the tree.
 *
 * Determinism: fixed ids, a fixed mission-epoch clock, and allocation via
 * the pure ops mean `seedFSState()` always returns the same value (per
 * embedded pack) — MF-2's reset path (AP-4) can compare or re-seed freely.
 * Wallpaper alignment (settings default 'star-chart') is NOT this file's
 * concern.
 */

import { getContent, getContentSource, type ProjectEntry } from '../content'
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
 * Compose a seeded exhibit specimen's body from its content-pack entry.
 * Two honest states, keyed to the loader's source:
 * - FILLED PACK: a real catalogue sheet — the officer's own words verbatim
 *   (name, line, tech, channels, field story). Zero placeholder markers: a
 *   filled archive must not read as a form (refinement #1's fill law).
 * - PLACEHOLDER PACK: the marked stub, banner first (MF-1's contract).
 */
function exhibitBody(project: ProjectEntry, index: number): string {
  const orNone = (value: string): string => (value.length > 0 ? value : 'none listed')
  if (getContentSource() === 'pack') {
    const story = project.story.length > 0 ? `\n\nFIELD NOTES\n  ${project.story}\n` : '\n'
    return `EXHIBIT ${String(index + 1).padStart(2, '0')} — catalogue entry.

  ${project.name} — ${project.description}

  apparatus: ${project.tech.join(', ')}
  live: ${orNone(project.liveUrl)}
  repository: ${orNone(project.repoUrl)}
${story}
Catalogued from the author content pack; the Field Atlas carries this
exhibit's plate (screenshot + external channels) in the browser module.`
  }
  return `${REPLACE_ME}

EXHIBIT ${String(index + 1).padStart(2, '0')} — catalog stub (content-pack slot "${project.id}").

Seeded from the author content pack; while placeholders are in place it reads:
  name: ${project.name}
  line: ${project.description}
  tech: ${project.tech.join(', ')}
  live: ${orNone(project.liveUrl)}
  repo: ${orNone(project.repoUrl)}

Drop a filled content/author.json at the repo root (content/author.template.md
is the form) and reset the catalog to accession the real exhibit. The About
nameplate and Project Browser pick the pack up without a reset.`
}

/**
 * The seeded catalog. Grown through the REAL ops (createNode/setIconPosition)
 * so seed integrity is enforced by the same rules every later mutation faces.
 */
export function seedFSState(): FSState {
  // One minute per accession, in creation order — stable regardless of how
  // many project slots the embedded pack carries.
  let minutes = 0
  const t = (): number => SEED_EPOCH + ++minutes * 60_000

  const pack = getContent()

  let state = emptyFSState(SEED_EPOCH)

  // Drawers on the desktop ------------------------------------------------
  state = createNode(state, {
    id: 'projects',
    parentId: 'root',
    name: 'Projects',
    kind: 'folder',
    now: t(),
  })
  state = createNode(state, {
    id: 'field-notes',
    parentId: 'root',
    name: 'Field Notes',
    kind: 'folder',
    now: t(),
  })
  state = createNode(state, {
    id: 'archive',
    parentId: 'root',
    name: 'Archive',
    kind: 'folder',
    now: t(),
  })

  // Projects — catalogued exhibits, one stub per content-pack project slot
  // (the MF-3 join: exhibit node id === pack project id). ------------------
  pack.projects.forEach((project, index) => {
    state = createNode(state, {
      id: project.id,
      parentId: 'projects',
      name: `${project.id}.txt`,
      kind: 'text',
      now: t(),
      content: exhibitBody(project, index),
    })
  })
  state = createNode(state, {
    id: 'reference-plate',
    parentId: 'projects',
    name: 'reference-plate.png',
    kind: 'image',
    now: t(),
    src: placeholderPlate('EXHIBIT REFERENCE'),
  })

  // Field Notes -------------------------------------------------------------
  state = createNode(state, {
    id: 'field-log',
    parentId: 'field-notes',
    name: 'field-log.txt',
    kind: 'text',
    now: t(),
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
    now: t(),
    src: placeholderPlate('FIELD OBSERVATION'),
  })

  // Archive -----------------------------------------------------------------
  state = createNode(state, {
    id: 'decommissioned',
    parentId: 'archive',
    name: 'decommissioned-exhibit.txt',
    kind: 'text',
    now: t(),
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
    now: t(),
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
    now: t(),
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
