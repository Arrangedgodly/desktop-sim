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
 * 2. The FILLED pack (refinement #1: Graydon Wasil's content/author.json)
 *    renders the five real exhibits — names, stories, tech chips, embedded
 *    screenshots — and NO template debris exists anywhere in the served DOM.
 * 3. Clicking a card turns to the PLATE PAGE inside the same window; the
 *    ledger returns (button + Backspace); prev/next WRAP the ring both by
 *    toolbar and by arrow keys.
 * 4. External actions are REAL anchors carrying the pack's URLs
 *    (target=_blank + rel=noopener noreferrer); exhibits without a repository
 *    render the honest disabled state with its engraved reason.
 * 5. The atlas is a URL-free zone — zero iframes in the served DOM at every
 *    view.
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

test('the launcher opens the atlas: the five exhibits render, zero debris, one window', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openAtlas(page)

  // The ledger: one card per pack slot (five), plate-book furniture.
  const cards = page.locator('[data-browser-card]')
  await expect(cards).toHaveCount(5)
  await expect(cards.nth(0)).toContainText('Rhymepage')
  await expect(cards.nth(1)).toContainText('Collectible Cars DB')
  await expect(cards.nth(2)).toContainText('Arranged Godly')
  await expect(cards.nth(3)).toContainText('VOXCHAIN')
  await expect(cards.nth(4)).toContainText('The Experiments Shelf')
  await expect(page.locator('[data-browser-readout]')).toHaveText('5 PLATES')
  await expect(page.locator('[data-browser-awaiting]')).toHaveCount(0)

  // Filled honesty: real descriptions, real tech chips, and every card
  // carries its embedded screenshot (the pack names one per exhibit).
  await expect(cards.nth(0)).toContainText('Write the verse, sync it to the track')
  await expect(cards.nth(0).locator('.browser-chip').first()).toHaveText('Web app')
  await expect(page.locator('.browser-card-image')).toHaveCount(5)
  await expect(page.locator('[data-browser-undeveloped]')).toHaveCount(0)
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
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('Rhymepage')
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE I / V')

  // The accession well cites the archive's own record (the seeded exhibit
  // specimen joined to this slot).
  await expect(page.locator('[data-browser-accession]')).toHaveText(/^SPC-\d{4}$/)

  // The pack names a screenshot per exhibit: the embedded plate renders.
  // (Dev-server flavor serves the source path; the production build hashes
  // it into /assets/ — both are the resolved asset, never the fallback.)
  const shot = page.locator('[data-browser-screenshot]')
  await expect(shot).toBeVisible()
  await expect(shot).toHaveAttribute('src', /^\/(assets\/.+|content\/screenshots\/.+)\.(png|webp|jpe?g)$/)
  await expect(shot).toHaveAttribute('alt', 'Rhymepage — exhibit plate')
  await expect(page.locator('[data-browser-undeveloped]')).toHaveCount(0)

  // The story rides as FIELD NOTES.
  await expect(page.locator('[data-browser-story]')).toContainText('teleprompter')

  // Back via the toolbar: the ledger returns and focus lands on the card.
  await page.locator('[data-browser-back]').click()
  await expect(page.locator('[data-browser-page]')).toHaveCount(0)
  await expect(page.locator('[data-browser-card]')).toHaveCount(5)
  await expect(page.locator('[data-browser-card]').nth(0)).toBeFocused()

  // Back via the keyboard floor: Backspace returns from a plate too.
  await page.locator('[data-browser-card]').nth(1).click()
  await expect(page.locator('[data-browser-page]')).toHaveAttribute('data-plate-id', 'exhibit-02')
  await page.keyboard.press('Backspace')
  await expect(page.locator('[data-browser-page]')).toHaveCount(0)
  await expect(page.locator('[data-browser-card]').nth(1)).toBeFocused()
})

test('prev/next move between exhibits and WRAP the ring, by control and by key', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openAtlas(page)

  // Enter the ring at plate I.
  await page.locator('[data-browser-card]').nth(0).click()
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE I / V')

  // Step through the real exhibits; next past the last WRAPS (a plate book
  // is a ring).
  await page.locator('[data-browser-next]').click()
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE II / V')
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('Collectible Cars DB')
  await page.locator('[data-browser-next]').click()
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('Arranged Godly')
  await page.locator('[data-browser-next]').click()
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('VOXCHAIN')
  await page.locator('[data-browser-next]').click()
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('The Experiments Shelf')
  await page.locator('[data-browser-next]').click() // wraps I ← V
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE I / V')
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('Rhymepage')

  // Prev wraps the other way: I → V.
  await page.locator('[data-browser-prev]').click()
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE V / V')

  // The keyboard floor pages the same ring while a plate is open.
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE I / V')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-browser-readout]')).toHaveText('PLATE V / V')

  // No iframe at the plate view either.
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('external actions: the pack’s URLs open as safe anchors; absent repos stay honestly disabled', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openAtlas(page)

  // Rhymepage carries both channels: real anchors, safe attributes, hosts
  // printed beside them (refinement #1 unfreezes the placeholder limit).
  await page.locator('[data-browser-card]').nth(0).click()
  const live = page.locator('[data-browser-live]')
  await expect(live).toHaveText('Open live site')
  await expect(live).toHaveAttribute('href', 'https://graydonwasil.com')
  await expect(live).toHaveAttribute('target', '_blank')
  await expect(live).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.locator('[data-browser-live-note]')).toHaveText('graydonwasil.com')

  const repo = page.locator('[data-browser-repo]')
  await expect(repo).toHaveAttribute('href', 'https://github.com/arrangedgodly/rhymepage')
  await expect(repo).toHaveAttribute('target', '_blank')
  await expect(repo).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.locator('[data-browser-repo-note]')).toHaveText('github.com')

  // Arranged Godly (III) and VOXCHAIN (IV) carry no repository: the action
  // renders as a DISABLED BUTTON with its engraved reason — never hidden.
  await page.locator('[data-browser-next]').click()
  await page.locator('[data-browser-next]').click()
  await expect(page.locator('[data-browser-plate-name]')).toHaveText('Arranged Godly')
  const noRepo = page.locator('[data-browser-repo]')
  await expect(noRepo).toBeVisible()
  await expect(noRepo).toBeDisabled()
  await expect(page.locator('[data-browser-repo-note]')).toHaveText(
    'No repository on file with the archive.',
  )
  await expect(
    page.locator('.wm-window[data-app-id="browser"] a[data-browser-live]'),
  ).toHaveCount(1) // the live channel is still a real anchor
})
