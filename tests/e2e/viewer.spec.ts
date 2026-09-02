import { expect, test } from '@playwright/test'

/**
 * AP-3 e2e — the plate viewer against the real app graph: fresh context per
 * test = a genuine first visit.
 *
 * Gates (docs/ultron/plan.md AP-3 acceptance: "opens image specimens, fit/100%
 * toggle, plate-style matting; keyboard zoom toggle"):
 * 1. Opening a plate specimen from INSIDE the explorer (the acceptedFileTypes
 *    consultation that lit up when `image-viewer` registered — the last
 *    reserved FILE route) mounts the MATTED SPECIMEN: parchment mat, plate
 *    centered with its in-world shadow, engraved caption strip beneath
 *    (accession · name · B612 label stamp), fit by default.
 * 2. The 1:1 toggle scales the plate to ACTUAL PIXELS (computed width =
 *    naturalWidth), zoom steps scale from there, and pan arms only once the
 *    plate overflows the mat — a drag moves the plate.
 * 3. Reload restores the window AND its bound plate (WM launch persistence;
 *    the archive's side of the state — zoom posture is per-session by
 *    design, the explorer's view-memory discipline).
 *
 * Selectors ride stable seams (data-* attributes), never CSS pixels — the
 * one deliberate pixel read is the 1:1 assertion itself (width === natural).
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Route through the explorer: Projects drawer → the reference plate. */
async function openReferencePlate(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-specimen-id="projects"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
  await page.locator('[data-explorer-option="reference-plate"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="image-viewer"]')).toBeVisible()
}

test('a plate opens from the explorer onto its mat: caption, fit default', async ({ page }) => {
  await toDesktop(page)
  await openReferencePlate(page)

  const viewer = page.locator('.wm-window[data-app-id="image-viewer"]')

  // The chrome: engraved name + the accession well.
  await expect(viewer.locator('[data-viewer-name]')).toHaveText('reference-plate.png')
  await expect(viewer.locator('.viewer-accession')).toHaveText('PLT-0001')

  // The matted specimen: the plate centered on the parchment mat…
  const image = viewer.locator('[data-viewer-image]')
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('alt', 'reference-plate.png')
  // …with the engraved caption strip beneath: accession, name, label stamp.
  const caption = viewer.locator('[data-viewer-caption]')
  await expect(caption).toContainText('PLT-0001')
  await expect(caption).toContainText('reference-plate.png')
  await expect(viewer.locator('.viewer-caption-stamp')).toHaveText(
    /^LABELLED \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
  )

  // FIT is the opening posture: readout + the toggle offering 1:1.
  await expect(viewer.locator('[data-viewer-readout]')).toHaveText('FIT')
  await expect(viewer.locator('[data-viewer-toggle]')).toHaveText('1:1')
})

test('F toggles 1:1 to actual pixels; zoom steps scale; pan arms on overflow', async ({ page }) => {
  await toDesktop(page)
  await openReferencePlate(page)

  const viewer = page.locator('.wm-window[data-app-id="image-viewer"]')
  const stage = viewer.locator('[data-viewer-stage]')
  const image = viewer.locator('[data-viewer-image]')

  // The stage holds focus when the window is focused — F is live.
  await expect(stage).toBeFocused()
  await page.keyboard.press('f')
  await expect(viewer.locator('[data-viewer-readout]')).toHaveText('100%')
  await expect(viewer.locator('[data-viewer-toggle]')).toHaveText('Fit')

  // ACTUAL PIXELS: the rendered width is the plate's own natural width.
  const natural = await image.evaluate((el) => (el as HTMLImageElement).naturalWidth)
  expect(natural).toBeGreaterThan(0)
  await expect(image).toHaveCSS('width', `${natural}px`)

  // A zoom step (25%) scales from the 1:1 anchor — computed style again.
  await viewer.locator('[data-viewer-zoom-in]').click()
  await expect(viewer.locator('[data-viewer-readout]')).toHaveText('125%')
  await expect(image).toHaveCSS('width', `${Math.round(natural * 1.25)}px`)

  // Pan arms ONLY once the plate overflows the mat: at 125% of a 320px plate
  // in a ~640px window it still fits — arm it through the clamp's far end.
  await expect(stage).not.toHaveAttribute('data-pannable', 'true')
  const zoomIn = viewer.locator('[data-viewer-zoom-in]')
  for (let i = 0; i < 11; i++) await zoomIn.click() // 125 → 400% (the clamp)
  await expect(viewer.locator('[data-viewer-readout]')).toHaveText('400%')
  await expect(stage).toHaveAttribute('data-pannable', 'true')

  // A drag pans the plate (transform commits at pointerup — no inertia).
  const plate = viewer.locator('[data-viewer-plate]')
  const before = await plate.evaluate((el) => el.style.transform)
  const box = await stage.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 40, { steps: 4 })
  await page.mouse.up()
  const after = await plate.evaluate((el) => el.style.transform)
  expect(after).not.toBe(before)
})

test('reload restores the window and its bound plate on the mat', async ({ page }) => {
  await toDesktop(page)
  await openReferencePlate(page)

  // Park the window somewhere unmistakable, then let the envelope flush.
  await page.keyboard.press('f') // 1:1 — a view posture this session held
  await page.waitForTimeout(700)

  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // The window reopens (WM launch persistence) bound to the SAME plate: mat,
  // plate, caption — the archive's side of the state, all restored.
  const viewer = page.locator('.wm-window[data-app-id="image-viewer"]')
  await expect(viewer).toBeVisible({ timeout: 10_000 })
  await expect(viewer.locator('[data-viewer-image]')).toBeVisible()
  await expect(viewer.locator('[data-viewer-caption]')).toContainText('PLT-0001')
  await expect(viewer.locator('[data-viewer-name]')).toHaveText('reference-plate.png')
})
