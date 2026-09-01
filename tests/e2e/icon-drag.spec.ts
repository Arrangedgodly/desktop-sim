import { expect, test, type Page } from '@playwright/test'

/**
 * IM-5 e2e — desktop icon interactions against the real app graph in a real
 * Chromium, driven by REAL input (page.mouse rides CDP Input.dispatch* —
 * genuine pointer events with capture, elementFromPoint, the works).
 *
 * Gates (docs/ultron/plan.md IM-5 acceptance — Thor's law: 60fps or it
 * doesn't ship):
 * 1. Drag an icon to a new position → ONE grid-snapped commit → reload → the
 *    placement persists (the archive remembers).
 * 2. Drag a specimen onto the Projects drawer → it files INSIDE (drawer-pull
 *    highlight mid-drag, icon leaves the field, parentId moves, persists).
 * 3. Double-click the about module reference → soft-fail (no explorer/about
 *    app registered yet) — no window, no crash, the desktop stays operable.
 * 4. THE FPS PROOF — a ~1s continuous icon drag while rAF frames are counted
 *    in-page via the TH-1 measureFps probe: ≥55fps average, no avalanche.
 *
 * Store assertions import the REAL fs-store module from the dev server (the
 * same singleton the app graph uses) — the honest seam until IM-4c's taskbar.
 */

/** Boot verdict on a fresh context: skip the POST, wait out the desktop. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/**
 * Retire the first-visit docent (its cards annotate the space right of the
 * field) with one bare-plate click, so drag geometry has clean ground.
 */
async function retireDocent(page: Page): Promise<void> {
  await page.mouse.click(900, 600)
  await expect(page.locator('[data-docent]')).toHaveCount(0)
}

/** The fs-store module as seen from the page (dev-server URL, asserted shape). */
interface FSStoreView {
  getState(): {
    fs: {
      nodes: Readonly<Record<string, { parentId: string | null }>>
      iconPositions: Readonly<Record<string, { x: number; y: number }>>
    }
  }
}

async function fsState(page: Page): Promise<ReturnType<FSStoreView['getState']>['fs']> {
  return page.evaluate(async () => {
    const url = '/src/platform/stores/fs-store.ts' // page-context URL, not a TS module
    const { useFSStore } = (await import(url)) as { useFSStore: FSStoreView }
    return useFSStore.getState().fs
  })
}

/** Mouse-drag one locator's element by (dx, dy), with stepped moves. */
async function dragBy(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
): Promise<void> {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 })
}

test('drag commits a grid-snapped position once and it persists through reload', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  const charter = page.locator('[data-specimen-id="charter"]')
  const before = (await charter.boundingBox())! // seeded slot (1,0) → 132,28
  expect(Math.round(before.x)).toBe(132)
  expect(Math.round(before.y)).toBe(28)

  // +208/+264 lands the origin exactly on cell (3,2) → 340,292.
  await dragBy(page, before, 208, 264)

  // Mid-gesture: the transient drag state is live (shimmer + ghost)…
  await expect(charter).toHaveAttribute('data-gesture', 'drag')
  await page.mouse.up()

  // …gone after the single commit; the icon sits on the snapped grid cell.
  await expect(charter).not.toHaveAttribute('data-gesture', 'drag')
  const after = (await charter.boundingBox())!
  expect(Math.round(after.x)).toBe(340)
  expect(Math.round(after.y)).toBe(292)

  const fs = await fsState(page)
  expect(fs.iconPositions['charter']).toEqual({ x: 3, y: 2 })

  // The archive remembers: let the debounced autosave flush, then reload.
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  const persisted = (await page.locator('[data-specimen-id="charter"]').boundingBox())!
  expect(Math.round(persisted.x)).toBe(340)
  expect(Math.round(persisted.y)).toBe(292)
  expect((await fsState(page)).iconPositions['charter']).toEqual({ x: 3, y: 2 })
})

