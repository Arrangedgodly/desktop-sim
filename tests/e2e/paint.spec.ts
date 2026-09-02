import { stat } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

/**
 * Paint e2e (federated session 2) — the Plate Painter against the real app
 * graph: fresh context per test = a genuine first visit.
 *
 * Gates (docs/FEDERATED-SESSIONS.md acceptance):
 * 1. Manifest: launcher open is a fresh blank plate (multi-instance); the
 *    launcher's order floor intact (notepad still the first module).
 * 2. Draw → Save: name offered inline → the plate specimen EXISTS, its icon
 *    is on the desktop, a reload keeps it, and a double-click opens the
 *    PLATE VIEWER (the untouched platform route) showing the drawn PNG.
 * 3. Reopen: the painter's picker loads the same plate's pixels; an edit →
 *    save updates the node's src (the live viewer's pixels change).
 * 4. Export: a real PNG download (download event, .png name, blob > 0).
 * 5. Guard: dirty ✕ → the in-world strip (Keep painting / Discard); clean ✕
 *    closes immediately; a dirty in-progress plate survives reload via the
 *    window's appState.
 * 6. The studio floor: tool keys, size stepper, undo, the two-step oxide Clear.
 *
 * Selectors ride stable seams (data-* attributes), never CSS pixels. Pixel
 * truths are read from the canvas backing store itself (getImageData in page
 * context) — the plate is the product.
 */

/** The palette's ground and default ink as RGB (tokens: --parchment, --parchment-ink). */
const PARCHMENT = [236, 226, 201]
const INK = [51, 41, 28]

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

/** Open the painter through the module drawer — the launcher route. */
async function openPaint(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="paint"]').click()
  const win = page.locator('.wm-window[data-app-id="paint"]').last()
  await expect(win).toBeVisible()
  return win
}

/** The plate canvas as a Playwright locator (the newest painter window). */
const plate = (page: Page) => page.locator('[data-paint-plate]').last()

/** Read one pixel of the plate's backing store at plate-space fractions.
 *  Reads the LAST plate on the stage — the raised painter (z-order rides DOM
 *  order), the same window `plate()` and `stroke()` address. */
async function probe(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.evaluate(([xFrac, yFrac]) => {
    const canvases = document.querySelectorAll('[data-paint-plate]')
    const canvas = canvases[canvases.length - 1] as HTMLCanvasElement | undefined
    if (!canvas || xFrac === undefined || yFrac === undefined) {
      return [] as number[] // not mounted yet — the poll waits through mount
    }
    const ctx = canvas.getContext('2d')!
    const x = Math.min(canvas.width - 1, Math.floor(xFrac * canvas.width))
    const y = Math.min(canvas.height - 1, Math.floor(yFrac * canvas.height))
    const data = ctx.getImageData(x, y, 1, 1).data
    return [data[0]!, data[1]!, data[2]!]
  }, [fx, fy])
}

/** Drag a stroke across the plate (plate-space fractions → client coords). */
async function stroke(page: Page, fx0: number, fy0: number, fx1: number, fy1: number): Promise<void> {
  const box = (await plate(page).boundingBox())!
  const at = (fx: number, fy: number): [number, number] => [
    box.x + fx * box.width,
    box.y + fy * box.height,
  ]
  const [x0, y0] = at(fx0, fy0)
  const [x1, y1] = at(fx1, fy1)
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x1, y1, { steps: 12 })
  await page.mouse.up()
}

/** Click the plate at a fraction (the fill tool's route). */
async function tapPlate(page: Page, fx: number, fy: number): Promise<void> {
  const box = (await plate(page).boundingBox())!
  await page.mouse.click(box.x + fx * box.width, box.y + fy * box.height)
}

/* ------------------------------------------------------------------ */

