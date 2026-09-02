import { expect, test, type Page } from '@playwright/test'
import { startPreviewServer, type PreviewServer } from './e2e-helpers'

/**
 * TH-2 memory soak — the production build (preview server; built first when
 * dist/ is stale — see e2e-helpers). The script: boot once, then open ALL SIX
 * shipped apps, close them all, and repeat ×5. After every cycle the heap is
 * garbage-collected and sampled (Chromium DOM counters via CDP — total DOM
 * nodes, the honest detached-node signal, since detached nodes survive GC and
 * count — plus the JS heap and the live document tree).
 *
 * Bounds are GENEROUS on purpose (they must catch leaks, not noise):
 * - DOM nodes (incl. detached): cycle 5 ≤ cycle 1 + 1,000 nodes AND ≤ 2x.
 * - Live document tree: within ±25% of cycle 1's element count.
 * - JS heap: cycle 5 ≤ cycle 1 + 24 MB.
 * Actuals are logged + annotated for the TH-2 production-log entry.
 */

let preview: PreviewServer | null = null

test.beforeAll(async () => {
  preview = await startPreviewServer()
})

test.afterAll(async () => {
  await preview?.close()
  preview = null
})

interface SoakSample {
  readonly cycle: number
  readonly domNodes: number
  readonly jsHeapBytes: number
  readonly liveElements: number
}

/** GC, then read the three counters (CDP DOM counters + Performance metrics). */
async function sample(page: Page, cycle: number): Promise<SoakSample> {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('HeapProfiler.collectGarbage')
    const counters = await cdp.send('Memory.getDOMCounters')
    await cdp.send('Performance.enable')
    const metrics = await cdp.send('Performance.getMetrics')
    const heap = metrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0
    const liveElements = await page.evaluate(() => document.querySelectorAll('*').length)
    return {
      cycle,
      domNodes: counters.nodes,
      jsHeapBytes: heap,
      liveElements,
    }
  } finally {
    await cdp.detach()
  }
}

/** Open every one of the six shipped apps through the real affordances. */
async function openAllSix(page: Page): Promise<void> {
  // explorer — the desktop's Projects drawer icon
  await page.locator('[data-specimen-id="projects"]').dblclick()
  const explorer = page.locator('.wm-window[data-app-id="explorer"]')
  await expect(explorer.locator('[data-explorer-surface]')).toBeVisible({ timeout: 10_000 })
  // notepad + viewer — specimens opened from inside the drawer (raise the
  // explorer between opens: the notepad window can cover its list)
  await explorer.locator('[data-explorer-option="exhibit-01"]').dblclick()
  await expect(page.locator('[data-notepad-textarea]')).toBeVisible({ timeout: 10_000 })
  await explorer.locator('.wm-titlebar').click()
  await explorer.locator('[data-explorer-option="reference-plate"]').dblclick()
  await expect(page.locator('[data-viewer-image]')).toBeVisible({ timeout: 10_000 })
  // settings + about + browser — the module drawer (launcher launches)
  for (const name of ['Console Settings', 'Nameplate Manifest', 'Field Atlas']) {
    await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
    await page.getByRole('menuitem', { name }).click()
  }
  await expect(page.locator('.wm-window')).toHaveCount(6)
}

/** Close every open window through the title-bar ✕ (topmost first — DOM order rides z-order, so `.last()` is never covered). */
async function closeAll(page: Page): Promise<void> {
  for (;;) {
    const closeButtons = page
      .locator('.wm-window')
      .getByRole('button', { name: 'Close', exact: true })
    const count = await closeButtons.count()
    if (count === 0) break
    await closeButtons.last().click()
  }
  await expect(page.locator('.wm-window')).toHaveCount(0)
}

test('soak: open all six apps + close them, x5 — no detached-node growth, bounded heap', async ({
  page,
}) => {
  test.slow()
  await page.goto(preview!.baseUrl)
  await page.keyboard.press('Space') // skip the POST; the cycles are the subject
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  const samples: SoakSample[] = []
  for (let cycle = 1; cycle <= 5; cycle++) {
    await openAllSix(page)
    await closeAll(page)
    await page.waitForTimeout(150) // let teardown callbacks (observers, menus) drain
    samples.push(await sample(page, cycle))
  }

  for (const s of samples) {
    const line = `cycle ${s.cycle}: DOM nodes ${s.domNodes} · live elements ${s.liveElements} · JS heap ${(s.jsHeapBytes / 1024 / 1024).toFixed(1)} MB`
    console.log(`[th-2 soak] ${line}`)
    test.info().annotations.push({ type: 'th-2-soak', description: line })
  }

  const first = samples[0]!
  const last = samples[samples.length - 1]!

  // Detached-node law: total DOM nodes (GC'd) do not grow with the cycles.
  expect(last.domNodes, 'DOM nodes after 5 open/close cycles of all six apps').toBeLessThanOrEqual(
    first.domNodes + 1_000,
  )
  expect(last.domNodes).toBeLessThanOrEqual(first.domNodes * 2)

  // The live document tree returns to its boot shape every cycle.
  expect(Math.abs(last.liveElements - first.liveElements)).toBeLessThanOrEqual(
    Math.ceil(first.liveElements * 0.25),
  )

  // Heap law: generous ceiling — catches a leaking subscription or a retained
  // window tree, ignores allocator noise.
  expect(last.jsHeapBytes, 'JS heap growth over the soak').toBeLessThanOrEqual(
    first.jsHeapBytes + 24 * 1024 * 1024,
  )
})
