import { expect, test, type Page } from '@playwright/test'

/**
 * Vivarium e2e (batch 2, brief 1) — the Hold Vivarium against the real app
 * graph, AFTER integration registers `vivarium` in src/apps/index.ts (this
 * worker could not run the suite — the batch's isolation rule; selectors ride
 * the app's stable data-seams, the fleet's spec style).
 *
 * Gates (the brief's acceptance 7 — opens, pauses via toggle, drops a nutrient):
 * 1. Launcher opens the ONE tank window (singleton); a re-open raises it,
 *    never a second window; the launcher's order floor stays intact
 *    (notepad still the first module).
 * 2. The census readout is honest (B612 well: POP 047 = 18 minnows +
 *    2 drifters + 1 predator + 26 motes) and the larder starts empty.
 * 3. Tapping the glass drops a nutrient: FOOD 00 → 01 (the readout snaps;
 *    convergence itself is the model's unit law, not pixels here).
 * 4. The PAUSE bat: aria-checked flips, the HELD flag shows, the life lamp
 *    dies; throwing it back relights the tank.
 * 5. Default motion console: no STEP control ships outside reduced motion.
 */

const EXPECTED_POP = 47 // 18 + 2 + 1 + 26 (vivarium-species census law)

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

/** Open the vivarium through the module drawer — the launcher route. */
async function openVivarium(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="vivarium"]').click()
  const win = page.locator('.wm-window[data-app-id="vivarium"]')
  await expect(win).toBeVisible()
  return win
}

test('launcher opens the ONE tank; re-open raises it; notepad keeps the first slot; the census is honest', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  // The order floor: the notepad is still the launcher's first module.
  await page.locator('[data-launcher-pull]').click()
  const firstModule = page.locator('[data-launcher-menu] [data-launch-app]').first()
  await expect(firstModule).toHaveAttribute('data-launch-app', 'notepad')

  await page.locator('[data-launcher-menu] [data-launch-app="vivarium"]').click()
  const win = page.locator('.wm-window[data-app-id="vivarium"]')
  await expect(win).toBeVisible()
  await expect(win.locator('[data-vivarium-pop]')).toHaveText(`POP ${String(EXPECTED_POP).padStart(3, '0')}`)
  await expect(win.locator('[data-vivarium-food]')).toHaveText('FOOD 00')

  // Singleton: a second launcher open raises the SAME window, never a second.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="vivarium"]').click()
  await expect(page.locator('.wm-window[data-app-id="vivarium"]')).toHaveCount(1)
})

test('tapping the glass drops a nutrient mote — the larder readout snaps', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  const win = await openVivarium(page)

  const tank = win.locator('[data-vivarium-tank]')
  const box = (await tank.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4)

  await expect(win.locator('[data-vivarium-food]')).toHaveText('FOOD 01')
  // A second tap mid-tank: two live motes.
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.6)
  await expect(win.locator('[data-vivarium-food]')).toHaveText('FOOD 02')
})

test('the PAUSE bat holds the tank; throwing it back relights it', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  const win = await openVivarium(page)

  const pause = win.locator('[data-vivarium-pause]')
  await expect(pause).toHaveAttribute('aria-checked', 'false')
  await expect(win.locator('[data-vivarium-hold]')).toHaveCount(0)
  await expect(win.locator('.vivarium-lamp')).toHaveAttribute('data-lit', 'true')
  // The default console is the MOVING console — no step control ships.
  await expect(win.locator('[data-vivarium-step]')).toHaveCount(0)

  await pause.click()
  await expect(pause).toHaveAttribute('aria-checked', 'true')
  await expect(win.locator('[data-vivarium-hold]')).toHaveText('HELD')
  await expect(win.locator('.vivarium-lamp')).toHaveAttribute('data-lit', 'false')

  await pause.click()
  await expect(pause).toHaveAttribute('aria-checked', 'false')
  await expect(win.locator('[data-vivarium-hold]')).toHaveCount(0)
  await expect(win.locator('.vivarium-lamp')).toHaveAttribute('data-lit', 'true')
})