test('launcher opens a fresh blank plate; re-open is a SECOND window; notepad keeps the first slot', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  // The order floor: the notepad is still the launcher's first module.
  await page.locator('[data-launcher-pull]').click()
  const firstModule = page.locator('[data-launcher-menu] [data-launch-app]').first()
  await expect(firstModule).toHaveAttribute('data-launch-app', 'notepad')

  await page.locator('[data-launcher-menu] [data-launch-app="paint"]').click()
  const win = page.locator('.wm-window[data-app-id="paint"]')
  await expect(win).toBeVisible()
  await expect(plate(page)).toBeFocused() // the plate is the focus seat

  // A fresh blank plate: parchment ground, unfiled accession, clean lamp.
  await expect.poll(async () => probe(page, 0.5, 0.5)).toEqual(PARCHMENT)
  await expect(page.locator('.paint-accession').last()).toHaveText('UNFILED')
  await expect(page.locator('.paint-lamp').last()).toHaveAttribute('data-lit', 'false')

  // Multi-instance: a second launcher open is a second FRESH plate window.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="paint"]').click()
  await expect(page.locator('.wm-window[data-app-id="paint"]')).toHaveCount(2)
  await expect.poll(async () => probe(page, 0.5, 0.5)).toEqual(PARCHMENT)
})

test('draw → save: the plate is a REAL specimen — icon on the desktop, reload persists, double-click opens the PLATE VIEWER', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openPaint(page)

  // A heavy ink stroke across the upper plate; its midpoint reads ink.
  await page.locator('[data-paint-size-up]').click() // 8 → 16
  await page.locator('[data-paint-size-up]').click() // 16 → 32
  await stroke(page, 0.25, 0.3, 0.75, 0.35)
  await expect.poll(async () => probe(page, 0.5, 0.325)).toEqual(INK)
  await expect(page.locator('.paint-lamp').last()).toHaveAttribute('data-lit', 'true')

  // Save: the name is offered INLINE; Enter accessions the plate.
  await page.locator('[data-paint-save]').click()
  const nameField = page.locator('[data-paint-name-input]')
  await expect(nameField).toBeFocused()
  await nameField.fill('e2e-field-sketch.png')
  await page.keyboard.press('Enter')

  // Filed: a PLT accession in the well, the lamp dims, the icon is on the desktop.
  await expect(page.locator('.paint-accession').last()).toHaveText(/^PLT-\d{4}$/)
  await expect(page.locator('.paint-lamp').last()).toHaveAttribute('data-lit', 'false')
  const icon = page.locator('.specimen-icon', { hasText: 'e2e-field-sketch.png' })
  await expect(icon).toBeVisible()

  // Reload: the specimen SURVIVES (the same store underneath, persisted).
  await page.waitForTimeout(700) // the MF-2 writer flushes the envelope
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(icon).toBeVisible({ timeout: 10_000 })

  // The UNTOUCHED platform route: double-click opens the PLATE VIEWER, and
  // it shows the drawn PNG (a data:image/png carrier).
  await icon.dblclick()
  const viewer = page.locator('.wm-window[data-app-id="image-viewer"]')
  await expect(viewer).toBeVisible()
  const image = viewer.locator('[data-viewer-image]')
  await expect(image).toBeVisible()
  expect(await image.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
})

