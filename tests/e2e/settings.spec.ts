import { expect, test, type Page } from '@playwright/test'

/**
 * AP-4 e2e — the Console Settings against the real app graph (boot, real
 * IndexedDB persistence, real stores; fresh context per test = a genuine
 * first visit).
 *
 * Gates (docs/ultron/plan.md AP-4 acceptance — "each setting applies live +
 * persists; reset reseeds cleanly"):
 * 1. The module drawer lists Console Settings; opening it mounts the console
 *    panel, and the SINGLETON rule holds — re-opening raises the one window.
 * 2. Switching the wallpaper plate IN THE PANEL changes the desktop's
 *    data-wallpaper live and survives a reload (UI-4's store seam, now with
 *    a real UI on it; desktop.spec drives the store module directly).
 * 3. The UI SOUNDS hardware switch persists (ships muted; UI-6 wires the
 *    playback itself).
 * 4. The guarded reset: the oxide cover hides a disabled switch; lifting it
 *    arms the switch + names consequences; throwing reseeds the desktop LIVE
 *    (a created test specimen vanishes), closes every window but the relit
 *    console carrying ARCHIVE RESEALED, and the reseed survives a reload.
 *
 * Selectors ride stable seams (data-* attributes / accessible names).
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Launch Console Settings from the module drawer (the honest affordance). */
async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Console Settings' }).click()
  await expect(page.locator('.wm-window[data-app-id="settings"]')).toBeVisible()
}

/** The desktop's icon count — the reseed assertion reads it before + after. */
async function iconCount(page: Page): Promise<number> {
  return page.locator('.icon-field [data-specimen-id]').count()
}

test('the drawer launches the console; the singleton rule holds', async ({ page }) => {
  await toDesktop(page)
  await openSettings(page)

  const consoleWindow = page.locator('.wm-window[data-app-id="settings"]')
  await expect(consoleWindow).toHaveCount(1)
  await expect(page.locator('[data-settings-surface]')).toBeVisible()

  // A second launch raises + focuses THE window — never a second console.
  await openSettings(page)
  await expect(consoleWindow).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Console Settings, focused' })).toBeVisible()
})

test('switching the wallpaper plate in the panel changes the desktop live and persists', async ({
  page,
}) => {
  await toDesktop(page)
  await openSettings(page)

  // The live plate wears the mounted indicator; the default is the star chart.
  const plateLayer = page.locator('[data-wallpaper]')
  await expect(plateLayer).toHaveAttribute('data-wallpaper', 'star-chart')
  await expect(page.locator('[data-settings-plate="star-chart"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.locator('.settings-plate-flag')).toHaveText('MOUNTED')

  // Select the survey measuring sheet IN THE PANEL — the desktop follows live.
  await page.locator('[data-settings-plate="survey"]').click()
  await expect(plateLayer).toHaveAttribute('data-wallpaper', 'survey')
  await expect(page.locator('.wallpaper-layer svg')).toHaveCount(1)
  await expect(page.locator('[data-settings-plate="survey"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.locator('[data-settings-plate="star-chart"]')).toHaveAttribute(
    'aria-checked',
    'false',
  )

  // The archive remembers: the debounced autosave flushes, then a reload
  // comes back on the SAME plate — console window and all (MF-2 restores it).
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(plateLayer).toHaveAttribute('data-wallpaper', 'survey')
  await expect(page.locator('[data-settings-surface]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-settings-plate="survey"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('the UI sounds switch throws and persists', async ({ page }) => {
  await toDesktop(page)
  await openSettings(page)

  const sounds = page.getByRole('switch', { name: 'UI sounds' })
  await expect(sounds).toHaveAttribute('aria-checked', 'false') // ships muted
  await sounds.click()
  await expect(sounds).toHaveAttribute('aria-checked', 'true')

  // Space throws it back for a beat (the hardware keyboard path), then on.
  await sounds.focus()
  await page.keyboard.press('Space')
  await expect(sounds).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Space')
  await expect(sounds).toHaveAttribute('aria-checked', 'true')

  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-settings-surface]')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('switch', { name: 'UI sounds' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('the guarded reset reseeds the desktop live and the reseed survives reload', async ({
  page,
}) => {
  await toDesktop(page)

  // A created test specimen — the thing the reset must destroy.
  await page.mouse.click(900, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-drawer"]').click()
  const created = page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })
  await expect(created).toBeVisible()
  const beforeReset = await iconCount(page)
  expect(beforeReset).toBe(6)

  await openSettings(page)

  // Under the oxide cover the reset switch is DEAD.
  const resetSwitch = page.getByRole('switch', { name: 'Reseal archive' })
  await expect(resetSwitch).toBeDisabled()
  await expect(page.locator('[data-reset-strip]')).toHaveCount(0)

  // Lift the guard: the confirm strip names the consequences, the switch arms.
  await page.getByRole('button', { name: 'Lift guard cover' }).click()
  await expect(page.locator('[data-settings-guard]')).toHaveAttribute('data-lifted', 'true')
  const strip = page.locator('[data-reset-strip]')
  await expect(strip).toBeVisible()
  await expect(strip).toContainText('reseeds the catalog')
  await expect(strip).toContainText('reset on reload')
  await expect(resetSwitch).toBeEnabled()

  // THROW. The specimen vanishes live, every window closes but the relit
  // console, and the ARCHIVE RESEALED report renders in-world.
  await resetSwitch.click()
  await expect(created).toHaveCount(0)
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)
  await expect(page.locator('.wm-window')).toHaveCount(1)
  await expect(page.locator('.wm-window[data-app-id="settings"]')).toHaveCount(1)
  const report = page.locator('[data-resealed]')
  await expect(report).toBeVisible()
  await expect(report).toContainText('Archive resealed')

  // The archive remembers the reseed: reload, and the specimen stays gone
  // (the wallpaper reseeded to its default with everything else).
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)
  await expect(page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })).toHaveCount(0)
  await expect(page.locator('[data-wallpaper]')).toHaveAttribute('data-wallpaper', 'star-chart')
})
