import { beforeEach, describe, expect, it } from 'vitest'
import { useWMStore, type WindowGeometry } from './wm-store'

// Stores are module singletons — snapshot the pristine state (actions bound) and
// hard-reset before each test.
const initialWM = useWMStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
})

const GEOM: WindowGeometry = { x: 10, y: 20, w: 400, h: 300 }

function open(appId: string, instanceId?: string, geometry: WindowGeometry = GEOM) {
  return useWMStore.getState().openWindow({ appId, instanceId, geometry })
}

describe('wm-store · open/close registry', () => {
  it('registers a window with id, appId, instanceId, geometry, z and focuses it', () => {
    const id = open('notepad', undefined)
    const state = useWMStore.getState()
    const win = state.windows[id]

    expect(win).toBeDefined()
    expect(win!.id).toBe(id)
    expect(win!.appId).toBe('notepad')
    expect(win!.instanceId).toBe(`auto:${id}`)
    expect(win!.geometry).toEqual(GEOM)
    expect(win!.minimized).toBe(false)
    expect(win!.maximized).toBe(false)
    expect(state.zOrder).toEqual([id])
    expect(state.focusedId).toBe(id)
  })

  it('multi-instance apps open one window per call', () => {
    const a = open('notepad')
    const b = open('notepad')
    expect(a).not.toBe(b)
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(2)
  })

  it('singleton re-open (same appId+instanceId) reuses, raises and focuses the window', () => {
    const first = open('settings', 'singleton')
    open('explorer', 'w:/archive')
    const again = open('settings', 'singleton')

    expect(again).toBe(first)
    const state = useWMStore.getState()
    expect(Object.keys(state.windows)).toHaveLength(2)
    expect(state.focusedId).toBe(first)
    expect(state.zOrder.at(-1)).toBe(first)
  })

  it('closeWindow removes the window from registry and z-order', () => {
    const a = open('a')
    const b = open('b')
    const state = useWMStore.getState()
    state.closeWindow(a)

    const after = useWMStore.getState()
    expect(after.windows[a]).toBeUndefined()
    expect(after.zOrder).toEqual([b])
    expect(after.focusedId).toBe(b)
  })

  it('closing the last window leaves focusedId null', () => {
    const a = open('a')
    useWMStore.getState().closeWindow(a)
    const after = useWMStore.getState()
    expect(after.windows).toEqual({})
    expect(after.zOrder).toEqual([])
    expect(after.focusedId).toBeNull()
  })

  it('closing a non-focused window does not steal focus', () => {
    const a = open('a')
    const b = open('b')
    useWMStore.getState().closeWindow(a)
    expect(useWMStore.getState().focusedId).toBe(b)
  })
})

describe('wm-store · focus + z-order raise', () => {
  it('focusWindow moves the window to the top of zOrder with a strictly greater z', () => {
    const a = open('a')
    const b = open('b')
    const c = open('c')
    const before = useWMStore.getState()

    useWMStore.getState().focusWindow(a)

    const after = useWMStore.getState()
    expect(after.zOrder).toEqual([b, c, a])
    expect(after.windows[a]!.z).toBeGreaterThan(before.windows[c]!.z)
    expect(after.focusedId).toBe(a)
  })

  it('raiseWindow raises z-order without touching focus or flags', () => {
    const a = open('a')
    const b = open('b')
    useWMStore.getState().focusWindow(b) // b focused + on top

    useWMStore.getState().raiseWindow(a)

    const after = useWMStore.getState()
    expect(after.zOrder.at(-1)).toBe(a)
    expect(after.focusedId).toBe(b) // unchanged
    expect(after.windows[a]!.minimized).toBe(false)
    expect(after.windows[a]!.maximized).toBe(false)
  })

  it('focusWindow on an unknown id is a no-op', () => {
    open('a')
    const before = useWMStore.getState()
    useWMStore.getState().focusWindow('does-not-exist')
    expect(useWMStore.getState()).toBe(before)
  })
})

