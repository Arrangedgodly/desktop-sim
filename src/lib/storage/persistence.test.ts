// @vitest-environment jsdom
// Full boot orchestration against REAL fake-indexeddb (structured clone,
// transactions) + jsdom localStorage (boot flag). Every failure path in the
// dispatch validation list lives here: corruption, quota, unavailability
// (private browsing), v0 migration, unknown versions, reset, flag divergence.
import 'fake-indexeddb/auto'
import { get as idbGet, set as idbSet, createStore } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNode, fromEnvelope, toEnvelope, type FSTextNode } from '../fs'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { BACKUP_KEY, IDBStorageAdapter, STATE_KEY } from './adapter'
import { StorageError } from './errors'
import { attachAutosave, stopAutosave } from './autosave'
import { bootPersistence, resetDesktop } from './persistence'
import { buildStoredState, hydrateStores, seedStoredState } from './stored-state'
import { useStorageStatusStore } from './status'
import { readBootFlag } from './boot-flag'
import type { StorageAdapter, StoredState } from './types'

/* --------------------------- fixtures ----------------------------------- */

let dbCount = 0
function freshAdapter(): { adapter: IDBStorageAdapter; store: ReturnType<typeof createStore> } {
  const store = createStore(`ds-boot-test-${++dbCount}`, 'state')
  return { adapter: new IDBStorageAdapter({ store }), store }
}

/** A valid envelope carrying a distinctive marker node (backup-identity checks). */
function stateWithMarker(id = 'marker'): StoredState {
  const seeded = seedStoredState()
  const withNode = createNode(fromEnvelope(seeded), {
    id,
    parentId: 'root',
    name: `${id}.txt`,
    kind: 'text',
    now: 500,
  })
  return { ...toEnvelope(withNode, 100), windows: [], settings: seeded.settings }
}

class UnavailableAdapter implements StorageAdapter {
  saves = 0
  async load(): Promise<never> {
    throw new StorageError('unavailable', 'test: idb blocked (private mode)')
  }
  async save(): Promise<never> {
    this.saves += 1
    throw new StorageError('unavailable', 'test: idb blocked (private mode)')
  }
  async saveBackup(): Promise<void> {}
  async loadBackup(): Promise<never> {
    throw new StorageError('unavailable', 'test: idb blocked (private mode)')
  }
  async clear(): Promise<never> {
    throw new StorageError('unavailable', 'test: idb blocked (private mode)')
  }
}

class QuotaSaveAdapter implements StorageAdapter {
  async load(): Promise<null> {
    return null
  }
  async save(): Promise<never> {
    throw new DOMException('disk full', 'QuotaExceededError')
  }
  async saveBackup(): Promise<void> {}
  async loadBackup(): Promise<null> {
    return null
  }
  async clear(): Promise<void> {}
}

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()
const initialStatus = useStorageStatusStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true)
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  useStorageStatusStore.setState(initialStatus, true)
  stopAutosave()
  localStorage.clear()
})

afterEach(() => {
  stopAutosave()
})

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/* ----------------------------- boot ------------------------------------- */

describe('bootPersistence · first visit', () => {
  it('seeds the placeholder catalog, persists it, writes the boot flag, surfaces no recovery', async () => {
    const { adapter } = freshAdapter()
    const result = await bootPersistence({ adapter, autosave: false, now: () => 777 })

    expect(result.origin).toBe('seed')
    expect(result.firstVisit).toBe(true)
    expect(result.state).toEqual(seedStoredState())

    // Stores hydrated from the seed.
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined()
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)

    // UI-2 seam: the flag now says "return visit next time".
    expect(readBootFlag()).toEqual({ seen: true, version: 1 })

    // The seed was persisted (savedAt stamped per write) — this is what a
    // first-visit reload will find.
    const persisted = await adapter.load()
    expect(persisted?.version).toBe(1)
    expect(persisted?.savedAt).toBe(777)
    expect(persisted?.fs).toEqual(seedStoredState().fs)

    const status = useStorageStatusStore.getState()
    expect(status.phase).toBe('ready')
    expect(status.firstVisit).toBe(true)
    expect(status.bootOrigin).toBe('seed')
    expect(status.recovery).toBeNull() // a first-visit seed is normal, not a recovery
    expect(status.saveCount).toBe(1)
  })
})