test('reopen from the picker loads the same pixels; an edit → save updates the node src (the live viewer repaints)', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openPaint(page)

  // Accession one plate: fill the whole plate with ink, save.
  await page.locator('[data-paint-tool="fill"]').click()
  await tapPlate(page, 0.5, 0.5)
  await expect.poll(async () => probe(page, 0.08, 0.08)).toEqual(INK)
  await page.locator('[data-paint-save]').click()
  await page.locator('[data-paint-name-input]').fill('e2e-reopen-plate.png')
  await page.keyboard.press('Enter')
  await expect(page.locator('.paint-accession').last()).toHaveText(/^PLT-\d{4}$/)

  // Open the VIEWER on it (the platform's own route) — its pixels are the
  // store's truth surfaced in the DOM.
  const icon = page.locator('.specimen-icon', { hasText: 'e2e-reopen-plate.png' })
  await expect(icon).toBeVisible()
  await icon.dblclick()
  const viewerImage = page.locator('.wm-window[data-app-id="image-viewer"] [data-viewer-image]')
  await expect(viewerImage).toBeVisible()
  const srcBefore = await viewerImage.getAttribute('src')
  expect(srcBefore).toMatch(/^data:image\/png;base64,/)

  // Close the (clean, saved) painter window. The platform's close law (the
  // soak spec's own note): a covered window's ✕ never lands — DOM order
  // rides z-order — so raise the painter first, then x it.
  await page.locator('.wm-window[data-app-id="paint"] .wm-titlebar').click()
  await page
    .locator('.wm-window[data-app-id="paint"]')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.locator('.wm-window[data-app-id="paint"]')).toHaveCount(0)

  await openPaint(page)
  await page.locator('[data-paint-open]').click()
  const picker = page.locator('[data-paint-picker]')
  await expect(picker).toBeVisible()
  await expect(picker).toContainText('PLT-')
  const row = picker.locator('[data-paint-pick]', { hasText: 'e2e-reopen-plate.png' }).last()
  await row.click()

  // The picker routed through openApp: the plate gets its OWN painter window
  // (per-plate instance), raised on top — the untitled painter stays put
  // (never hijacked: a draft can't be lost to an open). Two windows, and the
  // RAISED one is the plate's, carrying the SAVED pixels (ink everywhere).
  const painter = page.locator('.wm-window[data-app-id="paint"]')
  await expect(painter).toHaveCount(2)
  await expect(page.locator('.paint-accession').last()).toHaveText(/^PLT-\d{4}$/)
  await expect.poll(async () => probe(page, 0.5, 0.5)).toEqual(INK)

  // Edit (wash the center back to parchment with the eraser) + save — all in
  // the RAISED painter (the plate's window, the last on the stage).
  await page.locator('[data-paint-tool="eraser"]').last().click()
  await stroke(page, 0.4, 0.48, 0.6, 0.52)
  await expect.poll(async () => probe(page, 0.5, 0.5)).toEqual(PARCHMENT)
  await page.locator('[data-paint-save]').last().click()
  await expect(page.locator('.paint-lamp').last()).toHaveAttribute('data-lit', 'false')

  // The node's src UPDATED: the live viewer (still open on the plate) now
  // carries different pixels than before the save.
  await expect
    .poll(async () => viewerImage.getAttribute('src'), { timeout: 5_000 })
    .not.toBe(srcBefore)
})

test('export triggers a real PNG download', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openPaint(page)

  await page.locator('[data-paint-tool="fill"]').click()
  await tapPlate(page, 0.5, 0.5)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-paint-export]').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^untitled-plate\.png$/)
  const size = (await stat(await download.path())).size
  expect(size).toBeGreaterThan(0)
})

