import { expect, test } from '@playwright/test'

/**
 * UI-3 + UI-5 e2e — the desktop surface contract, against the real app graph
 * (boot orchestrator, real persistence, real stores; fresh context per test
 * = a genuine first visit).
 *
 * Gates (docs/ultron/plan.md UI-3 + UI-4 + UI-5 acceptance):
 * 1. After boot, the desktop shows the seeded catalog as specimen icons
 *    (Projects / Field Notes / Archive drawers + the charter specimen + the
 *    About module reference) on the default star-chart archive plate.
 * 2. Click selects an icon; clicking the bare plate clears the selection.
 * 3. The first-visit docent hints are visible, dismissible, and stay gone
 *    after a reload.
 * 4. (UI-5) Right-click ground → New Drawer accessions into the FS and the
 *    icon renders; right-click icon → inline rename commits and persists;
 *    icon delete runs the two-step confirm and stays gone after reload.
 * 5. (UI-4) Switching the wallpaper through the REAL settings-store action
 *    changes the plate live (data-wallpaper id) and survives a reload —
 *    persistence via the same debounced autosave every setting rides.
 *
 * Selectors ride stable seams (data-* attributes / accessible names), never
 * CSS pixels — the one bare-plate click uses a deliberately empty screen
 * region instead.
 *
 * The UI-4 spec drives the settings store the way interactions.spec.ts
 * drives the wm-store: a page-context dynamic import of the dev-server module
 * (the SAME module instance the app uses) calling the real setWallpaper
 * action — deliberately NO test-only setter ships in the production bundle.
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

test('after boot the desktop shows the seeded catalog as specimen icons', async ({ page }) => {
  await toDesktop(page)

  // The three drawers + the charter specimen + the About module reference —
  // accessible names carry name, accession code, kind.
  const icons = page.locator('.icon-field [data-specimen-id]')
  await expect(icons).toHaveCount(5)
  await expect(
    page.getByRole('button', { name: 'Projects, DRW-0001, drawer' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Field Notes, DRW-0002, drawer' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive, DRW-0003, drawer' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'accession-charter.txt, SPC-0005, specimen' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Science Officer Nameplate, MOD-0001, module' }),
  ).toBeVisible()

  // Parchment labels carry the engraved catalog text; the default archive
  // plate (star-chart) is under everything; no windows on a first visit.
  await expect(page.locator('.specimen-accession', { hasText: 'DRW-0001' })).toBeVisible()
  await expect(page.locator('[data-wallpaper="star-chart"]')).toBeAttached()
  await expect(page.locator('[data-wallpaper="star-chart"] svg')).toBeAttached()
  await expect(page.locator('.wm-window')).toHaveCount(0)
})

test('click selects an icon; clicking the bare plate clears the selection', async ({ page }) => {
  await toDesktop(page)

  const projects = page.locator('[data-specimen-id="projects"]')
  const archive = page.locator('[data-specimen-id="archive"]')

  await projects.click()
  await expect(projects).toHaveAttribute('data-selected', 'true')
  await expect(archive).toHaveAttribute('data-selected', 'false')

  // Selection is single: clicking another specimen moves it.
  await archive.click()
  await expect(archive).toHaveAttribute('data-selected', 'true')
  await expect(projects).toHaveAttribute('data-selected', 'false')

  // Clicking the bare plate (a deliberately empty region, clear of icons,
  // docent cards, and windows) sets the selection down.
  await page.mouse.click(900, 600)
  await expect(archive).toHaveAttribute('data-selected', 'false')
})

test('the first-visit docent hints are visible, dismiss on interaction, and stay gone', async ({
  page,
}) => {
  await toDesktop(page)

  // Parchment annotation cards + drawn leader lines, first visit only.
  await expect(page.locator('[data-docent]')).toBeVisible()
  await expect(page.getByText('Double-click a specimen to open it.')).toBeVisible()
  await expect(page.getByText(/Drag to rearrange the hold/)).toBeVisible()
  // 4 leaders: three specimens + the console's own keyboard hint at the rail
  // (refinement #5 `onboard` — F6/Enter/Esc surface in-world, first visit only).
  await expect(page.locator('[data-docent-hint="rail"]')).toBeVisible()
  await expect(page.locator('[data-docent-hint="rail"]')).toContainText(
    'This console answers the keyboard',
  )
  await expect(page.locator('.docent-leader')).toHaveCount(4)

  // Any interaction retires the docent (here: selecting a specimen).
  await page.locator('[data-specimen-id="nameplate"]').click()
  await expect(page.locator('[data-docent]')).toHaveCount(0)

  // Reload (return visit): desktop returns, docent never does.
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-docent]')).toHaveCount(0)
})

test('the × on a docent card dismisses the hints too', async ({ page }) => {
  await toDesktop(page)

  await page.getByRole('button', { name: 'Dismiss hint' }).first().click()
  await expect(page.locator('[data-docent]')).toHaveCount(0)
})

/* ------------------------------ UI-5 · context menus ---------------------- */

