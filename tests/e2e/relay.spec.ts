import { expect, test, type Page } from '@playwright/test'

/**
 * Relay e2e (batch 2, brief 3) — SURVEY RELAY against the real app graph,
 * AFTER integration registers `relay` in src/apps/index.ts (this worker
 * could not run the suite — the batch's isolation rule; selectors ride the
 * app's stable data-seams, the fleet's spec style).
 *
 * Gates (brief 3 acceptance 8 — first letter arrives under a documented
 * test-mode schedule hook; read + file; the archive gains a story):
 * 1. Launcher opens the ONE relay window (singleton); a re-open raises it,
 *    never a second window; the launcher's order floor stays intact
 *    (notepad still the first module). The wire mounts QUIET with honest
 *    readouts (awaiting note, MAIL 00/06, NEXT 00:20).
 * 2. THE TEST HOOK (the method, documented): the mounted surface exposes
 *    `window.__relayTestHook.advance(ms)` — advance the relay clock
 *    directly (the drip's honest seam; the surface's own 1s tick pauses
 *    under document.hidden, so real-time waiting would be the only
 *    alternative and the wire is deliberately slow). Advancing 20s delivers
 *    the first letter: a row settles into the ledger, the arrival lamp
 *    lights, MAIL reads 01/06 — never a modal.
 * 3. Reading: the letter opens on parchment (the reading surface); the
 *    read-lamp state dims; opening marks it read.
 * 4. Filing: FILE TO THE ARCHIVE bootstraps the Relay drawer on the desktop
 *    and accessions a REAL text specimen — verifiable down the platform's
 *    own routes: open the Relay drawer in the explorer, double-click the
 *    transcript, the NOTEPAD shows the filed letter.
 * 5. Reload: the watch rides the window record's appState — the same
 *    letters arrived, the same marks held (read stays read, filed stays
 *    filed).
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

/** Open the relay through the module drawer — the launcher route. */
async function openRelay(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="relay"]').click()
  const win = page.locator('.wm-window[data-app-id="relay"]')
  await expect(win).toBeVisible()
  return win
}

/** Wait for the lazy surface, then advance the relay clock by `ms`. */
async function advanceWire(page: Page, ms: number): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => typeof window.__relayTestHook !== 'undefined'))
    .toBe(true)
  await page.evaluate((delta) => window.__relayTestHook!.advance(delta), ms)
}

/* ------------------------------------------------------------------ */

test('launcher opens the wire; singleton re-open raises the SAME window; notepad keeps the first slot', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  // The order floor: the notepad is still the launcher's first module.
  await page.locator('[data-launcher-pull]').click()
  const firstModule = page.locator('[data-launcher-menu] [data-launch-app]').first()
  await expect(firstModule).toHaveAttribute('data-launch-app', 'notepad')

  await page.locator('[data-launcher-menu] [data-launch-app="relay"]').click()
  const win = page.locator('.wm-window[data-app-id="relay"]')
  await expect(win).toBeVisible()

  // The wire mounts QUIET — honest readouts, dark lamp, no rows. (The watch
  // and NEXT readouts are banded: the surface's own 1s tick keeps honest
  // time underneath the test's own milliseconds.)
  await expect(page.locator('[data-relay-awaiting]')).toBeVisible()
  await expect(page.locator('[data-relay-count]')).toHaveText('MAIL 00/06')
  await expect(page.locator('[data-relay-watch]')).toHaveText(/^WATCH 00:00:0\d$/)
  await expect(page.locator('[data-relay-next]')).toHaveText(/^NEXT 00:2\d$/)
  await expect(page.locator('[data-relay-lamp]')).toHaveAttribute('data-lit', 'false')
  await expect(page.locator('[data-relay-marginal]')).toContainText('The wire is quiet')

  // Singleton: a second launcher open is the SAME window, raised.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="relay"]').click()
  await expect(page.locator('.wm-window[data-app-id="relay"]')).toHaveCount(1)
})