test('the dirty guard: ✕ interposes the strip; Discard closes, Keep keeps; clean ✕ closes now; a dirty plate survives reload', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openPaint(page)

  // Dirty the plate, then ✕: the close is VETOED — the in-world strip
  // interposes (never a browser dialog), the lamp flares.
  await page.locator('[data-paint-tool="fill"]').click()
  await tapPlate(page, 0.5, 0.5)
  await expect(page.locator('.paint-lamp').last()).toHaveAttribute('data-lit', 'true')

  const win = page.locator('.wm-window[data-app-id="paint"]')
  await win.getByRole('button', { name: 'Close', exact: true }).click()
  const strip = page.locator('[data-paint-strip]')
  await expect(strip).toBeVisible()
  await expect(strip).toContainText('Plate work not accessioned?')
  await expect(page.locator('.paint-lamp').last()).toHaveAttribute('data-flare', 'true')
  await expect(win).toBeVisible() // the close was BLOCKED

  // Keep painting: the strip withdraws, the work stays.
  await page.locator('[data-paint-keep]').click()
  await expect(strip).toBeHidden()
  await expect.poll(async () => probe(page, 0.08, 0.08)).toEqual(INK)

  // Esc owns the same claim: dirty Esc interposes; the strip's Esc keeps.
  await page.keyboard.press('Escape')
  await expect(strip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(strip).toBeHidden()

  // A dirty in-progress plate survives reload via the window's appState.
  await page.waitForTimeout(1_500) // mirror debounce (400ms) + MF-2 writer (500ms)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  const restored = page.locator('.wm-window[data-app-id="paint"]')
  await expect(restored).toBeVisible({ timeout: 10_000 })
  await expect.poll(async () => probe(page, 0.08, 0.08), { timeout: 5_000 }).toEqual(INK)
  await expect(page.locator('.paint-lamp').last()).toHaveAttribute('data-lit', 'true')

  // Discard: the window closes, the archive never learned the plate.
  await restored.locator('.wm-titlebar').click() // raise: covered x never lands
  await restored.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(strip).toBeVisible()
  await page.locator('[data-paint-discard]').click()
  await expect(restored).toHaveCount(0)
  await expect(page.locator('.specimen-icon', { hasText: 'Untitled plate' })).toHaveCount(0)

  // Clean ✕ closes immediately — no strip.
  await openPaint(page)
  await expect(page.locator('.paint-lamp').last()).toHaveAttribute('data-lit', 'false')
  await page
    .locator('.wm-window[data-app-id="paint"]')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.locator('.wm-window[data-app-id="paint"]')).toHaveCount(0)
})

test('the studio floor: tool keys, the size stepper, undo, the two-step oxide Clear', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openPaint(page)
  await expect(plate(page)).toBeFocused() // keys ride the focused plate

  // Tool keys ride the focused plate: B/E/F pick the tools.
  await page.keyboard.press('f')
  await expect(page.locator('[data-paint-tool="fill"]')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('b')
  await expect(page.locator('[data-paint-tool="brush"]')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('e')
  await expect(page.locator('[data-paint-tool="eraser"]')).toHaveAttribute('aria-pressed', 'true')

  // The size stepper: [ steps down to the floor, ] steps back up (B612 readout).
  const readout = page.locator('[data-paint-size-readout]')
  await expect(readout).toHaveText('8')
  await page.keyboard.press('[')
  await expect(readout).toHaveText('4')
  await page.keyboard.press('[')
  await expect(readout).toHaveText('2')
  await page.keyboard.press(']')
  await expect(readout).toHaveText('4')

  // Fill the plate, then UNDO restores the parchment ground.
  await page.keyboard.press('f')
  await tapPlate(page, 0.5, 0.5)
  await expect.poll(async () => probe(page, 0.08, 0.08)).toEqual(INK)
  await page.locator('[data-paint-undo]').click()
  await expect.poll(async () => probe(page, 0.08, 0.08)).toEqual(PARCHMENT)

  // Clear is oxide-guarded two-step: the first click arms, the second washes;
  // Esc disarms an armed Clear without washing.
  await page.keyboard.press('f')
  await tapPlate(page, 0.5, 0.5)
  await expect.poll(async () => probe(page, 0.5, 0.5)).toEqual(INK)
  const clear = page.locator('[data-paint-clear]')
  await clear.click()
  await expect(clear).toHaveAttribute('data-armed', 'true')
  await expect(clear).toHaveText('Confirm')
  await page.keyboard.press('Escape')
  await expect(clear).not.toHaveAttribute('data-armed', 'true')
  await expect.poll(async () => probe(page, 0.5, 0.5)).toEqual(INK) // not washed
  await clear.click()
  await clear.click()
  await expect.poll(async () => probe(page, 0.5, 0.5)).toEqual(PARCHMENT)
})
