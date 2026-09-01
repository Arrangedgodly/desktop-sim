// @vitest-environment jsdom
// IM-5 icon drag contract (RQ-3 committed pattern via the TH-1 scripted
// gesture primitives — the same event shape the real-browser probe uses),
// rendered through the REAL DesktopSurface + seeded stores:
// - transform-only movement with ZERO store notifications mid-gesture and
//   exactly ONE grid-snapped setIconPosition commit at pointerup;
// - 4px click-vs-drag threshold (sub-threshold = a plain click);
// - viewport clamp mid-gesture; same-slot release commits nothing;
// - full end-matrix: Escape / pointercancel cancel + bounce back,
//   lostpointercapture defensively commits, every end idempotent;
// - drop-on-folder: valid drawer commits moveNode once (old position pruned,
//   icon leaves the field, highlight cleared); non-folder and own-descendant
//   targets fail SOFT (shake attribute + bounce, no store write);
// - a released drag suppresses the next double-click open.
//
// jsdom has no elementFromPoint — the drop tests stub it (the hook
// feature-detects; the stub is exactly the seam RQ-3 owns in the browser).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createNode } from '../../lib/fs'
import { createPointerEvent } from '../../lib/perf/gesture'
import { useFSStore } from '../stores/fs-store'
import { useWMStore } from '../stores/wm-store'
import { useSettingsStore } from '../stores/settings-store'
import { registerApp, resetAppRegistry } from '../app-registry'
import { DemoIcon } from '../../apps/demo/DemoIcon'
import { DesktopSurface } from './DesktopSurface'

vi.mock('../../lib/storage/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/adapter')>()
  return { ...actual, requestPersistentStorage: vi.fn().mockResolvedValue(true) }
})

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()

const probeApp = {
  id: 'probe',
  name: 'Probe Module',
  icon: DemoIcon,
  mount: () => null,
} as const

beforeEach(() => {
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  resetAppRegistry()
  registerApp(probeApp)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (document as { elementFromPoint?: unknown }).elementFromPoint // drop stub
})

/* ------------------------------ helpers ---------------------------------- */

function icon(id: string): HTMLElement {
  const el = document.querySelector(`[data-specimen-id="${id}"]`)
  if (!(el instanceof HTMLElement)) throw new Error(`specimen "${id}" not rendered`)
  return el
}

function fieldCount(): number {
  return document.querySelectorAll('.icon-field [data-specimen-id]').length
}

/** Dispatch one scripted pointer event on a surface, inside act(). */
function fire(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
): void {
  act(() => {
    target.dispatchEvent(createPointerEvent(type, { x, y }))
  })
}

/** Let the pending rAF paint (or its timeout fallback) run, inside act(). */
async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
      else setTimeout(resolve, 20)
    })
  })
}

/** Store notification spy: zustand's base subscribe fires on EVERY set. */
function spyFS(): { calls: () => number; stop: () => void } {
  const spy = vi.fn()
  const unsubscribe = useFSStore.subscribe(spy)
  return { calls: () => spy.mock.calls.length, stop: unsubscribe }
}

/** Stub jsdom's missing elementFromPoint (the RQ-3 hit-test seam). */
function stubElementFromPoint(resolve: (x: number, y: number) => Element | null): void {
  ;(document as { elementFromPoint?: (x: number, y: number) => Element | null }).elementFromPoint =
    resolve
}

/* ------------------------------ tests ------------------------------------ */