describe('bootPersistence · return visit (round trip save → load → hydrate)', () => {
  it('restores the mutated fs, window session (with launch context) and settings', async () => {
    const { adapter } = freshAdapter()
    await bootPersistence({ adapter, autosave: false })

    // A real session: a new specimen, a notepad window opened against it,
    // wallpaper + sounds changed. Autosave persists it (delayMs tiny).
    const handle = attachAutosave({ adapter, delayMs: 10 })
    const fs = useFSStore.getState().fs
    const commit = useFSStore.getState().commit
    commit(
      createNode(fs, {
        id: 'note-x',
        parentId: 'root',
        name: 'note-x.txt',
        kind: 'text',
        now: 1,
        content: 'edited',
      }),
    )
    const node = useFSStore.getState().fs.nodes['note-x']!
    useWMStore.getState().openWindow({
      appId: 'notepad',
      instanceId: 'file:note-x',
      title: 'note-x.txt',
      launch: { source: 'file', file: node },
    })
    useSettingsStore.getState().setWallpaper('phytograph')
    useSettingsStore.getState().setSoundsEnabled(true)
    useSettingsStore.getState().dismissDocent() // UI-3: docent seen once, forever
    await sleep(40)
    await handle.flush()

    // "Reload": re-boot from the same storage.
    const second = await bootPersistence({ adapter, autosave: false })

    expect(second.origin).toBe('stored')
    expect(second.firstVisit).toBe(false) // boot flag short-circuit verdict for UI-2
    expect(second.state.windows).toHaveLength(1)
    expect(second.state.windows[0]!.launch).toMatchObject({
      source: 'file',
      file: { id: 'note-x' },
    })
    expect(second.state.settings).toEqual({
      wallpaper: 'phytograph',
      soundsEnabled: true,
      reducedMotionFollow: true,
      docentDismissed: true,
    })

    // Hydrated into the stores.
    expect((useFSStore.getState().fs.nodes['note-x'] as FSTextNode).content).toBe('edited')
    const restoredWindow = Object.values(useWMStore.getState().windows)[0]!
    expect(restoredWindow.appId).toBe('notepad')
    expect(restoredWindow.launch?.source).toBe('file')
    expect(useSettingsStore.getState().wallpaper).toBe('phytograph')
    expect(useSettingsStore.getState().docentDismissed).toBe(true) // the docent never returns
    expect(useStorageStatusStore.getState().recovery).toBeNull()
  })
})

describe('bootPersistence · corruption → recovery path to seed', () => {
  it('a torn string blob under the state key reseeds + self-heals + surfaces a notice', async () => {
    const { adapter, store } = freshAdapter()
    await idbSet(STATE_KEY, '{"version":1,"fs":"torn', store)

    const result = await bootPersistence({ adapter, autosave: false })

    expect(result.origin).toBe('seed')
    const status = useStorageStatusStore.getState()
    expect(status.recovery?.kind).toBe('reseeded')
    expect(status.recovery?.message).toBeTruthy()
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined() // seeded

    // Self-healed: the main key now holds a valid seed envelope again.
    expect((await adapter.load())?.fs).toEqual(seedStoredState().fs)
    // The boot flag is written — the recovery happened, the console is usable.
    expect(readBootFlag()).toEqual({ seen: true, version: 1 })

    // HU-1 seam: the notice is dismissable state.
    useStorageStatusStore.getState().dismissRecovery()
    expect(useStorageStatusStore.getState().recovery).toBeNull()
  })

  it('a structurally broken v1 envelope (missing root) reseeds the same way', async () => {
    const { adapter, store } = freshAdapter()
    await idbSet(STATE_KEY, { ...seedStoredState(), fs: { rootId: 'root', nodes: {} } }, store)

    const result = await bootPersistence({ adapter, autosave: false })

    expect(result.origin).toBe('seed')
    expect(useStorageStatusStore.getState().recovery?.kind).toBe('reseeded')
  })

  it('a good pre-migration backup is restored and promoted over the corrupt state', async () => {
    const { adapter, store } = freshAdapter()
    const backup = stateWithMarker('backup-marker')
    await adapter.saveBackup(backup)
    await idbSet(STATE_KEY, 42, store) // corrupt main key

    const result = await bootPersistence({ adapter, autosave: false, now: () => 888 })

    expect(result.origin).toBe('backup')
    expect(useStorageStatusStore.getState().recovery?.kind).toBe('restored-from-backup')
    // Hydrated from the BACKUP (marker node present), not a bare seed.
    expect(useFSStore.getState().fs.nodes['backup-marker']).toBeDefined()
    // Promoted: the main key now holds the restored envelope, stamped per write.
    const promoted = await adapter.load()
    expect(promoted?.fs.nodes['backup-marker']).toBeDefined()
    expect(promoted?.savedAt).toBe(888)
  })
})

