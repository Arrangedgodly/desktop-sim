import { expect, test, type Page } from '@playwright/test'

/**
 * Type Cabinet e2e (batch 2 federated fleet) — the OS's own specimen book
 * against the real app graph. Written by the type-cabinet session for the
 * INTEGRATOR to run once registration is wired into src/apps/index.ts (the
 * isolation law forbade running it in-session: concurrent e2e runs collide on
 * the port). Fresh context per test = a genuine first visit.
 *
 * Gates (the brief's acceptance 6):
 * 1. The launcher opens the cabinet: THREE drawer tabs, the label drawer
 *    engaged, and the waterfall spans its full run — a size RUNT (11 PX) and
 *    a DISPLAY size (34 PX) both render on the same sheet.
 * 2. The tabs are KEYBOARD-operable: arrows walk + wrap the ring, Home/End
 *    jump, the panel follows the engaged tab, the B612 drawer readout counts.
 * 3. Every drawer's sheet carries its role line (speaks / reads / counts) and
 *    the mono drawer shows its DIGIT ROW (the measuring law, in a well).
 * 4. Singleton: a second launcher open raises the ONE window (never a second).
 *
 * Selectors ride stable seams (data-tc-* attributes), never CSS pixels.
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

/** Open the cabinet through the module drawer — the launcher route. */
async function openCabinet(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="type-cabinet"]').click()
  const win = page.locator('.wm-window[data-app-id="type-cabinet"]')
  await expect(win).toBeVisible()
  return win
}

/** The drawer tabs, as Playwright locators. */
const tabs = (page: Page) => page.locator('[data-tc-surface] [role="tab"]')

/* ------------------------------------------------------------------ */

test('the launcher opens the cabinet: three drawers, runt and display sizes both rendering', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openCabinet(page)

  // Three engraved drawer tabs; the LABEL drawer is open by default.
  await expect(tabs(page)).toHaveCount(3)
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-tc-tab="label"]')).toHaveAttribute('aria-selected', 'true')

  // The waterfall spans its full run on the open sheet: the 11 PX runt and
  // the 34 PX display size both render (the same face, six stops apart).
  await expect(page.locator('[data-tc-size="11"]')).toBeVisible()
  await expect(page.locator('[data-tc-size="34"]')).toBeVisible()

  // The drawer readout counts from a well: 01 / 03 in B612.
  await expect(page.locator('[data-tc-readout]')).toHaveText('01 / 03')

  // The label drawer's own story is on the sheet.
  await expect(page.locator('[data-tc-role]')).toContainText(/speaks for the console/i)
})

test('the tabs are keyboard-operable: arrows walk and wrap the ring, Home/End jump, sheets follow', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openCabinet(page)

  // Land focus on the engaged tab, then walk the ring with arrows.
  await tabs(page).first().focus()
  await page.keyboard.press('ArrowRight') // → the content drawer
  await expect(page.locator('[data-tc-tab="content"]')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-tc-tab="content"]')).toBeFocused()
  await expect(page.locator('[data-tc-readout]')).toHaveText('02 / 03')

  await page.keyboard.press('ArrowRight') // → the mono drawer
  await expect(page.locator('[data-tc-tab="mono"]')).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('ArrowRight') // WRAPS → the label drawer
  await expect(page.locator('[data-tc-tab="label"]')).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('ArrowLeft') // wraps back → the mono drawer
  await expect(page.locator('[data-tc-tab="mono"]')).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('Home')
  await expect(page.locator('[data-tc-tab="label"]')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(page.locator('[data-tc-tab="mono"]')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-tc-readout]')).toHaveText('03 / 03')

  // The panel is labelled by the engaged tab and follows the turn.
  const panel = page.locator('[data-tc-panel]')
  const engagedId = await page.locator('[data-tc-tab="mono"]').getAttribute('id')
  await expect(panel).toHaveAttribute('aria-labelledby', engagedId ?? '')
  await expect(panel).toContainText(/this face counts/i)
})

test('every drawer tells its role; the mono drawer counts — its digit row rides a well', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openCabinet(page)

  // The content drawer: the serif's reading sizes render (13 runt, 28 display).
  await page.locator('[data-tc-tab="content"]').click()
  await expect(page.locator('[data-tc-role]')).toContainText(/reads the archive/i)
  await expect(page.locator('[data-tc-size="13"]')).toBeVisible()
  await expect(page.locator('[data-tc-size="28"]')).toBeVisible()

  // The mono drawer: the DIGIT ROW — the measuring law, seated in a well.
  await page.locator('[data-tc-tab="mono"]').click()
  await expect(page.locator('[data-tc-role]')).toContainText(/this face counts/i)
  const digits = page.locator('[data-tc-digits]')
  await expect(digits).toBeVisible()
  await expect(digits).toContainText('0123456789')
  await expect(digits).toHaveClass(/well/)

  // The label drawer's proportional digits are barred — printed OUTSIDE any well.
  await page.locator('[data-tc-tab="label"]').click()
  const barred = page.locator('[data-tc-digits]')
  await expect(barred).toBeVisible()
  await expect(barred).not.toHaveClass(/well/)
})

test('singleton: a second launcher open raises the ONE cabinet window', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openCabinet(page)

  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="type-cabinet"]').click()
  await expect(page.locator('.wm-window[data-app-id="type-cabinet"]')).toHaveCount(1)
  await expect(page.locator('[data-tc-surface]')).toHaveCount(1)
})
