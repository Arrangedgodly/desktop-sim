import { expect, test, type Page } from '@playwright/test'

/**
 * IM-4c e2e — the drawer rail, against the real app graph in a real Chromium.
 * This suite is the plan's IM-4c validation step AND the honest UI launch
 * affordance the earlier specs scripted around (interactions.spec opened
 * windows through the store module "until then" — now the drawer does it).
 *
 * Gates (docs/ultron/plan.md IM-4c acceptance):
 * 1. The rail reflects open/minimized windows — LEDs appear per open window
 *    (multi-instance suffixes included) and disappear on close.
 * 2. Clicking a minimized window's LED restores it; clicking the focused
 *    window's LED stows it (toggle).
 * 3. Every registered app is launchable from the module drawer (the registry
 *    IS the list — demo today), with the drawer closing on launch, Escape,
 *    and outside clicks, and keyboard operable (Enter launches).
 * 4. The timecode ticks (two samples 1.2s apart differ).
 *
 * Selectors ride stable seams (data-* attributes / accessible names).
 */

/** Boot verdict on a fresh context: skip the POST, wait out the desktop. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  // the rail mounts with the desktop surface
  await expect(page.locator('[data-taskbar]')).toBeVisible()
}

/** Open the module drawer (the brass pull at the rail's left end). */
async function openDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await expect(page.locator('[data-launcher-menu]')).toBeVisible()
  // opening lands focus on the first item (the keyboard floor rides on it)
  await expect(page.locator('[data-launcher-menu] [data-launch-app]').first()).toBeFocused()
}

/** Launch the Demo Module through the drawer (multi-instance → a new window). */
async function launchDemo(page: Page): Promise<void> {
  await openDrawer(page)
  await page.getByRole('menuitem', { name: 'Demo Module' }).click()
  await expect(page.locator('[data-launcher-menu]')).toHaveCount(0) // launch closes it
}

test('the drawer launches modules; LEDs track the open-window registry', async ({ page }) => {
  await toDesktop(page)

  // A fresh hold: no windows, no LEDs; the registry holds one module today.
  await expect(page.locator('.wm-window')).toHaveCount(0)
  await expect(page.locator('[data-window-led]')).toHaveCount(0)
  await openDrawer(page)
  await expect(page.locator('[data-launcher-menu] [data-launch-app="demo"]')).toBeVisible()
  await page.keyboard.press('Escape') // close again — opened read-only above
  await expect(page.locator('[data-launcher-menu]')).toHaveCount(0)

  // Two launches → two windows (multi-instance) → two LEDs with suffixes.
  await launchDemo(page)
  await launchDemo(page)
  await expect(page.locator('.wm-window')).toHaveCount(2)
  await expect(page.locator('[data-window-led]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Demo Module 1, open' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Demo Module 2, focused' })).toBeVisible()

  // Closing the top module removes exactly its LED. (exact: the demo surface
  // carries its own "Close window" control, and name-matching is substring.)
  // The survivor drops its instance suffix — suffixes ride multi-instance only.
  await page
    .locator('.wm-window')
    .last()
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.locator('.wm-window')).toHaveCount(1)
  await expect(page.locator('[data-window-led]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Demo Module, focused' })).toBeVisible()
})

test('LED clicks restore a minimized module and toggle-stow the focused one', async ({ page }) => {
  await toDesktop(page)
  await launchDemo(page)

  const win = page.locator('.wm-window')
  const led = page.locator('[data-window-led]').first()
  await expect(led).toHaveAttribute('data-focused', 'true')

  // Stow from the title bar: the window hides, its LED stays — dimmed.
  await win.getByRole('button', { name: 'Minimize' }).click()
  await expect(win).toHaveAttribute('data-minimized', 'true')
  await expect(win).toBeHidden()
  await expect(led).toHaveAttribute('data-minimized', 'true')
  await expect(led).toHaveAttribute('data-focused', 'false')

  // LED click restores: visible, raised, focused.
  await led.click()
  await expect(win).toHaveAttribute('data-minimized', 'false')
  await expect(win).toBeVisible()
  await expect(led).toHaveAttribute('data-focused', 'true')

  // LED click on the FOCUSED module stows it again (toggle).
  await led.click()
  await expect(win).toHaveAttribute('data-minimized', 'true')
  await expect(led).toHaveAttribute('data-minimized', 'true')

  // And back once more — the cycle is repeatable.
  await led.click()
  await expect(win).toBeVisible()
  await expect(led).toHaveAttribute('data-focused', 'true')
})

test('the drawer keyboards (Enter launches) and closes on Escape and outside clicks', async ({
  page,
}) => {
  await toDesktop(page)
  const pull = page.getByRole('button', { name: 'Module drawer — launch a module' })

  // Keyboard: opening focuses the first item; Enter launches it.
  // (First item = first REGISTERED app — AP-2 moved the notepad ahead of the
  // demo module in src/apps/index.ts so the real text owner wins the
  // explorer's acceptedFileTypes routing tiebreak; the launcher follows the
  // registry's order, as it has since IM-4c.)
  await pull.click()
  await expect(page.locator('[data-launcher-menu]')).toBeVisible()
  await expect(page.locator('[data-launch-app="notepad"]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toHaveCount(1)
  await expect(page.locator('[data-launcher-menu]')).toHaveCount(0)

  // Escape closes and hands focus back to the pull.
  await pull.click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-launcher-menu]')).toHaveCount(0)
  await expect(pull).toBeFocused()

  // A click outside the drawer (a deliberately empty plate region) closes it.
  await pull.click()
  await expect(page.locator('[data-launcher-menu]')).toBeVisible()
  await page.mouse.click(900, 300)
  await expect(page.locator('[data-launcher-menu]')).toHaveCount(0)
})

test('the timecode reads HH:MM:SS and ticks', async ({ page }) => {
  await toDesktop(page)

  const readout = page.locator('[data-timecode]')
  await expect(readout).toBeVisible()
  const first = (await readout.innerText()).trim()
  expect(first).toMatch(/^\d{2}:\d{2}:\d{2}$/)

  // Two samples 1.2s apart can never read the same second.
  await page.waitForTimeout(1200)
  const second = (await readout.innerText()).trim()
  expect(second).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  expect(second).not.toBe(first)
})

test('taskbar-ready lands in the boot timeline with the desktop', async ({ page }) => {
  await toDesktop(page)

  const names = await page.evaluate((): string[] =>
    (window.__BOOT_TIMELINE ?? []).map((m) => m.name),
  )
  expect(names).toContain('boot-start')
  expect(names).toContain('desktop-ready')
  expect(names).toContain('taskbar-ready')
  expect(names.filter((n) => n === 'taskbar-ready')).toHaveLength(1) // append-once
})
