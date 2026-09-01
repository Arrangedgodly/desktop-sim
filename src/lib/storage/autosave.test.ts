// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNode } from '../fs'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { attachAutosave, stopAutosave } from './autosave'
import { useStorageStatusStore } from './status'
import type { StorageAdapter, StoredState } from './types'

/** Fault-injectable in-memory adapter (quota/unavailable scenarios + write counting). */
class MockAdapter implements StorageAdapter {
  saved: StoredState[] = []
  attempts: StoredState[] = []
  failuresRemaining = 0
  async load(): Promise<StoredState | null> {
    return this.saved.at(-1) ?? null
  }
  async save(state: StoredState): Promise<void> {
    this.attempts.push(state)
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1
      throw new DOMException('no space left', 'QuotaExceededError')
    }
    this.saved.push(state)
  }
  async saveBackup(): Promise<void> {}
  async loadBackup(): Promise<StoredState | null> {
    return null
  }
  async clear(): Promise<void> {
    this.saved = []
    this.attempts = []
  }
}

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()
const initialStatus = useStorageStatusStore.getState()

let clock = 1_000
const tick = (): number => (clock += 500)

beforeEach(() => {
  vi.useFakeTimers()
  useFSStore.setState(initialFS, true)
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  useStorageStatusStore.setState(initialStatus, true)
})

afterEach(() => {
  stopAutosave()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function commitFSNode(id: string): void {
  useFSStore
    .getState()
    .commit(
      createNode(useFSStore.getState().fs, {
        id,
        parentId: 'root',
        name: `${id}.txt`,
        kind: 'text',
        now: tick(),
      }),
    )
}

describe('autosave · debounce coalescing', () => {
  it('five rapid commits produce exactly ONE write carrying the final state', async () => {
    const adapter = new MockAdapter()
    attachAutosave({ adapter, delayMs: 500, now: tick })

    for (let i = 0; i < 5; i++) commitFSNode(`note-${i}`)
    await vi.advanceTimersByTimeAsync(500)

    expect(adapter.saved).toHaveLength(1)
    expect(Object.keys(adapter.saved[0]!.fs.nodes)).toContain('note-4')
    expect(adapter.saved[0]!.fs.nodes['note-0']).toBeDefined() // final state, not first
  })

  it('commits inside the window extend nothing — one timer per burst, trailing fire', async () => {
    const adapter = new MockAdapter()
    attachAutosave({ adapter, delayMs: 500, now: tick })
    commitFSNode('a')
    await vi.advanceTimersByTimeAsync(250)
    commitFSNode('b') // within the debounce window of the first
    await vi.advanceTimersByTimeAsync(250)
    expect(adapter.saved).toHaveLength(0) // still coalesced…
    commitFSNode('c')
    await vi.advanceTimersByTimeAsync(500)
    expect(adapter.saved).toHaveLength(1)
    expect(Object.keys(adapter.saved[0]!.fs.nodes)).toContain('c')
  })

  it('a second burst after the first writes again (savedAt stamped per write)', async () => {
    const adapter = new MockAdapter()
    attachAutosave({ adapter, delayMs: 500, now: tick })
    commitFSNode('a')
    await vi.advanceTimersByTimeAsync(500)
    commitFSNode('b')
    await vi.advanceTimersByTimeAsync(500)

    expect(adapter.saved).toHaveLength(2)
    expect(adapter.saved[1]!.savedAt).toBeGreaterThan(adapter.saved[0]!.savedAt)
    expect(useStorageStatusStore.getState().lastSavedAt).toBe(adapter.saved[1]!.savedAt)
    expect(useStorageStatusStore.getState().saveCount).toBe(2)
  })
})

describe('autosave · store seams (subscribeWithSelector)', () => {
  it('WM transient drag storms schedule ZERO saves (RQ-2 discipline)', async () => {
    const adapter = new MockAdapter()
    attachAutosave({ adapter, delayMs: 500, now: tick })
    const id = useWMStore.getState().openWindow({ appId: 'notepad' })
    await vi.advanceTimersByTimeAsync(500)
    expect(adapter.saved).toHaveLength(1) // the open itself saved

    useWMStore.getState().beginDrag(id)
    for (let i = 1; i <= 100; i++) useWMStore.getState().updateDrag(i * 2, i * 3)
    await vi.advanceTimersByTimeAsync(600)
    expect(adapter.saved).toHaveLength(1) // pointermove writes never persist

    useWMStore.getState().commitWindowGeometry(id, { x: 111, y: 222, w: 400, h: 300 })
    await vi.advanceTimersByTimeAsync(500)
    expect(adapter.saved).toHaveLength(2) // the single pointerup commit does
    expect(adapter.saved[1]!.windows[0]!.geometry).toEqual({ x: 111, y: 222, w: 400, h: 300 })
  })

  it('persisted windows follow zOrder (bottom → top)', async () => {
    const adapter = new MockAdapter()
    attachAutosave({ adapter, delayMs: 500, now: tick })
    const a = useWMStore.getState().openWindow({ appId: 'explorer' })
    const b = useWMStore.getState().openWindow({ appId: 'notepad' })
    useWMStore.getState().focusWindow(a) // raise a above b
    await vi.advanceTimersByTimeAsync(500)

    expect(adapter.saved[0]!.windows.map((w) => w.id)).toEqual(useWMStore.getState().zOrder)
    expect(adapter.saved[0]!.windows.map((w) => w.id)).toEqual([b, a])
  })

  it('settings changes persist through the shallow-equality selector', async () => {
    const adapter = new MockAdapter()
    attachAutosave({ adapter, delayMs: 500, now: tick })
    useSettingsStore.getState().setSoundsEnabled(true)
    useSettingsStore.getState().setWallpaper('phytograph')
    await vi.advanceTimersByTimeAsync(500)
    expect(adapter.saved[0]!.settings).toEqual({
      wallpaper: 'phytograph',
      soundsEnabled: true,
      reducedMotionFollow: true,
    })
  })
})

describe('autosave · flush, stop, pagehide', () => {
  it('flush() writes immediately without waiting for the timer', async () => {
    const adapter = new MockAdapter()
    const handle = attachAutosave({ adapter, delayMs: 5000, now: tick })
    commitFSNode('now')
    await handle.flush()
    expect(adapter.saved).toHaveLength(1)

    await handle.flush() // nothing dirty → no second write
    expect(adapter.saved).toHaveLength(1)
  })

  it('stop() detaches: later commits never write', async () => {
    const adapter = new MockAdapter()
    const handle = attachAutosave({ adapter, delayMs: 500, now: tick })
    handle.stop()
    commitFSNode('later')
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.saved).toHaveLength(0)
  })

  it('pagehide fires the flush (reload mid-op keeps the edit — AP-2/HU-2 seam)', async () => {
    const adapter = new MockAdapter()
    attachAutosave({ adapter, delayMs: 5000, now: tick })
    commitFSNode('precious-edit')
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.saved).toHaveLength(1)
    expect(adapter.saved[0]!.fs.nodes['precious-edit']).toBeDefined()
  })
})