describe('bootPersistence · unknown schema version', () => {
  it('throws typed from readStoredState and load() surfaces it as a recovery (reseed)', async () => {
    const { adapter, store } = freshAdapter()
    // A future console's envelope: unreadable here, but structurally intact.
    const future = { ...stateWithMarker('future-marker'), version: 99 }
    await idbSet(STATE_KEY, future, store)

    const result = await bootPersistence({ adapter, autosave: false })

    expect(result.origin).toBe('seed')
    expect(useStorageStatusStore.getState().recovery?.kind).toBe('unknown-version')
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined()

    // The newer console's data was preserved as the backup before reseeding.
    const preserved = (await idbGet(BACKUP_KEY, store)) as StoredState
    expect(preserved.version).toBe(99)
    expect(preserved.fs.nodes['future-marker']).toBeDefined()
  })
})

describe('bootPersistence · v0 envelope → migrate → v1 hydrate', () => {
  it('steps the flat v0 tree through MF-1’s chain, backs up the raw v0, writes v1 forward', async () => {
    const { adapter, store } = freshAdapter()
    const v0 = {
      version: 0,
      rootId: 'root',
      nodes: {
        root: { id: 'root', parentId: null, name: 'Hold', kind: 'folder' },
        a: { id: 'a', parentId: 'root', name: 'a.txt', kind: 'text' },
      },
      iconPositions: { a: { x: 0, y: 0 } },
    }
    await idbSet(STATE_KEY, v0, store)

    const result = await bootPersistence({ adapter, autosave: false, now: () => 999 })

    expect(result.origin).toBe('migrated')
    expect(result.state.version).toBe(1)
    expect(result.state.fs.nodes['a']!.accession).toMatch(/^SPC-\d{4}$/)
    expect(result.state.windows).toEqual([]) // v0 predates session persistence

    // Hydrated at v1.
    expect(useFSStore.getState().fs.nodes['a']!.accession).toMatch(/^SPC-\d{4}$/)

    // Pre-migration snapshot preserved verbatim…
    expect(await idbGet(BACKUP_KEY, store)).toEqual(v0)
    // …and the migrated envelope written forward with a fresh stamp.
    const migrated = await adapter.load()
    expect(migrated?.version).toBe(1)
    expect(migrated?.savedAt).toBe(999)
    expect(useStorageStatusStore.getState().recovery).toBeNull() // migration is not a failure
  })
})

describe('bootPersistence · unavailable storage (private browsing / blocked IDB)', () => {
  it('seeds in memory, surfaces a notice, skips the flag, attempts no writes', async () => {
    const adapter = new UnavailableAdapter()
    const result = await bootPersistence({ adapter, autosave: false })

    expect(result.origin).toBe('seed')
    expect(useStorageStatusStore.getState().recovery?.kind).toBe('storage-unavailable')
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined() // usable session
    expect(readBootFlag()).toBeNull() // no "return visit" claim when nothing persists
    expect(adapter.saves).toBe(0)

    // The session keeps living in memory; saves keep failing visibly.
    const handle = attachAutosave({ adapter, delayMs: 10 })
    useFSStore
      .getState()
      .commit(
        createNode(useFSStore.getState().fs, {
          id: 'ephemeral',
          parentId: 'root',
          name: 'e.txt',
          kind: 'text',
          now: 1,
        }),
      )
    await sleep(40)
    await handle.flush()

    expect(useStorageStatusStore.getState().lastFailure?.kind).toBe('unavailable')
    expect(useFSStore.getState().fs.nodes['ephemeral']).toBeDefined() // never discarded
  })
})

describe('bootPersistence · quota at boot-persist', () => {
  it('surfaced as a typed failure; the seeded session boots anyway', async () => {
    const adapter = new QuotaSaveAdapter()
    const result = await bootPersistence({ adapter, autosave: false })

    expect(result.origin).toBe('seed')
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined()
    const status = useStorageStatusStore.getState()
    expect(status.phase).toBe('ready') // quota at boot is surfaced, not fatal
    expect(status.lastFailure?.kind).toBe('quota')
    expect(status.recovery).toBeNull()
    expect(readBootFlag()).toEqual({ seen: true, version: 1 })
  })
})

describe('bootPersistence · flag/state divergence (Hulk edge)', () => {
  it('missing flag with existing state hydrates the state — the flag never destroys data', async () => {
    const { adapter } = freshAdapter()
    await adapter.save(stateWithMarker('flag-evicted'))
    localStorage.removeItem('ds:boot') // explicit: flag gone, data present

    const result = await bootPersistence({ adapter, autosave: false })

    expect(result.origin).toBe('stored')
    expect(result.firstVisit).toBe(true) // pacing hint only (UI-2 shows full boot)
    expect(useFSStore.getState().fs.nodes['flag-evicted']).toBeDefined()
    expect(useStorageStatusStore.getState().recovery).toBeNull()
  })
})

/* ----------------------------- reset ------------------------------------ */