test('dragging a specimen onto the Projects drawer files it inside — and it stays', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  const charter = page.locator('[data-specimen-id="charter"]')
  const projects = page.locator('[data-specimen-id="projects"]')
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)

  const charterBox = (await charter.boundingBox())!
  const projectsBox = (await projects.boundingBox())!

  await dragBy(
    page,
    charterBox,
    projectsBox.x + projectsBox.width / 2 - (charterBox.x + charterBox.width / 2),
    projectsBox.y + projectsBox.height / 2 - (charterBox.y + charterBox.height / 2),
  )

  // Mid-drag over the drawer: the drawer-pull affordance is showing.
  await expect(projects).toHaveAttribute('data-drop-target', 'true')
  await page.mouse.up()

  // The specimen left the field; the drawer keeps its highlight only while
  // hovered (retired at gesture end).
  await expect(charter).toHaveCount(0)
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(4)
  await expect(projects).not.toHaveAttribute('data-drop-target', 'true')

  // The move is real: charter now lives inside projects, its desktop
  // placement pruned (a moved node re-contextualizes — MF-1 rule).
  const fs = await fsState(page)
  expect(fs.nodes['charter']!.parentId).toBe('projects')
  expect(fs.iconPositions['charter']).toBeUndefined()

  // Reload: still filed inside (persistence, not a lucky render).
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(4)
  await expect(page.locator('[data-specimen-id="charter"]')).toHaveCount(0)
  const reloaded = await fsState(page)
  expect(reloaded.nodes['charter']!.parentId).toBe('projects')
})

test('double-clicking the about module reference soft-fails: no window, no crash', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  // 'about' is not registered until AP-5 — the routing table still dispatches
  // to it; openApp's contract soft-fail (warn + null, never a throw) is the
  // correct behavior. No window appears and the desktop stays fully operable.
  await page.locator('[data-specimen-id="nameplate"]').dblclick()

  await expect(page.locator('.wm-window')).toHaveCount(0)
  await expect(page.locator('[data-desktop-stage]')).toBeVisible()

  const projects = page.locator('[data-specimen-id="projects"]')
  await projects.click()
  await expect(projects).toHaveAttribute('data-selected', 'true')
})

test('THE FPS PROOF — ~1s continuous icon drag holds ≥55fps average with no frame avalanche', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  const charter = page.locator('[data-specimen-id="charter"]')
  const before = (await charter.boundingBox())!
  const grabX = before.x + before.width / 2
  const grabY = before.y + before.height / 2

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
    await page.mouse.move(430 + Math.cos(angle) * 150, 250 + Math.sin(angle) * 100)
  }
  // Release over known bare plate (right of the field, below the cards).
  await page.mouse.move(760, 520)
  await page.mouse.up()

  const fps = await sample
  // Visible in the run output (the annotation rides the report for HE-2 evidence).
  console.log(
    `[im-5] icon drag fps: ${fps.fps.toFixed(1)} avg · ${fps.frames} frames / ${fps.elapsedMs.toFixed(0)}ms · longest gap ${fps.longestDeltaMs.toFixed(1)}ms`,
  )
  test.info().annotations.push({
    type: 'im-5-icon-drag-fps',
    description: `${fps.fps.toFixed(1)}fps avg, ${fps.frames} frames in ${fps.elapsedMs.toFixed(0)}ms, longest gap ${fps.longestDeltaMs.toFixed(1)}ms`,
  })

  // The drag was real movement (not a pinned/clamped no-op) and committed.
  const after = (await charter.boundingBox())!
  expect(
    Math.abs(Math.round(after.x) - Math.round(before.x)) +
      Math.abs(Math.round(after.y) - Math.round(before.y)),
  ).toBeGreaterThan(50)
  const fs = await fsState(page)
  expect(fs.iconPositions['charter']).toBeDefined() // pinned by the release

  // Thor's law. 55 (not 60) leaves headroom for scheduler noise in headless;
  // the avalanche guard catches the failure mode a low average would miss.
  expect(fps.fps).toBeGreaterThanOrEqual(55)
  expect(fps.longestDeltaMs).toBeLessThan(100)
})
