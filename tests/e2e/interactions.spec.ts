import { expect, test, type Page } from '@playwright/test'

/**
 * IM-4b e2e — window drag/resize against the real app graph in a real
 * Chromium, driven by REAL input (page.mouse rides CDP Input.dispatch*, so
 * these are genuine browser pointer events with pointer capture, not synthetic
 * page-script events).
 *
 * Gates (docs/ultron/plan.md IM-4b acceptance — Thor's law: 60fps or it
 * doesn't ship):
 * 1. THE FPS PROOF — a ~1s continuous title-bar drag while rAF frames are
 *    counted in-page via the TH-1 measureFps probe: ≥55fps average and no
 *    dropped-frame avalanche.
 * 2. Drag commits geometry exactly once (bounding box + store state), with
 *    the transient data-gesture state present mid-drag and gone after.
 * 3. Corner-bracket resize grows/clamps (min-size floor honored).
 * 4. Escape cancels a drag and restores; maximized modules are immovable.
 *
 * Opening a window goes through the REAL wm-store module (dev-server import
 * of /src/platform/stores/wm-store.ts — the same singleton the app graph
 * uses). The UI launch affordance is IM-4c's taskbar; until then this is the
 * honest programmatic equivalent of the IM-4c seam.
 */

/** Boot verdict on a fresh context: skip the POST, wait out the desktop. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

interface ProbeGeometry {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * The wm-store module as seen from the page. The dynamic import uses a
 * NON-literal specifier (a page-context URL the dev server serves, not a TS
 * module this file resolves) — so the shape is asserted instead. Defined
 * INLINE inside each evaluate callback: page.evaluate serializes function
 * source, not closures.
 */
interface WMStoreView {
  getState(): {
    openWindow(input: {
      appId: string
      title: string
      geometry?: ProbeGeometry
    }): string
    windows: Readonly<Record<string, { title: string; geometry: ProbeGeometry }>>
  }
}

/** Open one window through the real store module (see file comment). */
async function openWindow(page: Page, title: string, geometry?: ProbeGeometry): Promise<void> {
  await page.evaluate(
    async ({ title: t, geometry: g }) => {
      const url = '/src/platform/stores/wm-store.ts'
      const { useWMStore } = (await import(url)) as { useWMStore: WMStoreView }
      useWMStore.getState().openWindow({ appId: 'demo', title: t, ...(g ? { geometry: g } : {}) })
    },
    { title, geometry },
  )
  await expect(page.locator('.wm-window', { hasText: title })).toBeVisible()
}

/** Geometry of the window's record inside the live store. */
async function storedGeometry(page: Page, title: string): Promise<ProbeGeometry> {
  return page.evaluate(
    async (t: string) => {
      const url = '/src/platform/stores/wm-store.ts'
      const { useWMStore } = (await import(url)) as { useWMStore: WMStoreView }
      const win = Object.values(useWMStore.getState().windows).find((w) => w.title === t)
      if (!win) throw new Error(`no window titled ${t}`)
      return win.geometry
    },
    title,
  )
}

test('drag commits the geometry once: box moves by the drag delta, shimmer transient', async ({
  page,
}) => {
  await toDesktop(page)
  await openWindow(page, 'Drag Probe')

  const win = page.locator('.wm-window', { hasText: 'Drag Probe' })
  const bar = page.locator('.wm-titlebar')
  const before = (await win.boundingBox())!
  const barBox = (await bar.boundingBox())!
  const cx = barBox.x + barBox.width / 2
  const cy = barBox.y + barBox.height / 2

  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 140, cy + 90, { steps: 14 })

  // Mid-gesture: the transient drag state is live (shimmer attribute)…
  await expect(win).toHaveAttribute('data-gesture', 'drag')
  await page.mouse.up()

  // …and it is gone after the single commit.
  await expect(win).not.toHaveAttribute('data-gesture', 'drag')
  const after = (await win.boundingBox())!
  expect(Math.round(after.x - before.x)).toBe(140)
  expect(Math.round(after.y - before.y)).toBe(90)
  expect(Math.round(after.width)).toBe(Math.round(before.width))

  const stored = await storedGeometry(page, 'Drag Probe')
  expect(Math.round(stored.x - before.x)).toBe(140)
  expect(Math.round(stored.y - before.y)).toBe(90)
})

test('corner-bracket resize grows from the far edge and honors the min-size floor', async ({
  page,
}) => {
  await toDesktop(page)
  await openWindow(page, 'Resize Probe', { x: 100, y: 80, w: 480, h: 320 })

  const win = page.locator('.wm-window', { hasText: 'Resize Probe' })

  // se bracket: +180/+100 grows both axes, origin stays put. (boundingBox is
  // the border box; .wm-window carries the 1px instrument bevel → +2px.)
  const se = (await page.locator('[data-resize="se"]').boundingBox())!
  const seCx = se.x + se.width / 2
  const seCy = se.y + se.height / 2
  await page.mouse.move(seCx, seCy)
  await page.mouse.down()
  await page.mouse.move(seCx + 180, seCy + 100, { steps: 12 })
  await page.mouse.up()

  let box = (await win.boundingBox())!
  expect(Math.round(box.width)).toBe(662) // 660 geometry + 2px bevel border
  expect(Math.round(box.height)).toBe(422)
  expect(Math.round(box.x)).toBe(100)
  expect(Math.round(box.y)).toBe(80)
  let stored = await storedGeometry(page, 'Resize Probe')
  expect(stored).toEqual({ x: 100, y: 80, w: 660, h: 420 })

  // e pull far past the floor: width clamps to MIN_WINDOW_WIDTH (320).
  const e = (await page.locator('[data-resize="e"]').boundingBox())!
  const eCx = e.x + e.width / 2
  await page.mouse.move(eCx, 240)
  await page.mouse.down()
  await page.mouse.move(eCx - 1000, 240, { steps: 12 })
  await page.mouse.up()

  box = (await win.boundingBox())!
  expect(Math.round(box.width)).toBe(322) // 320 floor + bevel
  stored = await storedGeometry(page, 'Resize Probe')
  expect(stored.w).toBe(320)
  expect(stored.h).toBe(420) // e pull never touches height
})

