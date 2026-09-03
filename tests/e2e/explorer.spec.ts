import { expect, test } from '@playwright/test'

/**
 * AP-1 e2e — the file explorer (drawer module) against the real app graph:
 * fresh context per test = a genuine first visit.
 *
 * Gates (docs/ultron/plan.md AP-1 acceptance: "navigate tree, open items,
 * ops reflect in FS + persist"):
 * 1. Double-clicking a drawer on the hold opens the explorer module AT that
 *    drawer (breadcrumb Hold / Projects, children in accession order) — the
 *    IM-5 routing that soft-failed until this app registered.
 * 2. One window PER drawer: re-opening a drawer restores its existing window
 *    instead of duplicating it.
 * 3. Navigate into a subfolder by double-click; jump via breadcrumb crumb;
 *    the back affordance returns through history.
 * 4. New Drawer / New Specimen via the explorer's context menu (the platform
 *    shell) appear in the drawer; an inline rename persists after reload.
 * 5. Opening the about module reference from inside the explorer opens the
 *    nameplate manifest window (AP-5 registered `about` — the route that
 *    soft-failed until then).
 *
 * Selectors ride stable seams (data-* attributes / accessible names), never
 * CSS pixels — the two content right-clicks use a deliberately empty region
 * below the first card row.
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Open the Projects drawer module from the hold (double-click routing). */
async function openProjects(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-specimen-id="projects"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
}

/** Right-click an empty region of the drawer's parchment (below the cards). */
async function drawerMenu(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-explorer-content]').click({
    button: 'right',
    position: { x: 340, y: 330 },
  })
  await expect(page.locator('[data-menu-root]')).toBeVisible()
}

test('double-click a drawer opens the explorer at that drawer; one window per drawer', async ({
  page,
}) => {
  await toDesktop(page)
  await openProjects(page)

  // Breadcrumb: Hold / Projects, each crumb navigable; accession rides the well.
  await expect(page.locator('[data-explorer-crumb="root"]')).toHaveText('Hold')
  await expect(page.locator('[data-explorer-crumb="projects"]')).toHaveText('Projects')
  await expect(page.locator('.explorer-accession')).toHaveText('DRW-0001')

  // Children in catalog (accession) order: the plate series leads the specimens.
  const options = page.locator('[data-explorer-listbox] [data-explorer-option]')
  await expect(options).toHaveCount(6) // 5 exhibit specimens + reference plate
  await expect(options.first()).toHaveAttribute('data-kind', 'image')

  // Ledger density: readout columns, same order.
  await page.locator('[data-explorer-view="list"]').click()
  await expect(page.locator('.explorer-ledger-head')).toBeVisible()
  await expect(page.locator('.explorer-row .explorer-row-accession').first()).toHaveText('PLT-0001')

  // Per-folder dedupe: stow the module, re-open the SAME drawer → the ONE
  // window restores (focus + un-minimize), never a second module.
  await page
    .locator('.wm-window[data-app-id="explorer"]')
    .getByRole('button', { name: 'Minimize' })
    .click()
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeHidden()
  await page.locator('[data-specimen-id="projects"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
  await expect(page.locator('.wm-window')).toHaveCount(1)
})

test('navigate into a subfolder by double-click; jump by crumb; back returns', async ({ page }) => {
  await toDesktop(page)
  await openProjects(page)

  // Accession a fresh drawer INTO Projects via the drawer menu.
  await drawerMenu(page)
  await page.locator('[data-menu-item="new-drawer"]').click()
  const sub = page.locator('[data-explorer-listbox]').getByRole('option', {
    name: /^New Drawer, DRW-\d{4}, drawer$/,
  })
  await expect(sub).toBeVisible()

  // Double-click navigates INSIDE this window — no second module.
  await sub.dblclick()
  await expect(page.locator('.wm-window')).toHaveCount(1)
  await expect(page.locator('[data-explorer-crumb]')).toHaveCount(3)
  await expect(page.locator('[data-explorer-empty]')).toBeVisible()
  await expect(page.getByText('No specimens catalogued')).toBeVisible()

  // Crumb jump: straight back to Projects.
  await page.locator('[data-explorer-crumb="projects"]').click()
  await expect(page.locator('[data-explorer-crumb]')).toHaveCount(2)
  await expect(page.locator('[data-explorer-listbox] [data-explorer-option]')).toHaveCount(7)

  // Back walks the history into the fresh drawer again.
  await page.locator('[data-explorer-back]').click()
  await expect(page.locator('[data-explorer-empty]')).toBeVisible()
})

test('New Specimen via the drawer menu; inline rename persists after reload', async ({ page }) => {
  await toDesktop(page)
  await openProjects(page)

  await drawerMenu(page)
  await page.locator('[data-menu-item="new-specimen"]').click()
  const specimen = page.locator('[data-explorer-listbox]').getByRole('option', {
    name: /^New Specimen, SPC-\d{4}, specimen$/,
  })
  await expect(specimen).toBeVisible()

  // Rename in place through the specimen menu (the platform rows).
  await specimen.click({ button: 'right' })
  await page.locator('[data-menu-item="rename"]').click()
  const field = page.locator('[data-rename-input]')
  await expect(field).toBeFocused()
  await field.fill('field-manual.txt')
  await field.press('Enter')
  await expect(
    page.locator('[data-explorer-listbox]').getByRole('option', {
      name: /^field-manual\.txt, SPC-\d{4}, specimen$/,
    }),
  ).toBeVisible()

  // The archive remembers: autosave flushes, reload, the restored module (WM
  // persistence) still shows the relabelled specimen.
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
  await expect(page.getByText('field-manual.txt').first()).toBeVisible()
})

test('the about module reference opens the nameplate manifest (AP-5 registered it)', async ({
  page,
}) => {
  await toDesktop(page)
  await openProjects(page)

  // Jump to the hold via the breadcrumb; the nameplate module lives there.
  await page.locator('[data-explorer-crumb="root"]').click()
  await expect(page.locator('[data-explorer-listbox] [data-explorer-option]')).toHaveCount(5)

  await page.locator('[data-explorer-option="nameplate"]').dblclick()

  // `about` was a reserved id with no registered app until AP-5: openApp
  // soft-failed (no crash, no window). The nameplate module now opens the
  // manifest for real — same unfreeze class as the drawers at AP-1.
  await expect(page.locator('.wm-window[data-app-id="about"]')).toBeVisible()
  await expect(page.locator('.wm-window')).toHaveCount(2) // this drawer + the manifest
  await expect(page.locator('[data-about-name]')).toHaveText('Graydon Wasil')
  await expect(page.locator('[data-explorer-crumb="root"]')).toBeVisible() // the drawer carries on
})
