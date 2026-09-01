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