test('Escape cancels a drag and restores the module to its berth', async ({ page }) => {
  await toDesktop(page)
  await openWindow(page, 'Escape Probe', { x: 100, y: 80, w: 480, h: 320 })

  const win = page.locator('.wm-window', { hasText: 'Escape Probe' })
  const before = (await win.boundingBox())!
  const bar = (await page.locator('.wm-titlebar').boundingBox())!

  await page.mouse.move(bar.x + 100, bar.y + 16)
  await page.mouse.down()
  await page.mouse.move(bar.x + 240, bar.y + 106, { steps: 10 })
  await page.keyboard.press('Escape')
  await page.mouse.up()

  await expect(win).not.toHaveAttribute('data-gesture', 'drag')
  const after = (await win.boundingBox())!
  expect(Math.round(after.x)).toBe(Math.round(before.x))
  expect(Math.round(after.y)).toBe(Math.round(before.y))
  const stored = await storedGeometry(page, 'Escape Probe')
  expect(stored.x).toBe(100)
  expect(stored.y).toBe(80)
})

test('maximized modules are fixed furniture — no drag, no handles', async ({ page }) => {
  await toDesktop(page)
  await openWindow(page, 'Max Probe', { x: 100, y: 80, w: 480, h: 320 })

  const win = page.locator('.wm-window', { hasText: 'Max Probe' })
  await page.getByRole('button', { name: 'Maximize' }).click()
  await expect(win).toHaveAttribute('data-maximized', 'true')
  await expect(page.locator('[data-resize]')).toHaveCount(0)

  const maximized = (await win.boundingBox())!
  const bar = (await page.locator('.wm-titlebar').boundingBox())!
  await page.mouse.move(bar.x + 120, bar.y + 16)
  await page.mouse.down()
  await page.mouse.move(bar.x + 320, bar.y + 200, { steps: 10 })
  await page.mouse.up()

  const after = (await win.boundingBox())!
  expect(Math.round(after.x)).toBe(Math.round(maximized.x))
  expect(Math.round(after.y)).toBe(Math.round(maximized.y))
  // The normal-state geometry survived untouched for the restore.
  const stored = await storedGeometry(page, 'Max Probe')
  expect(stored).toEqual({ x: 100, y: 80, w: 480, h: 320 })
})

test('THE FPS PROOF — ~1s continuous drag holds ≥55fps average with no frame avalanche', async ({
  page,
}) => {
  await toDesktop(page)
  // A compact module: the sweep below then moves the window LIVE the whole
  // circle (no viewport-clamp pinning) inside the 1280×720 default viewport.
  await openWindow(page, 'FPS Probe', { x: 100, y: 80, w: 480, h: 320 })

  const bar = (await page.locator('.wm-titlebar').boundingBox())!
  const grabX = bar.x + 240
  const grabY = bar.y + 16
  const before = await storedGeometry(page, 'FPS Probe')

  // rAF counting starts in-page (TH-1 measureFps, interval-based) before the
  // pointer goes down, and outlives the drag so the average includes settle.
  const sample = page.evaluate(async (): Promise<{
    fps: number
    frames: number
    elapsedMs: number
    longestDeltaMs: number
  }> => {
    const url = '/src/lib/perf/fps.ts' // page-context dev-server URL, not a TS module
    const { measureFps } = (await import(url)) as {
      measureFps: (durationMs: number) => Promise<{
        fps: number
        frames: number
        elapsedMs: number
        longestDeltaMs: number
      }>
    }
    return measureFps(1600)
  })

  await page.mouse.move(grabX, grabY)
  await page.mouse.down()
  const dragStart = Date.now()
  let step = 0
  while (Date.now() - dragStart < 1050) {
    const angle = (step++ / 30) * Math.PI * 2
    await page.mouse.move(520 + Math.cos(angle) * 150, 260 + Math.sin(angle) * 100)
  }
  await page.mouse.up()

  const fps = await sample
  // Visible in the run output (the annotation rides the report for HE-2 evidence).
  console.log(
    `[im-4b] drag fps: ${fps.fps.toFixed(1)} avg · ${fps.frames} frames / ${fps.elapsedMs.toFixed(0)}ms · longest gap ${fps.longestDeltaMs.toFixed(1)}ms`,
  )
  test.info().annotations.push({
    type: 'im-4b-drag-fps',
    description: `${fps.fps.toFixed(1)}fps avg, ${fps.frames} frames in ${fps.elapsedMs.toFixed(0)}ms, longest gap ${fps.longestDeltaMs.toFixed(1)}ms`,
  })

  // The drag was real movement (not a pinned/clamped no-op).
  const after = await storedGeometry(page, 'FPS Probe')
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(50)

  // Thor's law. 55 (not 60) leaves headroom for scheduler noise in headless;
  // the avalanche guard catches the failure mode a low average would miss.
  expect(fps.fps).toBeGreaterThanOrEqual(55)
  expect(fps.longestDeltaMs).toBeLessThan(100)
})
