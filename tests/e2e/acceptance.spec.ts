import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startPreviewServer, type PreviewServer } from './e2e-helpers'

/**
 * HE-2 acceptance gates — the nine town-hall success criteria, executed
 * end-to-end against the SHIPPED artifact (vite preview via e2e-helpers,
 * building first when dist/ is missing or stale). This file is the acceptance
 * record AND a durable regression net: every criterion that can be driven in
 * a real browser is here, in-world, through real affordances.
 *
 *   AC-1  boot ≤2s POST (real clock, unthrottled) + skippable + return-visit
 *         short-circuit + reduced-motion static path. The ≤3s-on-typical-
 *         broadband half of AC-1 is the TH-2 throttled median — that gate
 *         lives in perf.spec.ts and is re-run fresh inside the same suite
 *         execution (recorded in the HE-2 log section, not duplicated here).
 *   AC-2  icons: select on click, open on double-click, drag fps (TH-1
 *         measureFps contract, inlined — see the note in the fps test),
 *         drop-on-folder moves, positions persist across reload.
 *   AC-3  windows: open/drag/resize/minimize→taskbar-restore/maximize/
 *         focus-raise/close; taskbar lists open windows.
 *   AC-4  filesystem: context-menu create/rename/delete on the desktop AND
 *         inside the explorer; notepad edits persist; a full-session state
 *         dump survives reload byte-for-byte (IDB envelope compared).
 *   AC-5  every MVP app opens and performs its function; About + Browser
 *         proven against the fixture pack in the HE-2 prove-then-revert
 *         build pass (one-time, log-documented) — the durable gates here pin
 *         the honest placeholder truth (stand-ins, zero debris, disabled
 *         external actions with reasons, zero iframes).
 *   AC-6  phone notice card replaces the desktop at 390×844.
 *   AC-7  keyboard journey = the DD-1 keyboard.spec suite (referenced as
 *         evidence; re-run green inside the same suite execution).
 *   AC-8  automated gates = the whole suite (this file included).
 *   AC-9  console hygiene: a full-session run (boot + every app + menus +
 *         notepad edit + settings switches + guarded reset + reload) with a
 *         console listener — zero errors/warnings/pageerrors.
 *
 * Visual evidence lands in .impeccable/review/ (real Playwright screenshots):
 * desktop.png, windows-open.png, fs-session.png, about-nameplate.png,
 * atlas-placeholder.png, notice-390.png.
 */

let preview: PreviewServer | null = null
const REVIEW_DIR = join(process.cwd(), '.impeccable', 'review')

test.beforeAll(async () => {
  // Serial workers (playwright.config.ts) → one preview server for the file.
  preview = await startPreviewServer()
  mkdirSync(REVIEW_DIR, { recursive: true })
})

test.afterAll(async () => {
  await preview?.close()
  preview = null
})

/* ------------------------------- shared helpers --------------------------- */

interface MilestoneView {
  name: string
  t: number
  order: number
}

async function timeline(page: Page): Promise<MilestoneView[]> {
  return page.evaluate(() =>
    (window.__BOOT_TIMELINE ?? []).map((m) => ({ name: m.name, t: m.t, order: m.order })),
  )
}

/** Boot to the desktop, skipping the POST (any key), on the preview origin. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto(preview!.baseUrl)
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Retire the first-visit docent so pointer geometry has clean ground. */
async function retireDocent(page: Page): Promise<void> {
  await page.mouse.click(900, 600)
  await expect(page.locator('[data-docent]')).toHaveCount(0)
}

/** Mouse-drag by (dx, dy) from the center of a box, in stepped real moves. */
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

/**
 * The persisted state envelope, straight from IndexedDB (the production
 * bundle has no dev-server module URLs to import — the IDB boundary is the
 * honest read seam, the resilience/edges-spec precedent). Projected to the
 * comparable fields: savedAt (a timestamp) and per-window appState (an
 * opaque payload) are dropped.
 */
interface EnvelopeView {
  version: number
  nodes: Record<string, { parentId: string | null; name: string; kind: string }>
  iconPositions: Record<string, { x: number; y: number }>
  windows: Array<{
    appId: string
    instanceId: string
    geometry: { x: number; y: number; w: number; h: number }
    minimized: boolean
    maximized: boolean
    title: string
  }>
  settings: Record<string, unknown>
}