describe('resetDesktop · AP-4 Reset seam', () => {
  it('clears storage + backup + flag, reseeds, rehydrates, persists the fresh seed', async () => {
    const { adapter } = freshAdapter()
    await bootPersistence({ adapter, autosave: false })

    // Dirty the console + storage.
    useFSStore
      .getState()
      .commit(
        createNode(useFSStore.getState().fs, {
          id: 'user-file',
          parentId: 'root',
          name: 'u.txt',
          kind: 'text',
          now: 1,
        }),
      )
    useWMStore.getState().openWindow({ appId: 'notepad' })
    useSettingsStore.getState().setWallpaper('graticule')
    await adapter.save(buildStoredState())
    await adapter.saveBackup(stateWithMarker('old-backup'))

    const result = await resetDesktop({ adapter, now: () => 4_242 })

    expect(result.ok).toBe(true)
    expect(result.failure).toBeNull()

    // Storage: exactly the seed, stamped per write.
    const persisted = await adapter.load()
    const seed = seedStoredState()
    expect(persisted).toEqual({ ...seed, savedAt: 4_242 })
    await expect(adapter.loadBackup()).resolves.toBeNull()

    // Stores: reseeded clean.
    expect(useFSStore.getState().fs.nodes['user-file']).toBeUndefined()
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined()
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)
    expect(useSettingsStore.getState().wallpaper).toBe('star-chart')

    // Flag cleared → the NEXT boot paces as a first visit; the persisted state
    // it loads IS the seed (the reset survived the reload).
    expect(readBootFlag()).toBeNull()
    const next = await bootPersistence({ adapter, autosave: false })
    expect(next.firstVisit).toBe(true) // full boot pacing replays (UI-2/UI-3 hints)
    expect(next.state.fs.nodes['user-file']).toBeUndefined()
    expect(next.state.windows).toEqual([])
    expect(next.state.settings.wallpaper).toBe('star-chart')
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined()
    expect(useStorageStatusStore.getState().recovery).toBeNull()
  })

  it('reports ok:false with a typed failure when storage cannot be cleared (private mode)', async () => {
    const adapter = new UnavailableAdapter()
    hydrateStores(stateWithMarker('pre-reset'))
    const result = await resetDesktop({ adapter })

    expect(result.ok).toBe(false)
    expect(result.failure?.kind).toBe('unavailable')
    // The in-memory reset still happened.
    expect(useFSStore.getState().fs.nodes['pre-reset']).toBeUndefined()
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined()
  })
})


/* ============================== HU-2 (j) ================================== */

describe('HU-2 (j) · storage disabled entirely (lockdown: localStorage throws AND IDB blocked)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('idb-keyval')
  })

  it('the OS still boots read-only in memory: seeded, usable, honestly noticed', async () => {
    vi.stubGlobal(
      'localStorage',
      Object.freeze({
        getItem: () => {
          throw new DOMException('denied', 'SecurityError')
        },
        setItem: () => {
          throw new DOMException('denied', 'SecurityError')
        },
        removeItem: () => {
          throw new DOMException('denied', 'SecurityError')
        },
      }),
    )
    const result = await bootPersistence({ adapter: new UnavailableAdapter(), autosave: false })

    expect(result.origin).toBe('seed')
    expect(result.firstVisit).toBe(true) // the throwing flag reads as absent — full POST pacing
    expect(useFSStore.getState().fs.nodes['charter']).toBeDefined() // seeded catalog
    expect(useStorageStatusStore.getState().recovery?.kind).toBe('storage-unavailable')
    expect(readBootFlag()).toBeNull() // no return-visit claim when nothing persists

    // The desktop side still OPERATES: windows open, ops commit, memory-only.
    useWMStore.getState().openWindow({ appId: 'notepad' })
    useFSStore.getState().commit(
      createNode(useFSStore.getState().fs, {
        id: 'lockdown-note',
        parentId: 'root',
        name: 'lockdown.txt',
        kind: 'text',
        now: 1,
      }),
    )
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(1)
    expect(useFSStore.getState().fs.nodes['lockdown-note']).toBeDefined()
    expect(useStorageStatusStore.getState().phase).toBe('ready') // never a crash
  })

  it('a host where even adapter construction throws degrades the default to unavailable', async () => {
    // The module-init guard: if createStore itself throws (no IndexedDB at
    // all), the default adapter must still exist and reject typed — never take
    // the import graph down.
    vi.resetModules()
    vi.doMock('idb-keyval', () => ({
      createStore: () => {
        throw new Error('IndexedDB is not available')
      },
      get: () => Promise.resolve(undefined),
      set: () => Promise.resolve(),
      del: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    }))
    const { defaultIDBAdapter } = await import('./adapter')
    await expect(defaultIDBAdapter.load()).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
