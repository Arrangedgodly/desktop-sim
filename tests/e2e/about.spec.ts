import { expect, test, type Page } from '@playwright/test'

/**
 * AP-5 e2e — the science officer's nameplate manifest against the real app
 * graph: fresh context per test = a genuine first visit.
 *
 * Gates (docs/ultron/plan.md AP-5 acceptance: "content-pack fields all
 * rendered; links safe"):
 * 1. Double-clicking the seeded nameplate reference opens the manifest
 *    window — the IM-5 routing that soft-failed until this app registered.
 * 2. Placeholder mode is visitor-safe: in-world stand-ins render, and NO
 *    template debris ([REPLACE VIA CONTENT PACK (MF-3)] markers) exists
 *    anywhere in the served DOM — a recruiter never sees the fill-in form.
 * 3. The commissioning stamp cites the archive's record (the nameplate
 *    specimen's accession + mission-epoch timestamp).
 * 4. Singleton: opening through the launcher while the window lives raises
 *    the ONE window instead of duplicating it.
 * 5. The colophon names the console, its version, and its build truth.
 *
 * HONEST LIMIT — link safety attributes: the pack on this repo is the
 * placeholder pack (no links until the fill task lands content/author.json),
 * so the served DOM has no channel anchors to attribute-check. The anchors'
 * target=_blank + rel=noopener noreferrer are unit-proven against a fixture
 * pack in src/apps/about/about.test.tsx — the same rendering path a filled
 * pack drives; MF-3's fill task will light the real rows. Here we prove the
 * in-world empty state instead (no channels, no fake URLs).
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Retire the first-visit docent so the nameplate double-click is clean. */
async function retireDocent(page: Page): Promise<void> {
  await page.mouse.click(900, 600)
  await expect(page.locator('[data-docent]')).toHaveCount(0)
}

/** The manifest window, opened the way the first visitor opens it. */
async function openNameplate(page: Page) {
  await page.locator('[data-specimen-id="nameplate"]').dblclick()
  const win = page.locator('.wm-window[data-app-id="about"]')
  await expect(win).toBeVisible()
  return win
}

test('double-click the nameplate: the manifest opens, stand-ins render, zero template debris', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openNameplate(page)

  // Placeholder mode renders the in-world stand-ins, never the markers.
  await expect(page.locator('[data-about-name]')).toHaveText('Unassigned Officer')
  await expect(page.locator('[data-about-tagline]')).toHaveText(
    'Manifest pending — the officer’s record is not yet on file.',
  )
  await expect(page.locator('[data-about-awaiting]')).toContainText('AWAITING OFFICER MANIFEST')

  // The whole served document carries no fill-in-form debris.
  const debris = await page.evaluate(() => {
    const text = document.documentElement.innerText
    return {
      markers: text.includes('REPLACE VIA CONTENT PACK'),
      brackets: text.includes('[YOUR') || text.includes('[BIO') || text.includes('[TECH'),
    }
  })
  expect(debris.markers).toBe(false)
  expect(debris.brackets).toBe(false)

  // No channels riveted (the placeholder pack lists none — honestly, no fake
  // URLs), and no channel anchors exist to click.
  await expect(page.locator('[data-about-empty]')).toContainText('No channels riveted')
  await expect(page.locator('[data-about-link]')).toHaveCount(0)
})

test('the commissioning stamp cites the archive record; the colophon names the console', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openNameplate(page)

  // The seeded nameplate specimen: MOD-0001, accessioned 2087-03-14 09:37Z
  // (the seed's fixed mission clock — deterministic, in-mission).
  await expect(page.locator('[data-about-stamp-code]')).toHaveText('MOD-0001')
  await expect(page.locator('[data-about-stamp-log]')).toHaveText('LOG/2087-03-14 09:37Z')

  // THIS CONSOLE: name + version + build truth + the exhibit sentence. (The
  // legend is authored 'This Console'; the sheet's text-transform engraves
  // the caps — Playwright matches the DOM text, not the rendered case.)
  const colophon = page.locator('[data-about-colophon]')
  await expect(colophon).toContainText('This Console')
  await expect(colophon).toContainText('HOLD/OS')
  await expect(page.locator('[data-about-colophon-version]')).toHaveText('0.1.0')
  await expect(colophon).toContainText('REACT · TYPESCRIPT · VITE')
  await expect(page.locator('[data-about-colophon-note]')).toContainText('the portfolio')
})

test('singleton: the launcher re-open raises the ONE manifest window', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openNameplate(page)

  // Open the module drawer and launch the nameplate again — the registry's
  // singleton rule raises + focuses the existing window, never a second.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="about"]').click()
  await expect(page.locator('.wm-window')).toHaveCount(1)
  await expect(page.locator('.wm-window[data-app-id="about"]')).toBeVisible()
  await expect(page.locator('[data-window-led]')).toHaveCount(1)

  // The desktop reference agrees — through the RAISE path: stow the window
  // via its rail LED (the open module also covers the icon field), then
  // double-click the reference: the ONE window restores, never a second.
  await page.locator('[data-window-led]').click()
  await expect(page.locator('.wm-window[data-app-id="about"]')).toBeHidden()
  await page.locator('[data-specimen-id="nameplate"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="about"]')).toBeVisible()
  await expect(page.locator('.wm-window')).toHaveCount(1)
})
