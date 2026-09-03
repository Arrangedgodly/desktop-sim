import { expect, test, type Page } from '@playwright/test'

/**
 * Terminal e2e (federated session 1) — the Catalog Terminal against the real
 * app graph: fresh context per test = a genuine first visit.
 *
 * Gates (docs/FEDERATED-SESSIONS.md acceptance):
 * 1. Manifest: launcher open, singleton raise + focus; the launcher's order
 *    floor intact (notepad still the first module).
 * 2. Every command works against the REAL store: mkdir puts a real drawer on
 *    the desktop, touch records a specimen, cat prints a seeded specimen's
 *    content, rm strikes it — and a reload shows both truths exactly as
 *    commanded (the kept drawer still there, the removed one gone).
 * 3. `accession` lists the live catalog — real accession codes from the seed.
 * 4. History + cwd survive reload via the window's appState.
 * 5. The no-eval hard rule's visible face: eval-shaped input gets the same
 *    in-world unknown-command refusal as `flurb`.
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

/** Open the terminal through the module drawer — the launcher route. */
async function openTerminal(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="terminal"]').click()
  const win = page.locator('.wm-window[data-app-id="terminal"]')
  await expect(win).toBeVisible()
  return win
}

/** Commit one command line and await its echo landing in the log. */
async function run(page: Page, command: string): Promise<void> {
  await page.locator('[data-terminal-input]').fill(command)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-terminal-log]')).toContainText(command, { timeout: 5_000 })
}

const log = (page: Page) => page.locator('[data-terminal-log]')

test('launcher opens the terminal; re-open raises the ONE window; notepad keeps the first slot', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  // The order floor: the notepad is still the launcher's first module.
  await page.locator('[data-launcher-pull]').click()
  const firstModule = page.locator('[data-launcher-menu] [data-launch-app]').first()
  await expect(firstModule).toHaveAttribute('data-launch-app', 'notepad')

  await page.locator('[data-launcher-menu] [data-launch-app="terminal"]').click()
  const win = page.locator('.wm-window[data-app-id="terminal"]')
  await expect(win).toBeVisible()
  await expect(page.locator('[data-terminal-input]')).toBeFocused() // keyboard-first

  // Singleton: the launcher re-open raises + focuses the ONE shell.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="terminal"]').click()
  await expect(page.locator('.wm-window')).toHaveCount(1)
  await expect(page.locator('[data-window-led]')).toHaveCount(1)

  // The banner and the hold-root prompt are on the well.
  await expect(log(page)).toContainText('HOLD/OS CATALOG TERMINAL')
  await expect(page.locator('.terminal-prompt')).toHaveText(/ARC-0000:\/>/)
})

test('mkdir/touch/cat/rm work on the REAL store; a reload keeps exactly what was commanded', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openTerminal(page)

  // cat reads a seeded text specimen — the same store the notepad edits.
  await run(page, 'cat accession-charter.txt')
  await expect(log(page)).toContainText('ACCESSION CHARTER')

  // mkdir accessions a real drawer: its icon lands on the desktop.
  await run(page, 'mkdir e2e-drawer')
  const drawerIcon = page.locator('.specimen-icon', { hasText: 'e2e-drawer' })
  await expect(drawerIcon).toBeVisible()

  // touch records a text specimen in the drawer; ls sees it; cat reads it.
  await run(page, 'cd e2e-drawer')
  await run(page, 'touch e2e-note.txt')
  await run(page, 'ls')
  await expect(log(page)).toContainText('e2e-note.txt')
  await run(page, 'cat e2e-note.txt')
  await expect(log(page)).toContainText('(empty specimen)')

  // rm strikes it from the real catalog — the listing forgets it.
  await run(page, 'rm e2e-note.txt')
  await run(page, 'ls')
  await expect(log(page)).toContainText('(empty drawer)')

  // Reload: the drawer SURVIVES (made from the terminal), the specimen is
  // GONE (removed from the terminal) — the same store underneath, persisted.
  await page.waitForTimeout(700) // the MF-2 writer flushes the envelope
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(drawerIcon).toBeVisible({ timeout: 10_000 })
  await run(page, 'cd e2e-drawer')
  await run(page, 'ls')
  await expect(log(page)).toContainText('(empty drawer)')
})

test('rm refuses a non-empty drawer and accepts the explicit recursive form', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openTerminal(page)

  // The seeded Projects drawer is non-empty: refused, WITH the guidance.
  await run(page, 'rm Projects')
  await expect(log(page)).toContainText('non-empty drawer')
  await expect(log(page)).toContainText('rm -r Projects')
  await expect(page.locator('.specimen-icon', { hasText: 'Projects' })).toBeVisible()

  // The explicit recursive form decommissions the whole drawer.
  await run(page, 'rm -r Projects')
  await expect(page.locator('.specimen-icon', { hasText: 'Projects' })).toHaveCount(0)
})

test('accession walks the live catalog with the seed\'s real accession codes', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openTerminal(page)

  await run(page, 'accession')
  await expect(log(page)).toContainText('CATALOG — THE SURVEY ARCHIVE')
  for (const code of ['ARC-0000', 'DRW-0001', 'DRW-0002', 'MOD-0001', 'SPC-0001']) {
    await expect(log(page)).toContainText(code)
  }
  await expect(log(page)).toContainText('Projects/')
  await expect(log(page)).toContainText('accession-charter.txt')

  // One specimen's full label record, by code.
  await run(page, 'accession SPC-0008')
  await expect(log(page)).toContainText('SPC-0008 · accession-charter.txt')
  await expect(log(page)).toContainText('filed under')
  await expect(log(page)).toContainText('entries')
})

test('cwd + command history survive reload via the window\'s appState', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openTerminal(page)

  await run(page, 'cd Projects')
  await run(page, 'ls')

  await page.waitForTimeout(700) // the envelope write settles
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // The restored window sits in the SAME drawer …
  const win = page.locator('.wm-window[data-app-id="terminal"]')
  await expect(win).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.terminal-prompt')).toHaveText(/DRW-0001:\/Projects>/)

  // … and Up walks the SAME history (newest first).
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('[data-terminal-input]')).toHaveValue('ls')
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('[data-terminal-input]')).toHaveValue('cd Projects')
})

test('eval-shaped payloads meet the same in-world refusal as any unknown command', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openTerminal(page)

  await run(page, 'eval("alert(1)")')
  await expect(log(page)).toContainText('unknown command')
  await expect(page.locator('.wm-window[data-app-id="terminal"]')).toBeVisible() // still alive

  await run(page, 'flurb')
  await expect(log(page)).toContainText('unknown command “flurb”')
})

test('Esc clears the line — the terminal\'s first claim; help prints the plate', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openTerminal(page)

  await page.locator('[data-terminal-input]').fill('half-typed')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-terminal-input]')).toHaveValue('')
  // The window did NOT close on Esc — the claim held.
  await expect(page.locator('.wm-window[data-app-id="terminal"]')).toBeVisible()

  await run(page, 'help')
  await expect(log(page)).toContainText('command plate')
  await expect(log(page)).toContainText('accession')
})
