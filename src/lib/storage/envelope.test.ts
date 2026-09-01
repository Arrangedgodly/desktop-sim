import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type FSNode } from '../fs'
import type { WindowRecord } from '../../platform/stores/wm-store'
import { StorageError, classifyStorageError, isStorageError, type StorageErrorKind } from './errors'
import { seedStoredState } from './stored-state'
import { readStoredState, sanitizeSettings, sanitizeWindows } from './validate'
import type { StoredState } from './types'

/** Run `fn`, expect it to throw a StorageError of exactly `kind`. */
function expectKind(kind: StorageErrorKind, fn: () => unknown): void {
  try {
    fn()
  } catch (error) {
    expect(isStorageError(error), `threw ${String(error)} instead of a StorageError`).toBe(true)
    expect((error as StorageError).kind).toBe(kind)
    return
  }
  throw new Error(`expected fn to throw a StorageError('${kind}')`)
}

describe('readStoredState · current-version envelopes', () => {
  it('accepts a pristine seed envelope unchanged (round-trip shape)', () => {
    const seed = seedStoredState()
    expect(readStoredState(seed)).toEqual(seed)
  })

  it('accepts a session-carrying envelope (windows + settings survive)', () => {
    const state: StoredState = {
      ...seedStoredState(),
      windows: [
        {
          id: 'w1',
          appId: 'notepad',
          instanceId: 'file:spc-0001',
          geometry: { x: 10, y: 20, w: 400, h: 300 },
          z: 3,
          minimized: false,
          maximized: true,
          title: 'note',
          launch: { source: 'file', file: { id: 'spc-0001' } as unknown as FSNode },
          openedAt: 42,
        },
      ],
      settings: { wallpaper: 'phytograph', soundsEnabled: true, reducedMotionFollow: false },
    }
    expect(readStoredState(state)).toEqual(state)
  })

  it('rides CURRENT_SCHEMA_VERSION as the whole-envelope version', () => {
    expect(seedStoredState().version).toBe(CURRENT_SCHEMA_VERSION)
  })
})

describe('readStoredState · corruption → typed StorageError', () => {
  it.each([
    ['a string blob', '{"version":1,'],
    ['null', null],
    ['a number', 42],
    ['an array', [1, 2, 3]],
  ])('rejects %s as corrupt', (_label, raw) => {
    expectKind('corrupt', () => readStoredState(raw))
  })

  it('rejects a v1 envelope whose catalog is structurally broken (missing root)', () => {
    const broken = { ...seedStoredState(), fs: { rootId: 'root', nodes: {} } }
    expectKind('corrupt', () => readStoredState(broken))
  })

  it('rejects a v1 envelope with a dangling parentId', () => {
    const seed = seedStoredState()
    const nodes = { ...seed.fs.nodes }
    nodes['charter'] = { ...nodes['charter']!, parentId: 'ghost-drawer' }
    expectKind('corrupt', () => readStoredState({ ...seed, fs: { rootId: 'root', nodes } }))
  })

  it('keeps the catalog but degrades a junk windows slice (never nukes user data)', () => {
    const seed = seedStoredState()
    const out = readStoredState({ ...seed, windows: 'not-an-array' })
    expect(out.windows).toEqual([])
    expect(out.fs).toEqual(seed.fs)
  })
})

describe('readStoredState · unknown versions → typed unknown-version', () => {
  it.each([
    ['unreadable string version', { version: 'one' }],
    ['negative version', { version: -1 }],
    ['fractional version', { version: 1.5 }],
    ['missing version', {}],
    ['future version (newer console)', { ...seedStoredState(), version: 99 }],
  ])('throws StorageError(unknown-version) for %s', (_label, raw) => {
    expectKind('unknown-version', () => readStoredState(raw))
  })
})

describe('readStoredState · v0 → migrate → v1 (MF-1 chain through the whole envelope)', () => {
  const V0_RAW = {
    version: 0,
    rootId: 'root',
    nodes: {
      root: { id: 'root', parentId: null, name: 'Hold', kind: 'folder' },
      a: { id: 'a', parentId: 'root', name: 'a.txt', kind: 'text' },
      b: { id: 'b', parentId: 'root', name: 'b.png', kind: 'image' },
    },
    iconPositions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
  }

  it('wraps the flat v0 tree into the v1 envelope and backfills accession labels', () => {
    const out = readStoredState(V0_RAW)
    expect(out.version).toBe(1)
    expect(out.fs.rootId).toBe('root')
    expect(out.fs.nodes['root']!.accession).toBe('ARC-0000')
    expect(out.fs.nodes['root']!.accessionedAt).toBe(0)
    const a = out.fs.nodes['a']!
    expect(a.kind).toBe('text')
    expect(a.accession).toMatch(/^SPC-\d{4}$/)
    if (a.kind === 'text') expect(a.content).toBe('')
    expect(out.fs.nodes['b']!.accession).toMatch(/^PLT-\d{4}$/)
    expect(out.iconPositions).toEqual(V0_RAW.iconPositions)
  })

  it('gives v0 sessions empty windows and default settings (v0 predates both)', () => {
    const out = readStoredState({
      ...V0_RAW,
      windows: [{ junk: true }],
      settings: { wallpaper: 7 },
    })
    expect(out.windows).toEqual([])
    expect(out.settings).toEqual({
      wallpaper: 'star-chart',
      soundsEnabled: false,
      reducedMotionFollow: true,
    })
  })
})

