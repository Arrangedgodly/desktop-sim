import { expect, test, type Page } from '@playwright/test'
import { startPreviewServer, type PreviewServer } from './e2e-helpers'

/**
 * TH-2 e2e perf gates — the production build, served by `vite preview`
 * (e2e-helpers builds first when dist/ is missing or stale). The Playwright
 * webServer runs the DEV server for the functional suite; these two gates
 * deliberately ride the SHIPPED artifact instead:
 *
 * 1. BOOT MEDIAN (slow) — boot-to-interactive on a hostile machine: headless
 *    Chromium, CPU throttled 4x + fast 3G (150ms RTT, 1.6 Mbps down /
 *    750 kbps up) via CDP, FIVE fresh-context runs (every run a genuine
 *    first visit: empty IndexedDB, no boot flag → the full POST), reporting
 *    the median `desktop-ready` milestone (performance.now() is relative to
 *    navigation start, so the number IS boot-to-interactive). Town-hall
 *    budget: ≤3s under throttle (the unthrottled ≤2s gate stays in
 *    boot.spec.ts against the dev graph).
 * 2. RENDER COST — a scripted interaction session (open explorer + scroll,
 *    open notepad + type 100 chars, open viewer + zoom to the 400% clamp) on
 *    an UNTHROTTLED run, asserting ZERO long tasks (>50ms) between arming
 *    the collector (after desktop-ready) and settle. Actuals are logged and
 *    annotated for the TH-2 log entry.
 *
 * Numbers are recorded via test.info().annotations — HE-2 evidence.
 */

let preview: PreviewServer | null = null

test.beforeAll(async () => {
  // Serial workers (playwright.config.ts) → one preview server for the file.
  preview = await startPreviewServer()
})

test.afterAll(async () => {
  await preview?.close()
  preview = null
})

/** The desktop-ready milestone's t (ms since navigation start), once landed. */
async function desktopReadyAt(page: Page): Promise<number> {
  return page.evaluate(() => {
    const timeline = window.__BOOT_TIMELINE ?? []
    const ready = timeline.find((m) => m.name === 'desktop-ready')
    if (!ready) throw new Error('no desktop-ready milestone in the timeline')
    return ready.t
  })
}

interface TimelineView {
  name: string
  t: number
}

const BOOT_RUNS = 5
const BOOT_BUDGET_MS = 3_000

test.slow()
test('boot-to-interactive: median of 5 first-visit runs at 4x CPU + fast 3G stays ≤3s', async ({
  browser,
}) => {
  const runs: { ready: number; timeline: TimelineView[] }[] = []

  for (let run = 0; run < BOOT_RUNS; run++) {
    // A fresh context per run = a genuine first visit every time (empty
    // IndexedDB, no boot flag → the full POST; no cache, no service worker).
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150, // fast 3G RTT (ms)
      downloadThroughput: Math.floor((1.6 * 1024 * 1024) / 8), // 1.6 Mbps → B/s
      uploadThroughput: Math.floor((750 * 1024) / 8), // 750 kbps → B/s
    })

    await page.goto(preview!.baseUrl)
    // First visit, unskipped: the POST types while the network trickles.
    await page.waitForFunction(
      () => (window.__BOOT_TIMELINE ?? []).some((m) => m.name === 'desktop-ready'),
      undefined,
      { timeout: 20_000, polling: 50 },
    )
    const ready = await desktopReadyAt(page)
    const timeline = await page.evaluate((): TimelineView[] =>
      (window.__BOOT_TIMELINE ?? []).map((m) => ({ name: m.name, t: m.t })),
    )
    runs.push({ ready, timeline })
    await context.close()
  }

  const samples = runs.map((r) => r.ready).sort((a, b) => a - b)
  const median = samples[Math.floor(BOOT_RUNS / 2)]!
  const worst = samples[samples.length - 1]!

  const summary = `boot-to-interactive @4xCPU+fast3G: runs [${samples
    .map((ms) => `${Math.round(ms)}ms`)
    .join(', ')}] · median ${Math.round(median)}ms · worst ${Math.round(worst)}ms`
  console.log(`[th-2] ${summary}`)
  test.info().annotations.push({ type: 'th-2-boot-median', description: summary })

  // The median-run phase breakdown (where the throttled boot spends its time).
  const medianRun = runs.find((r) => r.ready === median)!
  const breakdown = medianRun.timeline
    .map((m) => `${m.name}@${Math.round(m.t)}ms`)
    .join(' → ')
  console.log(`[th-2] median-run timeline: ${breakdown}`)
  test.info().annotations.push({ type: 'th-2-boot-phases', description: breakdown })

  expect(median, `boot median over ${BOOT_RUNS} runs`).toBeLessThanOrEqual(BOOT_BUDGET_MS)
})

