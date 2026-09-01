// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useWMStore, type WindowGeometry, type WindowId } from '../../stores/wm-store'
import { WindowHost } from '../WindowHost'
import { createPointerEvent } from '../../../lib/perf/gesture'
import {
  CLICK_VS_DRAG_THRESHOLD_PX,
  movedBeyondThreshold,
  resolveResizeGeometry,
} from './gesture-math'

/**
 * IM-4b gesture contract (RQ-3 committed pattern), driven through the TH-1
 * scripted gesture primitives (createPointerEvent, raw dispatch — the same
 * event shape the real-browser probe uses):
 * - move rides transform ONLY (left/top frozen) with ZERO store notifications
 *   mid-gesture and exactly ONE commit at pointerup;
 * - full end-matrix: Escape and pointercancel cancel + restore, a defensive
 *   lostpointercapture commits, every end is idempotent;
 * - 4px click-vs-drag threshold; maximized modules are fixed furniture;
 * - resize (se/e/s) honors the geometry.ts min-size floor + viewport cap;
 * - gesture classes (body kill-switch, drag-only shimmer attribute).
 */

const initialWM = useWMStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
})

afterEach(cleanup)

const GEOM: WindowGeometry = { x: 40, y: 30, w: 480, h: 320 }
const VIEWPORT = { w: 800, h: 600 }

function actWM(fn: () => void): void {
  act(fn)
}

function open(title: string, geometry: WindowGeometry = GEOM): WindowId {
  let id: WindowId = ''
  actWM(() => {
    id = useWMStore.getState().openWindow({ appId: title.toLowerCase(), title, geometry })
  })
  return id
}

function renderHost(): void {
  render(<WindowHost viewport={VIEWPORT} />)
}

function dialogByName(name: string): HTMLElement {
  return screen.getByRole('dialog', { name })
}

function titlebarOf(dialog: HTMLElement): HTMLElement {
  return dialog.querySelector('.wm-titlebar')!
}

