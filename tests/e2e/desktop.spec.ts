import { expect, test } from '@playwright/test'

/**
 * UI-3 e2e — the desktop surface contract, against the real app graph (boot
 * orchestrator, real persistence, real stores; fresh context per test = a
 * genuine first visit).
 *
 * Gates (docs/ultron/plan.md UI-3 acceptance):
 * 1. After boot, the desktop shows the seeded catalog as specimen icons
 *    (Projects / Field Notes / Archive drawers + the charter specimen + the
 *    About module reference) on the provisional plate.
 * 2. Click selects an icon; clicking the bare plate clears the selection.
 * 3. The first-visit docent hints are visible, dismissible, and stay gone
 *    after a reload.
 *
 * Selectors ride stable seams (data-* attributes / accessible names), never
 * CSS pixels — the one bare-plate click uses a deliberately empty screen
 * region instead.
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

test('after boot the desktop shows the seeded catalog as specimen icons', async ({ page }) => {
  await toDesktop(page)

  // The three drawers + the charter specimen + the About module reference —
  // accessible names carry name, accession code, kind.
  const icons = page.locator('.icon-field [data-specimen-id]')
  await expect(icons).toHaveCount(5)
  await expect(
    page.getByRole('button', { name: 'Projects, DRW-0001, drawer' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Field Notes, DRW-0002, drawer' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive, DRW-0003, drawer' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'accession-charter.txt, SPC-0005, specimen' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Science Officer Nameplate, MOD-0001, module' }),
  ).toBeVisible()

  // Parchment labels carry the engraved catalog text; the provisional plate
  // (CSS graticule) is under everything; no windows on a first visit.
  await expect(page.locator('.specimen-accession', { hasText: 'DRW-0001' })).toBeVisible()
  await expect(page.locator('[data-wallpaper="provisional-graticule"]')).toBeAttached()
  await expect(page.locator('.wm-window')).toHaveCount(0)
})

test('click selects an icon; clicking the bare plate clears the selection', async ({ page }) => {
  await toDesktop(page)

  const projects = page.locator('[data-specimen-id="projects"]')
  const archive = page.locator('[data-specimen-id="archive"]')

  await projects.click()
  await expect(projects).toHaveAttribute('data-selected', 'true')
  await expect(archive).toHaveAttribute('data-selected', 'false')

  // Selection is single: clicking another specimen moves it.
  await archive.click()
  await expect(archive).toHaveAttribute('data-selected', 'true')
  await expect(projects).toHaveAttribute('data-selected', 'false')

  // Clicking the bare plate (a deliberately empty region, clear of icons,
  // docent cards, and windows) sets the selection down.
  await page.mouse.click(900, 600)
  await expect(archive).toHaveAttribute('data-selected', 'false')
})

test('the first-visit docent hints are visible, dismiss on interaction, and stay gone', async ({
  page,
}) => {
  await toDesktop(page)

  // Parchment annotation cards + drawn leader lines, first visit only.
  await expect(page.locator('[data-docent]')).toBeVisible()
  await expect(page.getByText('Double-click a specimen to open it.')).toBeVisible()
  await expect(page.getByText(/Drag to rearrange the hold/)).toBeVisible()
  await expect(page.locator('.docent-leader')).toHaveCount(3)

  // Any interaction retires the docent (here: selecting a specimen).
  await page.locator('[data-specimen-id="nameplate"]').click()
  await expect(page.locator('[data-docent]')).toHaveCount(0)

  // Reload (return visit): desktop returns, docent never does.
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-docent]')).toHaveCount(0)
})

test('the × on a docent card dismisses the hints too', async ({ page }) => {
  await toDesktop(page)

  await page.getByRole('button', { name: 'Dismiss hint' }).first().click()
  await expect(page.locator('[data-docent]')).toHaveCount(0)
})
