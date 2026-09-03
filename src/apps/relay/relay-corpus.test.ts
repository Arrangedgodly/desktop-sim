/**
 * Relay corpus law (batch 2, brief 3) — the authored letters are CONTENT,
 * and content carries laws: the drip shape the brief names (first post ~20s,
 * then minutes apart), uniqueness of every identity field, and THE
 * NO-REAL-WORLD-CLAIMS audit, grepped: every word of the corpus is fiction
 * about the fictional Survey 44 — no real people, offices, products,
 * addresses, or dates. (The log carries the human self-audit line this test
 * mechanically backs.)
 */

import { describe, expect, it } from 'vitest'
import { RELAY_LETTERS, type RelayLetter } from './relay-letters'

/** The corpus's whole ink — every field a reader could ever see. */
const inkOf = (letter: RelayLetter): string =>
  [letter.from, letter.fromCode, letter.stamp, letter.subject, ...letter.paragraphs, letter.filedName]
    .join('\n')
    .toLowerCase()

describe('relay corpus · shape and identity', () => {
  it("carries 5–8 letters (the brief's band)", () => {
    expect(RELAY_LETTERS.length).toBeGreaterThanOrEqual(5)
    expect(RELAY_LETTERS.length).toBeLessThanOrEqual(8)
  })

  it('every identity field is unique — ids, subjects, filed names', () => {
    const ids = RELAY_LETTERS.map((letter) => letter.id)
    const subjects = RELAY_LETTERS.map((letter) => letter.subject)
    const filedNames = RELAY_LETTERS.map((letter) => letter.filedName)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(subjects).size).toBe(subjects.length)
    expect(new Set(filedNames).size).toBe(filedNames.length)
  })

  it('filed names are catalog-safe labels (.txt, no path separators)', () => {
    for (const letter of RELAY_LETTERS) {
      expect(letter.filedName).toMatch(/^relay-44-[a-z0-9-]+\.txt$/)
      expect(letter.filedName).not.toContain('/')
    }
  })

  it('every prose field is non-empty and sanely bounded', () => {
    for (const letter of RELAY_LETTERS) {
      for (const field of [letter.id, letter.from, letter.fromCode, letter.stamp, letter.subject]) {
        expect(field.trim().length, `${letter.id}: ${field}`).toBeGreaterThan(0)
      }
      expect(letter.paragraphs.length).toBeGreaterThanOrEqual(2)
      expect(letter.paragraphs.length).toBeLessThanOrEqual(8)
      for (const paragraph of letter.paragraphs) {
        // 9 = the shortest legitimate line, the "Officer —" salutation
        expect(paragraph.trim().length).toBeGreaterThanOrEqual(9) // not a stub
        expect(paragraph.length).toBeLessThan(600) // parchment paragraphs, not essays
      }
    }
  })
})

describe('relay corpus · the drip the brief names', () => {
  it('first post arrives ~20s in (10–30s band)', () => {
    expect(RELAY_LETTERS[0]!.offsetMs).toBeGreaterThanOrEqual(10_000)
    expect(RELAY_LETTERS[0]!.offsetMs).toBeLessThanOrEqual(30_000)
  })

  it('then posts are MINUTES apart — every gap at least a minute, the whole wire inside a day', () => {
    for (let i = 1; i < RELAY_LETTERS.length; i += 1) {
      const gap = RELAY_LETTERS[i]!.offsetMs - RELAY_LETTERS[i - 1]!.offsetMs
      expect(gap).toBeGreaterThanOrEqual(60_000)
    }
    const last = RELAY_LETTERS[RELAY_LETTERS.length - 1]!
    expect(last.offsetMs).toBeLessThan(24 * 3_600_000)
  })
})

describe('relay corpus · zero real-world claims (the audit, grepped)', () => {
  it('carries no network addresses, handles, or domains', () => {
    for (const letter of RELAY_LETTERS) {
      expect(inkOf(letter)).not.toMatch(/https?:|www\.|\.com|\.org|\.net|\.io\b|@/)
    }
  })

  it('carries no 20th/21st-century years — the mission calendar is its own', () => {
    for (const letter of RELAY_LETTERS) {
      expect(inkOf(letter)).not.toMatch(/\b(19|20)\d{2}\b/)
    }
  })

  it("is written in the mission's own vocabulary — every letter cites the survey's world", () => {
    // Dry institutional register, proven by its own furniture: every letter
    // signs from an office on its code, and the corpus as a whole touches
    // the hold, the archive, and the mission's long middle.
    for (const letter of RELAY_LETTERS) {
      expect(letter.fromCode).toMatch(/^OF-\d{3}$/)
      expect(letter.stamp).toMatch(/DAY \d{4}-\d{3} · (FIRST|DAY|MIDDLE|LATE|NIGHT|DOG) WATCH/)
    }
    const all = RELAY_LETTERS.map(inkOf).join(' ')
    for (const word of ['hold', 'archive', 'survey 44', 'watch']) {
      expect(all).toContain(word)
    }
  })
})
