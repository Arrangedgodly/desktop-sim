import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CONTENT_SCHEMA_VERSION,
  ContentError,
  isContentError,
  normalizeAuthorPack,
  parseAuthorPack,
  PLACEHOLDER_MARK,
} from './schema'

/** A minimal-but-complete pack: exactly the required fields, nothing else. */
const MINIMAL = {
  version: 1,
  author: { name: 'A. Officer', tagline: 'Surveys things.', bio: 'Two sentences.' },
  projects: [
    { id: 'exhibit-01', name: 'Thing', description: 'Does a thing.', tech: ['React', 'Vite'] },
  ],
}

describe('MF-3 · schema validates a well-formed author.json', () => {
  it('accepts the shipped example fixture (content/author.example.json)', () => {
    const raw = readFileSync(
      fileURLToPath(new URL('../../../content/author.example.json', import.meta.url)),
      'utf8',
    )
    const pack = parseAuthorPack(raw)
    expect(pack.version).toBe(CONTENT_SCHEMA_VERSION)
    expect(pack.author.name).toMatch(/\[YOUR NAME\]/)
    expect(pack.projects.map((project) => project.id)).toEqual(['exhibit-01', 'exhibit-02'])
  })

  it('accepts the minimal honest pack and backfills every optional field', () => {
    const pack = normalizeAuthorPack(MINIMAL)
    expect(pack.author.handle).toBe('')
    expect(pack.author.links).toEqual([])
    expect(pack.author.skills).toEqual([])
    expect(pack.author.interests).toEqual([])
    expect(pack.projects[0]!.liveUrl).toBe('')
    expect(pack.projects[0]!.story).toBe('')
  })

  it('derives link kind from the address (mailto → email, else web)', () => {
    const pack = normalizeAuthorPack({
      ...MINIMAL,
      author: {
        ...MINIMAL.author,
        links: [
          { label: 'Email', url: 'mailto:you@example.com' },
          { label: 'GitHub', url: 'https://github.com/your-name' },
        ],
      },
    })
    expect(pack.author.links[0]).toEqual({
      label: 'Email',
      url: 'mailto:you@example.com',
      kind: 'email',
    })
    expect(pack.author.links[1]!.kind).toBe('web')
  })

  it('returns frozen packs (consumers cannot mutate the manifest)', () => {
    const pack = normalizeAuthorPack(MINIMAL)
    expect(Object.isFrozen(pack)).toBe(true)
    expect(Object.isFrozen(pack.author)).toBe(true)
    expect(() => {
      ;(pack.author as { name: string }).name = 'someone else'
    }).toThrow()
  })
})

describe('MF-3 · schema rejects malformed packs', () => {
  const cases: readonly [string, unknown][] = [
    ['not an object', 'nope'],
    ['wrong version', { ...MINIMAL, version: 2 }],
    ['missing author', { version: 1, projects: [] }],
    ['empty name', { ...MINIMAL, author: { ...MINIMAL.author, name: '   ' } }],
    ['missing bio', { version: 1, author: { name: 'X', tagline: 'Y' }, projects: [] }],
    [
      'bad project id',
      { ...MINIMAL, projects: [{ id: 'Exhibit 1', name: 'X', description: 'Y', tech: ['a'] }] },
    ],
    [
      'duplicate project ids',
      {
        version: 1,
        author: MINIMAL.author,
        projects: [
          { id: 'exhibit-01', name: 'A', description: 'a', tech: ['t'] },
          { id: 'exhibit-01', name: 'B', description: 'b', tech: ['t'] },
        ],
      },
    ],
    [
      'tech must be a non-empty list',
      { ...MINIMAL, projects: [{ ...MINIMAL.projects[0], tech: [] }] },
    ],
    ['tech wrong type', { ...MINIMAL, projects: [{ ...MINIMAL.projects[0], tech: 'React' }] }],
    [
      'relative url',
      { ...MINIMAL, projects: [{ ...MINIMAL.projects[0], liveUrl: 'github.com/me/x' }] },
    ],
    [
      'script url',
      { ...MINIMAL, projects: [{ ...MINIMAL.projects[0], repoUrl: 'javascript:alert(1)' }] },
    ],
  ]

  for (const [label, input] of cases) {
    it(`throws ContentError('invalid-pack') on ${label}`, () => {
      expect(() => normalizeAuthorPack(input)).toThrowError(ContentError)
      try {
        normalizeAuthorPack(input)
      } catch (error) {
        if (!isContentError(error))
          throw new Error(`expected ContentError on ${label}`, { cause: error })
        expect(error.code).toBe('invalid-pack')
      }
    })
  }

  it(`throws ContentError('invalid-json') on non-JSON text`, () => {
    try {
      parseAuthorPack('{not json')
    } catch (error) {
      if (!isContentError(error)) throw new Error('expected ContentError', { cause: error })
      expect(error.code).toBe('invalid-json')
      return
    }
    expect.unreachable('parseAuthorPack should have thrown')
  })

  it('caps links at 4 and projects at 6 (the template ceilings)', () => {
    const fiveLinks = Array.from({ length: 5 }, () => ({ label: 'L', url: 'https://a.b' }))
    expect(() =>
      normalizeAuthorPack({ ...MINIMAL, author: { ...MINIMAL.author, links: fiveLinks } }),
    ).toThrowError(ContentError)
    const sevenProjects = Array.from({ length: 7 }, (_, i) => ({
      id: `exhibit-0${i}`,
      name: 'P',
      description: 'p',
      tech: ['t'],
    }))
    expect(() => normalizeAuthorPack({ ...MINIMAL, projects: sevenProjects })).toThrowError(
      ContentError,
    )
  })
})

describe('MF-3 · example fixture honesty', () => {
  it('carries only placeholder values — no fabricated facts, no junk', () => {
    const raw = readFileSync(
      fileURLToPath(new URL('../../../content/author.example.json', import.meta.url)),
      'utf8',
    )
    expect(raw).toContain(PLACEHOLDER_MARK)
    expect(raw).not.toContain('undefined')
    // the reserved example domain is the only allowed hostname in placeholders
    expect(raw).not.toMatch(/https?:\/\/(?!example\.com)[a-z]/)
  })
})
