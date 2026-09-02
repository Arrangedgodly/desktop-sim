import { expect, test } from '@playwright/test'

/**
 * HU-2 e2e — edge hardening against the real app graph (fresh context per
 * test = a genuine first visit). The gates, one per recorded edge:
 *
 * 1. CLOSE-REQUEST VETO: the title-bar ✕ routes through the app's dirty guard
 *    (AppManifest.onCloseRequest) — not Esc-only anymore. A dirty notepad
 *    vetoes the ✕; a clean one closes.
 * 2. RENAME-WHILE-OPEN: a specimen relabelled elsewhere lands in the open
 *    notepad's header AND the WM title bar (title-follow).
 * 3. OFFSCREEN WINDOW RECOVERY: a window persisted on a bigger monitor
 *    (geometry committed far outside) is clamped back into the live viewport
 *    on hydrate — visible, and the STORE agrees with the pixels.
 * 4. LONG NAMES: an unbounded catalog label clamps on the desktop icon, the
 *    window title bar, and the taskbar LED label — with the full text on
 *    hover (title attributes).
 * 5. DRAFT RELOAD (launch-rebind): an unsaved UNTITLED draft survives a
 *    reload as the SAME draft; naming it rebinds the window onto the
 *    accessioned specimen (dedupe holds across the reload).
 *
 * Store-level setup where the UI path would be flaky (window overlap) rides
 * the sanctioned page-context dynamic import of REAL store actions — the
 * UI-4 wallpaper-spec precedent: no test-only setter ships in the bundle.
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

const sheet = (page: import('@playwright/test').Page) => page.locator('[data-notepad-textarea]')
const notepadWindow = (page: import('@playwright/test').Page) =>
  page.locator('.wm-window[data-app-id="notepad"]')

async function openCharter(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-specimen-id="charter"]').dblclick()
  await expect(notepadWindow(page)).toBeVisible()
}

/* --------------------------- 1 · close-request veto ----------------------- */

test('the title-bar ✕ honors the notepad dirty guard (veto → strip → clean close)', async ({
  page,
}) => {
  await toDesktop(page)
  await openCharter(page)
  const notepad = notepadWindow(page)
  const before = await sheet(page).inputValue()

  // Dirty + ✕: the close is VETOED through the manifest's onCloseRequest —
  // the same strip Esc interposes, no browser dialog.
  await sheet(page).fill(`${before}\nCLOSE-BUTTON ENTRY — guarded by the seam.`)
  await notepad.getByRole('button', { name: 'Close' }).click()
  const strip = page.locator('[data-notepad-strip]')
  await expect(strip).toBeVisible()
  await expect(page.locator('.notepad-lamp')).toHaveAttribute('data-flare', 'true')
  await expect(notepad).toBeVisible() // vetoed — still open

  // Keep editing withdraws the strip; committing the entry makes it clean.
  await page.locator('[data-notepad-keep]').click()
  await expect(strip).toBeHidden()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.locator('.notepad-lamp')).toHaveAttribute('data-lit', 'false')

  // Clean + ✕: no veto — the platform closes immediately.
  await notepad.getByRole('button', { name: 'Close' }).click()
  await expect(notepad).toHaveCount(0)
})

/* --------------------------- 2 · rename-while-open ------------------------ */

test('a rename made in the archive lands in the open notepad header and the title bar', async ({
  page,
}) => {
  await toDesktop(page)
  await openCharter(page)
  const notepad = notepadWindow(page)
  await expect(page.locator('[data-notepad-name]')).toHaveText('accession-charter.txt')
  // Title-follow: mounting retitled the window onto the specimen.
  await expect(notepad.locator('.wm-title')).toHaveText('accession-charter.txt')

  // Stow the window so the desktop icon is reachable, relabel the specimen
  // through the desktop's own inline rename (an EXTERNAL rename — another
  // surface's commit), then bring the window back from the rail.
  await notepad.getByRole('button', { name: 'Minimize' }).click()
  await expect(notepad).toBeHidden()

  await page.locator('[data-specimen-id="charter"]').click({ button: 'right' })
  await page.locator('[data-menu-item="rename"]').click()
  const field = page.locator('[data-rename-input]')
  await field.fill('RELABELLED-BY-E2E.TXT')
  await field.press('Enter')
  await expect(page.locator('[data-specimen-id="charter"] .specimen-name')).toHaveText(
    'RELABELLED-BY-E2E.TXT',
  )

  await page.locator('[data-window-led]').first().click() // restore from the rail
  await expect(notepad).toBeVisible()

  // The open window followed: the app's engraved header AND the WM title bar.
  await expect(page.locator('[data-notepad-name]')).toHaveText('RELABELLED-BY-E2E.TXT')
  await expect(notepad.locator('.wm-title')).toHaveText('RELABELLED-BY-E2E.TXT')
})

