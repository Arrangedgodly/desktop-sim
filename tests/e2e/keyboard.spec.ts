import { expect, test, type Page } from '@playwright/test'

/**
 * DD-1 e2e — the NON-VISUAL JOURNEY: the scripted keyboard-only pass the
 * plan's acceptance names ("full desktop operable keyboard-only"). Every
 * input is a key press; the mouse is touched exactly once (the POST skip is
 * a key too — zero mouse). docs/KEYBOARD.md is the map this walks.
 *
 * The journey, one continuous session:
 *   boot → Tab to the ground → 2D arrows to the nameplate → Space selects
 *   → Enter opens the manifest → the F6 ring (desktop → taskbar → window)
 *   → drawer opened + walked by keys (Tab stays INSIDE it) → a second window
 *   → Alt+Esc between the two → LED stow by Enter → LED restore by Enter
 *   → Esc closes (app path, then OS path) → focus re-seated on the ground.
 *
 * Companions: the ground menu's keyboard-open path (Menu key law), and the
 * notepad dirty guard's precedence over the OS Esc-close — the input-field
 * law (keys inside a textarea are the field's) proven in a real browser.
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** The attribute of the live focus target — the journey's eyes. */
function focusAttr(page: Page, attr: string): Promise<string | null> {
  return page.evaluate(
    ({ attribute }) => document.activeElement?.getAttribute(attribute) ?? null,
    { attribute: attr },
  )
}

/** The id of the focused window's DOM root, or null. */
function focusedWindowId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.closest('.wm-window')?.getAttribute('data-window-id') ?? null,
  )
}

test('the non-visual journey — the whole desktop, zero pointer', async ({ page }) => {
  await toDesktop(page)

  // -- the ground: first Tab lands on the specimen field
  await page.keyboard.press('Tab')
  expect(await focusAttr(page, 'data-icon-field')).not.toBeNull()

  // -- 2D arrows: right then down reaches the nameplate at (1,1). (The first
  //    keydown inside the stage also retires the first-visit docent.)
  await page.keyboard.press('ArrowRight') // (0,0) → charter (1,0)
  await expect(page.locator('[data-docent]')).toHaveCount(0)
  expect(await focusAttr(page, 'data-specimen-id')).toBe('charter')
  await page.keyboard.press('ArrowDown') // (1,0) → nameplate (1,1)
  expect(await focusAttr(page, 'data-specimen-id')).toBe('nameplate')
  await expect(page.locator('[data-specimen-id="nameplate"]')).toHaveAttribute(
    'data-selected',
    'true',
  )

  // -- Space selects without opening
  await page.keyboard.press('Space')
  await expect(page.locator('.wm-window')).toHaveCount(0)

  // -- Enter opens the manifest; focus moves INTO the window
  await page.keyboard.press('Enter')
  const about = page.locator('.wm-window[data-app-id="about"]')
  await expect(about).toBeVisible()
  expect(await focusedWindowId(page)).toBe(await about.getAttribute('data-window-id'))

  // -- the F6 ring: window → desktop → taskbar → window
  await page.keyboard.press('F6')
  expect(await focusAttr(page, 'data-specimen-id')).toBe('nameplate') // the tabbable icon
  await page.keyboard.press('F6')
  expect(await focusAttr(page, 'data-launcher-pull')).not.toBeNull()
  await page.keyboard.press('F6')
  expect(await focusedWindowId(page)).toBe(await about.getAttribute('data-window-id'))

  // -- the drawer, keys only: Enter opens it, Tab stays INSIDE it, Enter launches
  await page.keyboard.press('F6') // window → desktop
  await page.keyboard.press('F6') // desktop → taskbar (the pull is the stop)
  await page.keyboard.press('Enter') // pull opens the module drawer
  await expect(page.locator('[data-launcher-menu]')).toBeVisible()
  expect(await focusAttr(page, 'data-launch-app')).toBe('notepad') // first row focused
  await page.keyboard.press('Tab') // walks the rows — the drawer STAYS OPEN
  expect(await focusAttr(page, 'data-launch-app')).toBe('image-viewer')
  await expect(page.locator('[data-launcher-menu]')).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Home') // back to the first row
  expect(await focusAttr(page, 'data-launch-app')).toBe('notepad')
  await page.keyboard.press('Enter') // launch — a second window
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepad).toBeVisible()
  await expect(page.locator('.wm-window')).toHaveCount(2)

  // -- focus is inside the new window's SHEET: typing keys are the field's
  await expect(page.locator('[data-notepad-textarea]')).toBeFocused()
  await page.keyboard.press('ArrowLeft') // the caret's, never the desktop's
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('TEXTAREA')

  // -- Alt+Esc walks the stack from ANYWHERE (a global, non-typing chord):
  //    focus + raise flip to the other window, and back
  await page.keyboard.press('Alt+Escape')
  await expect(about).toHaveAttribute('data-focused', 'true')
  expect(await focusedWindowId(page)).toBe(await about.getAttribute('data-window-id'))
  await page.keyboard.press('Alt+Escape') // …and back
  await expect(notepad).toHaveAttribute('data-focused', 'true')
  expect(await focusedWindowId(page)).toBe(await notepad.getAttribute('data-window-id'))

  // -- LED stow by Enter: F6 to the rail, arrows walk pull → LEDs
  await page.keyboard.press('F6') // window → desktop
  await page.keyboard.press('F6') // desktop → taskbar
  await page.keyboard.press('ArrowRight') // → the about LED (open order)
  expect(await focusAttr(page, 'data-window-led')).toBe(await about.getAttribute('data-window-id'))
  await page.keyboard.press('ArrowRight') // → the notepad LED
  expect(await focusAttr(page, 'data-window-led')).toBe(
    await notepad.getAttribute('data-window-id'),
  )
  await page.keyboard.press('Enter') // the focused LED stows its window
  await expect(notepad).toHaveAttribute('data-minimized', 'true')
  await expect(notepad).toBeHidden()

  // -- LED restore by Enter: the roving stop stayed on the notepad LED
  await page.keyboard.press('F6') // window (about took focus) → desktop
  await page.keyboard.press('F6') // desktop → taskbar — lands on the ROVED stop
  expect(await focusAttr(page, 'data-window-led')).toBe(
    await notepad.getAttribute('data-window-id'),
  )
  await page.keyboard.press('Enter') // restore: raise + focus + un-stow
  await expect(notepad).toHaveAttribute('data-minimized', 'false')
  await expect(notepad).toHaveAttribute('data-focused', 'true')
  expect(await focusedWindowId(page)).toBe(await notepad.getAttribute('data-window-id'))

  // -- Esc closes: the notepad's OWN path first (clean draft → close now)
  await page.keyboard.press('Escape')
  await expect(notepad).toHaveCount(0)

  // -- Esc closes: the OS path for the guardless manifest (unclaimed Esc)
  await page.keyboard.press('F6') // desktop
  await page.keyboard.press('F6') // taskbar
  await page.keyboard.press('F6') // window — the about window is the last one
  expect(await focusedWindowId(page)).toBe(await about.getAttribute('data-window-id'))
  await page.keyboard.press('Escape')
  await expect(about).toHaveCount(0)
  await expect(page.locator('.wm-window')).toHaveCount(0)

  // -- focus decency: the last close re-seats on the ground, never <body>
  expect(await focusAttr(page, 'data-icon-field')).not.toBeNull()
})