async function readEnvelope(page: Page): Promise<EnvelopeView> {
  return page.evaluate(async (): Promise<EnvelopeView> => {
    const open = indexedDB.open('desktop-sim')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    try {
      const tx = db.transaction('state', 'readonly')
      const read = tx.objectStore('state').get('desktop-sim/state')
      const envelope = await new Promise<Record<string, unknown>>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result as Record<string, unknown>)
        read.onerror = () => reject(read.error)
      })
      if (!envelope) throw new Error('no persisted envelope under desktop-sim/state')
      const fs = envelope.fs as {
        nodes: Record<string, { parentId: string | null; name: string; kind: string }>
      }
      const nodes: EnvelopeView['nodes'] = {}
      for (const [id, node] of Object.entries(fs.nodes)) {
        nodes[id] = { parentId: node.parentId, name: node.name, kind: node.kind }
      }
      return {
        version: envelope.version as number,
        nodes,
        iconPositions: envelope.iconPositions as EnvelopeView['iconPositions'],
        windows: (envelope.windows as Array<Record<string, unknown>>).map((w) => ({
          appId: w.appId as string,
          instanceId: w.instanceId as string,
          geometry: w.geometry as EnvelopeView['windows'][number]['geometry'],
          minimized: w.minimized as boolean,
          maximized: w.maximized as boolean,
          title: w.title as string,
        })),
        settings: envelope.settings as Record<string, unknown>,
      }
    } finally {
      db.close()
    }
  })
}

/** Let every persistence layer settle (notepad mirrors ~400ms, envelope ~900ms+). */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(1800)
}

/* ============================== AC-1 · boot ============================== */

test('AC-1 boot: first visit ≤2s real-clock, POST visible, skippable by click and key, return visit short-circuits', async ({
  page,
  browser,
}: { page: Page; browser: Browser }) => {
  // (a) FIRST VISIT, unthrottled, real clock: the full POST runs and the
  // desktop is interactive (desktop-ready milestone) within 2s.
  await page.goto(preview!.baseUrl)
  await expect(page.locator('[data-post-well]')).toBeVisible()
  await expect(page.locator('[data-post-line="archive-integrity"]')).toContainText('SEEDED')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  const milestones = await timeline(page)
  const start = milestones.find((m) => m.name === 'boot-start')!
  const ready = milestones.find((m) => m.name === 'desktop-ready')!
  const bootSum = `first visit (unthrottled, real clock): POST→desktop ${Math.round(ready.t - start.t)}ms · desktop-ready ${Math.round(ready.t)}ms after navigation start`
  console.log(`[he-2] ${bootSum}`)
  test.info().annotations.push({ type: 'he-2-boot-unthrottled', description: bootSum })
  expect(ready.order).toBeGreaterThan(start.order)
  expect(ready.t - start.t).toBeLessThanOrEqual(2000) // the ≤2s boot law
  expect(ready.t).toBeLessThanOrEqual(3000) // ≤3s interactive, even wall-clock
  expect(await page.locator('.wm-window').count()).toBe(0) // nothing auto-opened

  // (b) SKIP BY CLICK — a genuine fresh first visit in its own context.
  const clickCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const clickPage = await clickCtx.newPage()
  await clickPage.goto(preview!.baseUrl)
  await expect(clickPage.locator('[data-post-well]')).toBeVisible()
  await clickPage.mouse.click(640, 360) // the whole boot screen is the skip control
  await expect(clickPage.locator('[data-desktop-stage]')).toBeVisible()
  const skipped = await timeline(clickPage)
  const skipReady = skipped.find((m) => m.name === 'desktop-ready')!
  const clickSum = `click-skipped desktop-ready: ${Math.round(skipReady.t)}ms after navigation start`
  console.log(`[he-2] ${clickSum}`)
  test.info().annotations.push({ type: 'he-2-boot-skip-click', description: clickSum })
  expect(skipped.map((m) => m.name)).toContain('post-complete') // a skip still completes
  expect(skipReady.t).toBeLessThanOrEqual(2000)
  await clickCtx.close()

  // (c) SKIP BY KEY — same shape, Space.
  const keyCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const keyPage = await keyCtx.newPage()
  await keyPage.goto(preview!.baseUrl)
  await expect(keyPage.locator('[data-post-well]')).toBeVisible()
  await keyPage.keyboard.press('Space')
  await expect(keyPage.locator('[data-desktop-stage]')).toBeVisible()
  expect((await timeline(keyPage)).map((m) => m.name)).toContain('post-complete')
  await keyCtx.close()

  // (d) RETURN VISIT: the boot flag short-circuits the POST (≤200ms).
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  const returned = await timeline(page)
  const names = returned.map((m) => m.name)
  expect(names).not.toContain('post-complete') // no POST ran
  const retStart = returned.find((m) => m.name === 'boot-start')!
  const retReady = returned.find((m) => m.name === 'desktop-ready')!
  const resumeSum = `return visit: desktop-ready ${Math.round(retReady.t - retStart.t)}ms (no POST at all)`
  console.log(`[he-2] ${resumeSum}`)
  test.info().annotations.push({ type: 'he-2-boot-return', description: resumeSum })
  expect(retReady.t - retStart.t).toBeLessThanOrEqual(200)

  // The acceptance desktop capture: steady state, default star-chart plate.
  await retireDocent(page)
  await expect(page.locator('[data-wallpaper="star-chart"]')).toBeAttached()
  await page.screenshot({ path: join(REVIEW_DIR, 'desktop.png') })
})