/* ------------------------ 3 · offscreen window recovery ------------------- */

test('a window persisted outside the viewport is clamped back in after reload', async ({
  page,
}) => {
  await toDesktop(page)
  await openCharter(page)
  await expect(notepadWindow(page)).toBeVisible()
  // Let every commit settle through BOTH debounces: the mount-time title and
  // appState-mirror writes land at ~400ms, the MF-2 envelope at ~900ms.
  await page.waitForTimeout(1800)

  // "Saved on a 5120×2880 monitor": patch the PERSISTED envelope's window
  // geometry far offscreen at the IDB boundary (the resilience-spec
  // precedent for storage-level setup — no test-only store seam ships in
  // the bundle, and this exercises the hydrate path exactly: the record on
  // disk is offscreen; nothing in-memory knows it yet).
  await page.evaluate(async () => {
    const open = indexedDB.open('desktop-sim')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    try {
      const tx = db.transaction('state', 'readwrite')
      const store = tx.objectStore('state')
      const read = store.get('desktop-sim/state')
      const envelope = await new Promise<{
        windows?: Array<{ appId: string; geometry: unknown }>
      }>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result)
        read.onerror = () => reject(read.error)
      })
      const win = envelope?.windows?.find((entry) => entry.appId === 'notepad')
      if (!win) throw new Error('no notepad window in the persisted envelope')
      win.geometry = { x: 4000, y: 2400, w: 1600, h: 1200 }
      store.put(envelope, 'desktop-sim/state')
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  })

  // "Reopened on a laptop": the reload hydrates the offscreen record…
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(notepadWindow(page)).toBeVisible({ timeout: 10_000 })

  // …and the HU-2 recovery clamps it INTO the live viewport: fully visible,
  // grabbed by its berth, never teleported on the first drag. (2px tolerance:
  // the geometry model is border-agnostic, the frame's own 1px edges ride on
  // top of a full-viewport clamp — pre-existing IM-4a behavior, not HU-2's.)
  const viewport = page.viewportSize()!
  const EDGE = 2
  const box = await notepadWindow(page).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + EDGE)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + EDGE)

  // And the title bar drags it sanely: a real grab-commit stays in view
  // (the stored geometry agrees with the pixels — no offscreen teleport).
  const bar = notepadWindow(page).locator('.wm-titlebar')
  const barBox = (await bar.boundingBox())!
  await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(barBox.x + 80, barBox.y + 40, { steps: 6 })
  await page.mouse.up()
  const dragged = await notepadWindow(page).boundingBox()
  expect(dragged!.x).toBeGreaterThanOrEqual(0)
  expect(dragged!.x + dragged!.width).toBeLessThanOrEqual(viewport.width + EDGE)
})

/* ------------------------------ 4 · long names ---------------------------- */

