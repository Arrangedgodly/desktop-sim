/**
 * Author content-pack schema (MF-3) — THE SCIENCE OFFICER'S MANIFEST.
 *
 * One author, their contact links, and their catalogued projects. Everything
 * user-true in the OS flows from a single pack:
 *
 *   content/author.template.md   the one-time human fill-in form
 *   content/author.json          the filled pack (transcribed from the form;
 *                                ABSENT until the fill task drops it in)
 *   src/lib/content/default.ts   placeholder pack — obviously-marked stand-ins,
 *                                zero fabricated facts ([YOUR NAME] et al.)
 *
 * Consumers (AP-5 About nameplate, AP-6 Project Browser, UI-7 phone notice,
 * COM-1 README) read `getContent()` from loader.ts — never the file directly —
 * so an absent or invalid pack degrades to the placeholder pack instead of
 * breaking the OS. The desktop seed (lib/fs/seed.ts) joins this schema too:
 * each project's `id` IS the seeded exhibit specimen's node id
 * (`exhibit-01.txt` ↔ project `exhibit-01`), so FS specimens and Browser
 * catalog cards stay in lock-step.
 *
 * Validation follows MF-1's hand-rolled discipline (no schema dependency):
 * untrusted input is narrowed field-by-field; a structural violation throws
 * `ContentError` and the caller falls back to defaults. Content is display
 * data, not user records — a bad pack must never take the archive down.
 */

/** Content-pack schema version this console writes and understands. */
export const CONTENT_SCHEMA_VERSION = 1

/**
 * Project slot-id grammar — same shape as the app-registry's APP_ID_PATTERN
 * (lowercase kebab-case, leading letter). Ids are stable identities: they join
 * the pack to the seeded FS exhibit nodes and must never be renamed once real.
 */
export const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/** The marker every placeholder string carries (matches MF-1's seed markers). */
export const PLACEHOLDER_MARK = 'REPLACE VIA CONTENT PACK (MF-3)'

/** Contact links must be real web or mail addresses (AP-5 opens them externally). */
const URL_PATTERN = /^(https?:\/\/|mailto:)/i

/** How a link opens. `email` → mail client, `web` → new tab (noopener). */
export type AuthorLinkKind = 'email' | 'web'

/** One contact link on the nameplate: the words shown + where they go. */
export interface AuthorLink {
  readonly label: string
  readonly url: string
  readonly kind: AuthorLinkKind
}

/** The science officer's manifest — everything personal the nameplate shows. */
export interface AuthorProfile {
  /** Full name, or working name. Required. */
  readonly name: string
  /** Code-site handle, shown beside the name. Empty = absent. */
  readonly handle: string
  /** One line under the name. Required. */
  readonly tagline: string
  /** 2–4 sentences of long-form introduction. Required. */
  readonly bio: string
  /** 0–4 contact links (email / site / GitHub / LinkedIn / …). */
  readonly links: readonly AuthorLink[]
  /** Things the officer works with. Optional — empty = hidden. */
  readonly skills: readonly string[]
  /** Things the officer follows. Optional — empty = hidden. */
  readonly interests: readonly string[]
  /** One in-world archive-voice flavor line, small type on the nameplate. Empty = silence. */
  readonly missionLog: string
}

/** One catalogued exhibit: a Project Browser card + an FS specimen. */
export interface ProjectEntry {
  /** Stable slot id (PROJECT_ID_PATTERN); joins the seeded exhibit node id. */
  readonly id: string
  /** Exhibit name. Required. */
  readonly name: string
  /** One-line description. Required. */
  readonly description: string
  /** 2–4 tech tags (guide) — schema accepts 1–6 non-empty strings. */
  readonly tech: readonly string[]
  /** Deployed site; empty = card hides the live-site action. */
  readonly liveUrl: string
  /** Readable source; empty = card hides the repo action. */
  readonly repoUrl: string
  /** Repo-relative path to a screenshot (e.g. content/screenshots/x.png); empty = none. */
  readonly screenshotPath: string
  /** Optional one-paragraph story, the card's reverse side; empty = none. */
  readonly story: string
}

/** The whole pack — the wire shape of content/author.json. */
export interface AuthorPack {
  readonly version: typeof CONTENT_SCHEMA_VERSION
  readonly author: AuthorProfile
  readonly projects: readonly ProjectEntry[]
}

/* --------------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------------ */

export type ContentErrorCode =
  /** The file isn't JSON at all. */
  | 'invalid-json'
  /** Structurally wrong (bad version, missing required fields, wrong types, bad ids/urls). */
  | 'invalid-pack'

export class ContentError extends Error {
  readonly code: ContentErrorCode

  constructor(code: ContentErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'ContentError'
    this.code = code
  }
}

export function isContentError(value: unknown): value is ContentError {
  return value instanceof ContentError
}

/* --------------------------------------------------------------------------
 * Validation + optional-field backfill (untrusted input in, frozen pack out)
 * ------------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** Required: a non-empty (trimmed) string. */
function requiredText(where: string, raw: Record<string, unknown>, field: string): string {
  const value = raw[field]
  if (!isString(value) || value.trim().length === 0) {
    throw new ContentError('invalid-pack', `${where}.${field} must be a non-empty string`)
  }
  return value
}

/** Optional: absent → fallback; present must be a string (empty allowed). */
function optionalText(
  where: string,
  raw: Record<string, unknown>,
  field: string,
  fallback = '',
): string {
  const value = raw[field]
  if (value === undefined) return fallback
  if (!isString(value)) {
    throw new ContentError('invalid-pack', `${where}.${field} must be a string when present`)
  }
  return value
}

