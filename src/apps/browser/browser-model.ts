/**
 * Browser model (AP-6) — the pure view-model of the archive's FIELD ATLAS,
 * the plate-book browser for the science officer's projects. Everything here
 * is a function of its arguments: the ambient reads (getContent(),
 * isPlaceholderContent(), the FS store) happen once in BrowserSurface, so the
 * atlas can be proven against fixture packs in tests exactly as a filled
 * content/author.json will drive it in production (AP-5's fixture class).
 *
 * The window is a URL-FREE ZONE by committed decision (plan.md AP-6, town-hall
 * non-goals: no iframing of arbitrary external sites): the atlas renders
 * CURATED PLATES only — pack-authored screenshot assets or the in-world
 * PLATE NOT DEVELOPED frame — and every external departure is a real anchor
 * that leaves the sim (target _blank + noopener noreferrer).
 *
 * Four jobs:
 * 1. PLACEHOLDER HONESTY — while the OS runs on the placeholder pack, a
 *    visitor must never see template debris (`[REPLACE VIA CONTENT PACK]`
 *    markers). `atlasView` NEVER forwards a placeholder string: each pack
 *    slot becomes an in-world stand-in ("Unindexed Specimen 01") whose
 *    description is clearly-about-placeholder. Slot IDS survive the swap —
 *    they are stable join keys (schema.ts), never human-facing copy.
 * 2. THE LEDGER JOIN — each plate's slot id IS the seeded exhibit specimen's
 *    node id (lib/fs/seed.ts, the MF-3 join), so the plate page can cite the
 *    archive's own accession record; a deleted specimen degrades honestly to
 *    UNFILED rather than printing a stale code.
 * 3. Navigation — prev/next WRAPS around the ledger (a plate book is a ring,
 *    not a ladder); the readouts print roman plate numbers in the mono face.
 * 4. Screenshot resolution — the pack names repo-relative screenshot paths;
 *    the surface embeds content/screenshots/* at build time and resolves
 *    through `screenshotSrc`, which degrades to '' (→ the PLATE NOT
 *    DEVELOPED frame) when the asset is absent.
 */

import type { AuthorPack, ProjectEntry } from '../../lib/content'
import type { FSNodeRef } from '../../platform/app-registry'

/* ------------------------------- the atlas --------------------------------- */

/** One catalog card / plate page, as the atlas renders it. */
export interface AtlasPlate {
  /** Stable slot id (survives the placeholder swap — the ledger join key). */
  readonly id: string
  /** True while standing in for an unfiled slot. */
  readonly placeholder: boolean
  readonly name: string
  readonly description: string
  readonly tech: readonly string[]
  /** Deployed site; '' = the live-site action renders disabled + reason. */
  readonly liveUrl: string
  /** Readable source; '' = the repository action renders disabled + reason. */
  readonly repoUrl: string
  /** Repo-relative screenshot path ('' = the PLATE NOT DEVELOPED frame). */
  readonly screenshotPath: string
  /** Optional one-paragraph field story; '' = the section hides. */
  readonly story: string
}

/** The whole atlas, stand-ins already applied where the pack is unfiled. */
export interface AtlasView {
  /** True while standing in for an unfiled pack (drives the AWAITING notice). */
  readonly placeholder: boolean
  readonly plates: readonly AtlasPlate[]
}

/* ------------------------------ placeholder -------------------------------- */

/** What the ledger says while the officer's exhibits are not on file. */
export const STANDIN_NAME_PREFIX = 'Unindexed Specimen'
export const STANDIN_DESCRIPTION =
  'Awaiting the officer\u2019s field notes \u2014 this slot is held for a catalogued exhibit.'

/** The placeholder-mode notice strip (rendered only while standing in). */
export const AWAITING_TITLE = 'AWAITING FIELD ACCESSION'
export const AWAITING_BODY =
  'This atlas is dressed in stand-ins until the officer\u2019s exhibits are filed with the archive.'

/** The zero-projects ledger: the atlas states its emptiness in-world. */
export const EMPTY_TITLE = 'Atlas empty — awaiting specimens'
export const EMPTY_BODY =
  'No exhibits are catalogued in this atlas yet. Specimens filed with the archive will enter here as plates.'

/** Engraved reasons printed under actions the pack cannot back (never hidden). */
export const NO_LIVE_REASON = 'No live site on file with the archive.'
export const NO_REPO_REASON = 'No repository on file with the archive.'

/** The authored placeholder frame (a plate the pack did not expose). */
export const UNDEVELOPED_TITLE = 'PLATE NOT DEVELOPED'
export const UNDEVELOPED_HINT =
  'This exhibit\u2019s plate awaits exposure; its catalog entry will carry the image.'

/** Zero-pad a slot number for stand-in names (01, 02, …). */
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** One stand-in plate for an unfiled slot (ids join; copy does not forward). */
function standIn(project: ProjectEntry, index: number): AtlasPlate {
  return {
    id: project.id, // the ledger join key — never human-facing copy
    placeholder: true,
    name: `${STANDIN_NAME_PREFIX} ${pad2(index + 1)}`,
    description: STANDIN_DESCRIPTION,
    tech: [],
    liveUrl: '',
    repoUrl: '',
    screenshotPath: '',
    story: '',
  }
}

