import { expect, test, type Page } from '@playwright/test'

/**
 * Field Notes e2e (batch 2, brief 6) — the READING ROOM against the real app
 * graph. NOT run by the building worker (isolation rule 2); the integrator
 * runs it AFTER wiring registration (one line in src/apps/index.ts).
 *
 * Gates (the brief's acceptance 8):
 * 1. The module opens from the drawer as a SINGLETON; its in-app catalog
 *    ledger lists the SEEDED catalog's text specimens and opens one.
 * 2. A markdown specimen written in the NOTEPAD (the in-world route — the
 *    notepad is the editor, this module is the reader) TYPESETS: headings,
 *    strong/emphasis, lists — and raw HTML stays VISIBLE TEXT.
 * 3. External links carry href/target=_blank/rel="noopener noreferrer";
 *    a javascript: construct never becomes an anchor.
 * 4. Backspace returns from a specimen to the ledger (the atlas page law).
 *
 * Selectors ride stable seams (data-* attributes), never CSS pixels. No test
 * hooks: the markdown specimen is authored through the notepad's own save
 * flow, exactly as a visitor would.
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

/** The reading room window (singleton — at most one ever). */
const room = (page: Page) => page.locator('.wm-window[data-app-id="field-notes"]')

/** Open Field Notes through the module drawer — the launcher route. */
async function openFieldNotes(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="field-notes"]').click()
  const win = room(page)
  await expect(win).toBeVisible()
  return win
}

/**
 * Author a markdown text specimen through the NOTEPAD's own save flow (the
 * honest in-world route: write → Save → name offered inline → Enter
 * accessions it). Returns the specimen's catalog name.
 */
async function writeMarkdownSpecimen(page: Page, name: string, body: string): Promise<void> {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="notepad"]').click()
  const notepad = page.locator('.wm-window[data-app-id="notepad"]').last()
  await expect(notepad).toBeVisible()

  await notepad.locator('[data-notepad-textarea]').fill(body)
  await notepad.locator('[data-notepad-save]').click()
  const nameField = notepad.locator('[data-rename-input]')
  await expect(nameField).toBeFocused() // the name is offered inline
  await nameField.fill(name)
  await page.keyboard.press('Enter')
  await expect(notepad.locator('.notepad-accession')).toHaveText(/^SPC-\d{4}$/)

  // Close the clean editor — the reading room owns the rest of this spec.
  await notepad.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toHaveCount(0)
}

/** The markdown fixture: every rendered construct plus the hostile shapes. */
const MD_SPECIMEN = [
  '# Vela IX ridge survey',
  '',
  'The **lower ridgeline** glows after dusk; *Vela moss* prefers the north face.',
  'Chart: [survey plate](https://charts.example.com/vela-9).',
  'Trap: [do not follow](javascript:alert(1)).',
  '<script>alert(1)</script>',
  '',
  '## Samples',
  '',
  '- moss, north face',
  '- moss, south face',
].join('\n')

/* ------------------------------------------------------------------ */

test('opens as a singleton; the ledger lists the seeded catalog and opens a specimen', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  const win = await openFieldNotes(page)
  // The catalog ledger greets the visitor (nothing selected at mount).
  const ledger = win.locator('[data-field-notes-picker]')
  await expect(ledger).toBeVisible()
  await expect(ledger).toContainText('SPC-')

  // The SEEDED catalog's field log is listed and opens typeset.
  const row = ledger.locator('[data-field-notes-pick]', { hasText: 'field-log.txt' })
  await expect(row).toBeVisible()
  await row.click()
  const doc = win.locator('[data-field-notes-document]')
  await expect(doc).toBeVisible()
  await expect(doc.locator('p').nth(1)).toContainText('FIELD LOG') // the seeded body, typeset
  await expect(win.locator('[data-field-notes-accession]')).toHaveText(/^SPC-\d{4}$/)

  // SINGLETON: a second launcher open raises the SAME window, never a second.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="field-notes"]').click()
  await expect(room(page)).toHaveCount(1)
})

test('a specimen written in the notepad TYPESETS here — headings, emphasis, lists; raw HTML stays visible text', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await writeMarkdownSpecimen(page, 'e2e-ridge-survey.txt', MD_SPECIMEN)

  const win = await openFieldNotes(page)
  const row = win.locator('[data-field-notes-pick]', { hasText: 'e2e-ridge-survey.txt' })
  await expect(row).toBeVisible()
  await row.click()

  const doc = win.locator('[data-field-notes-document]')
  await expect(doc).toBeVisible()

  // Headings at their authored levels (h1/h2 from `#`/`##`).
  await expect(doc.locator('h1')).toHaveText('Vela IX ridge survey')
  await expect(doc.locator('h2')).toHaveText('Samples')

  // Emphasis: strong and em render as their semantic elements.
  await expect(doc.locator('.field-notes-strong')).toHaveText('lower ridgeline')
  await expect(doc.locator('.field-notes-em')).toHaveText('Vela moss')

  // Lists typeset.
  await expect(doc.locator('.field-notes-list .field-notes-li')).toHaveCount(2)

  // Raw HTML NEVER renders: no script element anywhere, the tag is VISIBLE.
  await expect(doc.locator('script')).toHaveCount(0)
  await expect(doc.locator('.field-notes-p').filter({ hasText: '<script>alert(1)</script>' })).toBeVisible()

  // The toolbar reads the open specimen.
  await expect(win.locator('[data-field-notes-label]')).toHaveText('e2e-ridge-survey.txt')
})

test('external links carry the safety attrs; a javascript: construct never becomes an anchor', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await writeMarkdownSpecimen(page, 'e2e-link-safety.txt', MD_SPECIMEN)

  const win = await openFieldNotes(page)
  await win
    .locator('[data-field-notes-pick]', { hasText: 'e2e-link-safety.txt' })
    .click()

  const doc = win.locator('[data-field-notes-document]')
  await expect(doc).toBeVisible()

  // Exactly ONE anchor: the http(s) link, with the full safety dress.
  const link = doc.locator('a.field-notes-link')
  await expect(link).toHaveCount(1)
  await expect(link).toHaveText('survey plate')
  await expect(link).toHaveAttribute('href', 'https://charts.example.com/vela-9')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')

  // The javascript: construct degraded to literal text — visible, inert.
  await expect(doc.locator('.field-notes-p').filter({ hasText: '[do not follow](javascript:alert(1))' })).toBeVisible()
})

test('Backspace returns from a specimen to the ledger; Esc closes the ledger', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)

  const win = await openFieldNotes(page)
  await win.locator('[data-field-notes-pick]', { hasText: 'field-log.txt' }).click()
  const doc = win.locator('[data-field-notes-document]')
  await expect(doc).toBeVisible()

  // The atlas page law: Backspace returns to the ledger.
  await page.keyboard.press('Backspace')
  await expect(win.locator('[data-field-notes-picker]')).toBeVisible()
  await expect(doc).toHaveCount(0)

  // Esc closes the ledger (the reading room's one Esc claim) — and with the
  // ledger closed the desk's honest empty state shows the catalog button.
  await page.keyboard.press('Escape')
  await expect(win.locator('[data-field-notes-picker]')).toHaveCount(0)
  await expect(win.locator('[data-field-notes-desk]')).toBeVisible()
  await expect(win.locator('[data-field-notes-desk-open]')).toBeFocused()
})