test('the hook advances the wire: first post arrives — a row, a lamp, a count; never a modal', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openRelay(page)

  // 20 seconds of relay clock: the first letter is on the wire.
  await advanceWire(page, 20_000)
  const row = page.locator('[data-relay-row]').first()
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('data-unread', 'true')
  await expect(row).toContainText('Channel check')
  await expect(page.locator('[data-relay-lamp]')).toHaveAttribute('data-lit', 'true')
  await expect(page.locator('[data-relay-count]')).toHaveText('MAIL 01/06')
  await expect(page.locator('[data-relay-watch]')).toHaveText(/^WATCH 00:00:2\d$/)
  await expect(page.locator('[data-relay-next]')).toHaveText(/^NEXT 01:3\d$/)

  // Arrival was quiet: no dialog, no overlay — the desktop stands.
  await expect(page.locator('[data-relay-awaiting]')).toHaveCount(0)
  await expect(page.locator('[data-desktop-stage]')).toBeVisible()
})

test('reading: the letter opens on parchment and the read-lamp state dims', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openRelay(page)
  await advanceWire(page, 20_000)

  await page.locator('[data-relay-row]').first().click()
  const letter = page.locator('[data-relay-letter]')
  await expect(letter).toBeVisible()
  await expect(letter.locator('[data-relay-letter-body]')).toContainText('channel check')
  await expect(letter.locator('[data-relay-letter-body]')).toContainText('one hundred and eleven days')

  // The read-lamp state: the row dims, the wire owes nothing.
  await expect(page.locator('[data-relay-row]').first()).toHaveAttribute('data-unread', 'false')
  await expect(page.locator('[data-relay-lamp]')).toHaveAttribute('data-lit', 'false')

  // A second post under the hook; the ledger keeps arrival order.
  await advanceWire(page, 100_000)
  await expect(page.locator('[data-relay-row]')).toHaveCount(2)
  await expect(page.locator('[data-relay-count]')).toHaveText('MAIL 02/06')
})

test('file to the archive: the Relay drawer bootstraps and the letter becomes a REAL specimen', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openRelay(page)
  await advanceWire(page, 20_000)

  await page.locator('[data-relay-row]').first().click()
  await page.locator('[data-relay-file]').click()

  // The sheet stamps FILED with its SPC accession; the ledger row agrees.
  await expect(page.locator('[data-relay-filed]')).toHaveText(/^FILED · SPC-\d{4}$/)
  await expect(page.locator('[data-relay-row]').first()).toContainText('FILED')

  // The Relay drawer is on the desktop (bootstrapped by the first file).
  const drawerIcon = page.locator('.specimen-icon', { hasText: 'Relay' })
  await expect(drawerIcon).toBeVisible()

  // Down the platform's OWN routes: open the drawer in the explorer and
  // double-click the transcript — the NOTEPAD (the text route since IM-5)
  // shows the filed letter.
  await drawerIcon.dblclick()
  const explorer = page.locator('.wm-window[data-app-id="explorer"]')
  await expect(explorer).toBeVisible()
  const specimen = explorer.locator('[data-explorer-option]', { hasText: 'relay-44-channel-check.txt' })
  await expect(specimen).toBeVisible()
  await specimen.dblclick()
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepad).toBeVisible()
  await expect(notepad.locator('[data-notepad-textarea]')).toHaveValue(/FILED CORRESPONDENCE — SURVEY RELAY/)
  await expect(notepad.locator('[data-notepad-textarea]')).toHaveValue(/TRANSCRIPT ENDS/)
})

test('reload restores the watch: the same arrivals, the same marks (appState)', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openRelay(page)
  await advanceWire(page, 120_000) // two letters on the wire
  await page.locator('[data-relay-row]').first().click() // read the first
  await expect(page.locator('[data-relay-lamp]')).toHaveAttribute('data-lit', 'true') // one still unread

  await page.waitForTimeout(700) // the MF-2 writer flushes the envelope
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  const restored = page.locator('.wm-window[data-app-id="relay"]')
  await expect(restored).toBeVisible({ timeout: 10_000 })

  // The SAME watch: two letters arrived, the first still read, the clock kept
  // (banded — the surface's live 1s tick keeps honest time under the test).
  await expect(page.locator('[data-relay-row]')).toHaveCount(2)
  await expect(page.locator('[data-relay-row]').first()).toHaveAttribute('data-unread', 'false')
  await expect(page.locator('[data-relay-count]')).toHaveText('MAIL 02/06')
  await expect(page.locator('[data-relay-watch]')).toHaveText(/^WATCH 00:02:\d\d$/)
})