/** Optional: absent → fallback; present must be an array of non-empty strings. */
function optionalStringList(
  where: string,
  raw: Record<string, unknown>,
  field: string,
): readonly string[] {
  const value = raw[field]
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((item) => isString(item) && item.trim().length > 0)) {
    throw new ContentError(
      'invalid-pack',
      `${where}.${field} must be an array of non-empty strings when present`,
    )
  }
  return value
}

/** URLs must be full web or mail addresses (never javascript:, never relative). */
function optionalUrl(where: string, raw: Record<string, unknown>, field: string): string {
  const value = raw[field]
  if (value === undefined) return ''
  if (!isString(value)) {
    throw new ContentError('invalid-pack', `${where}.${field} must be a string when present`)
  }
  if (value.length === 0) return ''
  if (!URL_PATTERN.test(value)) {
    throw new ContentError(
      'invalid-pack',
      `${where}.${field} must be a full https://, http://, or mailto: address (got ${JSON.stringify(value)})`,
    )
  }
  return value
}

function readLink(raw: unknown, index: number): AuthorLink {
  if (!isRecord(raw)) {
    throw new ContentError('invalid-pack', `author.links[${index}] is not an object`)
  }
  const url = optionalUrl(`author.links[${index}]`, raw, 'url')
  return {
    label: requiredText(`author.links[${index}]`, raw, 'label'),
    url,
    kind: url.startsWith('mailto:') ? 'email' : 'web',
  }
}

function readProject(raw: unknown, index: number, seenIds: Set<string>): ProjectEntry {
  const where = `projects[${index}]`
  if (!isRecord(raw)) {
    throw new ContentError('invalid-pack', `${where} is not an object`)
  }
  const id = requiredText(where, raw, 'id')
  if (!PROJECT_ID_PATTERN.test(id)) {
    throw new ContentError(
      'invalid-pack',
      `${where}.id ${JSON.stringify(id)} must match ${PROJECT_ID_PATTERN.source} (stable slot id)`,
    )
  }
  if (seenIds.has(id)) {
    throw new ContentError('invalid-pack', `duplicate project slot id ${JSON.stringify(id)}`)
  }
  seenIds.add(id)

  const tech = optionalStringList(where, raw, 'tech')
  if (tech.length < 1 || tech.length > 6) {
    throw new ContentError(
      'invalid-pack',
      `${where}.tech needs 1–6 tags (the template asks for 2–4)`,
    )
  }

  return {
    id,
    name: requiredText(where, raw, 'name'),
    description: requiredText(where, raw, 'description'),
    tech,
    liveUrl: optionalUrl(where, raw, 'liveUrl'),
    repoUrl: optionalUrl(where, raw, 'repoUrl'),
    screenshotPath: optionalText(where, raw, 'screenshotPath'),
    story: optionalText(where, raw, 'story'),
  }
}

/** Recursively freeze normalized packs — consumers get an immutable manifest. */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((item) => deepFreeze(item))
    return Object.freeze(value)
  }
  if (isRecord(value)) {
    Object.values(value).forEach((item) => deepFreeze(item))
    return Object.freeze(value)
  }
  return value
}

/**
 * Validate an untrusted parsed pack and backfill optional fields.
 * Required: version, author.{name,tagline,bio}, projects[].{id,name,description}.
 * Throws ContentError('invalid-pack') on any structural violation.
 */
export function normalizeAuthorPack(input: unknown): AuthorPack {
  if (!isRecord(input)) {
    throw new ContentError('invalid-pack', 'the content pack is not an object')
  }
  if (input['version'] !== CONTENT_SCHEMA_VERSION) {
    throw new ContentError(
      'invalid-pack',
      `expected content-pack version ${CONTENT_SCHEMA_VERSION}, found ${JSON.stringify(input['version'])}`,
    )
  }

  const rawAuthor = input['author']
  if (!isRecord(rawAuthor)) {
    throw new ContentError('invalid-pack', 'author is missing or not an object')
  }
  const rawLinks = rawAuthor['links'] === undefined ? [] : rawAuthor['links']
  if (!Array.isArray(rawLinks) || rawLinks.length > 4) {
    throw new ContentError('invalid-pack', 'author.links must be an array of at most 4 links')
  }

  const rawProjects = input['projects'] === undefined ? [] : input['projects']
  if (!Array.isArray(rawProjects) || rawProjects.length > 6) {
    throw new ContentError('invalid-pack', 'projects must be an array of at most 6 projects')
  }

  const seenIds = new Set<string>()
  const projects = rawProjects.map((raw, index) => readProject(raw, index, seenIds))

  return deepFreeze({
    version: CONTENT_SCHEMA_VERSION,
    author: deepFreeze({
      name: requiredText('author', rawAuthor, 'name'),
      handle: optionalText('author', rawAuthor, 'handle'),
      tagline: requiredText('author', rawAuthor, 'tagline'),
      bio: requiredText('author', rawAuthor, 'bio'),
      links: deepFreeze(rawLinks.map(readLink)),
      skills: optionalStringList('author', rawAuthor, 'skills'),
      interests: optionalStringList('author', rawAuthor, 'interests'),
      missionLog: optionalText('author', rawAuthor, 'missionLog'),
    }),
    projects: deepFreeze(projects),
  })
}

/**
 * Parse raw pack text (the embedded content/author.json) into a validated
 * frozen pack. Throws ContentError('invalid-json' | 'invalid-pack').
 */
export function parseAuthorPack(rawText: string): AuthorPack {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch (error) {
    throw new ContentError(
      'invalid-json',
      `content/author.json is not valid JSON: ${String(error)}`,
    )
  }
  return normalizeAuthorPack(parsed)
}
