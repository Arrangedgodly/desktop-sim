/**
 * Content loader (MF-3) — the single read seam every content consumer uses.
 *
 *   getContent()        ─▶ the frozen, validated AuthorPack (always usable)
 *   getContentSource()  ─▶ 'pack' (content/author.json embedded at build time)
 *                          or 'default' (placeholder pack — nothing filled yet)
 *
 * How a filled pack arrives (no backend, static bundle per the fixed scope):
 * the fill task drops `content/author.json` at the repo root; Vite's
 * import.meta.glob embeds it as raw text at build time. Until the file exists
 * the glob resolves to {} and the loader serves the placeholder pack — which
 * is exactly today's state, so AP-5/AP-6/UI-7 can be built against
 * getContent() NOW and light up with real content the moment the pack lands.
 *
 * Failure policy (content is display data, not user records): an absent,
 * unparseable, or structurally invalid author.json NEVER throws — the loader
 * warns once and falls back to the placeholder pack. The user's FS/persistence
 * data is untouched by content problems (blast-radius discipline from MF-2).
 */

import { defaultAuthorPack } from './default'
import { parseAuthorPack, type AuthorPack } from './schema'

/** Where the fill task drops the transcribed pack (repo root, see template). */
export const AUTHOR_PACK_PATH = '/content/author.json'

/**
 * Build-time embed of the pack file, if any. Zero matches (file absent) → {}
 * — the documented pre-fill state. `?raw` keeps it text: JSON.parse +
 * validation happen here, in our code, where invalid input falls back safely.
 * (The pattern must be a literal per glob syntax; it mirrors AUTHOR_PACK_PATH.)
 */
const embeddedPacks = import.meta.glob('/content/author.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export type ContentSource = 'pack' | 'default'

interface ResolvedContent {
  readonly pack: AuthorPack
  readonly source: ContentSource
}

/** Resolve raw pack text (or absence) — pure, exported for testing. */
export function resolveContent(rawText: string | null): ResolvedContent {
  if (rawText === null) return { pack: defaultAuthorPack, source: 'default' }
  try {
    return { pack: parseAuthorPack(rawText), source: 'pack' }
  } catch (error) {
    // A bad pack is a fill-task problem, not a visitor problem: log it loudly
    // for the operator, keep the OS on its placeholders.
    console.warn(
      `[content] ${AUTHOR_PACK_PATH} is invalid — serving the placeholder pack instead (${error instanceof Error ? error.message : String(error)})`,
    )
    return { pack: defaultAuthorPack, source: 'default' }
  }
}

let cached: ResolvedContent | null = null

function resolved(): ResolvedContent {
  if (cached === null) {
    const raw = embeddedPacks[AUTHOR_PACK_PATH]
    cached = resolveContent(raw === undefined ? null : raw)
  }
  return cached
}

/**
 * The author content pack, frozen and validated. Safe to call anywhere,
 * any number of times; never throws.
 */
export function getContent(): AuthorPack {
  return resolved().pack
}

/** `'pack'` once a valid content/author.json is embedded, else `'default'`. */
export function getContentSource(): ContentSource {
  return resolved().source
}

/** True while the OS is running on placeholders (About can badge this). */
export function isPlaceholderContent(): boolean {
  return resolved().source === 'default'
}