describe('sanitizeWindows · per-entry degradation', () => {
  const base = {
    id: 'w1',
    appId: 'notepad',
    geometry: { x: 0, y: 0, w: 320, h: 200 },
  }

  it('keeps a well-formed record verbatim', () => {
    const record = {
      ...base,
      instanceId: 'singleton',
      z: 9,
      minimized: true,
      maximized: false,
      title: 't',
      openedAt: 5,
    }
    expect(sanitizeWindows([record])).toEqual([record])
  })

  it('backfills optional fields on keepers (instanceId/z/title/openedAt/launch)', () => {
    const [restored] = sanitizeWindows([{ ...base }]) as [WindowRecord]
    expect(restored).toMatchObject({
      id: 'w1',
      appId: 'notepad',
      instanceId: 'auto:w1',
      z: 0,
      minimized: false,
      maximized: false,
      title: 'notepad',
      openedAt: 0,
    })
    expect(restored.launch).toBeUndefined()
  })

  it('drops entries missing id/appId or with unusable geometry, and dedupes ids', () => {
    const out = sanitizeWindows([
      'junk',
      { appId: 'x', geometry: { x: 0, y: 0, w: 1, h: 1 } }, // no id
      { id: 'w2', geometry: { x: 0, y: 0, w: 1, h: 1 } }, // no appId
      { id: 'w3', appId: 'x', geometry: { x: 'a', y: 0, w: 1, h: 1 } }, // bad geometry
      { ...base, id: 'w4' },
      { ...base, id: 'w4' }, // duplicate id — second is dropped
    ])
    expect(out.map((w) => w.id)).toEqual(['w4'])
  })

  it('narrow launch contexts: launcher kept, file kept with its snapshot, junk degrades', () => {
    const [a, b, c] = sanitizeWindows([
      { ...base, launch: { source: 'launcher' } },
      { ...base, id: 'w2', launch: { source: 'file', file: { id: 'spc-0007', name: 'n.txt' } } },
      { ...base, id: 'w3', launch: { source: 'wormhole' } },
    ])
    expect(a!.launch).toEqual({ source: 'launcher' })
    expect(b!.launch).toMatchObject({ source: 'file', file: { id: 'spc-0007' } })
    expect(c!.launch).toBeUndefined()
  })
})

describe('sanitizeSettings · per-field defaults', () => {
  it('non-record input → defaults (sounds stay muted)', () => {
    expect(sanitizeSettings(undefined)).toEqual({
      wallpaper: 'star-chart',
      soundsEnabled: false,
      reducedMotionFollow: true,
    })
  })

  it('junk fields fall back individually; valid fields survive', () => {
    expect(
      sanitizeSettings({ wallpaper: 5, soundsEnabled: 'yes', reducedMotionFollow: false }),
    ).toEqual({
      wallpaper: 'star-chart',
      soundsEnabled: false,
      reducedMotionFollow: false,
    })
    expect(sanitizeSettings({ wallpaper: 'graticule', soundsEnabled: true })).toEqual({
      wallpaper: 'graticule',
      soundsEnabled: true,
      reducedMotionFollow: true,
    })
  })
})

describe('classifyStorageError · typed classification', () => {
  it('recognizes QuotaExceededError (name and legacy code 22)', () => {
    expect(classifyStorageError(new DOMException('full', 'QuotaExceededError')).kind).toBe('quota')
    const legacy = Object.assign(new Error('old gecko'), {
      code: 22,
      name: 'NS_ERROR_DOM_QUOTA_REACHED',
    })
    expect(classifyStorageError(legacy).kind).toBe('quota')
  })

  it('everything else from the IDB machinery degrades to unavailable', () => {
    expect(classifyStorageError(new DOMException('blocked', 'SecurityError')).kind).toBe(
      'unavailable',
    )
    expect(classifyStorageError(new Error('boom')).kind).toBe('unavailable')
  })

  it('passes already-typed StorageErrors through untouched', () => {
    const typed = new StorageError('corrupt', 'keep me')
    expect(classifyStorageError(typed)).toBe(typed)
  })
})