describe('autosave · quota path (typed failure, session survives)', () => {
  it('persistent quota: trim-retry once with windows dropped, then a typed surfaced failure — in-memory state intact', async () => {
    const adapter = new MockAdapter()
    adapter.failuresRemaining = Number.POSITIVE_INFINITY
    useWMStore.getState().openWindow({ appId: 'notepad' })
    attachAutosave({ adapter, delayMs: 500, now: tick })
    commitFSNode('kept-in-memory')

    await vi.advanceTimersByTimeAsync(500)

    expect(adapter.attempts).toHaveLength(2) // original + one trim-retry
    expect(adapter.attempts[0]!.windows).toHaveLength(1)
    expect(adapter.attempts[1]!.windows).toHaveLength(0) // CoW trim per RQ-1 note 4
    expect(adapter.saved).toHaveLength(0)

    const status = useStorageStatusStore.getState()
    expect(status.lastFailure?.kind).toBe('quota') // surfaced for HU-1's toast
    expect(status.recovery).toBeNull() // save failure ≠ boot recovery
    expect(status.saveCount).toBe(0)

    // The session is NOT discarded: stores keep the mutation.
    expect(useFSStore.getState().fs.nodes['kept-in-memory']).toBeDefined()
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(1)
  })

  it('transient quota: the trim-retry lands and the failure clears', async () => {
    const adapter = new MockAdapter()
    adapter.failuresRemaining = 1 // first save fails, retry succeeds
    useWMStore.getState().openWindow({ appId: 'settings', instanceId: 'singleton' })
    attachAutosave({ adapter, delayMs: 500, now: tick })
    commitFSNode('after-quota-blip')

    await vi.advanceTimersByTimeAsync(500)

    expect(adapter.saved).toHaveLength(1)
    expect(adapter.saved[0]!.windows).toHaveLength(0) // geometry sacrificed, catalog safe
    expect(adapter.saved[0]!.fs.nodes['after-quota-blip']).toBeDefined()
    expect(useStorageStatusStore.getState().lastFailure).toBeNull()
    expect(useStorageStatusStore.getState().saveCount).toBe(1)
  })

  it('a quota failure with no open windows does not retry into the same wall', async () => {
    const adapter = new MockAdapter()
    adapter.failuresRemaining = Number.POSITIVE_INFINITY
    attachAutosave({ adapter, delayMs: 500, now: tick })
    commitFSNode('no-windows-anyway')
    await vi.advanceTimersByTimeAsync(500)
    expect(adapter.attempts).toHaveLength(1) // nothing to trim → single attempt
    expect(useStorageStatusStore.getState().lastFailure?.kind).toBe('quota')
  })
})
