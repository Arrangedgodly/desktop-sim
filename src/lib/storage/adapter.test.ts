// Node environment + fake-indexeddb — exercises the real idb-keyval code path
// (structured clone, transactions, key layout) without a browser.
import 'fake-indexeddb/auto'
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval'
import { beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_KEY, IDBStorageAdapter, STATE_KEY } from './adapter'
import { seedStoredState } from './stored-state'
import type { StoredState } from './types'

// Each test aims its adapter at an isolated fake-indexeddb database (idb-keyval
// keeps one connection per createStore call; same name ⇒ same database).
let dbCount = 0
function freshAdapter(): { adapter: IDBStorageAdapter; store: ReturnType<typeof createStore> } {
  const store = createStore(`ds-adapter-test-${++dbCount}`, 'state')
  return { adapter: new IDBStorageAdapter({ store }), store }
}

describe('IDBStorageAdapter · round trip', () => {
  let ctx: ReturnType<typeof freshAdapter>
  beforeEach(() => {
    ctx = freshAdapter()
  })

  it('save → load returns the same envelope (structured clone round trip)', async () => {
    const state = seedStoredState()
    await ctx.adapter.save(state)
    await expect(ctx.adapter.load()).resolves.toEqual(state)
  })

  it('save stamps nothing — savedAt is the caller’s per-write stamp', async () => {
    const state: StoredState = { ...seedStoredState(), savedAt: 123_456 }
    await ctx.adapter.save(state)
    await expect(ctx.adapter.load()).resolves.toMatchObject({ savedAt: 123_456 })
  })

  it('load resolves null when nothing was persisted (fresh visitor / ITP purge)', async () => {
    await expect(ctx.adapter.load()).resolves.toBeNull()
  })

  it('backup keys are independent of the state key', async () => {
    const state = seedStoredState()
    const older = { ...state, savedAt: 1 }
    await ctx.adapter.save(state)
    await ctx.adapter.saveBackup(older)
    await expect(ctx.adapter.loadBackup()).resolves.toEqual(older)
    await expect(ctx.adapter.load()).resolves.toEqual(state)
  })

  it('clear() removes state AND backup in one call (the Reset seam)', async () => {
    await ctx.adapter.save(seedStoredState())
    await ctx.adapter.saveBackup(seedStoredState())
    await ctx.adapter.clear()
    await expect(ctx.adapter.load()).resolves.toBeNull()
    await expect(ctx.adapter.loadBackup()).resolves.toBeNull()
  })

  it('load returns whatever blob sits under the key, unvalidated (trust boundary is readStoredState)', async () => {
    await idbSet(STATE_KEY, '{"version":1,"fs":"torn', ctx.store)
    await idbSet(BACKUP_KEY, 42, ctx.store)
    await expect(ctx.adapter.load()).resolves.toBe('{"version":1,"fs":"torn')
    await expect(ctx.adapter.loadBackup()).resolves.toBe(42)
    expect(await idbGet(STATE_KEY, ctx.store)).toBe('{"version":1,"fs":"torn')
  })
})