describe('icon drag · transient transform path', () => {
  it('moves via transform only — left/top frozen, ZERO store writes mid-gesture, ONE snap commit at up', async () => {
    render(<DesktopSurface />)
    const el = icon('charter') // seeded slot (1,0) → left 132, top 28
    const store = spyFS()

    fire(el, 'pointerdown', 178, 96)
    fire(el, 'pointermove', 220, 140)
    fire(el, 'pointermove', 300, 220)
    fire(el, 'pointermove', 386, 360)
    await flushFrame()

    // Transform carries the delta; React-owned left/top never moved.
    expect(el.style.transform).toBe('translate3d(208px, 264px, 0)')
    expect(el.style.left).toBe('132px')
    expect(el.style.top).toBe('28px')
    expect(store.calls()).toBe(0) // ZERO store notifications mid-gesture

    fire(el, 'pointerup', 386, 360)

    expect(store.calls()).toBe(1) // exactly ONE atomic commit
    const fs = useFSStore.getState().fs
    expect(fs.iconPositions['charter']).toEqual({ x: 3, y: 2 }) // 340,292 snapped
    // The re-render owns the placement now: grid left/top, no transform.
    expect(el.style.transform).toBe('')
    expect(el.style.left).toBe('340px')
    expect(el.style.top).toBe('292px')
    store.stop()
  })

  it('rAF-batches: five moves inside one frame schedule exactly one rAF and apply once', async () => {
    render(<DesktopSurface />)
    const el = icon('charter')

    fire(el, 'pointerdown', 178, 96)
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    try {
      fire(el, 'pointermove', 200, 110)
      fire(el, 'pointermove', 240, 160)
      fire(el, 'pointermove', 300, 220)
      fire(el, 'pointermove', 350, 300)
      fire(el, 'pointermove', 386, 360)
      expect(rafSpy).toHaveBeenCalledTimes(1) // ≤1 scheduled paint regardless of input rate
      expect(el.style.transform).toBe('') // nothing applied synchronously

      await flushFrame()
      expect(el.style.transform).toBe('translate3d(208px, 264px, 0)') // LATEST coords won

      fire(el, 'pointerup', 386, 360)
    } finally {
      rafSpy.mockRestore()
    }
    expect(useFSStore.getState().fs.iconPositions['charter']).toEqual({ x: 3, y: 2 })
  })

  it('sub-threshold travel is a click: no transform, no commit, no gesture classes', async () => {
    render(<DesktopSurface />)
    const el = icon('charter')
    const store = spyFS()

    fire(el, 'pointerdown', 178, 96)
    fire(el, 'pointermove', 181, 98) // ~3.6px — under the 4px threshold
    await flushFrame()
    fire(el, 'pointerup', 181, 98)

    expect(el.style.transform).toBe('')
    expect(store.calls()).toBe(0)
    expect(useFSStore.getState().fs.iconPositions['charter']).toEqual({ x: 1, y: 0 })
    expect(document.body.classList.contains('wm-gesture-live')).toBe(false)
    expect(el.hasAttribute('data-gesture')).toBe(false)
    // …and the click semantics survive: click still selects.
    fireEvent.click(el)
    expect(el.getAttribute('data-selected')).toBe('true')
    store.stop()
  })

  it('clamps to the viewport during the gesture and snaps within the caps at commit', async () => {
    render(<DesktopSurface />)
    const el = icon('charter')
    const store = spyFS()

    fire(el, 'pointerdown', 178, 96)
    fire(el, 'pointermove', -5000, -5000)
    await flushFrame()

    // Proposed origin {−4970, −4972} clamps to {0,0} → transform shows only
    // the clamped delta; the card itself never leaves the screen.
    expect(el.style.transform).toBe('translate3d(-132px, -28px, 0)')

    fire(el, 'pointerup', -5000, -5000)
    expect(useFSStore.getState().fs.iconPositions['charter']).toEqual({ x: 0, y: 0 })
    expect(store.calls()).toBe(1)
    store.stop()
  })

  it('releasing inside the SAME cell commits nothing (a no-op is not a write)', async () => {
    render(<DesktopSurface />)
    const el = icon('charter')
    const store = spyFS()

    fire(el, 'pointerdown', 178, 96)
    fire(el, 'pointermove', 186, 104) // 8px — armed, still inside cell (1,0)
    await flushFrame()
    expect(el.getAttribute('data-gesture')).toBe('drag')
    fire(el, 'pointerup', 186, 104)

    expect(store.calls()).toBe(0) // snapped slot == stored slot → skipped
    expect(el.style.transform).toBe('')
    expect(useFSStore.getState().fs.iconPositions['charter']).toEqual({ x: 1, y: 0 })
    store.stop()
  })

  it('Escape cancels mid-drag: bounces back, no commit, idempotent after', async () => {
    render(<DesktopSurface />)
    const el = icon('charter')
    const store = spyFS()

    fire(el, 'pointerdown', 178, 96)
    fire(el, 'pointermove', 386, 360)
    await flushFrame()
    expect(el.getAttribute('data-gesture')).toBe('drag')

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(el.style.transform).toBe('')
    expect(el.getAttribute('data-gesture')).toBe(null)
    expect(document.body.classList.contains('wm-gesture-live')).toBe(false)
    expect(store.calls()).toBe(0)
    expect(useFSStore.getState().fs.iconPositions['charter']).toEqual({ x: 1, y: 0 })

    // The gesture is over: a late pointerup must not resurrect a commit.
    fire(el, 'pointerup', 386, 360)
    expect(store.calls()).toBe(0)
    store.stop()
  })

  it('pointercancel cancels and bounces back (browser took over the gesture)', async () => {
    render(<DesktopSurface />)
    const el = icon('charter')
    const store = spyFS()

    fire(el, 'pointerdown', 178, 96)
    fire(el, 'pointermove', 386, 360)
    await flushFrame()
    expect(el.style.transform).not.toBe('')

    fire(el, 'pointercancel', 386, 360)

    expect(el.style.transform).toBe('')
    expect(store.calls()).toBe(0)
    expect(useFSStore.getState().fs.iconPositions['charter']).toEqual({ x: 1, y: 0 })
    store.stop()
  })

  it('lostpointercapture is a defensive END: commits, and later events stay inert', async () => {
    render(<DesktopSurface />)
    const el = icon('charter')
    const store = spyFS()

    fire(el, 'pointerdown', 178, 96)
    fire(el, 'pointermove', 386, 360)
    await flushFrame()

    // Abnormal capture loss: the drag the user performed must not vanish.
    const lostEvent = createPointerEvent('pointerup', { x: 386, y: 360 })
    Object.defineProperty(lostEvent, 'type', { value: 'lostpointercapture' })
    act(() => {
      el.dispatchEvent(lostEvent)
    })

    expect(store.calls()).toBe(1)
    expect(useFSStore.getState().fs.iconPositions['charter']).toEqual({ x: 3, y: 2 })
    expect(el.style.transform).toBe('')

    fire(el, 'pointerup', 386, 360) // already ended — no second commit
    expect(store.calls()).toBe(1)
    store.stop()
  })

  it('the armed ghost is pointer-transparent with the shimmer attribute; both retire at end', async () => {
    render(<DesktopSurface />)
    const el = icon('charter')

    fire(el, 'pointerdown', 178, 96)
    fire(el, 'pointermove', 386, 360)
    await flushFrame()

    expect(el.style.pointerEvents).toBe('none') // elementFromPoint sees through
    expect(el.getAttribute('data-gesture')).toBe('drag') // the shimmer state

    fire(el, 'pointerup', 386, 360)
    expect(el.style.pointerEvents).toBe('')
    expect(el.hasAttribute('data-gesture')).toBe(false)
  })
})

