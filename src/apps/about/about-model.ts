/**
 * About model (AP-5) — the pure view-model of the SCIENCE OFFICER'S NAMEPLATE
 * MANIFEST. Everything here is a function of its arguments: the ambient reads
 * (getContent(), isPlaceholderContent(), the FS store) happen once in
 * AboutSurface, so the manifest can be proven against fixture packs in tests
 * exactly as a filled content/author.json will drive it in production.
 *
 * Three jobs:
 * 1. PLACEHOLDER HONESTY — while the OS runs on the placeholder pack, a
 *    visitor must never see template debris (`[REPLACE VIA CONTENT PACK]`
 *    markers). `manifestView` NEVER forwards placeholder strings: it swaps the
 *    whole manifest for in-world stand-ins ("Unassigned Officer", manifest
 *    pending). A recruiter reads a plaque with an empty seat, not a form.
 * 2. THE COMMISSIONING STAMP — the manifest cites the archive's own record:
 *    the seeded nameplate specimen (the app-link whose appId is `about`)
 *    carries the accession code + accessionedAt that the stamp prints. No
 *    record → the stamp honestly prints `LOG/—` (the task's own notation).
 * 3. Colophon truth — HOLD/OS + version (platform/boot/os.ts, the same
 *    constants the taskbar chip prints) and the built-with line, both static
 *    supplied truth; no invented metrics.
 */

import type { AuthorLink, AuthorPack } from '../../lib/content'
import type { FSNode } from '../../lib/fs'
import { ABOUT_APP_ID } from '../../platform/app-registry'
import { OS_NAME, OS_VERSION } from '../../platform/boot/os'

/* ----------------------------- placeholder pack ---------------------------- */

/** The whole manifest, as the nameplate renders it (stand-ins already applied). */
export interface ManifestView {
  /** True while standing in for an unfiled pack (drives the AWAITING notice). */
  readonly placeholder: boolean
  readonly name: string
  /** Code-site handle beside the name. Empty = hidden. */
  readonly handle: string
  readonly tagline: string
  readonly bio: string
  readonly links: readonly AuthorLink[]
  readonly skills: readonly string[]
  readonly interests: readonly string[]
  /** One archive-voice flavor line, small type at the sheet's foot. Empty = silence. */
  readonly missionLog: string
}

/** What the plate says while no officer's papers are on file. */
export const STANDIN_NAME = 'Unassigned Officer'
export const STANDIN_TAGLINE = 'Manifest pending — the officer\u2019s record is not yet on file.'
export const STANDIN_BIO =
  'No field note on record. This seat is held for the science officer; when the manifest is filed with the archive, the officer\u2019s own record will be entered here.'

/** The placeholder-mode notice strip (rendered only while standing in). */
export const AWAITING_TITLE = 'AWAITING OFFICER MANIFEST'
export const AWAITING_BODY =
  'This plaque is dressed in stand-ins until the officer\u2019s papers are filed with the archive.'

/**
 * Resolve the pack into renderable manifest data. Placeholder mode forwards
 * NOTHING from the pack — every human-facing string is a stand-in, and lists
 * collapse to empty (no fake links, no invented skills) — so a marker can
 * never reach the DOM through this path.
 */
export function manifestView(pack: AuthorPack, placeholder: boolean): ManifestView {
  if (placeholder) {
    return {
      placeholder: true,
      name: STANDIN_NAME,
      handle: '',
      tagline: STANDIN_TAGLINE,
      bio: STANDIN_BIO,
      links: [],
      skills: [],
      interests: [],
      missionLog: '',
    }
  }
  const { author } = pack
  return {
    placeholder: false,
    name: author.name,
    handle: author.handle,
    tagline: author.tagline,
    bio: author.bio,
    links: author.links,
    skills: author.skills,
    interests: author.interests,
    missionLog: author.missionLog,
  }
}

/* ------------------------------ contact rows ------------------------------- */

/**
 * The host an external channel is riveted to: a web link prints its hostname
 * (verbatim — `www.` is part of the address the officer gave), a mailto
 * prints the address itself. Pure and total: anything unparseable prints the
 * raw string rather than throwing at a visitor.
 */