test('AC-1 boot: prefers-reduced-motion takes the static POST path (no typing cadence), still ≤2s', async ({
  page,
}) => {
  // The DD-2 durable shape: a pre-app MutationObserver records whether any
  // POST line was EVER mid-typing (the static variant lands every line
  // fully-typed at once). The observer watches `document` — documentElement
  // does not exist when init scripts run.
  await page.addInitScript(() => {
    const w = window as unknown as { __sawTypingPostLine: boolean }
    w.__sawTypingPostLine = false
    const record = () => {
      for (const row of Array.from(document.querySelectorAll('[data-post-line]'))) {
        if ((row as HTMLElement).dataset.state === 'typing') w.__sawTypingPostLine = true
      }
    }
    new MutationObserver(record).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(preview!.baseUrl)

  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  expect(
    await page.evaluate(() => (window as { __sawTypingPostLine?: boolean }).__sawTypingPostLine),
  ).toBe(false) // static variant, no typing cadence
  const milestones = await timeline(page)
  expect(milestones.map((m) => m.name)).toContain('post-complete')
  const start = milestones.find((m) => m.name === 'boot-start')!
  const ready = milestones.find((m) => m.name === 'desktop-ready')!
  const sum = `reduced-motion static boot → desktop: ${Math.round(ready.t - start.t)}ms`
  console.log(`[he-2] ${sum}`)
  test.info().annotations.push({ type: 'he-2-boot-reduced-motion', description: sum })
  expect(ready.t - start.t).toBeLessThanOrEqual(2000)
})

/* ============================== AC-2 · icons ============================= */

test('AC-2 icons: click selects, double-click opens, drop-on-folder moves, positions persist across reload', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  // SELECT on click (single) — and the bare plate clears it.
  const charter = page.locator('[data-specimen-id="charter"]')
  await charter.click()
  await expect(charter).toHaveAttribute('data-selected', 'true')
  await page.mouse.click(900, 600)
  await expect(charter).toHaveAttribute('data-selected', 'false')

  // OPEN on double-click: a drawer opens the explorer (real open routing).
  await page.locator('[data-specimen-id="projects"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
  await page
    .locator('.wm-window[data-app-id="explorer"]')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.locator('.wm-window')).toHaveCount(0)

  // DRAG to a new position: one grid-snapped commit (cell 3,2 → 340,292).
  const before = (await charter.boundingBox())!
  expect(Math.round(before.x)).toBe(132) // seeded slot (1,0)
  await dragBy(page, before, 208, 264)
  await expect(charter).toHaveAttribute('data-gesture', 'drag') // transient state live
  await page.mouse.up()
  await expect(charter).not.toHaveAttribute('data-gesture', 'drag')
  const moved = (await charter.boundingBox())!
  expect(Math.round(moved.x)).toBe(340)
  expect(Math.round(moved.y)).toBe(292)

  // The position persists across reload (the archive remembers).
  await settle(page)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  const persisted = (await page.locator('[data-specimen-id="charter"]').boundingBox())!
  expect(Math.round(persisted.x)).toBe(340)
  expect(Math.round(persisted.y)).toBe(292)

  // DROP-ON-FOLDER moves the item into the drawer: drag the charter onto
  // Projects — the drawer-pull highlight shows mid-drag, the icon leaves the
  // field, and the move survives its own reload (persisted parentId proof).
  const charterBox = (await page.locator('[data-specimen-id="charter"]').boundingBox())!
  const projectsBox = (await page.locator('[data-specimen-id="projects"]').boundingBox())!
  await dragBy(
    page,
    charterBox,
    projectsBox.x + projectsBox.width / 2 - (charterBox.x + charterBox.width / 2),
    projectsBox.y + projectsBox.height / 2 - (charterBox.y + charterBox.height / 2),
  )
  await expect(page.locator('[data-specimen-id="projects"]')).toHaveAttribute(
    'data-drop-target',
    'true',
  )
  await page.mouse.up()
  await expect(page.locator('[data-specimen-id="charter"]')).toHaveCount(0)
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(4)

  await settle(page)
  expect((await readEnvelope(page)).nodes['charter']!.parentId).toBe('projects')

  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(4)
  expect((await readEnvelope(page)).nodes['charter']!.parentId).toBe('projects')
})

test('AC-2 icons: continuous drag holds ≥55fps on the production build', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)

  const charter = page.locator('[data-specimen-id="charter"]')
  const before = (await charter.boundingBox())!
  const grabX = before.x + before.width / 2
  const grabY = before.y + before.height / 2

  // The TH-1 measureFps contract, INLINED: the module URL import the dev-
  // server specs use is not reachable on the production bundle, so the same
  // counting algorithm (anchor frame starts the clock and is not counted;
  // fps = frames·1000/elapsed over completed intervals; longest gap tracked)
  // runs here directly. Same numbers, same meaning.
  const sample = page.evaluate(
    (): Promise<{ fps: number; frames: number; elapsedMs: number; longestDeltaMs: number }> =>
      new Promise((resolve) => {
        let frames = 0
        let anchorMs = -1
        let prevMs = 0
        let longestDeltaMs = 0
        const tick = (nowMs: number): void => {
          if (anchorMs < 0) {
            anchorMs = nowMs
            prevMs = nowMs
            requestAnimationFrame(tick)
            return
          }
          const deltaMs = Math.max(0, nowMs - prevMs)
          const elapsedMs = nowMs - anchorMs
          prevMs = nowMs
          frames += 1
          if (deltaMs > longestDeltaMs) longestDeltaMs = deltaMs
          if (elapsedMs >= 1600) {
            resolve({
              fps: frames > 0 ? (frames * 1000) / elapsedMs : 0,
              frames,
              elapsedMs,
              longestDeltaMs,
            })
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )

  await page.mouse.move(grabX, grabY)
  await page.mouse.down()
  const dragStart = Date.now()
  let step = 0
  while (Date.now() - dragStart < 1050) {
    const angle = (step++ / 30) * Math.PI * 2
    await page.mouse.move(430 + Math.cos(angle) * 150, 250 + Math.sin(angle) * 100)
  }
  await page.mouse.move(760, 520)
  await page.mouse.up()

  const fps = await sample
  const sum = `icon drag fps (production build): ${fps.fps.toFixed(1)} avg · ${fps.frames} frames / ${fps.elapsedMs.toFixed(0)}ms · longest gap ${fps.longestDeltaMs.toFixed(1)}ms`
  console.log(`[he-2] ${sum}`)
  test.info().annotations.push({ type: 'he-2-icon-drag-fps', description: sum })

  const after = (await charter.boundingBox())!
  expect(
    Math.abs(Math.round(after.x) - Math.round(before.x)) +
      Math.abs(Math.round(after.y) - Math.round(before.y)),
  ).toBeGreaterThan(50) // the drag moved the icon for real

  // Thor's law, with the same headroom the dev-server gates keep.
  expect(fps.fps).toBeGreaterThanOrEqual(55)
  expect(fps.longestDeltaMs).toBeLessThan(100)
})

/* ============================= AC-3 · windows ============================ */

test('AC-3 windows: open, drag, resize, minimize→taskbar restore, maximize, focus/raise, close — taskbar lists throughout', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  const leds = page.locator('[data-window-led]')

  // Two default 720×480 modules cannot fully clear each other on 1280×720,
  // so every interaction below rides the TOP window (or the taskbar): raise
  // the target first — the discipline a real operator's z-order imposes.

  // OPEN: explorer on Projects (desktop affordance); notepad from the module
  // drawer (its launcher affordance — a fresh untitled draft).
  await page.locator('[data-specimen-id="projects"]').dblclick()
  const explorer = page.locator('.wm-window[data-app-id="explorer"]')
  await expect(explorer).toBeVisible()
  await expect(leds).toHaveCount(1)

  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Specimen Notepad' }).click()
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepad.locator('[data-notepad-textarea]')).toBeVisible()
  await expect(leds).toHaveCount(2) // the taskbar lists both open windows

  // Opening raised the notepad — it holds focus.
  await expect(notepad).toHaveAttribute('data-focused', 'true')
  await expect(explorer).toHaveAttribute('data-focused', 'false')

  // DRAG: title-bar drag moves the notepad (on top) by the delta.
  const notepadBefore = (await notepad.boundingBox())!
  const barBox = (await notepad.locator('.wm-titlebar').boundingBox())!
  await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    barBox.x + barBox.width / 2 + 120,
    barBox.y + barBox.height / 2 + 60,
    { steps: 10 },
  )
  await expect(notepad).toHaveAttribute('data-gesture', 'drag')
  await page.mouse.up()
  const notepadMoved = (await notepad.boundingBox())!
  expect(Math.round(notepadMoved.x - notepadBefore.x)).toBe(120)
  expect(Math.round(notepadMoved.y - notepadBefore.y)).toBe(60)

  // MINIMIZE (still on top): the notepad stows; the taskbar STILL lists it…
  await notepad.getByRole('button', { name: 'Minimize' }).click()
  await expect(notepad).toBeHidden()
  await expect(leds).toHaveCount(2)
  await expect(page.locator('[data-window-led][data-app-id="notepad"]')).toHaveAttribute(
    'data-minimized',
    'true',
  )
  // …and the LED RESTORES it (taskbar restore — the window-switching path).
  await page.locator('[data-window-led][data-app-id="notepad"]').click()
  await expect(notepad).toBeVisible()
  await expect(notepad).toHaveAttribute('data-focused', 'true')

  // FOCUS/RAISE: clicking the explorer's title bar raises it from below —
  // the focused flag flips (its title row sits above the dragged notepad).
  await explorer.locator('.wm-titlebar').click()
  await expect(explorer).toHaveAttribute('data-focused', 'true')
  await expect(notepad).toHaveAttribute('data-focused', 'false')

  // RESIZE: the se corner bracket grows the explorer (now on top).
  const se = (await explorer.locator('[data-resize="se"]').boundingBox())!
  const explorerBefore = (await explorer.boundingBox())!
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2)
  await page.mouse.down()
  await page.mouse.move(se.x + se.width / 2 + 160, se.y + se.height / 2 + 90, { steps: 10 })
  await page.mouse.up()
  const explorerGrown = (await explorer.boundingBox())!
  expect(Math.round(explorerGrown.width - explorerBefore.width)).toBe(160)
  expect(Math.round(explorerGrown.height - explorerBefore.height)).toBe(90)

  // The acceptance window-manager capture: two live modules, one focused.
  await page.screenshot({ path: join(REVIEW_DIR, 'windows-open.png') })

  // MAXIMIZE: the explorer fills the viewport; restoring returns geometry.
  await explorer.getByRole('button', { name: 'Maximize' }).click()
  await expect(explorer).toHaveAttribute('data-maximized', 'true')
  const maxBox = (await explorer.boundingBox())!
  const viewport = page.viewportSize()!
  expect(Math.round(maxBox.width)).toBe(viewport.width)
  expect(Math.round(maxBox.height)).toBeGreaterThan(viewport.height - 80) // above the rail
  // The toggle relabels to 'Restore' while maximized (state-naming law).
  await explorer.getByRole('button', { name: 'Restore' }).click()
  await expect(explorer).toHaveAttribute('data-maximized', 'false')
  const unmaxed = (await explorer.boundingBox())!
  expect(Math.round(unmaxed.width)).toBe(Math.round(explorerGrown.width))

  // CLOSE: the explorer first (it is on top); closing it hands the notepad
  // focus + top — its own ✕ is then reachable. The taskbar empties with them.
  await explorer.getByRole('button', { name: 'Close', exact: true }).click()
  await notepad.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('.wm-window')).toHaveCount(0)
  await expect(leds).toHaveCount(0)
})