/**
 * Resolve the pack into renderable atlas data. Placeholder mode forwards
 * NOTHING human-facing from the pack — names/descriptions become stand-ins,
 * lists collapse empty (no fake tech, no fake URLs) — so a marker can never
 * reach the DOM through this path. Filled mode forwards the pack verbatim.
 */
export function atlasView(pack: AuthorPack, placeholder: boolean): AtlasView {
  if (placeholder) {
    return { placeholder: true, plates: pack.projects.map(standIn) }
  }
  return {
    placeholder: false,
    plates: pack.projects.map((project) => ({ ...project, placeholder: false })),
  }
}

/* ------------------------------ navigation ---------------------------------- */

/**
 * Step around the ledger with WRAP (a plate book is a ring: stepping past the
 * last plate turns to the first, and back past the first turns to the last).
 * Count 0 stays at 0 — the empty atlas has nowhere to turn.
 */
export function wrapIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return (((current + delta) % count) + count) % count
}

/* ------------------------------ plate numbering ----------------------------- */

const ROMAN_PAIRS: readonly (readonly [number, string])[] = Object.freeze([
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
])

/**
 * Plate numbers print as roman numerals — a plate book's own numbering (and
 * letters, so the mono well never owes its tabular figures anything). Total:
 * n < 1 returns the digits verbatim rather than throwing at a visitor.
 */
export function romanNumeral(n: number): string {
  if (n < 1) return String(n)
  let rest = Math.floor(n)
  let out = ''
  for (const [value, glyph] of ROMAN_PAIRS) {
    while (rest >= value) {
      out += glyph
      rest -= value
    }
  }
  return out
}

/** The ledger readout: how many plates the atlas holds. */
export function platesLabel(count: number): string {
  return `${count} ${count === 1 ? 'PLATE' : 'PLATES'}`
}

/** The plate-page readout: `PLATE II / IV` (roman ring position). */
export function plateReadout(index: number, count: number): string {
  return `PLATE ${romanNumeral(index + 1)} / ${romanNumeral(count)}`
}

/* ---------------------------- screenshot join ------------------------------- */

/**
 * The archive's screenshot directory — where the fill task drops exhibit
 * plates and where the surface's glob keys them.
 */
const SCREENSHOT_DIR = 'content/screenshots'

/**
 * Normalize a pack screenshot path onto the glob's key shape. Two spellings
 * resolve to the same embedded asset: repo-relative paths
 * (`content/screenshots/x.png`, with or without a leading `/` or `./`) and
 * BARE FILENAMES (`x.png`) — the fill's natural shorthand, resolved against
 * the screenshot directory the way the template's example points. A path
 * that carries its own directory is respected verbatim after the prefix
 * strip; anything unmapped still degrades to '' (the PLATE NOT DEVELOPED
 * frame), never a broken image.
 */
export function normalizeScreenshotPath(path: string): string {
  let out = path.trim()
  while (out.startsWith('./')) out = out.slice(2)
  if (out.startsWith('/')) out = out.slice(1)
  if (out.length > 0 && !out.includes('/')) out = `${SCREENSHOT_DIR}/${out}`
  return out
}

/**
 * Resolve a pack screenshot path to its embedded asset URL. `available` maps
 * normalized paths to build-time URLs (the surface supplies the glob); an
 * absent or unmapped path resolves to '' — the surface renders the PLATE NOT
 * DEVELOPED frame, never a broken image.
 */
export function screenshotSrc(
  path: string,
  available: Readonly<Record<string, string>>,
): string {
  if (path.length === 0) return ''
  return available[normalizeScreenshotPath(path)] ?? ''
}

/* ------------------------------ the join to FS ------------------------------ */

/**
 * The catalog tree shape this module reads — structurally the FS domain state
 * (`FSTree`/`FSState`), typed through the contract's node so the app never
 * names a lib/fs type directly (explorer/notepad/viewer discipline, verbatim).
 */
export interface CatalogSheet {
  readonly rootId: string
  readonly nodes: Readonly<Record<string, FSNodeRef>>
}

/** The accession readout while no specimen backs the slot. */
export const UNFILED_ACCESSION = 'UNFILED'

/**
 * The plate's own specimen: the seeded exhibit whose node id IS the pack slot
 * id (seed.ts's join). Returns its accession code, or null when the archive
 * holds no such node (deleted elsewhere) — the plate then prints UNFILED,
 * never a stale code.
 */
export function exhibitAccession(sheet: CatalogSheet, plateId: string): string | null {
  return sheet.nodes[plateId]?.accession ?? null
}

/* ------------------------------- external links ----------------------------- */

/** Every external departure opens safely (the platform's standing law). */
export const EXTERNAL_LINK_TARGET = '_blank'
export const EXTERNAL_LINK_REL = 'noopener noreferrer'

/**
 * The host an action departs to, printed beside it so the officer's address
 * is visible before the visitor leaves the sim. Hostname verbatim (`www.` is
 * part of the address); pure and total — anything unparseable prints the raw
 * string rather than throwing at a visitor (about-model's law, mirrored
 * app-side rather than imported across app boundaries).
 */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