test('right-click ground → New Drawer accessions into the FS and renders as an icon', async ({
  page,
}) => {
  await toDesktop(page)

  // A deliberately empty region of the plate, clear of icons/docent/windows.
  await page.mouse.click(900, 420, { button: 'right' })
  const menu = page.locator('[data-menu-root]')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('role', 'menu')

  await page.locator('[data-menu-item="new-drawer"]').click()

  // The drawer accessions into the catalog and its icon renders immediately.
  const created = page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })
  await expect(created).toBeVisible()

  // The archive remembers: let the debounced autosave flush, then reload.
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })).toBeVisible()
})

test('right-click icon → Rename edits in place; the label persists after reload', async ({ page }) => {
  await toDesktop(page)

  await page.locator('[data-specimen-id="charter"]').click({ button: 'right' })
  await page.locator('[data-menu-item="rename"]').click()

  // The icon itself becomes the label-edit field, seeded with the old label.
  const field = page.locator('[data-rename-input]')
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('accession-charter.txt')

  await field.fill('field-manual.txt')
  await field.press('Enter')

  await expect(
    page.getByRole('button', { name: 'field-manual.txt, SPC-0005, specimen' }),
  ).toBeVisible()

  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(
    page.getByRole('button', { name: 'field-manual.txt, SPC-0005, specimen' }),
  ).toBeVisible()
})

test('right-click icon → Delete runs the two-step confirm; the specimen stays gone', async ({
  page,
}) => {
  await toDesktop(page)

  await page.locator('[data-specimen-id="charter"]').click({ button: 'right' })
  await page.locator('[data-menu-item="delete"]').click()

  // The guarded step inside the SAME menu — nothing deleted yet.
  await expect(page.locator('[data-menu-confirm]')).toBeVisible()
  await expect(page.locator('[data-specimen-id="charter"]')).toBeVisible()

  await page.locator('[data-menu-item="delete__go"]').click()

  await expect(page.locator('[data-specimen-id="charter"]')).toHaveCount(0)
  await expect(page.locator('[data-menu-root]')).toHaveCount(0)

  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-specimen-id="charter"]')).toHaveCount(0)
  // The rest of the hold survives.
  await expect(
    page.getByRole('button', { name: 'Projects, DRW-0001, drawer' }),
  ).toBeVisible()
})

/* ------------------------------ UI-4 · archive plates ---------------------- */

/**
 * The settings-store module as seen from the page. The dynamic import uses a
 * NON-literal specifier (a page-context URL the dev server serves, not a TS
 * module this file resolves) — so the shape is asserted instead. Defined
 * INLINE inside each evaluate callback: page.evaluate serializes function
 * source, not closures. (Same seam class as interactions.spec.ts's wm-store
 * probe; no test-only setter exists in the production bundle.)
 */
interface SettingsStoreView {
  getState(): {
    setWallpaper(id: string): void
    wallpaper: string
  }
}

test('switching the wallpaper through the settings store changes the plate live and persists', async ({
  page,
}) => {
  await toDesktop(page)

  // The default plate is the authored star chart.
  const plate = page.locator('[data-wallpaper]')
  await expect(plate).toHaveAttribute('data-wallpaper', 'star-chart')
  await expect(page.locator('.wallpaper-layer svg')).toHaveCount(1)

  // Switch to the parchment anatomical plate through the REAL store action.
  await page.evaluate(async () => {
    const url = '/src/platform/stores/settings-store.ts'
    const { useSettingsStore } = (await import(url)) as { useSettingsStore: SettingsStoreView }
    useSettingsStore.getState().setWallpaper('anatomy')
  })
  await expect(plate).toHaveAttribute('data-wallpaper', 'anatomy')
  // One plate, live-swapped — nothing of the old chart survives in the layer.
  await expect(page.locator('.wallpaper-layer svg')).toHaveCount(1)
  await expect(page.locator('.wallpaper-layer svg[viewBox="0 0 1600 900"]')).toHaveCount(1)

  // A second switch to the survey sheet (the amber measuring plate).
  await page.evaluate(async () => {
    const url = '/src/platform/stores/settings-store.ts'
    const { useSettingsStore } = (await import(url)) as { useSettingsStore: SettingsStoreView }
    useSettingsStore.getState().setWallpaper('survey')
  })
  await expect(plate).toHaveAttribute('data-wallpaper', 'survey')

  // The archive remembers: the debounced autosave flushes, then a reload
  // comes back on the SAME plate.
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(plate).toHaveAttribute('data-wallpaper', 'survey')
  await expect(page.locator('.wallpaper-layer svg')).toHaveCount(1)
})