describe('icon drag · drop-on-folder', () => {
  it('valid drop: highlight appears mid-drag, ONE moveNode commit files it, position pruned, highlight cleared', async () => {
    render(<DesktopSurface />)
    const charter = icon('charter')
    const archive = icon('archive')
    const store = spyFS()
    // Hit-test seam: everything right of x=500 reads as the archive drawer.
    stubElementFromPoint((x) => (x > 500 ? archive : null))

    fire(charter, 'pointerdown', 178, 96)
    fire(charter, 'pointermove', 620, 320)
    await flushFrame()

    expect(archive.getAttribute('data-drop-target')).toBe('true') // drawer-pull affordance

    // Leaving the drawer drops the highlight again.
    fire(charter, 'pointermove', 200, 320)
    await flushFrame()
    expect(archive.hasAttribute('data-drop-target')).toBe(false)

    fire(charter, 'pointermove', 620, 320)
    await flushFrame()
    expect(archive.getAttribute('data-drop-target')).toBe('true')

    fire(charter, 'pointerup', 620, 320)

    expect(store.calls()).toBe(1) // exactly ONE atomic commit (the move)
    const fs = useFSStore.getState().fs
    expect(fs.nodes['charter']!.parentId).toBe('archive')
    expect(fs.iconPositions['charter']).toBeUndefined() // old desktop placement pruned
    expect(document.querySelector('[data-specimen-id="charter"]')).toBeNull() // left the field
    expect(fieldCount()).toBe(4)
    expect(archive.hasAttribute('data-drop-target')).toBe(false) // affordance retired
    store.stop()
  })

  it('non-folder target: SOFT fail — shake + bounce back, nothing committed', async () => {
    render(<DesktopSurface />)
    const charter = icon('charter')
    const nameplate = icon('nameplate') // an app-link, not a drawer
    const store = spyFS()
    stubElementFromPoint(() => nameplate)

    fire(charter, 'pointerdown', 178, 96)
    fire(charter, 'pointermove', 620, 320)
    await flushFrame()
    expect(nameplate.hasAttribute('data-drop-target')).toBe(false) // invalid → never highlighted

    fire(charter, 'pointerup', 620, 320)

    expect(store.calls()).toBe(0) // no move, no reposition
    expect(charter.getAttribute('data-drop-rejected')).toBe('true') // the in-world shake
    expect(charter.style.transform).toBe('') // bounced back to its slot
    expect(charter.style.left).toBe('132px')
    expect(charter.style.top).toBe('28px')
    const fs = useFSStore.getState().fs
    expect(fs.nodes['charter']!.parentId).toBe('root')
    expect(fs.iconPositions['charter']).toEqual({ x: 1, y: 0 })
    store.stop()
  })

  it('own descendant target (drawer onto its child): SOFT fail, no cycle ever attempted', async () => {
    render(<DesktopSurface />)
    // Fixture: drawer 'big' on the desktop with a nested child drawer — the
    // child is not on the field, so the hit-test is stubbed to its element.
    act(() => {
      const fs = useFSStore.getState()
      useFSStore.getState().commit(
        createNode(createNode(fs.fs, { id: 'big', parentId: 'root', name: 'Big', kind: 'folder' }), {
          id: 'inner',
          parentId: 'big',
          name: 'Inner',
          kind: 'folder',
        }),
      )
    })
    const big = icon('big')
    const inner = document.createElement('div')
    inner.setAttribute('data-specimen-id', 'inner')
    const store = spyFS()
    stubElementFromPoint(() => inner)

    fire(big, 'pointerdown', 178, 500)
    fire(big, 'pointermove', 620, 560)
    await flushFrame()
    fire(big, 'pointerup', 620, 560)

    expect(store.calls()).toBe(0)
    expect(big.getAttribute('data-drop-rejected')).toBe('true')
    expect(useFSStore.getState().fs.nodes['big']!.parentId).toBe('root') // not filed in its child
    expect(useFSStore.getState().fs.nodes['inner']!.parentId).toBe('big') // subtree intact
    store.stop()
  })
})

describe('icon drag · open suppression', () => {
  it('a released drag suppresses the immediately-following double-click open', async () => {
    render(<DesktopSurface />)
    act(() => {
      useFSStore
        .getState()
        .commit(
          createNode(useFSStore.getState().fs, {
            id: 'probe-link',
            parentId: 'root',
            name: 'Probe Link',
            kind: 'app-link',
            appId: 'probe',
          }),
        )
    })
    const el = icon('probe-link')

    // Drag it (armed), release — the browser still fires a compatibility
    // click/dblclick pair right after a captured drag.
    fire(el, 'pointerdown', 178, 500)
    fire(el, 'pointermove', 400, 560)
    await flushFrame()
    fire(el, 'pointerup', 400, 560)

    fireEvent.doubleClick(el)
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0) // suppressed

    // The NEXT double-click (a real one, no drag in front) opens normally.
    fireEvent.doubleClick(el)
    const windows = Object.values(useWMStore.getState().windows)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.appId).toBe('probe')
  })
})
