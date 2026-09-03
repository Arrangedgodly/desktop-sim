import { expect, test, type Page } from '@playwright/test'

/**
 * Chart Plate e2e (batch 2, brief 9) — the archive's engraver for numbers
 * against the real app graph: fresh context per test = a genuine first visit.
 *
 * !! INTEGRATOR GATE: this spec requires the registration line —
 *    `chartPlateApp` added to the array in src/apps/index.ts — before it can
 *    run (the batch-2 isolation rules kept that file out of the worker's
 *    hands). Everything below assumes the module launches from the drawer.
 *
 * Gates (brief 9 acceptance 7 + the product floor):
 * 1. Manifest: the module opens from the drawer; SINGLETON — a second open
 *    raises the same window, never a second one; the bench boots the honest
 *    empty state (a plate no data rules, Save stood down).
 * 2. Author → cut: add two ledger lines, fill label + value; the plate cuts
 *    hatched BARS; the census readout counts; the LINE toggle trades hatch
 *    for a ruled polyline; the GROUND toggle re-inks the plate.
 * 3. Save: the name is offered INLINE; Enter cuts and files a REAL image
 *    specimen — a desktop icon appears, its data URI is an SVG document,
 *    and a reload keeps it.
 * 4. The cap: at 24 lines the ledger stands down (Add disabled).
 *
 * Selectors ride stable seams (data-* attributes), never CSS pixels.
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

/** Open the engraver through the module drawer — the launcher route. */
async function openChartPlate(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="chart-plate"]').click()
  const win = page.locator('.wm-window[data-app-id="chart-plate"]')
  await expect(win).toBeVisible()
  return win
}

/** Fill one ledger line (label + value) by its 0-based index. */
async function fillLine(page: Page, index: number, label: string, value: string): Promise<void> {
  await page.locator('[data-chart-label-input]').nth(index).fill(label)
  await page.locator('[data-chart-value-input]').nth(index).fill(value)
}

/* ------------------------------------------------------------------ */

test('opens SINGLETON from the drawer; the bench boots the honest empty state', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openChartPlate(page)

  // A plate no data rules: the dashed provisional state, Save stood down.
  const plate = page.locator('[data-chart-plate]')
  await expect(plate).toHaveAttribute('data-empty', 'true')
  await expect(plate).toContainText('No data rules this plate')
  await expect(page.locator('[data-chart-rows-readout]')).toHaveText('ROWS 00/24')
  await expect(page.locator('[data-chart-save]')).toBeDisabled()

  // SINGLETON: a second drawer open RAISES the same engraver, never a clone.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="chart-plate"]').click()
  await expect(page.locator('.wm-window[data-app-id="chart-plate"]')).toHaveCount(1)
})

test('add two rows, cut the plate: bars, census, line + ground toggles', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openChartPlate(page)

  // Two ledger lines.
  await page.locator('[data-chart-add]').click()
  await fillLine(page, 0, 'Signal', '12')
  await page.locator('[data-chart-add]').click()
  await fillLine(page, 1, 'Return', '7')
  await expect(page.locator('[data-chart-rows-readout]')).toHaveText('ROWS 02/24')

  // The plate cut: hatched BARS ride the preview (ground + 2 bars).
  const plate = page.locator('[data-chart-plate]')
  await expect(plate).not.toHaveAttribute('data-empty', 'true')
  await expect(plate.locator('svg rect')).toHaveCount(3)
  // B612 tick numerals are cut (the Measuring Law).
  await expect(plate.locator('svg text').filter({ hasText: '10' })).toHaveCount(1)

  // The LINE cut: hatch trades for a ruled polyline with node dots.
  await page.locator('[data-chart-kind-toggle="line"]').click()
  await expect(page.locator('[data-chart-kind-toggle="line"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(plate.locator('svg polyline')).toHaveCount(1)
  await expect(plate.locator('svg rect')).toHaveCount(1) // the ground alone
  await expect(plate.locator('svg circle')).toHaveCount(2)

  // The GROUND toggle re-inks the plate (parchment ↔ dark plate).
  await page.locator('[data-chart-ground-toggle="plate"]').click()
  await expect(plate).toHaveAttribute('data-ground', 'plate')
  await page.locator('[data-chart-ground-toggle="parchment"]').click()
  await expect(plate).toHaveAttribute('data-ground', 'parchment')
})

test('save files a REAL image specimen — icon on the desktop, SVG data URI, survives reload', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openChartPlate(page)

  await page.locator('[data-chart-add]').click()
  await fillLine(page, 0, 'Signal', '12')
  await page.locator('[data-chart-add]').click()
  await fillLine(page, 1, 'Return', '7')

  // Save: the name is offered INLINE; Enter accessions the plate.
  await page.locator('[data-chart-save]').click()
  const nameField = page.locator('[data-chart-name-input]')
  await expect(nameField).toBeFocused()
  await nameField.fill('e2e-survey-44')
  await page.keyboard.press('Enter')

  // Filed: a PLT accession in the well readout.
  await expect(page.locator('[data-chart-accession]')).toHaveText(/^PLT-\d{4}$/)
  await expect(page.locator('[data-chart-name-input]')).toHaveCount(0)

  // The chart became an ARCHIVE OBJECT: a specimen icon on the desktop.
  const icon = page.locator('.specimen-icon', { hasText: 'e2e-survey-44' })
  await expect(icon).toBeVisible()

  // Reload: the accessioned plate SURVIVES (the store persisted it). The
  // wait must cover TWO trailing debounces — the engraver's 400ms session
  // mirror lands AFTER the fs commit and re-arms the MF-2 writer's ~500ms
  // envelope debounce, so 700ms (the painter's figure, whose last write IS
  // the commit) races the flush; 2s covers both plus slack.
  await page.waitForTimeout(2000)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(icon).toBeVisible({ timeout: 10_000 })

  // The platform's own route: double-click opens the PLATE VIEWER, carrying
  // the SVG data URI (CSP-clean under img-src data:).
  await icon.dblclick()
  const viewer = page.locator('.wm-window[data-app-id="image-viewer"]')
  await expect(viewer).toBeVisible()
  const image = viewer.locator('[data-viewer-image]')
  await expect(image).toBeVisible()
  expect(await image.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/)
})

test('the ledger HOLDS at 24 lines — the add control stands down', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openChartPlate(page)

  for (let i = 0; i < 24; i += 1) {
    await page.locator('[data-chart-add]').click()
  }
  await expect(page.locator('[data-chart-row]')).toHaveCount(24)
  await expect(page.locator('[data-chart-rows-readout]')).toHaveText('ROWS 24/24')
  await expect(page.locator('[data-chart-add]')).toBeDisabled()

  // Striking a line re-arms the ledger.
  await page.locator('[data-chart-remove]').first().click()
  await expect(page.locator('[data-chart-row]')).toHaveCount(23)
  await expect(page.locator('[data-chart-add]')).toBeEnabled()
})
