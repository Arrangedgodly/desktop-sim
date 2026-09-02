import { expect, test, type Page } from '@playwright/test'

/**
 * AP-6 e2e — the archive's FIELD ATLAS against the real app graph: fresh
 * context per test = a genuine first visit.
 *
 * Gates (docs/ultron/plan.md AP-6 acceptance: "all content-pack projects
 * listed; external opens correct URLs; no iframes"):
 * 1. Opening the atlas from the module launcher renders the LEDGER — one
 *    catalog card per content-pack project slot, in the plate-book's own
 *    furniture (roman plate numbers, stamped tech chips).
 * 2. Placeholder mode is visitor-safe: in-world stand-ins ("Unindexed
 *    Specimen 01") render and NO template debris ([REPLACE VIA CONTENT PACK
 *    (MF-3)] markers) exists anywhere in the served DOM.
 * 3. Clicking a card turns to the PLATE PAGE inside the same window; the
 *    ledger returns (button + Backspace); prev/next WRAP the ring both by
 *    toolbar and by arrow keys.
 * 4. The atlas is a URL-free zone — zero iframes in the served DOM at every
 *    view.
 *
 * HONEST LIMIT — external link attributes: the pack on this repo is the
 * placeholder pack (no URLs until the fill task lands content/author.json),
 * so the served DOM has NO live-site/repository anchors to attribute-check.
 * Their target=_blank + rel=noopener noreferrer are unit-proven against a
 * fixture pack in src/apps/browser/browser.test.tsx — the same rendering
 * path a filled pack drives. Here we prove the honest placeholder state
 * instead: absent URLs render BOTH actions disabled with engraved reasons,
 * never hidden, and never an anchor that could navigate anywhere.
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Retire the first-visit docent so launcher clicks are clean. */
async function retireDocent(page: Page): Promise<void> {
  await page.mouse.click(900, 600)
  await expect(page.locator('[data-docent]')).toHaveCount(0)
}

/** Open the atlas the way the first visitor does: the module drawer. */
async function openAtlas(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="browser"]').click()
  const win = page.locator('.wm-window[data-app-id="browser"]')
  await expect(win).toBeVisible()
  return win
}

test('the launcher opens the atlas: cards render, stand-ins only, zero debris, one window', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openAtlas(page)

  // The ledger: one card per placeholder-pack slot (two), plate-book furniture.
  await expect(page.locator('[data-browser-card]')).toHaveCount(2)
  await expect(page.locator('[data-browser-card]').nth(0)).toContainText('Unindexed Specimen 01')
  await expect(page.locator('[data-browser-card]').nth(1)).toContainText('Unindexed Specimen 02')
  await expect(page.locator('[data-browser-readout]')).toHaveText('2 PLATES')
  await expect(page.locator('[data-browser-awaiting]')).toContainText('AWAITING FIELD ACCESSION')

  // Placeholder honesty: descriptions are about the placeholder, and the
  // whole served document carries no fill-in-form debris.
  await expect(page.locator('[data-browser-card]').nth(0)).toContainText(
    'Awaiting the officer’s field notes',
  )
  const debris = await page.evaluate(() => {
    const text = document.documentElement.innerText
    return {
      markers: text.includes('REPLACE VIA CONTENT PACK'),
      brackets: text.includes('[YOUR') || text.includes('[PROJECT') || text.includes('[TECH'),
    }
  })
  expect(debris.markers).toBe(false)
  expect(debris.brackets).toBe(false)

  // Singleton: the launcher re-open raises the ONE atlas window.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="browser"]').click()
  await expect(page.locator('.wm-window')).toHaveCount(1)
  await expect(page.locator('.wm-window[data-app-id="browser"]')).toBeVisible()

  // A URL-free zone: no iframe anywhere in the served document.
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('a card turns to its plate page; the ledger returns (button and Backspace)', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openAtlas(page)

  // Enter the first plate — same window, page view.
  await page.locator('[data-browser-card]').nth(0).click()
  await expect(page.locator('[data-browser-page]')).toBeVisible()
  await expect(page.locator('[data-browser-page]')).toHaveAttribute('data-plate-id', 'exhibit-01')
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('Unindexed Specimen 01')
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE I / II')

  // The accession well cites the archive's own record (the seeded exhibit
  // specimen joined to this slot).
  await expect(page.locator('[data-browser-accession]')).toHaveText(/^SPC-\d{4}$/)

  // No screenshot in the placeholder pack: the authored undeveloped frame.
  await expect(page.locator('[data-browser-screenshot]')).toHaveCount(0)
  await expect(page.locator('[data-browser-undeveloped]')).toContainText('PLATE NOT DEVELOPED')

  // Back via the toolbar: the ledger returns and focus lands on the card.
  await page.locator('[data-browser-back]').click()
  await expect(page.locator('[data-browser-page]')).toHaveCount(0)
  await expect(page.locator('[data-browser-card]')).toHaveCount(2)
  await expect(page.locator('[data-browser-card]').nth(0)).toBeFocused()

  // Back via the keyboard floor: Backspace returns from a plate too.
  await page.locator('[data-browser-card]').nth(1).click()
  await expect(page.locator('[data-browser-page]')).toHaveAttribute('data-plate-id', 'exhibit-02')
  await page.keyboard.press('Backspace')
  await expect(page.locator('[data-browser-page]')).toHaveCount(0)
  await expect(page.locator('[data-browser-card]').nth(1)).toBeFocused()
})

test('prev/next move between projects and WRAP the ring, by control and by key', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openAtlas(page)

  // Enter the ring at plate I.
  await page.locator('[data-browser-card]').nth(0).click()
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE I / II')

  // Next → plate II; next again WRAPS back to plate I (a plate book is a ring).
  await page.locator('[data-browser-next]').click()
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE II / II')
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('Unindexed Specimen 02')
  await page.locator('[data-browser-next]').click()
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE I / II')
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('Unindexed Specimen 01')

  // Prev wraps the other way: I → II.
  await page.locator('[data-browser-prev]').click()
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE II / II')

  // The keyboard floor pages the same ring while a plate is open.
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE I / II')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE II / II')

  // No iframe at the plate view either.
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('external actions in placeholder mode: disabled with engraved reasons, never anchors', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openAtlas(page)

  await page.locator('[data-browser-card]').nth(0).click()

  // The honest placeholder state (see the header's limit note): both actions
  // render as DISABLED BUTTONS carrying their engraved reasons — never
  // hidden, and never an anchor that could navigate anywhere.
  const live = page.locator('[data-browser-live]')
  await expect(live).toBeVisible()
  await expect(live).toBeDisabled()
  await expect(live).toHaveText('Open live site')
  await expect(page.locator('[data-browser-live-note]')).toHaveText(
    'No live site on file with the archive.',
  )

  const repo = page.locator('[data-browser-repo]')
  await expect(repo).toBeVisible()
  await expect(repo).toBeDisabled()
  await expect(repo).toHaveText('Repository')
  await expect(page.locator('[data-browser-repo-note]')).toHaveText(
    'No repository on file with the archive.',
  )

  // Nothing in the atlas window navigates anywhere: no anchors at all.
  await expect(page.locator('.wm-window[data-app-id="browser"] a')).toHaveCount(0)
})
