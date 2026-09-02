import { expect, test } from '@playwright/test'

/**
 * AP-2 e2e — the notepad (specimen editor) against the real app graph: fresh
 * context per test = a genuine first visit.
 *
 * Gates (docs/ultron/plan.md AP-2 acceptance: "open/edit/save text specimens,
 * parchment content surface, dirty-state guard on close, autosave" — the core
 * step is edit→reload→intact):
 * 1. Opening a text specimen from INSIDE the explorer (the acceptedFileTypes
 *    consultation that lit up when `notepad` registered) mounts the parchment
 *    sheet with the seeded body; an edit flows draft → debounced store commit
 *    → debounced envelope write, and a reload restores BOTH the content and
 *    the window itself (WM launch persistence).
 * 2. The dirty close guard: Esc with unsaved entries interposes the in-window
 *    strip (Keep editing / Discard), the lamp flares, the window stays; Keep
 *    editing resumes, Discard closes without ever committing the draft.
 * 3. Ctrl+S commits immediately and persists after reload.
 *
 * Selectors ride stable seams (data-* attributes / accessible names), never
 * CSS pixels.
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** The charter specimen lives on the hold's desktop grid — the desktop route. */
async function openCharter(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-specimen-id="charter"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toBeVisible()
}

const sheet = (page: import('@playwright/test').Page) =>
  page.locator('[data-notepad-textarea]')

test('open a text specimen from the explorer; an edit survives reload in the restored window', async ({
  page,
}) => {
  await toDesktop(page)

  // Route through the explorer: Projects drawer → a catalogued exhibit.
  await page.locator('[data-specimen-id="projects"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
  await page.locator('[data-explorer-option="exhibit-01"]').dblclick()

  // The explorer's acceptedFileTypes consultation lands on NOTEPAD — it is
  // the only shipped `text` declarer (the demo fixture left the fleet in
  // TH-2; a late rival's defeat is pinned unit-side in notepad.test.tsx).
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepad).toBeVisible()
  await expect(page.locator('[data-notepad-name]')).toHaveText('exhibit-01.txt')
  await expect(page.locator('.notepad-accession')).toHaveText('SPC-0001')

  // The parchment sheet carries the seeded body; append an entry.
  const before = await sheet(page).inputValue()
  expect(before.length).toBeGreaterThan(0)
  await sheet(page).fill(`${before}\nE2E ENTRY — the archive remembers this edit.`)

  // Draft → notepad autosave (400ms) → store commit → MF-2 writer (500ms).
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // BOTH truths survive: the window reopens (WM launch persistence, bound to
  // the same specimen) AND the committed body is intact.
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toBeVisible({ timeout: 10_000 })
  await expect(sheet(page)).toHaveValue(/E2E ENTRY — the archive remembers this edit\./)
  await expect(page.locator('.notepad-lamp')).toHaveAttribute('data-lit', 'false')
})

test('Esc with unsaved entries interposes the guard strip; Discard never commits', async ({
  page,
}) => {
  await toDesktop(page)
  await openCharter(page)
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  const before = await sheet(page).inputValue()

  // A dirty draft + Esc: the lamp flares, the strip interposes IN-WINDOW, the
  // close is blocked (no browser dialog ever).
  await sheet(page).fill(`${before}\nDOOMED ENTRY — should never persist.`)
  await page.keyboard.press('Escape')
  const strip = page.locator('[data-notepad-strip]')
  await expect(strip).toBeVisible()
  await expect(strip).toContainText('Catalog unsaved changes?')
  await expect(page.locator('.notepad-lamp')).toHaveAttribute('data-flare', 'true')
  await expect(notepad).toBeVisible() // the close was BLOCKED

  // Keep editing: the strip withdraws, the sheet keeps the draft.
  await page.locator('[data-notepad-keep]').click()
  await expect(strip).toBeHidden()
  await expect(sheet(page)).toHaveValue(/DOOMED ENTRY/)
  await expect(notepad).toBeVisible()

  // Discard: the window closes, the draft dies with it.
  await page.keyboard.press('Escape')
  await expect(strip).toBeVisible()
  await page.locator('[data-notepad-discard]').click()
  await expect(notepad).toHaveCount(0)

  // The archive never learned the draft: reopen the charter — pristine body.
  await page.waitForTimeout(700) // any envelope write settles
  await page.locator('[data-specimen-id="charter"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toBeVisible()
  await expect(sheet(page)).not.toHaveValue(/DOOMED ENTRY/)
})

test('Ctrl+S commits immediately and survives the reload', async ({ page }) => {
  await toDesktop(page)
  await openCharter(page)
  const before = await sheet(page).inputValue()

  await sheet(page).fill(`${before}\nCTRL-S ENTRY — committed on demand.`)
  await page.keyboard.press('ControlOrMeta+s')

  // The lamp dims the moment the commit lands (no debounce wait).
  await expect(page.locator('.notepad-lamp')).toHaveAttribute('data-lit', 'false')

  await page.waitForTimeout(700) // the MF-2 writer flushes the envelope
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toBeVisible({ timeout: 10_000 })
  await expect(sheet(page)).toHaveValue(/CTRL-S ENTRY — committed on demand\./)
})