function handleOf(dialog: HTMLElement, handle: 'se' | 'e' | 's'): HTMLElement {
  return dialog.querySelector(`[data-resize="${handle}"]`)!
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
function spyStore(): { calls: () => number; stop: () => void } {
  const spy = vi.fn()
  const unsubscribe = useWMStore.subscribe(spy)
  return { calls: () => spy.mock.calls.length, stop: unsubscribe }
}

describe('gesture-math (pure)', () => {
  it('arms only beyond the threshold; exactly-at-threshold is still a click', () => {
    expect(movedBeyondThreshold(3, 0)).toBe(false)
    expect(movedBeyondThreshold(CLICK_VS_DRAG_THRESHOLD_PX, 0)).toBe(false)
    expect(movedBeyondThreshold(CLICK_VS_DRAG_THRESHOLD_PX + 0.5, 0)).toBe(true)
    expect(movedBeyondThreshold(3, 3)).toBe(true) // diagonal ~4.24px
  })

  it('e grows only width, s only height, se both; floors/caps through the shared clamp', () => {
    const start = { x: 40, y: 30, w: 480, h: 320 }
    expect(resolveResizeGeometry(start, 'e', 200, 500, VIEWPORT)).toEqual({
      x: 40,
      y: 30,
      w: 680,
      h: 320,
    })
    expect(resolveResizeGeometry(start, 's', 200, 500, VIEWPORT)).toEqual({
      x: 40,
      y: 0, // a viewport-tall window clamps fully on-screen (entirely-inside rule)
      w: 480,
      h: 600, // capped at viewport height
    })
    expect(resolveResizeGeometry(start, 'se', -10_000, -10_000, VIEWPORT)).toEqual({
      x: 40,
      y: 30,
      w: 320, // MIN_WINDOW_WIDTH
      h: 200, // MIN_WINDOW_HEIGHT
    })
  })
})

describe('drag · transient transform path', () => {
  it('moves via transform only — left/top frozen, ZERO store writes mid-gesture, ONE commit at up', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const bar = titlebarOf(el)
    const store = spyStore()

    fire(bar, 'pointerdown', 100, 46)
    // pointerdown still runs IM-4a click-anywhere focus/raise — one store
    // write at GESTURE START is the sanctioned baseline; from here on: silence.
    expect(store.calls()).toBe(1)
    store.stop()
    const midGesture = spyStore()

    fire(bar, 'pointermove', 140, 70)
    fire(bar, 'pointermove', 180, 96)
    fire(bar, 'pointermove', 220, 120)
    await flushFrame()

    // Transform carries the delta; React-owned left/top never moved.
    expect(el.style.transform).toBe('translate3d(120px, 74px, 0)')
    expect(el.style.left).toBe('40px')
    expect(el.style.top).toBe('30px')
    expect(el.style.width).toBe('480px')
    expect(midGesture.calls()).toBe(0) // ZERO store notifications mid-gesture

    fire(bar, 'pointerup', 220, 120)

    expect(midGesture.calls()).toBe(1) // exactly ONE atomic commit
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({
      x: 160,
      y: 104,
      w: 480,
      h: 320,
    })
    expect(el.style.transform).toBe('')
    expect(el.style.left).toBe('160px')
    expect(el.style.top).toBe('104px')
    midGesture.stop()
  })

  it('rAF-batches: five moves inside one frame schedule exactly one rAF and apply once', async () => {
    renderHost()
    open('Alpha')
    const el = dialogByName('Alpha')
    const bar = titlebarOf(el)

    fire(bar, 'pointerdown', 100, 46)
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    try {
      fire(bar, 'pointermove', 120, 50)
      fire(bar, 'pointermove', 140, 60)
      fire(bar, 'pointermove', 160, 70)
      fire(bar, 'pointermove', 180, 80)
      fire(bar, 'pointermove', 220, 120)
      expect(rafSpy).toHaveBeenCalledTimes(1) // ≤1 scheduled paint regardless of input rate
      expect(el.style.transform).toBe('') // nothing applied synchronously

      await flushFrame()
      expect(el.style.transform).toBe('translate3d(120px, 74px, 0)') // LATEST coords won

      fire(bar, 'pointerup', 220, 120)
    } finally {
      rafSpy.mockRestore()
    }
  })

  it('sub-threshold travel is a click: no transform, no commit, no gesture classes', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const bar = titlebarOf(el)

    fire(bar, 'pointerdown', 100, 46)
    const store = spyStore()
    fire(bar, 'pointermove', 102, 47) // ~3.2px — under the 4px threshold
    await flushFrame()
    fire(bar, 'pointerup', 102, 47)

    expect(el.style.transform).toBe('')
    expect(store.calls()).toBe(0)
    expect(useWMStore.getState().windows[id]!.geometry).toEqual(GEOM)
    expect(document.body.classList.contains('wm-gesture-live')).toBe(false)
    expect(el.hasAttribute('data-gesture')).toBe(false)
    store.stop()
  })

  it('clamps to the viewport during the gesture and again at commit', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const bar = titlebarOf(el)

    fire(bar, 'pointerdown', 100, 46)
    const store = spyStore()
    fire(bar, 'pointermove', -5000, -5000)
    await flushFrame()

    // Proposed {x:-5020, y:-4984} clamps to {0,0} → transform shows only the
    // clamped delta; the frame itself never leaves the screen.
    expect(el.style.transform).toBe('translate3d(-40px, -30px, 0)')

    fire(bar, 'pointerup', -5000, -5000)
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({ x: 0, y: 0, w: 480, h: 320 })
    expect(el.style.left).toBe('0px')
    expect(store.calls()).toBe(1)
    store.stop()
  })

  it('Escape cancels mid-drag: restores pre-gesture geometry, no commit, idempotent after', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const bar = titlebarOf(el)

    fire(bar, 'pointerdown', 100, 46)
    const store = spyStore()
    fire(bar, 'pointermove', 220, 120)
    await flushFrame()
    expect(el.style.transform).toBe('translate3d(120px, 74px, 0)')
    expect(el.getAttribute('data-gesture')).toBe('drag')

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(el.style.transform).toBe('')
    expect(el.style.left).toBe('40px')
    expect(el.style.top).toBe('30px')
    expect(el.getAttribute('data-gesture')).toBe(null)
    expect(document.body.classList.contains('wm-gesture-live')).toBe(false)
    expect(store.calls()).toBe(0)
    expect(useWMStore.getState().windows[id]!.geometry).toEqual(GEOM)

    // The gesture is over: a late pointerup must not resurrect a commit.
    fire(bar, 'pointerup', 220, 120)
    expect(store.calls()).toBe(0)
    store.stop()
  })

  it('pointercancel cancels and restores (browser took over the gesture)', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const bar = titlebarOf(el)

    fire(bar, 'pointerdown', 100, 46)
    const store = spyStore()
    fire(bar, 'pointermove', 220, 120)
    await flushFrame()
    expect(el.style.transform).not.toBe('')

    fire(bar, 'pointercancel', 220, 120)

    expect(el.style.transform).toBe('')
    expect(useWMStore.getState().windows[id]!.geometry).toEqual(GEOM)
    expect(store.calls()).toBe(0)
    store.stop()
  })

  it('lostpointercapture is a defensive END: commits, and later events stay inert', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const bar = titlebarOf(el)

    fire(bar, 'pointerdown', 100, 46)
    const store = spyStore()
    fire(bar, 'pointermove', 220, 120)
    await flushFrame()

    // Abnormal capture loss (element moved, browser stole it): the drag the
    // user performed must not vanish — treat as end, commit.
    const lostEvent = createPointerEvent('pointerup', { x: 220, y: 120 })
    Object.defineProperty(lostEvent, 'type', { value: 'lostpointercapture' })
    act(() => {
      bar.dispatchEvent(lostEvent)
    })

    expect(store.calls()).toBe(1)
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({
      x: 160,
      y: 104,
      w: 480,
      h: 320,
    })
    expect(el.style.transform).toBe('')

    fire(bar, 'pointerup', 220, 120) // already ended — no second commit
    expect(store.calls()).toBe(1)
    store.stop()
  })

  it('maximized modules are fixed furniture: no drag, no resize handles', async () => {
    renderHost()
    const id = open('Alpha')
    actWM(() => useWMStore.getState().toggleMaximize(id))
    const el = dialogByName('Alpha')
    const bar = titlebarOf(el)

    expect(el.querySelectorAll('[data-resize]')).toHaveLength(0) // handles unmount

    fire(bar, 'pointerdown', 400, 16)
    const store = spyStore()
    fire(bar, 'pointermove', 600, 200)
    await flushFrame()
    fire(bar, 'pointerup', 600, 200)

    expect(el.style.transform).toBe('')
    expect(store.calls()).toBe(0)
    expect(useWMStore.getState().windows[id]!.geometry).toEqual(GEOM) // normal-state geometry untouched
    store.stop()
  })

  it('title-bar chrome controls never anchor a drag — and their clicks still act', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const minimize = el.querySelector<HTMLButtonElement>('.wm-controls button[aria-label="Minimize"]')!

    fire(minimize, 'pointerdown', 120, 46)
    const store = spyStore()
    fire(minimize, 'pointermove', 300, 200) // way past threshold
    await flushFrame()
    fire(minimize, 'pointerup', 300, 200)

    expect(el.style.transform).toBe('')
    expect(store.calls()).toBe(0) // no commit (pointerdown on a control is a click-to-be)

    actWM(() => fireEvent.click(minimize))
    expect(useWMStore.getState().windows[id]!.minimized).toBe(true) // control still works
    store.stop()
  })
})