describe('wm-store · minimize → restore', () => {
  it('minimizeWindow flags the window and hands focus to the topmost remaining window', () => {
    open('a')
    const b = open('b')
    const c = open('c') // focused, on top

    useWMStore.getState().minimizeWindow(c)

    const after = useWMStore.getState()
    expect(after.windows[c]!.minimized).toBe(true)
    expect(after.focusedId).toBe(b) // topmost non-minimized below c
    expect(after.windows[b]!.minimized).toBe(false)
  })

  it('minimizing a non-focused window leaves focus alone', () => {
    const a = open('a')
    const b = open('b') // focused, on top
    useWMStore.getState().minimizeWindow(a) // minimize the NON-focused window
    expect(useWMStore.getState().focusedId).toBe(b)
    expect(useWMStore.getState().windows[a]!.minimized).toBe(true)
  })

  it('restoreWindow un-minimizes, raises and focuses', () => {
    open('a')
    const b = open('b')
    useWMStore.getState().minimizeWindow(b)

    useWMStore.getState().restoreWindow(b)

    const after = useWMStore.getState()
    expect(after.windows[b]!.minimized).toBe(false)
    expect(after.focusedId).toBe(b)
    expect(after.zOrder.at(-1)).toBe(b)
  })

  it('minimized windows are skipped when focus falls through', () => {
    const a = open('a')
    const b = open('b')
    const c = open('c')
    useWMStore.getState().minimizeWindow(c)
    useWMStore.getState().minimizeWindow(b)

    useWMStore.getState().closeWindow(c)
    // b is topmost but minimized → a keeps/gains focus
    expect(useWMStore.getState().focusedId).toBe(a)
  })
})

describe('wm-store · maximize toggle', () => {
  it('toggleMaximize flips the flag, preserves normal geometry, raises and focuses', () => {
    const a = open('a', undefined, GEOM)
    open('b')

    useWMStore.getState().toggleMaximize(a)

    let after = useWMStore.getState()
    expect(after.windows[a]!.maximized).toBe(true)
    expect(after.windows[a]!.geometry).toEqual(GEOM) // untouched for un-maximize
    expect(after.focusedId).toBe(a)
    expect(after.zOrder.at(-1)).toBe(a)

    useWMStore.getState().toggleMaximize(a)

    after = useWMStore.getState()
    expect(after.windows[a]!.maximized).toBe(false)
    expect(after.windows[a]!.geometry).toEqual(GEOM)
  })
})

