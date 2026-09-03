import { expect, test, type Page } from '@playwright/test'

/**
 * Vitals e2e (federated batch 2) — the self-monitoring panel against the real
 * app graph: fresh context per test = a genuine first visit.
 *
 * Gates (docs/ultron/sessions/batch2-briefs.md acceptance 7):
 * 1. OPENS from the module drawer; singleton (a second open raises the same
 *    window, never a second one); the FRAME RATE plate carries its well
 *    chart and an honest numeric readout once the first sample lands.
 * 2. The console plate counts live truth: REGISTERED MODULES > 8 (the
 *    integrator wires this batch's ten into the fleet of eight).
 * 3. The sample-rate selector works by pointer AND keyboard and persists
 *    through the window's appState across a reload.
 * 4. The boot ladder replays its milestones at true durations.
 *
 * Honest-seam note: heap/storage availability varies by engine; each plate
 * asserts its LIVE READOUT **or** its engraved NOT TELEMETRIED plate — never
 * a blank, never a fabricated number. The unavailable paths are proven by
 * the colocated unit tests (src/apps/vitals/vitals-surface.test.tsx) by
 * injecting absent telemetry sources; e2e cannot remove performance.memory
 * from a real Chromium.
 *
 * Selectors ride stable seams (data-vitals-* attributes), never CSS pixels.
 * The integrator registers `vitalsApp` in src/apps/index.ts before this spec
 * can pass (it launches through the real module drawer).
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Retire the first-visit docent so the rail and icons are unobstructed. */
async function retireDocent(page: Page): Promise<void> {
  await page.mouse.click(900, 600)
  await expect(page.locator('[data-docent]')).toHaveCount(0)
}

/** Open the vitals panel through the module drawer — the launcher route. */
async function openVitals(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="vitals"]').click()
  const win = page.locator('.wm-window[data-app-id="vitals"]')
  await expect(win).toBeVisible()
  return win
}

/** The readout text of a panel plate (singletons keep locators unique). */
const readout = (page: Page, q: string) => page.locator(q)

/* ------------------------------------------------------------------ */

test('opens from the drawer; singleton; the frame plate carries a live chart + honest readout; modules > 8', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openVitals(page)

  // The instrument grid mounted: the frame plate, its well chart, the toolbar.
  const root = page.locator('[data-vitals-root]')
  await expect(root).toBeVisible()
  await expect(page.locator('[data-vitals-plate="fps"]')).toBeVisible()
  await expect(page.locator('[data-vitals-fps-chart]')).toBeVisible()
  await expect(page.locator('[data-vitals-fps-chart] .vitals-trace')).toBeVisible()

  // The first sample lands within a beat (default 1S cadence) and the fps
  // readout becomes an honest NUMBER (a dash before that is correct).
  await expect
    .poll(async () => readout(page, '[data-vitals-fps-readout]').innerText(), { timeout: 15_000 })
    .toMatch(/^\d+(\.\d+)?$/)

  // Live console truth: modules > 8, at least this window open, uptime ticking.
  await expect
    .poll(async () => readout(page, '[data-vitals-modules]').innerText())
    .toMatch(/^\d+$/)
  expect(Number(await readout(page, '[data-vitals-modules]').innerText())).toBeGreaterThan(8)
  expect(Number(await readout(page, '[data-vitals-windows]').innerText())).toBeGreaterThanOrEqual(1)
  await expect
    .poll(async () => readout(page, '[data-vitals-uptime]').innerText())
    .toMatch(/^(\d+d )?\d{2}:\d{2}:\d{2}$/)

  // SINGLETON: a second launcher open raises the SAME window — never a second.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="vitals"]').click()
  await expect(page.locator('.wm-window[data-app-id="vitals"]')).toHaveCount(1)

  // Honest seams in a real Chromium: heap/storage either read truly or
  // engrave their refusal — never blank, never fabricated.
  const heap = page.locator('[data-vitals-plate="heap"]')
  await expect(heap).toBeVisible()
  await expect(heap).toContainText(/MiB|GiB|KiB|B\b|NOT TELEMETRIED/)
  const storage = page.locator('[data-vitals-plate="storage"]')
  await expect
    .poll(async () => storage.innerText(), { timeout: 10_000 })
    .toMatch(/%|NOT TELEMETRIED/)
})

test('the sample-rate selector: pointer + keyboard, persisted through appState across reload', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openVitals(page)

  const root = page.locator('[data-vitals-root]')
  await expect(root).toHaveAttribute('data-vitals-rate', '1000') // the default stop

  // Pointer: choosing 250MS moves selection and the root's declared rate.
  await page.locator('[data-vitals-rate-option="250"]').click()
  await expect(page.locator('[data-vitals-rate-option="250"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(root).toHaveAttribute('data-vitals-rate', '250')

  // Keyboard: the radiogroup walks (arrows move selection + focus).
  await page.locator('[data-vitals-rate-option="250"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-vitals-rate-option="1000"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.locator('[data-vitals-rate-option="1000"]')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-vitals-rate-option="5000"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(root).toHaveAttribute('data-vitals-rate', '5000')

  // The rate rides the window record's opaque appState: reload restores the
  // SAME panel at the SAME rate (MF-2 writer flush first, the paint spec's
  // own cadence).
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  const restored = page.locator('.wm-window[data-app-id="vitals"]')
  await expect(restored).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-vitals-root]')).toHaveAttribute('data-vitals-rate', '5000')
  await expect(page.locator('[data-vitals-rate-option="5000"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('the boot ladder replays the session milestones at true durations', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openVitals(page)

  // The ladder carries the platform's real milestones (boot.spec's names).
  const bootWell = page.locator('[data-vitals-boot-well]')
  await expect(bootWell).toBeVisible()
  await expect(bootWell).toContainText('BOOT-START')
  await expect(bootWell).toContainText('DESKTOP-READY')

  // REPLAY: mark 0 lights immediately, the playhead walks at true durations
  // (a real boot is ≤2s by law), and the moment ends at rest.
  await page.locator('[data-vitals-replay]').click()
  await expect(bootWell.locator('.vitals-ladder-name--now')).toHaveText('BOOT-START')
  await expect
    .poll(
      async () => bootWell.locator('.vitals-ladder-name--now').textContent(),
      { timeout: 10_000 },
    )
    .toBe('DESKTOP-READY')
  await expect
    .poll(
      async () => bootWell.locator('.vitals-ladder-name--now').count(),
      { timeout: 5_000 },
    )
    .toBe(0)
  // …and the ladder is still fully visible at rest — never blank.
  await expect(bootWell).toContainText('DESKTOP-READY')
})