test('an unbounded catalog label clamps everywhere it renders, full text on hover', async ({
  page,
}) => {
  await toDesktop(page)

  const LONG =
    'SPECIMEN-WITH-AN-UNBOUNDED-CATALOG-LABEL-RUNNING-WELL-PAST-EVERY-SURFACE-2087.TXT'

  // Accession a fresh specimen on the hold, then relabel it to the long name
  // through the desktop's own inline rename.
  await page.mouse.click(900, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-specimen"]').click()
  const created = page.getByRole('button', { name: /^New Specimen, SPC-\d{4}, specimen$/ })
  await expect(created).toBeVisible()
  await created.click({ button: 'right' })
  await page.locator('[data-menu-item="rename"]').click()
  const field = page.locator('[data-rename-input]')
  await field.fill(LONG)
  await field.press('Enter')

  // Desktop icon: 3-line clamp + the WHOLE name on hover and for AT.
  const icon = page.locator(`[data-specimen-id]`).filter({
    has: page.locator('.specimen-name', { hasText: LONG.slice(0, 30) }),
  })
  await expect(icon).toHaveCount(1)
  await expect(icon).toHaveAttribute('title', LONG)
  const iconClamp = await icon.locator('.specimen-name').evaluate(
    (el) => getComputedStyle(el).webkitLineClamp,
  )
  expect(iconClamp).toBe('3')

  // Open it: the notepad's own chrome + the WM title bar carry the long name,
  // ellipsized, with the full text in their title attributes.
  await icon.dblclick()
  const longNotepad = page.locator('.wm-window[data-app-id="notepad"]').filter({
    has: page.locator('.wm-title', { hasText: LONG.slice(0, 30) }),
  })
  await expect(longNotepad.locator('.wm-title')).toHaveAttribute('title', LONG)
  const titleEllipsis = await longNotepad.locator('.wm-title').evaluate(
    (el) => getComputedStyle(el).textOverflow,
  )
  expect(titleEllipsis).toBe('ellipsis')

  // Taskbar LED label: the module-name law holds (authored, bounded) and the
  // label span clamps so nothing unbounded can ever crowd the rail.
  const ledLabel = page.locator('.tb-led-name').first()
  const ledCss = await ledLabel.evaluate((el) => {
    const style = getComputedStyle(el)
    return { overflow: style.overflow, ellipsis: style.textOverflow, maxWidth: style.maxWidth }
  })
  expect(ledCss.ellipsis).toBe('ellipsis')
  expect(ledCss.overflow).toBe('hidden')
  expect(Number.parseInt(ledCss.maxWidth, 10)).toBeGreaterThan(0)
})

/* -------------------- 5 · draft reload + launch rebind -------------------- */

test('an untitled draft survives reload as the SAME draft, then rebinds onto its specimen', async ({
  page,
}) => {
  await toDesktop(page)

  // A fresh UNTITLED draft from the module drawer (launcher open).
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launch-app="notepad"]').click()
  await expect(notepadWindow(page)).toBeVisible()
  await expect(page.locator('[data-notepad-name]')).toHaveText('Untitled')

  await sheet(page).fill('UNTITLED DRAFT — written moments before the reload.')
  await page.waitForTimeout(1500) // draft debounce → window record → envelope
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(notepadWindow(page)).toBeVisible({ timeout: 10_000 })

  // The SAME draft came back — still untitled, nothing accessioned behind the
  // operator's back.
  await expect(sheet(page)).toHaveValue('UNTITLED DRAFT — written moments before the reload.')
  await expect(page.locator('[data-notepad-name]')).toHaveText('Untitled')
  await expect(page.locator('.notepad-accession')).toHaveText('UNFILED')

  // Name + accession it: the window REBINDS onto the specimen it created.
  await page.locator('[data-notepad-save]').click()
  const nameField = page.locator('[data-rename-input]')
  await nameField.fill('e2e-draft.txt')
  await nameField.press('Enter')
  await expect(page.locator('[data-notepad-name]')).toHaveText('e2e-draft.txt')
  await expect(page.locator('.notepad-accession')).toHaveText(/^SPC-\d{4}$/)

  // Reload: the restored window is the specimen's OWN window (bound, content
  // intact) — and reopening the specimen from the hold dedupes onto it.
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(notepadWindow(page)).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-notepad-name]')).toHaveText('e2e-draft.txt')
  await expect(sheet(page)).toHaveValue('UNTITLED DRAFT — written moments before the reload.')

  // Close the restored window (it is clean — the content committed), then
  // reopen the specimen from the hold: the rebind's dedupe… is proven by the
  // window coming back as THE one notepad, bound to e2e-draft.txt.
  const restored = notepadWindow(page)
  await restored.getByRole('button', { name: 'Close' }).click()
  await expect(restored).toHaveCount(0)

  const draftIcon = page.locator('[data-specimen-id]').filter({
    has: page.locator('.specimen-name', { hasText: 'E2E-DRAFT.TXT' }),
  })
  await draftIcon.dblclick()
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toHaveCount(1) // one window
  await expect(page.locator('[data-notepad-name]')).toHaveText('e2e-draft.txt')
  await expect(sheet(page)).toHaveValue('UNTITLED DRAFT — written moments before the reload.')
})
