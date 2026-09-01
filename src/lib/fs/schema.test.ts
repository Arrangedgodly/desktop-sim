import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  fromEnvelope,
  migrate,
  toEnvelope,
  validateEnvelope,
} from './schema'
import { FSError, isFSError } from './errors'
import { createNode, findNode } from './ops'
import { seedEnvelope, seedFSState } from './seed'
import type { FSState } from './types'

function expectCode(block: () => unknown, code: string): FSError {
  try {
    block()
  } catch (error) {
    expect(isFSError(error)).toBe(true)
    expect((error as FSError).code).toBe(code)
    return error as FSError
  }
  throw new Error(`expected FSError(${code}), but nothing was thrown`)
}

/** The IM-2 fs-store placeholder shape at v0 (flat, label-less). */
function v0Placeholder(): unknown {
  return {
    version: 0,
    rootId: 'root',
    nodes: {
      root: { id: 'root', parentId: null, name: 'Archive', kind: 'folder' },
      drawer: { id: 'drawer', parentId: 'root', name: 'drawer-03', kind: 'folder' },
      note: { id: 'note', parentId: 'root', name: 'plate-07.txt', kind: 'text' },
      plate: { id: 'plate', parentId: 'drawer', name: 'plate-08.png', kind: 'image' },
      link: { id: 'link', parentId: 'drawer', name: 'Viewer', kind: 'app-link' },
    },
    iconPositions: { note: { x: 4, y: 2 } },
  }
}

describe('schema · version constant', () => {
  it('writes schema v1', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1)
  })
})

describe('schema · migrate v0 → v1 (the pattern proof)', () => {
  it('wraps the flat placeholder into the envelope and stamps savedAt', () => {
    const migrated = migrate(v0Placeholder())
    expect(migrated.version).toBe(1)
    expect(migrated.savedAt).toBe(0)
    expect(migrated.fs.rootId).toBe('root')
    expect(Object.keys(migrated.fs.nodes)).toEqual(['root', 'drawer', 'note', 'plate', 'link'])
    expect(migrated.iconPositions).toEqual({ note: { x: 4, y: 2 } })
  })

  it('backfills catalog labels: accession series per kind, root ARC-0000', () => {
    const migrated = migrate(v0Placeholder())
    expect(migrated.fs.nodes['root']!.accession).toBe('ARC-0000')
    expect(migrated.fs.nodes['drawer']!.accession).toBe('DRW-0001')
    expect(migrated.fs.nodes['note']!.accession).toBe('SPC-0001')
    expect(migrated.fs.nodes['plate']!.accession).toBe('PLT-0001')
    expect(migrated.fs.nodes['link']!.accession).toBe('MOD-0001')
    for (const node of Object.values(migrated.fs.nodes)) {
      expect(node.accessionedAt).toBe(0)
    }
  })

  it('backfills kind-specific fields and the migrated envelope validates', () => {
    const migrated = migrate(v0Placeholder())
    expect(migrated.fs.nodes['note']).toMatchObject({ kind: 'text', content: '' })
    expect(migrated.fs.nodes['plate']).toMatchObject({ kind: 'image', src: '' })
    expect(migrated.fs.nodes['link']).toMatchObject({ kind: 'app-link', appId: '' })
    expect(() => validateEnvelope(migrated)).not.toThrow()
  })

  it('allocation in migration is monotonic within a series', () => {
    const v0 = v0Placeholder() as { nodes: Record<string, unknown> }
    v0.nodes['note2'] = { id: 'note2', parentId: 'root', name: 'second.txt', kind: 'text' }
    const migrated = migrate(v0)
    expect(migrated.fs.nodes['note']!.accession).toBe('SPC-0001')
    expect(migrated.fs.nodes['note2']!.accession).toBe('SPC-0002')
  })
})