/* =========================== AC-4 · filesystem =========================== */

test('AC-4 filesystem: context-menu create/rename/delete on desktop AND in explorer; notepad persists; full state survives reload', async ({
  page,
}) => {
  test.slow()
  await toDesktop(page)
  await retireDocent(page)

  /* -- desktop: create (drawer + specimen), rename, two-step delete -------- */
  await page.mouse.click(900, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-drawer"]').click()
  const createdDrawer = page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })
  await expect(createdDrawer).toBeVisible()

  // Rename the drawer in place on the icon.
  await createdDrawer.click({ button: 'right' })
  await page.locator('[data-menu-item="rename"]').click()
  let field = page.locator('[data-rename-input]')
  await field.fill('acceptance-drawer')
  await field.press('Enter')
  await expect(
    page.getByRole('button', { name: /^acceptance-drawer, DRW-\d{4}, drawer$/ }),
  ).toBeVisible()

  // Create a specimen on the desktop, then rename it — the notepad subject.
  await page.mouse.click(700, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-specimen"]').click()
  const createdSpecimen = page.getByRole('button', {
    name: /^New Specimen, SPC-\d{4}, specimen$/,
  })
  await expect(createdSpecimen).toBeVisible()
  await createdSpecimen.click({ button: 'right' })
  await page.locator('[data-menu-item="rename"]').click()
  field = page.locator('[data-rename-input]')
  await field.fill('session-log.txt')
  await field.press('Enter')
  await expect(
    page.getByRole('button', { name: /^session-log\.txt, SPC-\d{4}, specimen$/ }),
  ).toBeVisible()

  // Desktop DELETE: create one more drawer, delete it (two-step confirm).
  await page.mouse.click(760, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-drawer"]').click()
  const doomed = page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })
  await expect(doomed).toBeVisible()
  await doomed.click({ button: 'right' })
  await page.locator('[data-menu-item="delete"]').click()
  await expect(page.locator('[data-menu-confirm]')).toBeVisible()
  await page.locator('[data-menu-item="delete__go"]').click()
  await expect(page.locator('[data-menu-root]')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ }),
  ).toHaveCount(0)

  /* -- icon move (before any window opens — the field is unobstructed) ---- */
  const charter = page.locator('[data-specimen-id="charter"]')
  await dragBy(page, (await charter.boundingBox())!, 104, 132) // cell (2,1)
  await page.mouse.up()

  /* -- explorer: create, rename, two-step delete inside a drawer ---------- */
  await page.locator('[data-specimen-id="projects"]').dblclick()
  const explorer = page.locator('.wm-window[data-app-id="explorer"]')
  await expect(explorer.locator('[data-explorer-surface]')).toBeVisible()

  await explorer.locator('[data-explorer-content]').click({
    button: 'right',
    position: { x: 340, y: 330 },
  })
  await page.locator('[data-menu-item="new-specimen"]').click()
  const explorerSpecimen = explorer
    .locator('[data-explorer-listbox]')
    .getByRole('option', { name: /^New Specimen, SPC-\d{4}, specimen$/ })
  await expect(explorerSpecimen).toBeVisible()
  await explorerSpecimen.click({ button: 'right' })
  await page.locator('[data-menu-item="rename"]').click()
  field = page.locator('[data-rename-input]')
  await field.fill('relief-notes.txt')
  await field.press('Enter')
  const reliefRow = explorer
    .locator('[data-explorer-listbox]')
    .getByRole('option', { name: /^relief-notes\.txt, SPC-\d{4}, specimen$/ })
  await expect(reliefRow).toBeVisible()

  await explorer.locator('[data-explorer-content]').click({
    button: 'right',
    position: { x: 340, y: 330 },
  })
  await page.locator('[data-menu-item="new-drawer"]').click()
  const explorerDrawer = explorer
    .locator('[data-explorer-listbox]')
    .getByRole('option', { name: /^New Drawer, DRW-\d{4}, drawer$/ })
  await expect(explorerDrawer).toBeVisible()
  await explorerDrawer.click({ button: 'right' })
  await page.locator('[data-menu-item="delete"]').click()
  await expect(page.locator('[data-menu-confirm]')).toBeVisible()
  await page.locator('[data-menu-item="delete__go"]').click()
  await expect(
    explorer
      .locator('[data-explorer-listbox]')
      .getByRole('option', { name: /^New Drawer, DRW-\d{4}, drawer$/ }),
  ).toHaveCount(0)

  /* -- notepad: edit the created specimen and save it as a file ----------- */
  await reliefRow.dblclick()
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  const sheet = notepad.locator('[data-notepad-textarea]')
  await expect(sheet).toBeVisible()
  await sheet.fill('HE-2 acceptance: the archive remembers this entry.')
  await page.keyboard.press('ControlOrMeta+s') // persists as the file content
  await notepad.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(notepad).toHaveCount(0)

  /* -- full-session state: a second window joins the dump, then reload ----- */
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Console Settings' }).click()
  await expect(page.locator('[data-settings-surface]')).toBeVisible()

  await settle(page) // every debounce layer flushes
  const before = await readEnvelope(page)
  const dumpSum = `pre-reload envelope: ${Object.keys(before.nodes).length} nodes · ${Object.keys(before.iconPositions).length} icon positions · ${before.windows.length} windows (${before.windows.map((w) => w.appId).join(', ')}) · schema v${before.version}`
  console.log(`[he-2] ${dumpSum}`)
  test.info().annotations.push({ type: 'he-2-state-dump', description: dumpSum })

  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // The whole session comes back: created nodes, icon positions, open windows.
  await expect(
    page.getByRole('button', { name: /^acceptance-drawer, DRW-\d{4}, drawer$/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^session-log\.txt, SPC-\d{4}, specimen$/ }),
  ).toBeVisible()
  const charterAfter = (await charter.boundingBox())!
  expect(Math.round(charterAfter.x)).toBeGreaterThan(200) // the moved cell held
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
  await expect(page.locator('.wm-window[data-app-id="settings"]')).toBeVisible()
  await expect(page.locator('[data-window-led]')).toHaveCount(2)

  // BEFORE any new interaction re-arms the autosave: the reloaded envelope
  // deep-equals the pre-reload dump (savedAt — a timestamp — excluded).
  const after = await readEnvelope(page)
  const compareSum = `post-reload envelope: ${Object.keys(after.nodes).length} nodes · ${Object.keys(after.iconPositions).length} icon positions · ${after.windows.length} windows — deep-equal to pre-reload`
  console.log(`[he-2] ${compareSum}`)
  test.info().annotations.push({ type: 'he-2-state-dump-reloaded', description: compareSum })
  expect(after).toEqual(before)

  // The edited file's content survived too: reopen it from the restored
  // explorer window and read the sheet.
  await page.locator('.wm-window[data-app-id="explorer"] .wm-titlebar').click() // raise
  const reliefRowAfter = page
    .locator('.wm-window[data-app-id="explorer"] [data-explorer-listbox]')
    .getByRole('option', { name: /^relief-notes\.txt, SPC-\d{4}, specimen$/ })
  await reliefRowAfter.dblclick()
  const reopened = page.locator('.wm-window[data-app-id="notepad"] [data-notepad-textarea]')
  await expect(reopened).toBeVisible()
  await expect(reopened).toHaveValue('HE-2 acceptance: the archive remembers this entry.')

  await page.screenshot({ path: join(REVIEW_DIR, 'fs-session.png') })
})