test('the hold menu opens from the empty ground by keyboard and operates', async ({ page }) => {
  await toDesktop(page)
  await page.keyboard.press('Tab') // the ground
  const iconsBefore = await page.locator('[data-specimen-id]').count()

  // The recorded gap, closed: ContextMenu on the EMPTY ground opens the menu.
  await page.keyboard.press('ContextMenu')
  const menu = page.locator('[data-menu-root]')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('aria-label', 'Hold menu')

  // Arrows walk it; Enter activates New Drawer — a new icon lands on the hold.
  await page.keyboard.press('Enter') // first row: New Drawer
  await expect(page.locator('[data-specimen-id]')).toHaveCount(iconsBefore + 1)

  // The specimen's own Menu key still opens ITS menu on an icon.
  await page.keyboard.press('Tab') // ground → the tabbable icon
  await page.keyboard.press('Shift+F10')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('aria-label', 'Specimen menu — Projects')
  await page.keyboard.press('Escape') // close, focus returns to the icon
  await expect(page.locator('[data-menu-root]')).toHaveCount(0)
})

test('the notepad dirty guard outranks the OS Esc-close (input-field law)', async ({ page }) => {
  await toDesktop(page)

  // Keyboard-only to a notepad draft: ground → taskbar → drawer → notepad.
  await page.keyboard.press('Tab')
  await page.keyboard.press('F6') // desktop → taskbar
  await page.keyboard.press('Enter') // drawer
  await page.keyboard.press('Enter') // first row: the notepad
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepad).toBeVisible()
  const sheet = page.locator('[data-notepad-textarea]')
  await expect(sheet).toBeFocused()

  // -- the notepad dirty guard outranks the OS Esc-close — then a clean close
  await page.keyboard.type('unsaved field notes')
  await page.keyboard.press('Escape')
  const strip = page.locator('[data-notepad-strip]')
  await expect(strip).toBeVisible()
  await expect(notepad).toBeVisible()

  // The strip's own Esc keeps editing (safe default); the sheet retakes focus.
  await page.keyboard.press('Escape')
  await expect(strip).toHaveCount(0)
  await expect(sheet).toBeFocused()

  // Clean: the same Esc now closes — the notepad's requestClose path.
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
  await expect(notepad).toHaveCount(0)
})
