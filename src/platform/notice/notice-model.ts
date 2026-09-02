/**
 * Notice model (UI-7) — the pure view-model of the LIMITED BANDWIDTH CONSOLE,
 * the plate a phone meets instead of the desktop. Everything here is a
 * function of its arguments; the ambient reads (getContent(),
 * isPlaceholderContent()) happen once in NoticeCard so the plate is provable
 * against fixture packs in tests exactly as a filled content/author.json will
 * drive it in production (the AP-5 about-model precedent, deliberately).
 *
 * Placeholder law, same as the nameplate's: while the OS runs on the
 * placeholder pack, `noticeView` forwards NOTHING from it — the stand-in
 * officer name renders, links collapse to empty (a fake link is worse than
 * no link), and the dashed AWAITING notice explains the stand-ins. A
 * `[REPLACE VIA CONTENT PACK]` marker can never reach the DOM through this
 * path.
 *
 * Layering note: this is platform code, so it may NOT import the about app's
 * model — the link-safety constants and the domain formatter are re-declared
 * here (one archive, one officer: the lockstep tests in notice.test.tsx pin
 * them to about's, so the two can never drift apart silently).
 */

import type { AuthorLink, AuthorPack } from '../../lib/content'
import { OS_NAME, OS_VERSION } from '../boot/os'

/* ------------------------------ placeholder ------------------------------- */

/** What the plate says while no officer's papers are on file (about's stand-in). */
export const STANDIN_NAME = 'Unassigned Officer'

/** The whole card, as the plate renders it (stand-ins already applied). */
export interface NoticeView {
  /** True while standing in for an unfiled pack (drives the AWAITING notice). */
  readonly placeholder: boolean
  readonly name: string
  readonly links: readonly AuthorLink[]
}

/**
 * Resolve the pack into renderable card data. Placeholder mode forwards
 * NOTHING from the pack (stand-in name, zero links) — markers cannot leak.
 */
export function noticeView(pack: AuthorPack, placeholder: boolean): NoticeView {
  if (placeholder) {
    return { placeholder: true, name: STANDIN_NAME, links: [] }
  }
  return { placeholder: false, name: pack.author.name, links: pack.author.links }
}

/** The placeholder-mode notice (rendered only while standing in). */
export const AWAITING_TITLE = 'AWAITING OFFICER MANIFEST'
export const AWAITING_BODY =
  'This console is dressed in stand-ins until the officer\u2019s papers are filed with the archive.'

/** The honest empty state when the pack carries no channels. */
export const EMPTY_CHANNELS = 'No channels riveted to this console yet.'

/* --------------------------- the POST-style well --------------------------- */

/** The plate's principal engraving — the page's single h1. */
export const NOTICE_TITLE = 'Limited Bandwidth Console'

/**
 * The status line, dot-leader padded exactly the way the boot POST pads its
 * check lines (label, dotted to a shared column, verdict).
 */
const LABEL_COLUMN = 20

function padLabel(label: string): string {
  return `${`${label} `.padEnd(LABEL_COLUMN, '.')} `
}

export const NOTICE_STATUS_LINE = `${padLabel('BANDWIDTH CHECK')}LIMITED`
export const NOTICE_STATUS_QUALIFIER = 'HANDHELD VIEWPORT DETECTED'

/** The human line — the brief's own message, verbatim. */
export const NOTICE_MESSAGE =
  'This console requires a larger viewport \u2014 the archive is best experienced on a desktop.'

/* ------------------------------ contact rows ------------------------------- */

/** Every external channel opens safely (the platform's a11y commitment). */
export const EXTERNAL_LINK_TARGET = '_blank'
export const EXTERNAL_LINK_REL = 'noopener noreferrer'

/**
 * The host a channel row prints: a web link prints its hostname verbatim
 * (`www.` is part of the address the officer gave), a mailto prints the
 * address itself. Pure and total: anything unparseable prints the raw string
 * rather than throwing at a visitor.
 */
export function linkDomain(url: string): string {
  if (url.toLowerCase().startsWith('mailto:')) return url.slice('mailto:'.length)
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/* -------------------------------- colophon --------------------------------- */

/** The console's own name + version — the same constants the taskbar prints. */
export const NOTICE_OS_NAME = OS_NAME
export const NOTICE_OS_VERSION = OS_VERSION

/** The archive's name (the document title's other half). */
export const NOTICE_ARCHIVE_NAME = 'The Survey Archive'
