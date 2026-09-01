/**
 * The placeholder content pack (MF-3) — what `getContent()` serves until a
 * filled `content/author.json` lands (see schema.ts header for the flow).
 *
 * Honesty rules, matching MF-1's seed discipline:
 * - ZERO fabricated facts. Every human-facing string is an obvious bracket
 *   placeholder carrying the shared PLACEHOLDER_MARK, so an unfilled archive
 *   can never masquerade as a real one.
 * - Absent-by-design fields are EMPTY, never faked: no placeholder URLs
 *   (a fake link is worse than no link), no invented skills or mission-log
 *   flavor. Unfilled simply reads as unfilled.
 * - The two project slots use the ids the desktop seed joins on
 *   (exhibit-01 / exhibit-02) — the join contract lives in schema.ts.
 */

import { deepFreeze, PLACEHOLDER_MARK, type AuthorPack } from './schema'

const M = `[${PLACEHOLDER_MARK}]`

/** The placeholder pack — frozen, deterministic, obviously-not-a-person. */
export const defaultAuthorPack: AuthorPack = deepFreeze({
  version: 1,
  author: {
    name: `[YOUR NAME] ${M}`,
    handle: `[YOUR HANDLE — e.g. @your-name — or leave out] ${M}`,
    tagline: `[ONE LINE ABOUT YOU — from content/author.template.md] ${M}`,
    bio: `[BIO — 2–4 sentences about you: who you are, what you make, what you care about. Filled once via content/author.template.md, then served from content/author.json.] ${M}`,
    links: [],
    skills: [],
    interests: [],
    missionLog: '',
  },
  projects: [
    {
      id: 'exhibit-01',
      name: `[PROJECT 1 NAME] ${M}`,
      description: `[ONE LINE — what project one does] ${M}`,
      tech: ['[TECH 1]', '[TECH 2]'],
      liveUrl: '',
      repoUrl: '',
      screenshotPath: '',
      story: '',
    },
    {
      id: 'exhibit-02',
      name: `[PROJECT 2 NAME] ${M}`,
      description: `[ONE LINE — what project two does] ${M}`,
      tech: ['[TECH 1]', '[TECH 2]'],
      liveUrl: '',
      repoUrl: '',
      screenshotPath: '',
      story: '',
    },
  ],
})