export function linkDomain(url: string): string {
  if (url.toLowerCase().startsWith('mailto:')) return url.slice('mailto:'.length)
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Every external channel opens safely (the platform's a11y commitment). */
export const EXTERNAL_LINK_TARGET = '_blank'
export const EXTERNAL_LINK_REL = 'noopener noreferrer'

/* ---------------------------- the commissioning ---------------------------- */

/** What the stamp prints: the accession record + the LOG/ timecode. */
export interface Commissioning {
  /** The nameplate specimen's accession code (e.g. MOD-0001). Null = unfiled. */
  readonly accession: string | null
  /** `LOG/<UTC B612-ready timestamp>`; `LOG/—` when no record exists. */
  readonly stamp: string
}

/** Zero-pad to two digits (UTC parts of the log stamp). */
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** `LOG/2087-03-14 09:37Z` — mission-epoch UTC, the archive's fixed clock. */
export function formatLogStamp(atMs: number): string {
  const d = new Date(atMs)
  return (
    `LOG/${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`
  )
}

/** The unfiled stamp — the task's own notation for a record that isn't there. */
export const UNFILED_STAMP = 'LOG/—'

/**
 * The nameplate's own specimen: the app-link registered against this module.
 * Seeded once by MF-1 (`nameplate` → appId `about`); found by predicate, not
 * by id, so the lookup keeps working whatever the officer called the node.
 */
export function nameplateSpecimen(nodes: Readonly<Record<string, FSNode>>): FSNode | null {
  for (const node of Object.values(nodes)) {
    if (node.kind === 'app-link' && node.appId === ABOUT_APP_ID) return node
  }
  return null
}

/** Resolve the stamp from the specimen (its accession + accessionedAt). */
export function commissioning(specimen: FSNode | null): Commissioning {
  if (specimen === null) return { accession: null, stamp: UNFILED_STAMP }
  return { accession: specimen.accession, stamp: formatLogStamp(specimen.accessionedAt) }
}

/* -------------------------------- colophon --------------------------------- */

/** The console's own name + version — the same constants the taskbar prints. */
export const COLOPHON_OS_NAME = OS_NAME
export const COLOPHON_OS_VERSION = OS_VERSION

/** Built-with truth (package.json's own stack, no more, no less). */
export const BUILT_WITH: readonly string[] = Object.freeze(['React', 'TypeScript', 'Vite'])

/** The one in-world sentence that says the desktop IS the portfolio. */
export const COLOPHON_NOTE =
  'You are inside the exhibit itself — this console, its drawers, and everything the archive remembers under your hands are the portfolio.'

/* --------------------------- console keys (onboard) ------------------------- */

/** One chord of the condensed keyboard map: the keys + what they do. */
export interface ConsoleKey {
  /** The chord, verbatim as B612 prints it (e.g. 'F6 / SHIFT+F6'). */
  readonly keys: string
  /** What the chord does (engraved legend on the colophon plate). */
  readonly does: string
  /** True for the chords too long to share a row — the row spans both columns. */
  readonly full?: boolean
}

/**
 * The DD-1 map CONDENSED to the colophon (refinement #5 `onboard`): the
 * machine's operating legend, silkscreened where the machine speaks last.
 * Truth source is docs/KEYBOARD.md — every row here is that map's own wording
 * compressed, nothing invented; the full map (per-app floors included) stays
 * in the repo docs, pointed at by KEYS_DOC_REF.
 */
export const CONSOLE_KEYS: readonly ConsoleKey[] = Object.freeze([
  { keys: 'F6 / SHIFT+F6', does: 'travel the zones · hold, rail, window', full: true },
  { keys: 'ARROWS', does: 'walk specimens, lists, lamps' },
  { keys: 'ENTER', does: 'open the focused specimen' },
  { keys: 'ESC', does: 'close the focused module' },
  { keys: 'ALT+ESC', does: 'walk the window stack' },
  { keys: 'MENU / SHIFT+F10', does: 'the hold’s menus', full: true },
])

/** Where the complete map lives (the colophon cites its own papers). */
export const KEYS_DOC_REF = 'docs/KEYBOARD.md'