/* =============================== AC-5 · apps ============================= */

test('AC-5 apps: all six MVP apps open and perform their function (placeholder pack: honest stand-ins)', async ({
  page,
}) => {
  test.slow()
  await toDesktop(page)
  await retireDocent(page)

  // EXPLORER — navigates the tree (crumb jump to the hold root).
  await page.locator('[data-specimen-id="projects"]').dblclick()
  const explorer = page.locator('.wm-window[data-app-id="explorer"]')
  await expect(explorer.locator('[data-explorer-surface]')).toBeVisible()
  await explorer.locator('[data-explorer-crumb="root"]').click()
  await expect(
    explorer.locator('[data-explorer-listbox] [data-explorer-option]'),
  ).toHaveCount(5)

  // NOTEPAD — edits + saves (the file body is the function; persistence is
  // AC-4's gate, here the edit+save cycle completes cleanly).
  const charterRow = explorer
    .locator('[data-explorer-listbox]')
    .getByRole('option', { name: /charter/ })
  await charterRow.dblclick()
  const sheet = page.locator('[data-notepad-textarea]')
  await expect(sheet).toBeVisible()
  await sheet.fill('AC-5 function check.')
  await page.keyboard.press('ControlOrMeta+s')
  await page
    .locator('.wm-window[data-app-id="notepad"]')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toHaveCount(0)

  // IMAGE VIEWER — back into Projects (folders recurse in-window), which
  // opens the plate in the viewer; F toggles actual pixels.
  await explorer.locator('.wm-titlebar').click() // raise the explorer
  await explorer.locator('[data-explorer-option="projects"]').dblclick()
  await explorer.locator('[data-explorer-option="reference-plate"]').dblclick()
  const viewer = page.locator('.wm-window[data-app-id="image-viewer"]')
  const plateImg = viewer.locator('[data-viewer-image]')
  await expect(plateImg).toBeVisible()
  await plateImg.click() // seat focus on the stage
  await page.keyboard.press('f')
  await expect(viewer.locator('[data-viewer-readout]')).toContainText('100%')

  // SETTINGS — the console panel switches the live wallpaper plate.
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Console Settings' }).click()
  const settings = page.locator('.wm-window[data-app-id="settings"]')
  await expect(settings.locator('[data-settings-surface]')).toBeVisible()
  await settings.locator('[data-settings-plate="anatomy"]').click()
  await expect(page.locator('[data-wallpaper]')).toHaveAttribute('data-wallpaper', 'anatomy')
  await settings.locator('[data-settings-plate="star-chart"]').click()
  await expect(page.locator('[data-wallpaper]')).toHaveAttribute('data-wallpaper', 'star-chart')

  // ABOUT — the nameplate manifest: placeholder law (stand-ins, no anchors,
  // zero fill-in debris) until the content pack lands.
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Nameplate Manifest' }).click()
  const about = page.locator('.wm-window[data-app-id="about"]')
  await expect(about.locator('[data-about-name]')).toHaveText('Unassigned Officer')
  await expect(about.locator('[data-about-link]')).toHaveCount(0) // no fake links
  await about.screenshot({ path: join(REVIEW_DIR, 'about-nameplate.png') })

  // BROWSER — the field atlas: curated stand-in cards, zero iframes, external
  // actions honestly disabled with reasons (no URLs in the placeholder pack).
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Field Atlas' }).click()
  const atlas = page.locator('.wm-window[data-app-id="browser"]')
  await expect(atlas.locator('[data-browser-card]')).toHaveCount(2)
  await expect(atlas.locator('iframe')).toHaveCount(0)
  await atlas.locator('[data-browser-card]').first().click()
  await expect(atlas.locator('[data-browser-page]')).toBeVisible()
  await expect(atlas.locator('[data-browser-live]')).toBeDisabled()
  await expect(atlas.locator('[data-browser-repo]')).toBeDisabled()
  await atlas.screenshot({ path: join(REVIEW_DIR, 'atlas-placeholder.png') })
  await expect(atlas.locator('iframe')).toHaveCount(0)

  // Every app of the six ran in this one session; five remain live (the
  // notepad completed its edit+save cycle and closed cleanly above).
  await expect(page.locator('.wm-window')).toHaveCount(5)
  await expect(page.locator('[data-window-led]')).toHaveCount(5)
})