describe('resize · corner bracket + edge pulls', () => {
  it('se grows width and height from the far corner; origin stays put; one commit', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const handle = handleOf(el, 'se')

    fire(handle, 'pointerdown', 512, 342) // near the se corner (40+480, 30+320)
    const store = spyStore()
    fire(handle, 'pointermove', 692, 442) // +180, +100
    await flushFrame()

    expect(el.style.width).toBe('660px')
    expect(el.style.height).toBe('420px')
    expect(el.style.left).toBe('40px')
    expect(el.style.transform).toBe('')
    expect(store.calls()).toBe(0)

    fire(handle, 'pointerup', 692, 442)
    expect(store.calls()).toBe(1)
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({
      x: 40,
      y: 30,
      w: 660,
      h: 420,
    })
    store.stop()
  })

  it('honors the min-size floor when pulling past it (e handle, negative dx)', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const handle = handleOf(el, 'e')

    fire(handle, 'pointerdown', 518, 200)
    const store = spyStore()
    fire(handle, 'pointermove', -800, 210) // propose w = -302
    await flushFrame()
    expect(el.style.width).toBe('320px') // MIN_WINDOW_WIDTH floor

    fire(handle, 'pointerup', -800, 210)
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({
      x: 40,
      y: 30,
      w: 320,
      h: 320,
    })
    store.stop()
  })

  it('s handle grows height only; se caps at the viewport', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const sHandle = handleOf(el, 's')

    fire(sHandle, 'pointerdown', 280, 348)
    fire(sHandle, 'pointermove', 330, 498) // +50, +150 — dx must not touch width
    await flushFrame()
    expect(el.style.width).toBe('480px')
    expect(el.style.height).toBe('470px')
    fire(sHandle, 'pointerup', 330, 498)

    expect(useWMStore.getState().windows[id]!.geometry).toEqual({
      x: 40,
      y: 30,
      w: 480,
      h: 470,
    })

    // se beyond the viewport: capped at viewport bounds (800×600); the clamp
    // also pulls the origin so the full-viewport module sits at 0,0.
    const seHandle = handleOf(el, 'se')
    fire(seHandle, 'pointerdown', 518, 348)
    fire(seHandle, 'pointermove', 5000, 5000)
    await flushFrame()
    expect(el.style.width).toBe('800px')
    expect(el.style.height).toBe('600px')
    expect(el.style.left).toBe('0px') // transient visuals already equal the commit
    expect(el.style.top).toBe('0px')
    fire(seHandle, 'pointerup', 5000, 5000)
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({
      x: 0,
      y: 0,
      w: 800,
      h: 600,
    })
  })

  it('Escape cancels a resize: size restores, no commit; the shimmer attribute stays drag-only', async () => {
    renderHost()
    const id = open('Alpha')
    const el = dialogByName('Alpha')
    const handle = handleOf(el, 'se')

    fire(handle, 'pointerdown', 512, 342)
    const store = spyStore()
    fire(handle, 'pointermove', 692, 442)
    await flushFrame()

    expect(el.getAttribute('data-gesture')).toBe('resize') // NOT 'drag' — shimmer is drag-only
    expect(document.body.classList.contains('wm-gesture-live')).toBe(true)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(el.style.width).toBe('480px')
    expect(el.style.height).toBe('320px')
    expect(useWMStore.getState().windows[id]!.geometry).toEqual(GEOM)
    expect(store.calls()).toBe(0)
    expect(el.hasAttribute('data-gesture')).toBe(false)
    store.stop()
  })
})
