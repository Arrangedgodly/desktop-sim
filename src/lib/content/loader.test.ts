import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultAuthorPack } from './default'
import { getContent, getContentSource, isPlaceholderContent, resolveContent } from './loader'
import { parseAuthorPack, PLACEHOLDER_MARK } from './schema'

const repoPackPath = fileURLToPath(new URL('../../../content/author.json', import.meta.url))

/** A valid, real-looking pack the fill task might produce. */
const FILLED_JSON = JSON.stringify({
  version: 1,
  author: {
    name: 'Rosa Vega',
    tagline: 'Maps for places that do not exist',
    bio: 'Cartographer of imaginary terrain. I build small web toys that let people wander.',
    links: [{ label: 'Email', url: 'mailto:rosa@example.com' }],
  },
  projects: [
    {
      id: 'exhibit-01',
      name: 'Atlas of Nowhere',
      description: 'A browsable atlas of procedurally drawn islands.',
      tech: ['Canvas', 'TypeScript'],
      liveUrl: 'https://atlas.example.com',
    },
  ],
})

describe('MF-3 · resolveContent (the fallback policy)', () => {
  it('serves the placeholder pack when no file is embedded', () => {
    const resolved = resolveContent(null)
    expect(resolved.source).toBe('default')
    expect(resolved.pack).toBe(defaultAuthorPack)
  })

  it('serves the placeholder pack when the file is not JSON', () => {
    const resolved = resolveContent('{oops')
    expect(resolved.source).toBe('default')
    expect(resolved.pack).toBe(defaultAuthorPack)
  })

  it('serves the placeholder pack when the file is structurally invalid', () => {
    const resolved = resolveContent(JSON.stringify({ version: 1, author: 'Rosa' }))
    expect(resolved.source).toBe('default')
    expect(resolved.pack).toBe(defaultAuthorPack)
  })

  it('serves a parsed pack when the file is well-formed', () => {
    const resolved = resolveContent(FILLED_JSON)
    expect(resolved.source).toBe('pack')
    expect(resolved.pack.author.name).toBe('Rosa Vega')
    expect(resolved.pack.projects[0]!.liveUrl).toBe('https://atlas.example.com')
  })
})

describe('MF-3 · getContent (the single read seam)', () => {
  it('never throws and returns a frozen, validated pack', () => {
    const pack = getContent()
    expect(Object.isFrozen(pack)).toBe(true)
    expect(pack.version).toBe(1)
  })

  it('is stable across calls (same manifest object)', () => {
    expect(getContent()).toBe(getContent())
  })

  it("source is honest: 'default' while author.json is absent, 'pack' once it lands", () => {
    // Future-proofs the fill task: dropping content/author.json in must flip
    // the source (and this assertion still holds); until then, placeholders.
    if (existsSync(repoPackPath)) {
      expect(getContentSource()).toBe('pack')
      expect(isPlaceholderContent()).toBe(false)
    } else {
      expect(getContentSource()).toBe('default')
      expect(isPlaceholderContent()).toBe(true)
    }
  })
})

describe('MF-3 · placeholder honesty (no fabricated facts, no leaks)', () => {
  const serialized = JSON.stringify(defaultAuthorPack)

  it('no placeholder string leaks the word UNDEFINED (or NaN / null junk)', () => {
    expect(serialized).not.toContain('undefined')
    expect(serialized).not.toContain('NaN')
    expect(serialized).not.toContain(':null')
  })

  it('every required human-facing field is non-empty and marked REPLACE-VIA-CONTENT-PACK', () => {
    const { author } = defaultAuthorPack
    for (const field of [author.name, author.tagline, author.bio]) {
      expect(field.length).toBeGreaterThan(0)
      expect(field).toContain(PLACEHOLDER_MARK)
    }
    for (const project of defaultAuthorPack.projects) {
      expect(project.name).toContain(PLACEHOLDER_MARK)
      expect(project.description).toContain(PLACEHOLDER_MARK)
      expect(project.tech.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('absent-by-design fields stay empty instead of faked (no placeholder URLs)', () => {
    expect(defaultAuthorPack.author.links).toEqual([])
    expect(defaultAuthorPack.author.missionLog).toBe('')
    for (const project of defaultAuthorPack.projects) {
      expect(project.liveUrl).toBe('')
      expect(project.repoUrl).toBe('')
    }
  })

  it('the default pack is itself a valid pack file (serialize → parse → equal)', () => {
    expect(parseAuthorPack(JSON.stringify(defaultAuthorPack))).toEqual(defaultAuthorPack)
  })
})