describe('schema · migrate guards', () => {
  it('passes a current-version envelope through untouched', () => {
    const envelope = seedEnvelope()
    expect(migrate(envelope)).toEqual(envelope)
  })

  it('refuses a FUTURE version with a typed error', () => {
    const error = expectCode(
      () => migrate({ version: CURRENT_SCHEMA_VERSION + 1, fs: {}, iconPositions: {}, savedAt: 0 }),
      'unknown-schema-version',
    )
    expect(error.message).toContain('newer console')
  })

  it('refuses unreadable and negative versions', () => {
    expectCode(
      () => migrate({ version: 'one', fs: {}, iconPositions: {}, savedAt: 0 }),
      'unknown-schema-version',
    )
    expectCode(
      () => migrate({ version: -1, fs: {}, iconPositions: {}, savedAt: 0 }),
      'unknown-schema-version',
    )
    expectCode(
      () => migrate({ version: 1.5, fs: {}, iconPositions: {}, savedAt: 0 }),
      'unknown-schema-version',
    )
  })

  it('refuses non-object input', () => {
    expectCode(() => migrate(null), 'invalid-envelope')
    expectCode(() => migrate('nonsense'), 'invalid-envelope')
  })

  it('a v0 envelope with a malformed node is rejected, not silently reset', () => {
    const v0 = v0Placeholder() as { nodes: Record<string, unknown> }
    v0.nodes['broken'] = { id: 'broken', parentId: 'root', name: 'x', kind: 'specimen' }
    expectCode(() => migrate(v0), 'invalid-envelope')
  })
})

describe('schema · validateEnvelope (corruption detection for MF-2)', () => {
  it('accepts the seed envelope', () => {
    expect(() => validateEnvelope(seedEnvelope())).not.toThrow()
  })

  it('rejects structural corruption with typed errors', () => {
    const good = seedEnvelope()
    expectCode(() => validateEnvelope({ ...good, version: 99 }), 'invalid-envelope')
    expectCode(() => validateEnvelope({ ...good, fs: undefined }), 'invalid-envelope')
    expectCode(() => validateEnvelope({ ...good, savedAt: 'yesterday' }), 'invalid-envelope')

    const nodesWithoutRoot = Object.fromEntries(
      Object.entries(good.fs.nodes).filter(([id]) => id !== 'root'),
    )
    const noRoot = { ...good, fs: { ...good.fs, nodes: nodesWithoutRoot } }
    expectCode(() => validateEnvelope(noRoot), 'invalid-envelope')

    const dangling = {
      ...good,
      fs: {
        ...good.fs,
        nodes: {
          ...good.fs.nodes,
          stray: {
            id: 'stray',
            parentId: 'ghost',
            name: 's',
            kind: 'folder',
            accession: 'DRW-9999',
            accessionedAt: 0,
          },
        },
      },
    }
    expectCode(() => validateEnvelope(dangling), 'invalid-envelope')

    const orphanPosition = {
      ...good,
      iconPositions: { ...good.iconPositions, ghost: { x: 0, y: 0 } },
    }
    expectCode(() => validateEnvelope(orphanPosition), 'invalid-envelope')
  })
})

describe('schema · envelope round-trip', () => {
  it('state → envelope → state is lossless', () => {
    const state = seedFSState()
    const restored = fromEnvelope(toEnvelope(state, 42))
    expect(restored).toEqual(state)
    expect(toEnvelope(state, 42).savedAt).toBe(42)
  })

  it('toEnvelope stamps the current version', () => {
    expect(toEnvelope(seedFSState()).version).toBe(CURRENT_SCHEMA_VERSION)
    expect(typeof toEnvelope(seedFSState()).savedAt).toBe('number')
  })

  it('survives a JSON wire round-trip and re-migrates (MF-2’s actual path)', () => {
    const onTheWire = JSON.parse(JSON.stringify(seedEnvelope()))
    const migrated = migrate(onTheWire)
    expect(() => validateEnvelope(migrated)).not.toThrow()
    expect(fromEnvelope(migrated)).toEqual(seedFSState())
  })

  it('an evolved tree still round-trips after mutations', () => {
    let state: FSState = seedFSState()
    state = createNode(state, { parentId: 'root', name: 'new-drawer', kind: 'folder', id: 'nd' })
    state = createNode(state, {
      parentId: 'nd',
      name: 'note.txt',
      kind: 'text',
      id: 'nn',
      content: 'hi',
    })

    const restored = fromEnvelope(migrate(JSON.parse(JSON.stringify(toEnvelope(state, 7)))))
    expect(findNode(restored, 'nn')).toMatchObject({ name: 'note.txt', content: 'hi' })
    expect(restored).toEqual(state)
  })
})
