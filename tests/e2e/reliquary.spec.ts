import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Reliquary e2e (batch 2, worker 8) — the 3D case against the real app
 * graph. WRITTEN FOR THE INTEGRATOR to run AFTER registration lands in
 * src/apps/index.ts (isolation rule 2: the worker may not run e2e, and the
 * launcher row does not exist until the manifest is wired).
 *
 * Gates (docs/ultron/sessions/batch2-briefs.md, acceptance 8):
 * 1. Opens through the module drawer; the case mounts with a camera readout.
 * 2. SINGLETON: a second launcher open raises the same window (count stays 1).
 * 3. The picker seats specimen 2 (GYRE SHELL): the label card and the
 *    pressed card follow.
 * 4. A drag on the case CHANGES THE CAMERA — asserted via the documented
 *    CAMERA-STATE TEST HOOK (see method note below), not pixels.
 * 5. The zoom stop: wheel zoom clamps inside the case's machined limits.
 * 6. Keyboard floor: arrow keys orbit (the same camera hook moves).
 *
 * METHOD NOTE (the camera test hook, documented in the session log): the
 * toolbar's instrument readout is machine output — the renderer's onFrame
 * callback writes `data-reliquary-camera="az:<deg>;el:<deg>;r:<units>"` on
 * every drawn frame, and pointer-release commits the same value through
 * React state. The e2e reads THIS attribute (stable, DOM-visible, honest
 * instrument output — not a test-only seam). The WebGL-absent fallback is
 * unit-covered (reliquary-renderer.test.ts, jsdom has no WebGL by
 * construction); a real browser always has a context, so it is not e2e'd.
 */

/** The camera hook's r (stand-off distance) bounds — the machined stops. */
const R_MIN = 1.7
const R_MAX = 4.2

/** Parse `r:<float>` out of the camera hook attribute. */
async function readR(readout: Locator): Promise<number> {
  const hook = await readout.getAttribute('data-reliquary-camera')
  expect(hook).toMatch(/^az:[\d.]+;el:-?[\d.]+;r:[\d.]+$/)
  return Number(/r:([\d.]+)/.exec(hook!)![1])
}

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

/** Open the reliquary through the module drawer — the launcher route. */
async function openReliquary(page: Page): Promise<Locator> {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="reliquary"]').click()
  const win = page.locator('.wm-window[data-app-id="reliquary"]')
  await expect(win).toBeVisible()
  return win
}

/** The newest reliquary window's camera readout. */
const readout = (page: Page): Locator => page.locator('[data-reliquary-camera]').last()

test('opens the case through the launcher: canvas seated, camera readout live, singleton re-open raises', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openReliquary(page)

  // The vitrine: a canvas seated in the case, scanlines over the glass.
  await expect(page.locator('[data-reliquary-surface]')).toBeVisible()
  await expect(page.locator('[data-reliquary-case]')).toBeVisible()
  const canvas = page.locator('[data-reliquary-canvas]')
  await expect(canvas).toBeVisible()
  await expect(page.locator('[data-reliquary-case] .scanlines')).toHaveCount(1)

  // The camera readout (B612 well) carries the machine hook from frame one.
  const hook = await readout(page).getAttribute('data-reliquary-camera')
  expect(hook).toMatch(/^az:[\d.]+;el:-?[\d.]+;r:[\d.]+$/)
  await expect(readout(page)).toHaveText(/^AZ \d{3}\.\d EL [+-]\d{2}\.\d R \d\.\d{2}$/)

  // SINGLETON: a second launcher open raises the same case, never a second.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="reliquary"]').click()
  await expect(page.locator('.wm-window[data-app-id="reliquary"]')).toHaveCount(1)

  // The label card introduces the opening specimen (VENT PRISM, RQ-0001).
  await expect(page.locator('[data-reliquary-label]')).toContainText('Vent Prism')
  await expect(page.locator('[data-reliquary-label]')).toContainText('RQ-0001')
})

test('the picker seats specimen 2: label card + pressed card follow', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openReliquary(page)

  await expect(page.locator('[data-reliquary-pick="vent-prism"]')).toHaveAttribute('aria-pressed', 'true')

  // Seat the GYRE SHELL — specimen 2.
  await page.locator('[data-reliquary-pick="gyre-shell"]').click()
  await expect(page.locator('[data-reliquary-pick="gyre-shell"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-reliquary-pick="vent-prism"]')).toHaveAttribute('aria-pressed', 'false')

  // The label card re-introduces the specimen: name + accession.
  const label = page.locator('[data-reliquary-label]')
  await expect(label).toContainText('Gyre Shell')
  await expect(label).toContainText('RQ-0002')
})

test('a drag on the case orbits the specimen — the camera hook moves (the documented method)', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openReliquary(page)

  const before = await readout(page).getAttribute('data-reliquary-camera')
  const box = (await page.locator('[data-reliquary-canvas]').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // Grab and orbit: a deliberate diagonal drag, then release (the gesture
  // commits on pointer-up — the fleet's law).
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - 120, cy + 60, { steps: 10 })
  await page.mouse.up()

  await expect
    .poll(async () => readout(page).getAttribute('data-reliquary-camera'))
    .not.toBe(before)
})

test('the zoom stop: wheel zoom clamps inside the machined limits, the lever agrees', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openReliquary(page)

  const box = (await page.locator('[data-reliquary-canvas]').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  // Wheel over the case's center (cx/cy consumed by the loop below).
  await page.mouse.move(cx, cy)

  // Zoom IN hard: many inward notches — the stand-off must stop at the pin.
  for (let i = 0; i < 24; i += 1) {
    await page.mouse.wheel(0, -240)
  }
  await expect.poll(async () => readR(readout(page))).toBeLessThanOrEqual(R_MIN + 0.01)
  await expect.poll(async () => readR(readout(page))).toBeGreaterThanOrEqual(R_MIN - 0.01)

  // Zoom OUT hard: the far stop holds the camera inside the case.
  for (let i = 0; i < 40; i += 1) {
    await page.mouse.wheel(0, 240)
  }
  await expect.poll(async () => readR(readout(page))).toBeLessThanOrEqual(R_MAX + 0.01)
  await expect.poll(async () => readR(readout(page))).toBeGreaterThanOrEqual(R_MAX - 0.01)

  // The lever (a range input) is wired to the same clamped path: it reads
  // the far stop after the wheel ride (slider 0 = stand-off max).
  await expect(page.locator('[data-reliquary-zoom]')).toHaveValue('0')
})

test('the keyboard floor: arrows orbit the case from the focused canvas', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openReliquary(page)

  const canvas = page.locator('[data-reliquary-canvas]')
  await canvas.focus()
  await expect(canvas).toBeFocused()

  const before = await readout(page).getAttribute('data-reliquary-camera')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  await expect
    .poll(async () => readout(page).getAttribute('data-reliquary-camera'))
    .not.toBe(before)

  // Plus/minus are the zoom keys — the stand-off moves.
  const rBefore = await readR(readout(page))
  await page.keyboard.press('-')
  await expect.poll(async () => readR(readout(page))).toBeGreaterThan(rBefore)
})