/* ============================ AC-6 · phone card ========================== */

test('AC-6 phone: at 390×844 the notice card replaces the desktop — no broken layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(preview!.baseUrl)

  const card = page.locator('[data-notice-card]')
  await expect(card).toBeVisible()
  await expect(page.locator('h1[data-notice-title]')).toHaveText('Limited Bandwidth Console')
  await expect(page.locator('[data-notice-message]')).toContainText(
    'This console requires a larger viewport',
  )
  // The desktop graph never mounted beneath the card.
  await expect(page.locator('[data-desktop-stage]')).toHaveCount(0)
  await expect(page.locator('.wm-window')).toHaveCount(0)
  await expect(page.locator('[data-taskbar]')).toHaveCount(0)
  // Placeholder honesty: no fabricated links.
  await expect(page.locator('[data-notice-link]')).toHaveCount(0)
  // No horizontal scroll at the phone width.
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement
    return { scrollWidth: el.scrollWidth, innerWidth: window.innerWidth }
  })
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)

  await page.screenshot({ path: join(REVIEW_DIR, 'notice-390.png') })
})

/* ========================= AC-9 · console hygiene ======================== */

test('AC-9 console hygiene: a full-session run (boot + all apps + menus + reset + reload) logs zero console errors', async ({
  page,
}) => {
  test.slow()
  const noise: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      noise.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`))

  // FIRST VISIT with the FULL POST (nothing skipped) — the noisiest boot.
  await page.goto(preview!.baseUrl)
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // Ground + specimen context menus (the platform menu shell).
  await page.mouse.click(900, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-drawer"]').click()
  await expect(
    page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ }),
  ).toBeVisible()
  await page.locator('[data-specimen-id="charter"]').click({ button: 'right' })
  await page.locator('[data-menu-item="rename"]').click()
  const field = page.locator('[data-rename-input]')
  await field.fill('hygiene-check.txt')
  await field.press('Enter')
  await expect(
    page.getByRole('button', { name: /^hygiene-check\.txt, SPC-\d{4}, specimen$/ }),
  ).toBeVisible()

  // All six apps through real affordances (lazy chunks fetch + mount).
  await page.locator('[data-specimen-id="projects"]').dblclick()
  const explorer = page.locator('.wm-window[data-app-id="explorer"]')
  await expect(explorer.locator('[data-explorer-surface]')).toBeVisible()
  await explorer.locator('[data-explorer-option="exhibit-01"]').dblclick()
  await expect(page.locator('[data-notepad-textarea]')).toBeVisible()
  await page.locator('[data-notepad-textarea]').fill('AC-9 console hygiene entry.')
  await page.keyboard.press('ControlOrMeta+s')
  await explorer.locator('.wm-titlebar').click()
  await explorer.locator('[data-explorer-option="reference-plate"]').dblclick()
  await expect(page.locator('[data-viewer-image]')).toBeVisible()
  for (const name of ['Console Settings', 'Nameplate Manifest', 'Field Atlas']) {
    await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
    await page.getByRole('menuitem', { name }).click()
  }
  await expect(page.locator('.wm-window')).toHaveCount(6)

  // Settings switches (sounds arm + mute — the lazy AudioContext path).
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Console Settings' }).click()
  const sounds = page.getByRole('switch', { name: 'UI sounds' })
  await sounds.click()
  await expect(sounds).toHaveAttribute('aria-checked', 'true')
  await sounds.click()
  await expect(sounds).toHaveAttribute('aria-checked', 'false')

  // The guarded archive reset, end to end.
  await page.getByRole('button', { name: 'Lift guard cover' }).click()
  await page.getByRole('switch', { name: 'Reseal archive' }).click()
  await expect(page.locator('[data-resealed]')).toBeVisible()

  // Reload — the return-visit boot path.
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  const sum =
    noise.length === 0
      ? 'full session (boot POST + menus + 6 apps + notepad save + sound switches + guarded reset + reload): ZERO console errors/warnings/pageerrors'
      : `full session console noise: ${JSON.stringify(noise)}`
  console.log(`[he-2] ${sum}`)
  test.info().annotations.push({ type: 'he-2-console-hygiene', description: sum })

  // CSP-noise law: NOTHING is pre-excluded. The shipped strict CSP is
  // satisfied by the same-origin hashed assets; the only CSP violations in
  // the entire corpus are CA-1's deliberately injected canaries. A violation
  // seen in normal use would be a product failure to fix, not noise to
  // filter — so the assertion is zero, full stop.
  expect(noise).toEqual([])
})
