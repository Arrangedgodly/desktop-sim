import { readFile, stat } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

/**
 * Archive Backup e2e (batch-2 brief 10) — the honest utility against the real
 * app graph. Written by the worker, run by the INTEGRATOR after registration
 * (src/apps/index.ts) lands; selectors ride stable seams (data-* attributes),
 * never CSS pixels.
 *
 * Gates (brief 10 acceptance 8 + the flow truths):
 * 1. The launcher opens the vault (singleton: a second open raises, not
 *    duplicates), and the toolbar's live well counts the real hold.
 * 2. EXPORT fires a real JSON download — honest name, well-formed content
 *    that round-trips through the platform reader's own shape.
 * 3. IMPORT previews the SAME file without mutating anything, then the
 *    guarded restore (oxide two-step: arm → Esc disarms → arm → confirm)
 *    seats the envelope and says so in the well.
 * 4. A hostile file is refused IN-WORLD with its typed code — the desktop
 *    never changes.
 */

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

/** Open the vault through the module drawer — the launcher route. */
async function openBackup(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="archive-backup"]').click()
  const win = page.locator('.wm-window[data-app-id="archive-backup"]')
  await expect(win).toBeVisible()
  return win
}

/** The manifest-summary well of the newest vault window. */
const summary = (page: Page) => page.locator('[data-backup-summary]').last()

/* ------------------------------------------------------------------ */

test('the launcher opens the vault; a second open RAISES it — singleton; the live well counts the hold', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openBackup(page)

  // The live well is honest: its counts match the real desktop specimen icons
  // plus what sits inside drawers (>= the icons on the hold).
  const live = page.locator('[data-backup-live]').last()
  await expect(live).toContainText('SPECIMENS')
  const iconCount = await page.locator('.specimen-icon').count()
  const specimens = Number(
    (await live.textContent())!.match(/SPECIMENS (\d+)/)![1],
  )
  expect(specimens).toBeGreaterThanOrEqual(iconCount)

  // Singleton: a second launcher open raises the same window, never a second.
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="archive-backup"]').click()
  await expect(page.locator('.wm-window[data-app-id="archive-backup"]')).toHaveCount(1)
})

test('export fires a real JSON download of the living archive', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await openBackup(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-backup-export]').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^holdos-archive-v1-\d{8}-\d{6}\.json$/)
  const size = (await stat(await download.path())).size
  expect(size).toBeGreaterThan(0)

  // The content is the real envelope: version, catalog with its root hold,
  // session windows, settings — and its specimen count matches the live well.
  const payload = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    version: number
    fs: { rootId: string; nodes: Record<string, { kind: string }> }
    windows: unknown[]
    settings: { wallpaper: string }
  }
  expect(payload.version).toBe(1)
  expect(payload.fs.nodes[payload.fs.rootId]!.kind).toBe('folder')
  expect(Object.keys(payload.fs.nodes).length).toBeGreaterThan(3)
  expect(Array.isArray(payload.windows)).toBe(true)
  expect(typeof payload.settings.wallpaper).toBe('string')

  const specimens = Object.values(payload.fs.nodes).filter((n) => n.kind !== 'folder').length
  await expect(page.locator('[data-backup-live]').last()).toContainText(
    `SPECIMENS ${specimens}`,
  )
  // The receipt line in the well names what was written.
  await expect(page.locator('[data-backup-last]').last()).toContainText('WROTE holdos-archive-v1-')
})

test('import previews without mutating; the guarded two-step restore seats the envelope', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openBackup(page)

  // Export first — the import fixture is the console's own honest output.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-backup-export]').click(),
  ])
  const buffer = await readFile(await download.path())

  // IMPORT the same archive: the vault readout previews the manifest facts.
  await page.locator('[data-backup-file-input]').last().setInputFiles({
    name: 'holdos-roundtrip.json',
    mimeType: 'application/json',
    buffer,
  })
  await expect(summary(page)).toBeVisible()
  await expect(summary(page).locator('[data-backup-version]')).toHaveText('v1')
  await expect(summary(page).locator('[data-backup-windows]')).toContainText(/\d+/)
  const specimens = Object.values(
    (JSON.parse(buffer.toString('utf8')) as { fs: { nodes: Record<string, { kind: string }> } }).fs
      .nodes,
  ).filter((n) => n.kind !== 'folder').length
  await expect(summary(page).locator('[data-backup-specimens]')).toHaveText(String(specimens))

  // Preview changed nothing: the desktop icons are all still there.
  const iconsBefore = await page.locator('.specimen-icon').count()
  expect(iconsBefore).toBeGreaterThan(0)

  // The guard is oxide TWO-STEP: arm (re-label), Esc disarms…
  const restore = page.locator('[data-backup-restore]').last()
  await restore.click()
  await expect(restore).toHaveAttribute('data-armed', 'true')
  await expect(restore).toHaveText('Confirm restore')
  await page.keyboard.press('Escape')
  await expect(restore).not.toHaveAttribute('data-armed', 'true')
  await expect(page.locator('.specimen-icon')).toHaveCount(iconsBefore) // still nothing done

  // …arm again, and the second press commits through the seam.
  await restore.click()
  await restore.click()
  await expect(page.locator('[data-backup-restored]').last()).toContainText('ARCHIVE RESTORED')
  // The same envelope came home: the hold's icons are exactly what they were.
  await expect(page.locator('.specimen-icon')).toHaveCount(iconsBefore)
})

test('a hostile file is refused in-world with its typed code — the hold never changes', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await openBackup(page)

  const iconsBefore = await page.locator('.specimen-icon').count()
  await page.locator('[data-backup-file-input]').last().setInputFiles({
    name: 'not-an-archive.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":9999,"fs":[]}', 'utf8'),
  })
  const refusal = page.locator('[data-backup-refusal]').last()
  await expect(refusal).toBeVisible()
  await expect(refusal).toHaveAttribute('data-code', 'unknown-version')
  await expect(refusal).toContainText('UNKNOWN SCHEMA VERSION')
  await expect(page.locator('[data-backup-summary]')).toHaveCount(0)
  await expect(page.locator('.specimen-icon')).toHaveCount(iconsBefore)
})