describe('wm-store · two-phase drag commits (RQ-2)', () => {
  it('updateDrag touches ONLY the transient slice — windows keeps its reference', () => {
    const a = open('a')
    const windowsBefore = useWMStore.getState().windows

    useWMStore.getState().beginDrag(a)
    for (let i = 1; i <= 120; i++) {
      useWMStore.getState().updateDrag(i, i * 2)
    }

    const state = useWMStore.getState()
    expect(state.windows).toBe(windowsBefore) // zero window-map replacements
    expect(state.dragging).toEqual({ id: a, x: 120, y: 240 })
    expect(state.windows[a]!.geometry).toEqual(GEOM) // geometry untouched mid-gesture
  })

  it('a full gesture notifies windows subscribers exactly once (at the atomic commit)', () => {
    const a = open('a')
    let notifications = 0
    const unsubscribe = useWMStore.subscribe(
      (s) => s.windows,
      () => {
        notifications += 1
      },
    )

    useWMStore.getState().beginDrag(a)
    for (let i = 1; i <= 120; i++) {
      useWMStore.getState().updateDrag(i * 3, i * 4)
    }
    useWMStore.getState().commitWindowGeometry(a, { x: 360, y: 480, w: GEOM.w, h: GEOM.h })
    unsubscribe()

    const state = useWMStore.getState()
    expect(notifications).toBe(1) // one gesture → one commit → one notification
    expect(state.windows[a]!.geometry).toEqual({ x: 360, y: 480, w: 400, h: 300 })
    expect(state.dragging).toBeNull() // transient slice cleared in the same commit
  })

  it('endDrag clears the transient slice without touching geometry', () => {
    const a = open('a')
    useWMStore.getState().beginDrag(a)
    useWMStore.getState().endDrag()
    expect(useWMStore.getState().dragging).toBeNull()
    expect(useWMStore.getState().windows[a]!.geometry).toEqual(GEOM)
  })

  it('commitWindowGeometry on an unknown id is a no-op', () => {
    const before = useWMStore.getState()
    useWMStore.getState().commitWindowGeometry('ghost', GEOM)
    expect(useWMStore.getState()).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// MF-2 · hydrate seam (persisted-session restore) — additive; the loader lives
// in src/lib/storage.
// ---------------------------------------------------------------------------
describe('wm-store · hydrate (MF-2 persistence seam)', () => {
  it('restores windows verbatim and rebuilds zOrder/zCounter from array order', () => {
    const a = open('a')
    const b = open('b')
    const c = open('c')
    const before = useWMStore.getState()
    // A captured session: b (bottom), a, c minimized (top).
    const session = {
      windows: [
        { ...before.windows[b]!, z: 4 },
        { ...before.windows[a]!, z: 7 },
        { ...before.windows[c]!, z: 9, minimized: true },
      ],
    }

    useWMStore.getState().hydrate(session)

    const after = useWMStore.getState()
    expect(Object.keys(after.windows)).toHaveLength(3)
    expect(after.zOrder).toEqual([b, a, c])
    expect(after.zCounter).toBe(9)
    expect(after.windows[b]!.z).toBe(4) // record restored verbatim, not re-cascaded
    expect(after.windows[c]!.minimized).toBe(true)
    expect(after.focusedId).toBe(a) // topmost non-minimized
    expect(after.dragging).toBeNull()
  })

  it('restores launch contexts (IM-3) on the records untouched', () => {
    const id = useWMStore.getState().openWindow({
      appId: 'notepad',
      instanceId: 'file:spc-1',
      title: 'note',
      launch: { source: 'file', file: { id: 'spc-1', name: 'note.txt' } as never },
    })
    const captured = [useWMStore.getState().windows[id]!]
    useWMStore.setState(initialWM, true)

    useWMStore.getState().hydrate({ windows: captured })

    const restored = useWMStore.getState().windows[id]!
    expect(restored.launch).toEqual(captured[0]!.launch)
    expect(restored.instanceId).toBe('file:spc-1')
  })

  it('an empty snapshot clears the session and focus', () => {
    open('a')
    open('b')
    useWMStore.getState().hydrate({ windows: [] })
    const after = useWMStore.getState()
    expect(after.windows).toEqual({})
    expect(after.zOrder).toEqual([])
    expect(after.focusedId).toBeNull()
    expect(after.zCounter).toBe(0)
  })
})

/* ---------------------- HU-2 · window self-control seams -------------------- */

describe('wm-store · HU-2 setWindowTitle (rename-follow seam)', () => {
  it('retitles the record; unknown id and unchanged titles are no-ops', () => {
    const id = open('notepad')
    useWMStore.getState().setWindowTitle(id, 'FIELD NOTES.TXT')
    expect(useWMStore.getState().windows[id]!.title).toBe('FIELD NOTES.TXT')

    const before = useWMStore.getState().windows
    useWMStore.getState().setWindowTitle(id, 'FIELD NOTES.TXT') // unchanged → no-op
    useWMStore.getState().setWindowTitle('nope', 'x') // unknown → no-op
    expect(useWMStore.getState().windows).toBe(before) // same reference, zero commits
  })
})

describe('wm-store · HU-2 setWindowAppState (draft persistence seam)', () => {
  it('patches the opaque payload; unknown id and reference-equal payloads are no-ops', () => {
    const id = open('notepad')
    const payload = { draft: 'field notes' }
    useWMStore.getState().setWindowAppState(id, payload)
    expect(useWMStore.getState().windows[id]!.appState).toBe(payload)

    const before = useWMStore.getState().windows
    useWMStore.getState().setWindowAppState(id, payload) // same reference → no-op
    useWMStore.getState().setWindowAppState('nope', payload)
    expect(useWMStore.getState().windows).toBe(before)
  })
})

describe('wm-store · HU-2 rebindWindow (launch-rebind seam)', () => {
  it('rebinds instance + launch atomically (untitled draft → file window)', () => {
    const id = open('notepad') // launcher open: auto instance, no launch ctx
    const file = { id: 'spc-9', name: 'NOTE.TXT' } as never
    const ok = useWMStore.getState().rebindWindow(id, {
      instanceId: 'file:spc-9',
      launch: { source: 'file', file },
    })

    expect(ok).toBe(true)
    const record = useWMStore.getState().windows[id]!
    expect(record.instanceId).toBe('file:spc-9')
    expect(record.launch).toEqual({ source: 'file', file })

    // Rebinding made it the file window: a same-file open now DEDUPES onto it.
    const again = useWMStore.getState().openWindow({
      appId: 'notepad',
      instanceId: 'file:spc-9',
      launch: { source: 'file', file },
    })
    expect(again).toBe(id)
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(1)
  })

  it('preserves the rest of the record (geometry, flags, z) through a rebind', () => {
    const id = open('notepad', undefined, { x: 12, y: 34, w: 560, h: 420 })
    useWMStore.getState().rebindWindow(id, {
      instanceId: 'file:spc-1',
      launch: { source: 'file', file: { id: 'spc-1' } as never },
    })
    const record = useWMStore.getState().windows[id]!
    expect(record.geometry).toEqual({ x: 12, y: 34, w: 560, h: 420 })
    expect(record.appId).toBe('notepad')
    expect(record.openedAt).toBeGreaterThan(0)
  })

  it('refuses (false, no mutation) when another window already holds the target instance', () => {
    const holder = open('notepad', 'file:spc-2')
    const draft = open('notepad')
    const ok = useWMStore.getState().rebindWindow(draft, {
      instanceId: 'file:spc-2',
      launch: { source: 'file', file: { id: 'spc-2' } as never },
    })

    expect(ok).toBe(false)
    expect(useWMStore.getState().windows[draft]!.instanceId).toMatch(/^auto:/) // untouched
    expect(useWMStore.getState().windows[holder]!.instanceId).toBe('file:spc-2')
  })

  it('unknown id is a no-op returning false', () => {
    expect(useWMStore.getState().rebindWindow('nope', {
      instanceId: 'file:x',
      launch: { source: 'file', file: { id: 'x' } as never },
    })).toBe(false)
  })
})

describe('wm-store · HU-2 (i) rapid open stress (dedupe races)', () => {
  it('25 same-instance opens in one tick converge on ONE window (Enter/dblclick race)', () => {
    let first = ''
    for (let i = 0; i < 25; i++) {
      const id = useWMStore.getState().openWindow({
        appId: 'notepad',
        instanceId: 'file:spc-1',
        launch: { source: 'file', file: { id: 'spc-1' } as never },
      })
      if (i === 0) first = id
      expect(id).toBe(first) // every racing open lands on the same window
    }
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(1)
    expect(useWMStore.getState().focusedId).toBe(first)
  })

  it('interleaved racing opens on two files converge on exactly two windows', () => {
    for (let i = 0; i < 25; i++) {
      useWMStore.getState().openWindow({
        appId: 'notepad',
        instanceId: `file:spc-${(i % 2) + 1}`,
        launch: { source: 'file', file: { id: `spc-${(i % 2) + 1}` } as never },
      })
    }
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(2)
  })

  it('launcher opens stay multi-instance by design (a fresh draft per open)', () => {
    for (let i = 0; i < 5; i++) useWMStore.getState().openWindow({ appId: 'notepad' })
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(5)
  })
})
