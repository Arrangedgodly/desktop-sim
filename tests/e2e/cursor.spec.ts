import { expect, test, type Page } from '@playwright/test'

/**
 * Cursor e2e (batch 2, brief 4) — the BRASS CALCULATING MACHINE against the
 * real app graph: fresh context per test = a genuine first visit.
 *
 * Gates (brief 4 acceptance 7 — written for the integrator to run; this
 * worker does not execute e2e under the batch's isolation rules):
 * 1. Manifest: launcher open mounts the machine (singleton); the launcher's
 *    order floor intact (notepad still the first module).
 * 2. The math floor: `2^3^2` prints `= 512` (right-associativity on the
 *    tape), `1/0` prints the DIVISION BY ZERO refusal, a malformed line
 *    (including eval-shaped input) prints MALFORMED EXPRESSION — refused,
 *    never executed.
 * 3. The tape: a running history, newest first, clearable through the
 *    two-step guarded Clear.
 * 4. The session: the tape rides the window record's appState — a reload
 *    restores the same tape (close tears it off; reopening is a fresh tape).
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

/** Open the machine through the module drawer — the launcher route. */
async function openCursor(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="cursor"]').click()
  const win = page.locator('.wm-window[data-app-id="cursor"]')
  await expect(win).toBeVisible()
  return win
}

/** Print one line: seat the entry line first (the surface is a lazy chunk —
 *  the window frame is visible before the machine mounts), then type. */
async function print(page: Page, expr: string): Promise<void> {
  await expect(page.locator('[data-cursor-input]')).toBeFocused()
  await page.keyboard.type(expr)
  await page.keyboard.press('Enter')
}

test('launcher opens the machine; singleton re-open raises the SAME window; notepad keeps the first slot', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  // The order floor: the notepad is still the launcher's first module.
  await page.locator('[data-launcher-pull]').click()
  const firstModule = page.locator('[data-launcher-menu] [data-launch-app]').first()
  await expect(firstModule).toHaveAttribute('data-launch-app', 'notepad')

  await page.locator('[data-launcher-menu] [data-launch-app="cursor"]').click()
  const win = page.locator('.wm-window[data-app-id="cursor"]')
  await expect(win).toBeVisible()

  // Keyboard-first: the entry line is the focus seat, the tape starts empty.
  await expect(page.locator('[data-cursor-input]')).toBeFocused()
  await expect(page.locator('[data-cursor-empty]')).toBeVisible()

  // Singleton: a second launcher open is the SAME window, raised (the
  // terminal spec's precedent: count the window + the LED — on a re-raise
  // the platform's law seats focus on the WINDOW FRAME; the app's content
  // seat pulls deeper only on mount, so the line is not re-claimed).
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="cursor"]').click()
  await expect(page.locator('.wm-window[data-app-id="cursor"]')).toHaveCount(1)
  await expect(page.locator('[data-window-led]')).toHaveCount(1)
})

test('the math floor: 2^3^2 prints 512; the tape keeps a newest-first history', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openCursor(page)

  await print(page, '2^3^2')
  const row = page.locator('[data-cursor-row]').first()
  await expect(row).toContainText('2^3^2')
  await expect(row.locator('[data-cursor-line]')).toHaveText('= 512')
  await expect(row).toHaveAttribute('data-refused', 'false')

  // A second print feeds ABOVE the first — an adding machine's tape.
  await print(page, '1+1')
  await expect(page.locator('[data-cursor-row]')).toHaveCount(2)
  await expect(page.locator('[data-cursor-row]').first()).toContainText('= 2')
  await expect(page.locator('[data-cursor-row]').nth(1)).toContainText('= 512')

  // The line is clean after every print (keyboard-first, instant).
  await expect(page.locator('[data-cursor-input]')).toHaveValue('')
})

test('refusals: division by zero, malformed expressions, and eval-shaped input never executes', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openCursor(page)

  // DIVISION BY ZERO — the named refusal, inked as a warning line.
  await print(page, '1/0')
  await expect(page.locator('[data-cursor-row]').first()).toHaveAttribute('data-refused', 'true')
  await expect(page.locator('[data-cursor-row]').first()).toContainText('DIVISION BY ZERO')

  // MALFORMED EXPRESSION — grammar breaks and unknown words alike.
  await print(page, '2+')
  await expect(page.locator('[data-cursor-row]').first()).toContainText('MALFORMED EXPRESSION')

  // Eval-shaped payload input meets the same refusal — the machine's
  // vocabulary is arithmetic; there is no code path from the line to JS.
  await print(page, 'eval("alert(1)")')
  await expect(page.locator('[data-cursor-row]').first()).toHaveAttribute('data-refused', 'true')
  await expect(page.locator('[data-cursor-row]').first()).toContainText('MALFORMED EXPRESSION')

  // …and the page was never navigated or touched by the attempt.
  await expect(page.locator('[data-desktop-stage]')).toBeVisible()

  // The scientific pair and constants print values (the floor in full).
  await print(page, 'sqrt(abs(-16))')
  await expect(page.locator('[data-cursor-row]').first()).toContainText('= 4')
  await print(page, '2*pi')
  await expect(page.locator('[data-cursor-row]').first()).toContainText('= 6.28318530718')
})

test('the guarded Clear tears the tape in two steps; the session tape survives reload via appState', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openCursor(page)

  await print(page, '6*7')
  await print(page, '2^3^2')
  await expect(page.locator('[data-cursor-row]')).toHaveCount(2)

  // Reload: the window record (and its appState tape) survives MF-2 — the
  // same tape reprints, newest first.
  await page.waitForTimeout(700) // the MF-2 writer flushes the envelope
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  const restored = page.locator('.wm-window[data-app-id="cursor"]')
  await expect(restored).toBeVisible({ timeout: 10_000 })
  const rows = page.locator('[data-cursor-row]')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('= 512')
  await expect(rows.nth(1)).toContainText('= 42')

  // The guarded Clear: the first click ARMS (no wipe), the second tears off.
  const clear = page.locator('[data-cursor-clear]')
  await clear.click()
  await expect(clear).toHaveAttribute('data-armed', 'true')
  await expect(clear).toHaveText('Confirm')
  await expect(rows).toHaveCount(2) // armed is a guard, not a wipe

  // Esc stands the guard down without tearing (the line's first claim on Esc).
  await page.keyboard.press('Escape')
  await expect(clear).toHaveAttribute('data-armed', 'false')
  await expect(rows).toHaveCount(2)

  // Commit: the tape tears clean, the in-world empty note returns.
  await clear.click()
  await clear.click()
  await expect(page.locator('[data-cursor-row]')).toHaveCount(0)
  await expect(page.locator('[data-cursor-empty]')).toBeVisible()

  // Close tears the session off: reopening is a FRESH tape (session-only).
  await restored.locator('.wm-titlebar').click() // raise: covered x never lands
  await restored.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('.wm-window[data-app-id="cursor"]')).toHaveCount(0)
  await openCursor(page)
  await expect(page.locator('[data-cursor-empty]')).toBeVisible()
})