interface LongTaskView {
  readonly name: string
  readonly duration: number
  readonly startTime: number
}

declare global {
  interface Window {
    /** TH-2 render-cost collector (perf.spec.ts arms it after desktop-ready). */
    __longTasks?: LongTaskView[]
  }
}

test('interaction render cost: explorer + scroll, notepad + 100 chars, viewer at 400% — zero long tasks', async ({
  page,
}) => {
  await page.goto(preview!.baseUrl)
  await page.keyboard.press('Space') // skip the POST — interactions are the subject
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // Armed AFTER boot: only interaction work is measured (longtask reports
  // main-thread tasks ≥50ms — the spec's own floor IS the budget).
  await page.evaluate(() => {
    const tasks: LongTaskView[] = []
    window.__longTasks = tasks
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        tasks.push({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime,
        })
      }
    }).observe({ entryTypes: ['longtask'] })
  })

  // 1. Open the explorer on the Projects drawer and scroll its catalog.
  await page.locator('[data-specimen-id="projects"]').dblclick()
  const explorer = page.locator('.wm-window[data-app-id="explorer"]')
  const surface = explorer.locator('[data-explorer-surface]')
  await expect(surface).toBeVisible({ timeout: 10_000 })
  await surface.hover()
  await page.mouse.wheel(0, 600)
  await page.mouse.wheel(0, -300)

  // 2. Open a text specimen in the notepad and type 100 characters.
  await explorer.locator('[data-explorer-option="exhibit-01"]').dblclick()
  const sheet = page.locator('[data-notepad-textarea]')
  await expect(sheet).toBeVisible({ timeout: 10_000 })
  await sheet.click()
  await page.keyboard.type('ARCHIVE ENTRY 0123456789 '.repeat(5).slice(0, 100))

  // 3. Open the reference plate in the viewer and zoom to the 400% clamp.
  // (Raise the explorer first — the notepad window may cover its list.)
  await explorer.locator('.wm-titlebar').click()
  await explorer.locator('[data-explorer-option="reference-plate"]').dblclick()
  const viewer = page.locator('.wm-window[data-app-id="image-viewer"]')
  await expect(viewer.locator('[data-viewer-image]')).toBeVisible({ timeout: 10_000 })
  const zoomIn = viewer.locator('[data-viewer-zoom-in]')
  for (let step = 0; step < 16; step++) await zoomIn.click()
  await expect(viewer.locator('[data-viewer-readout]')).toHaveText('400%')

  // Settle (async chunk mounts, the autosave debounce), then read the bill.
  await page.waitForTimeout(400)
  const tasks = await page.evaluate(() => [...(window.__longTasks ?? [])])
  const longest = tasks.reduce((max, t) => Math.max(max, t.duration), 0)
  const summary = `interaction long tasks: ${tasks.length} (max ${longest.toFixed(1)}ms) — 0 expected`
  console.log(`[th-2] ${summary}`)
  test.info().annotations.push({ type: 'th-2-render-cost', description: summary })

  expect(tasks, `long tasks during interactions: ${JSON.stringify(tasks)}`).toHaveLength(0)
})
