// @vitest-environment jsdom
// AP-3 · viewer — the plate viewer through its real seams: the registration
// manifest, the routing that lights up the moment `image-viewer` registers
// (the desktop reserved-id table AND the explorer's acceptedFileTypes
// consultation — the last reserved FILE route), the per-plate window dedupe,
// the surface itself (matted plate + engraved caption, fit default, the F
// fit/1:1 toggle, +/− zoom steps with clamps, drag-to-pan armed ONLY on
// overflow, resize re-fit, the missing-src/removed/empty notices), the
// per-session view memory, and the pure model math.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createPointerEvent } from '../../lib/perf/gesture'
import { deleteNode, renameNode, type FSImageNode } from '../../lib/fs'
import {
  listApps,
  openApp,
  registerApps,
  resetAppRegistry,
  type AppLaunchContext,
} from '../../platform/app-registry'
import { resetLazyMount } from '../../platform/app-registry/lazy-mount'
import { openSpecimen, resolveOpenRoute } from '../../platform/desktop'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { apps } from '../index'
import { viewerApp } from './index'
import { ViewerIcon } from './ViewerIcon'
import ViewerSurface from './ViewerSurface'
import {
  ACTUAL_VIEW,
  CAPTION_HEIGHT,
  FIT_VIEW,
  MAT_PADDING,
  ZOOM_MAX,
  ZOOM_MIN,
  clampPan,
  clampZoom,
  displaySize,
  effectiveScale,
  fitScale,
  formatLabelStamp,
  imageBox,
  imageSpecimen,
  overflowOf,
  pannable,
  plateId,
  sessionView,
  setSessionView,
  stepZoom,
  toggleFit,
  viewReadout,
} from './viewer-model'
import { childOpenTarget } from '../explorer/explorer-model'

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  setSessionView(FIT_VIEW)
  resetAppRegistry()
  registerApps(apps) // the REAL startup registration (notepad + viewer + explorer)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/* -------------------------------- helpers --------------------------------- */

const node = (id: string) => useFSStore.getState().fs.nodes[id]!

const plateNode = (id: string): FSImageNode => {
  const found = node(id)
  if (found.kind !== 'image') throw new Error(`node ${id} is not a plate`)
  return found
}

const fileLaunch = (id: string): AppLaunchContext => ({ source: 'file', file: node(id) })

/** Mount against a REAL registry window so close paths are observable. */
function mountWindowed(id: string) {
  const windowId = openApp('image-viewer', fileLaunch(id))!
  const view = render(<ViewerSurface windowId={windowId} launch={fileLaunch(id)} />)
  return { windowId, view }
}

const mountLauncher = () => {
  const windowId = openApp('image-viewer')!
  const view = render(<ViewerSurface windowId={windowId} launch={{ source: 'launcher' }} />)
  return { windowId, view }
}

const windowCount = (): number => Object.keys(useWMStore.getState().windows).length

const commit = useFSStore.getState().commit

/* ------------------------------ the manifest ------------------------------- */

describe('AP-3 · registration manifest', () => {
  it('rides the startup apps array under the RESERVED id "image-viewer"', () => {
    expect(apps).toContain(viewerApp)
    expect(viewerApp.id).toBe('image-viewer')
    expect(viewerApp.name).toBe('Plate Viewer')
  })

  it('declares multi-instance (no singleton), image capability, and geometry hints', () => {
    expect(viewerApp.singleton).toBeUndefined() // one window PER PLATE, not one ever
    expect(viewerApp.acceptedFileTypes).toEqual(['image'])
    expect(viewerApp.defaultGeometry).toEqual({ w: 640, h: 520 })
  })

  it('mounts a LAZY surface (own chunk) and a render-only icon', () => {
    expect(typeof viewerApp.mount).toBe('function') // retryableLazy(() => import(...)) — HU-1
    expect(resetLazyMount(viewerApp.mount)).toBe(true) // it IS a retryable lazy mount
    expect(viewerApp.icon).toBe(ViewerIcon)
    const { container } = render(<ViewerIcon size={20} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('registers behind the notepad — the launcher first item stays stable', () => {
    const ids = listApps().map((app) => app.id)
    expect(ids.indexOf('notepad')).toBe(0) // taskbar launcher floor rides it
    expect(ids.indexOf('image-viewer')).toBeGreaterThan(ids.indexOf('notepad'))
  })
})

/* ------------------- routing lights up (the point of AP-3) ------------------ */

describe('AP-3 · image routing lights up at registration', () => {
  it('the DESKTOP routing table targets image-viewer and openSpecimen opens THIS app', () => {
    expect(resolveOpenRoute(node('reference-plate')).appId).toBe('image-viewer')
    openSpecimen(node('reference-plate'))
    expect(windowCount()).toBe(1)
    const record = Object.values(useWMStore.getState().windows)[0]!
    expect(record.appId).toBe('image-viewer')
    expect(record.launch).toEqual({ source: 'file', file: node('reference-plate') })
  })

  it('the EXPLORER consultation (acceptedFileTypes, first declaring wins) resolves image-viewer', () => {
    // The real startup registry — no probe; no other manifest declares image.
    expect(childOpenTarget(node('reference-plate'), listApps())).toBe('image-viewer')
    expect(childOpenTarget(node('observation-plate'), listApps())).toBe('image-viewer')
  })
})

/* ------------------------- per-plate window dedupe -------------------------- */

describe('AP-3 · one window per plate (openApp instance rules)', () => {
  it('opening the same plate twice focuses ONE window; different plates get their own', () => {
    const reference = openApp('image-viewer', fileLaunch('reference-plate'))!
    const again = openApp('image-viewer', fileLaunch('reference-plate'))
    const observation = openApp('image-viewer', fileLaunch('observation-plate'))!

    expect(again).toBe(reference)
    expect(observation).not.toBe(reference)
    expect(windowCount()).toBe(2)
    const windows = useWMStore.getState().windows
    expect(windows[reference]!.instanceId).toBe('file:reference-plate')
    expect(windows[observation]!.instanceId).toBe('file:observation-plate')
  })

  it('re-opening a minimized plate window restores + focuses it (no duplicate)', () => {
    const reference = openApp('image-viewer', fileLaunch('reference-plate'))!
    act(() => {
      useWMStore.getState().minimizeWindow(reference)
    })
    const again = openApp('image-viewer', fileLaunch('reference-plate'))

    expect(again).toBe(reference)
    expect(windowCount()).toBe(1)
    expect(useWMStore.getState().windows[reference]!.minimized).toBe(false)
    expect(useWMStore.getState().focusedId).toBe(reference)
  })

  it('a launcher open is its own fresh window (an EMPTY stage per open)', () => {
    const first = openApp('image-viewer')!
    const second = openApp('image-viewer')
    expect(first).not.toBe(second)
    expect(windowCount()).toBe(2)
  })
})

/* --------------------- the surface: chrome + matted plate -------------------- */

describe('AP-3 · the plate viewer surface', () => {
  it('carries the engraved name, the accession well, and the matted plate with its caption', () => {
    mountWindowed('reference-plate')

    expect(document.querySelector('[data-viewer-name]')!.textContent).toBe(
      'reference-plate.png',
    )
    expect(document.querySelector('.viewer-accession')!.textContent).toBe('PLT-0001')

    const img = document.querySelector('[data-viewer-image]') as HTMLImageElement
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(img.getAttribute('alt')).toBe('reference-plate.png')

    // The engraved caption strip: accession, name, and the label stamp in
    // B612 digits (the stamp computed from the plate's own accessionedAt).
    const caption = document.querySelector('[data-viewer-caption]')!
    expect(caption.textContent).toContain('PLT-0001')
    expect(caption.textContent).toContain('reference-plate.png')
    const stamp = document.querySelector('.viewer-caption-stamp')!
    expect(stamp.textContent).toBe(`LABELLED ${formatLabelStamp(plateNode('reference-plate').accessionedAt)}`)
    expect(stamp.textContent).toMatch(/LABELLED \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('opens in FIT by default (mode attribute + readout)', () => {
    mountWindowed('reference-plate')
    const root = document.querySelector('[data-viewer-surface]')!
    expect(root.getAttribute('data-view-mode')).toBe('fit')
    expect(document.querySelector('[data-viewer-readout]')!.textContent).toBe('FIT')
    // The toggle's label names the ACTION offered: 1:1, not Fit (the readout
    // already names the state — the two never say the same thing twice).
    expect(document.querySelector('[data-viewer-toggle]')!.textContent).toBe('1:1')
  })

  it('typesets the caption per the typeface law: B612 digits, label-face name (source-scan)', () => {
    // jsdom applies no CSS; the honest check is the caption rules themselves —
    // accession/stamp digits ride the mono face, the name rides the label
    // face, and the mat/caption geometry mirrors the model's constants.
    const css = readFileSync('src/apps/image-viewer/viewer.css', 'utf-8')
    const digitsRule = /\.viewer-caption-accession,\s*\.viewer-caption-stamp\s*\{[^}]*\}/.exec(css)![0]!
    expect(digitsRule).toContain('font-family: var(--font-mono)')
    expect(digitsRule).not.toContain('--font-label')

    const nameRule = /\.viewer-caption-name\s*\{[^}]*\}/.exec(css)![0]!
    expect(nameRule).toContain('font-family: var(--font-label)')

    // The measuring law: the mat's padding and the caption band's height in
    // CSS must equal the model constants the fit math subtracts.
    const stageRule = /\.viewer-stage\s*\{[^}]*\}/.exec(css)![0]!
    expect(new RegExp(`padding:\\s*${MAT_PADDING}px;`).test(stageRule)).toBe(true)
    const captionRule = /\.viewer-caption\s*\{[^}]*\}/.exec(css)![0]!
    expect(new RegExp(`height:\\s*${CAPTION_HEIGHT}px;`).test(captionRule)).toBe(true)
  })
})

/* ---------------------- keyboard + controls: fit / 1:1 / zoom ---------------- */

describe('AP-3 · fit/1:1 toggle and zoom steps', () => {
  const stage = (): HTMLElement => document.querySelector('[data-viewer-stage]')!
  const root = (): HTMLElement => document.querySelector('[data-viewer-surface]')!
  const readout = (): string =>
    document.querySelector('[data-viewer-readout]')!.textContent ?? ''

  it('F toggles fit ↔ 1:1: readout FIT → 100% → FIT, the toggle label swaps', () => {
    mountWindowed('reference-plate')

    fireEvent.keyDown(stage(), { key: 'f' })
    expect(root().getAttribute('data-view-mode')).toBe('zoom')
    expect(readout()).toBe('100%')
    expect(root().getAttribute('data-zoom')).toBe('1')
    expect(document.querySelector('[data-viewer-toggle]')!.textContent).toBe('Fit')

    fireEvent.keyDown(stage(), { key: 'F' }) // case-insensitive
    expect(root().getAttribute('data-view-mode')).toBe('fit')
    expect(readout()).toBe('FIT')
    expect(document.querySelector('[data-viewer-toggle]')!.textContent).toBe('1:1')
  })

  it('the toolbar toggle drives the same law as the key', () => {
    mountWindowed('reference-plate')

    fireEvent.click(document.querySelector('[data-viewer-toggle]')!)
    expect(root().getAttribute('data-view-mode')).toBe('zoom')
    expect(readout()).toBe('100%')

    fireEvent.click(document.querySelector('[data-viewer-toggle]')!)
    expect(root().getAttribute('data-view-mode')).toBe('fit')
    expect(readout()).toBe('FIT')
  })

  it('+/- step 25% from the 1:1 anchor; = and _ alias the keys', () => {
    mountWindowed('reference-plate')

    fireEvent.keyDown(stage(), { key: '+' })
    expect(readout()).toBe('125%')
    fireEvent.keyDown(stage(), { key: '=' }) // the unshifted key on US layouts
    expect(readout()).toBe('150%')
    fireEvent.keyDown(stage(), { key: '-' })
    expect(readout()).toBe('125%')
    fireEvent.keyDown(stage(), { key: '_' }) // shifted -
    expect(readout()).toBe('100%')
  })

  it('zoom clamps at both ends (25%–400%)', () => {
    mountWindowed('reference-plate')
    const zoomIn = document.querySelector<HTMLButtonElement>('[data-viewer-zoom-in]')!

    for (let i = 0; i < 12; i++) fireEvent.click(zoomIn) // 100 → 400 in 25s
    expect(readout()).toBe('400%')
    fireEvent.click(zoomIn) // clamped
    expect(readout()).toBe('400%')
    expect(root().getAttribute('data-zoom')).toBe(String(ZOOM_MAX))

    const zoomOut = document.querySelector<HTMLButtonElement>('[data-viewer-zoom-out]')!
    for (let i = 0; i < 16; i++) fireEvent.click(zoomOut) // 400 → 25 in 15s, then clamped
    expect(readout()).toBe('25%')
    expect(root().getAttribute('data-zoom')).toBe(String(ZOOM_MIN))
  })

  it('zoom controls are DEAD without a developed plate (launcher stage)', () => {
    mountLauncher()
    expect(document.querySelector<HTMLButtonElement>('[data-viewer-zoom-in]')!.disabled).toBe(
      true,
    )
    expect(document.querySelector<HTMLButtonElement>('[data-viewer-toggle]')!.disabled).toBe(true)

    fireEvent.keyDown(document.querySelector('[data-viewer-stage]')!, { key: 'f' })
    expect(root().getAttribute('data-view-mode')).toBe('fit') // no plate → no view change
  })

  it('records the per-session view memory: a NEW plate window inherits the last stance', () => {
    const first = mountWindowed('reference-plate')
    fireEvent.keyDown(first.view.container.querySelector('[data-viewer-stage]')!, { key: '+' })
    fireEvent.keyDown(first.view.container.querySelector('[data-viewer-stage]')!, { key: '+' })
    fireEvent.keyDown(first.view.container.querySelector('[data-viewer-stage]')!, { key: '+' })
    fireEvent.keyDown(first.view.container.querySelector('[data-viewer-stage]')!, { key: '+' })
    expect(sessionView()).toEqual({ mode: 'zoom', pct: 2 })

    const second = mountWindowed('observation-plate')
    const secondRoot = second.view.container.querySelector('[data-viewer-surface]')!
    expect(secondRoot.getAttribute('data-view-mode')).toBe('zoom')
    expect(secondRoot.getAttribute('data-zoom')).toBe('2')
    expect(second.view.container.querySelector('[data-viewer-readout]')!.textContent).toBe('200%')
  })
})

/* --------------------- measuring: fit re-fit + pan arming -------------------- */

describe('AP-3 · fit re-fit and pan arming (measured stage)', () => {
  beforeEach(() => {
    // Deterministic fallback path: no ResizeObserver in this environment,
    // so the surface re-measures on window resize (the jsdom/host fallback).
    vi.stubGlobal('ResizeObserver', undefined)
  })

  const stageEl = (): HTMLElement => document.querySelector('[data-viewer-stage]')!
  const img = (): HTMLImageElement => document.querySelector('[data-viewer-image]')!
  const plate = (): HTMLElement => document.querySelector('[data-viewer-plate]')!

  /** Give the rendered plate a natural size (jsdom images never load). */
  const armNatural = (w: number, h: number): void => {
    const el = img()
    Object.defineProperty(el, 'naturalWidth', { value: w, configurable: true })
    Object.defineProperty(el, 'naturalHeight', { value: h, configurable: true })
    act(() => {
      fireEvent.load(el)
    })
  }

  /** Point the stage's rect at a chosen box, then trigger re-measure. */
  const setStage = (w: number, h: number): void => {
    const el = stageEl()
    el.getBoundingClientRect = () =>
      ({ width: w, height: h, x: 0, y: 0, top: 0, left: 0, bottom: h, right: w }) as DOMRect
    act(() => {
      fireEvent(window, new Event('resize'))
    })
  }

  it('fit scales the plate into the mat and RE-FITS when the window resizes', () => {
    mountWindowed('reference-plate')
    armNatural(320, 220)

    // A 700×500 stage: box = 664 × 418 → contain scale 1.9 → 608×418.
    setStage(700, 500)
    expect(img().style.width).toBe('608px')
    expect(img().style.height).toBe('418px')

    // The window shrinks (a WM resize): fit re-solves. 400×300 → box 364×218
    // → scale min(364/320, 218/220) = 0.99090… → 317×218.
    setStage(400, 300)
    expect(img().style.width).toBe('317px')
    expect(img().style.height).toBe('218px')
  })

  it('pan is armed ONLY while the plate overflows the mat', () => {
    mountWindowed('reference-plate')
    armNatural(320, 220)
    setStage(700, 500)

    // Fit never overflows (that is its definition here).
    expect(stageEl().hasAttribute('data-pannable')).toBe(false)

    // 1:1 (320×220 into a 664×418 box) still fits — no pan.
    fireEvent.keyDown(stageEl(), { key: 'f' })
    expect(stageEl().hasAttribute('data-pannable')).toBe(false)

    // 200% (640×440) spills 22px past the box's height — pan arms.
    for (let i = 0; i < 4; i++) fireEvent.keyDown(stageEl(), { key: '+' })
    expect(stageEl().getAttribute('data-pannable')).toBe('true')
  })

  it('drag pans with transform only, commits once at pointerup, clamped to the overflow', () => {
    mountWindowed('reference-plate')
    armNatural(320, 220)
    setStage(700, 500)
    for (let i = 0; i < 4; i++) fireEvent.keyDown(stageEl(), { key: '+' }) // 200%
    // overflow = { w: 0, h: 22 } → x clamps to 0, y clamps to ±11.

    const point = (type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) =>
      act(() => {
        stageEl().dispatchEvent(createPointerEvent(type, { x, y }, { pointerId: 7 }))
      })

    point('pointerdown', 100, 100)
    expect(stageEl().getAttribute('data-panning')).toBe('true') // the hand takes the mat
    point('pointermove', 130, 105)
    // Live gesture: transform carried the clamped offset mid-drag (5px down).
    expect(plate().style.transform).toBe('translate3d(0px, 5px, 0)')

    // Overshoot on both axes: x dead (no horizontal overflow), y pinned at 11.
    point('pointermove', 400, 300)
    expect(plate().style.transform).toBe('translate3d(0px, 11px, 0)')

    // Pointerup commits: the React-owned transform persists (byte-identical)
    // and the mat leaves the grabbed state.
    point('pointerup', 400, 300)
    expect(plate().style.transform).toBe('translate3d(0px, 11px, 0)')
    expect(stageEl().hasAttribute('data-panning')).toBe(false)

    // A second gesture starts from the COMMITTED pan (11px) and ends at −9.
    act(() => {
      stageEl().dispatchEvent(createPointerEvent('pointerdown', { x: 100, y: 100 }, { pointerId: 8 }))
    })
    act(() => {
      stageEl().dispatchEvent(createPointerEvent('pointermove', { x: 100, y: 80 }, { pointerId: 8 }))
    })
    expect(plate().style.transform).toBe('translate3d(0px, -9px, 0)')
    act(() => {
      stageEl().dispatchEvent(createPointerEvent('pointerup', { x: 100, y: 80 }, { pointerId: 8 }))
    })
    expect(plate().style.transform).toBe('translate3d(0px, -9px, 0)')
  })

  it('Escape mid-pan bounces the plate back to its pre-gesture offset', () => {
    mountWindowed('reference-plate')
    armNatural(320, 220)
    setStage(700, 500)
    for (let i = 0; i < 4; i++) fireEvent.keyDown(stageEl(), { key: '+' })

    act(() => {
      stageEl().dispatchEvent(createPointerEvent('pointerdown', { x: 100, y: 100 }, { pointerId: 9 }))
    })
    act(() => {
      stageEl().dispatchEvent(createPointerEvent('pointermove', { x: 100, y: 90 }, { pointerId: 9 }))
    })
    expect(plate().style.transform).toBe('translate3d(0px, -10px, 0)') // up 10 reveals below
    fireEvent.keyDown(document.querySelector('[data-viewer-surface]')!, { key: 'Escape' })
    expect(plate().style.transform).toBe('translate3d(0px, 0px, 0)')
  })
})

/* -------------------------------- notices ---------------------------------- */

describe('AP-3 · in-world notices (missing src, unreadable, removed, empty stage)', () => {
  it('a plate with an EMPTY src draws the PLATE NOT DEVELOPED notice, no image', () => {
    mountWindowed('reference-plate')
    act(() => {
      const { fs } = useFSStore.getState()
      const bare = plateNode('reference-plate')
      commit({ ...fs, nodes: { ...fs.nodes, 'reference-plate': { ...bare, src: '' } } })
    })

    expect(document.querySelector('[data-viewer-empty-src]')).not.toBeNull()
    expect(document.querySelector('[data-viewer-empty-src]')!.textContent).toContain(
      'Plate not developed',
    )
    expect(document.querySelector('[data-viewer-image]')).toBeNull()
    expect(document.querySelector('[data-viewer-removed]')).toBeNull()
  })

  it('a src the browser refuses (onError) draws the same notice', () => {
    mountWindowed('reference-plate')
    act(() => {
      fireEvent.error(document.querySelector('[data-viewer-image]')!)
    })
    expect(document.querySelector('[data-viewer-empty-src]')).not.toBeNull()
  })

  it('deleting the node elsewhere swaps the mat for a close-only REMOVED notice', () => {
    const { windowId } = mountWindowed('reference-plate')
    act(() => {
      const { fs } = useFSStore.getState()
      commit(deleteNode(fs, 'reference-plate'))
    })

    expect(document.querySelector('[data-viewer-removed]')).not.toBeNull()
    expect(document.querySelector('[data-viewer-removed]')!.textContent).toContain(
      'Plate removed from catalog',
    )
    expect(document.querySelector('[data-viewer-image]')).toBeNull()
    expect(document.querySelector('[data-viewer-empty-src]')).toBeNull() // not a src problem

    fireEvent.click(document.querySelector('[data-viewer-removed-close]')!)
    expect(useWMStore.getState().windows[windowId]).toBeUndefined()
  })

  it('a window restored after its plate died opens straight onto the notice', () => {
    // The WM record carries the launch ctx as an immutable SNAPSHOT — it
    // outlives the node (the reload path).
    const launchCtx = fileLaunch('reference-plate')
    act(() => {
      const { fs } = useFSStore.getState()
      commit(deleteNode(fs, 'reference-plate'))
    })
    render(<ViewerSurface windowId="w-restore" launch={launchCtx} />)

    expect(document.querySelector('[data-viewer-removed]')).not.toBeNull()
    expect(document.querySelector('[data-viewer-image]')).toBeNull()
  })

  it('a launcher open is an EMPTY STAGE: notice, unfiled readouts, dead zoom', () => {
    mountLauncher()

    expect(document.querySelector('[data-viewer-empty-stage]')).not.toBeNull()
    expect(document.querySelector('[data-viewer-empty-stage]')!.textContent).toContain(
      'No plate mounted',
    )
    expect(document.querySelector('[data-viewer-name]')!.textContent).toBe('No plate mounted')
    expect(document.querySelector('.viewer-accession')!.textContent).toBe('UNFILED')
    expect(document.querySelector<HTMLButtonElement>('[data-viewer-zoom-out]')!.disabled).toBe(
      true,
    )
  })
})

/* ------------------------------- pure model --------------------------------- */

describe('AP-3 · model math (pure)', () => {
  const sheet = () => useFSStore.getState().fs

  it('plateId: file launch → the node id; launcher → null', () => {
    expect(plateId(fileLaunch('reference-plate'))).toBe('reference-plate')
    expect(plateId({ source: 'launcher' })).toBeNull()
  })

  it('imageSpecimen: live image node → itself; missing/foreign-kind/null-id → null', () => {
    expect(imageSpecimen(sheet(), 'reference-plate')!.kind).toBe('image')
    expect(imageSpecimen(sheet(), 'no-such-node')).toBeNull()
    expect(imageSpecimen(sheet(), 'projects')).toBeNull() // a drawer is not a plate
    expect(imageSpecimen(sheet(), 'charter')).toBeNull() // a text specimen neither
    expect(imageSpecimen(sheet(), null)).toBeNull()
  })

  it('imageBox: the mat arithmetic — padding both axes, caption band vertical', () => {
    expect(imageBox({ w: 700, h: 500 })).toEqual({
      w: 700 - MAT_PADDING * 2,
      h: 500 - MAT_PADDING * 2 - CAPTION_HEIGHT,
    })
    expect(imageBox({ w: 0, h: 0 })).toEqual({ w: 0, h: 0 }) // never negative
  })

  it('fitScale: contains up AND down; degenerate dimensions read as 1', () => {
    expect(fitScale({ w: 320, h: 220 }, { w: 640, h: 440 })).toBe(2) // enlarges honestly
    expect(fitScale({ w: 320, h: 220 }, { w: 160, h: 440 })).toBe(0.5) // width-bound
    expect(fitScale({ w: 320, h: 220 }, { w: 0, h: 440 })).toBe(1) // unmeasured
    expect(fitScale({ w: 0, h: 0 }, { w: 640, h: 440 })).toBe(1)
  })

  it('effectiveScale: fit consults the stage; zoom is the declared pct', () => {
    expect(effectiveScale({ w: 320, h: 220 }, FIT_VIEW, { w: 700, h: 500 })).toBeCloseTo(1.9)
    expect(effectiveScale({ w: 320, h: 220 }, { mode: 'zoom', pct: 2 }, { w: 700, h: 500 })).toBe(2)
  })

  it('toggleFit/stepZoom/clampZoom: the F law, the 1:1 anchor, the 25–400% clamps', () => {
    expect(toggleFit(FIT_VIEW)).toEqual(ACTUAL_VIEW) // fit → actual pixels
    expect(toggleFit({ mode: 'zoom', pct: 2.5 })).toEqual(FIT_VIEW) // any zoom → fit
    expect(stepZoom(FIT_VIEW, 1)).toEqual({ mode: 'zoom', pct: 1.25 }) // anchored at 100%
    expect(stepZoom(FIT_VIEW, -1)).toEqual({ mode: 'zoom', pct: 0.75 })
    expect(stepZoom({ mode: 'zoom', pct: 3.9 }, 1)).toEqual({ mode: 'zoom', pct: ZOOM_MAX })
    expect(stepZoom({ mode: 'zoom', pct: 0.4 }, -1)).toEqual({ mode: 'zoom', pct: ZOOM_MIN })
    expect(clampZoom(99)).toBe(ZOOM_MAX)
    expect(clampZoom(0.01)).toBe(ZOOM_MIN)
  })

  it('viewReadout: FIT or whole percents', () => {
    expect(viewReadout(FIT_VIEW)).toBe('FIT')
    expect(viewReadout({ mode: 'zoom', pct: 1 })).toBe('100%')
    expect(viewReadout({ mode: 'zoom', pct: 1.25 })).toBe('125%')
  })

  it('overflowOf/pannable/clampPan: pan exists only past the edges, never past half-spill', () => {
    const overflow = overflowOf({ w: 640, h: 440 }, { w: 664, h: 418 })
    expect(overflow).toEqual({ w: 0, h: 22 })
    expect(pannable({ w: 640, h: 440 }, { w: 664, h: 418 })).toBe(true) // 22px of vertical spill
    expect(pannable({ w: 320, h: 220 }, { w: 664, h: 418 })).toBe(false)

    // Centered plate: ± half the overflow, dead on the contained axis.
    expect(clampPan({ x: 999, y: 15 }, overflow)).toEqual({ x: 0, y: 11 })
    expect(clampPan({ x: -999, y: -15 }, overflow)).toEqual({ x: 0, y: -11 })
    expect(clampPan({ x: 30, y: 10 }, { w: 40, h: 0 })).toEqual({ x: 20, y: 0 })
  })

  it('displaySize rounds to whole CSS pixels', () => {
    expect(displaySize({ w: 320, h: 220 }, 0.99090909)).toEqual({ w: 317, h: 218 })
  })

  it('formatLabelStamp: mission-clock YYYY-MM-DD HH:MM, UTC', () => {
    expect(formatLabelStamp(Date.UTC(2087, 2, 14, 9, 26))).toBe('2087-03-14 09:26')
    expect(formatLabelStamp(Date.UTC(2087, 10, 1, 23, 5))).toBe('2087-11-01 23:05')
  })
})


/* ============================== HU-2 edges ================================ */

describe('HU-2 (h) · the plate window follows a rename made elsewhere', () => {
  it('mounting retitles onto the plate; an explorer-side relabel follows live', () => {
    const { windowId } = mountWindowed('reference-plate')
    const seededName = node('reference-plate').name
    expect(useWMStore.getState().windows[windowId]!.title).toBe(seededName)

    act(() => {
      commit(renameNode(useFSStore.getState().fs, 'reference-plate', 'REPLATE.PNG'))
    })

    expect(document.querySelector('[data-viewer-name]')!.textContent).toBe('REPLATE.PNG')
    expect(useWMStore.getState().windows[windowId]!.title).toBe('REPLATE.PNG')
  })

  it('an empty stage keeps the module name (no plate to follow)', () => {
    const { windowId } = mountLauncher()
    expect(useWMStore.getState().windows[windowId]!.title).toBe('Plate Viewer')
  })
})

describe('HU-2 (d) · a very long plate name clamps with the full text on hover', () => {
  it('the header name carries title = the whole name and ellipsizes (CSS law)', () => {
    const { windowId } = mountWindowed('reference-plate')
    const LONG = 'REFERENCE-PLATE-WITH-AN-UNBOUNDED-CATALOG-LABEL-RUNNING-PAST-TOOLBAR-2087.PNG'
    act(() => {
      commit(renameNode(useFSStore.getState().fs, 'reference-plate', LONG))
    })
    const name = document.querySelector('[data-viewer-name]') as HTMLElement
    expect(name.textContent).toBe(LONG)
    expect(name.getAttribute('title')).toBe(LONG)
    expect(useWMStore.getState().windows[windowId]!.title).toBe(LONG)

    const css = readFileSync('src/apps/image-viewer/viewer.css', 'utf8')
    const nameBlock = css.split('.viewer-name')[1]!.split('}')[0]!
    expect(nameBlock).toContain('text-overflow: ellipsis')
    expect(nameBlock).toContain('white-space: nowrap')
  })
})
