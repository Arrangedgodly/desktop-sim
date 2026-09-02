import { expect, test, type Page } from '@playwright/test'
import { registerDemoModule } from './e2e-helpers'

/**
 * HU-1 e2e — fault injection against the REAL app graph (dev server, real
 * IndexedDB, real stores; fresh context per test = a genuine first visit).
 *
 * Gates (docs/ultron/plan.md HU-1 acceptance — "fault-injection tests pass;
 * a thrown app error isolates; storage failure surfaces recovery"):
 * 1. An injected module RENDER fault (the dev hooks, `/?injectFaults=1`) → the
 *    window shows the in-world MODULE FAULT card, the DESKTOP STAYS OPERABLE
 *    (a second module opens + mounts), and Reload module recovers the window.
 * 2. A REAL chunk-load failure (route-aborted module request — no code hook,
 *    the honest network fault) → the SAME card, classified network; Reload
 *    module re-fetches the chunk for real and recovers; Copy diagnostics puts
 *    the network-vs-code distinction + module facts on the clipboard.
 * 3. A REAL boot recovery (the IndexedDB state envelope corrupted on disk
 *    between visits) → the bottom-right ARCHIVE RECOVERED notice card, the
 *    one-time View vault readout link opens Console Settings ON the vault
 *    readout, and Dismiss clears the card.
 *
 * HONEST LIMITS (documented per dispatch): the QUOTA notice path cannot be
 * forced in a real browser without lying about storage — it is covered
 * unit-level (storage-notices.test.tsx drives MF-2's real status store
 * surfaces); the OS-level CONSOLE FAULT plate + guarded reset likewise (a
 * shell fault has no honest real-browser injection seam — covered in
 * ConsoleFaultBoundary.test.tsx with the real resetDesktop seam mocked).
 *
 * The fault hooks themselves are DEV-ONLY: `?injectFaults` loads them on a
 * dev server; the production build eliminates the entire chunk (dist grep in
 * the HU-1 validation; see docs/TESTING.md "Fault injection").
 */

/** Boot to the desktop with the dev fault hooks armed (?injectFaults). */
async function toDesktopWithHooks(page: Page): Promise<void> {
  await page.goto('/?injectFaults=1')
  await page.keyboard.press('Space') // skip POST
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await page.waitForFunction(() => window.__holdFaults !== undefined)
}

/** Boot to the desktop (plain visit). */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Launch a module from the taskbar drawer (the honest affordance). */
async function launchModule(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name }).click()
}

/** Corrupt the persisted state envelope directly in IndexedDB (between visits). */
async function corruptStateEnvelope(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('desktop-sim')
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('state', 'readwrite')
          tx.objectStore('state').put(
            'garbage — not a structured-clone envelope',
            'desktop-sim/state',
          )
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
}

// window.__holdFaults is typed by the dev hooks module's own global
// declaration (src/platform/app-registry/fault-injection.tsx — the tsconfig
// program spans src + tests, so the spec rides that declaration).

// The diagnostics gate reads the clipboard back (localhost is a secure
// context in Chromium; the grant covers both directions).
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('an injected module render fault isolates to its window; the desktop stays operable; Reload module recovers', async ({
  page,
}) => {
  await toDesktopWithHooks(page)
  // TH-2: the demo module is a test-only fixture now — register it through
  // the registry's public seam (this fault-isolation subject is exactly what
  // it was built for).
  await registerDemoModule(page)

  // Arm the fault BEFORE the window opens (AppSlot consults the seam at mount).
  await page.evaluate(() => window.__holdFaults?.arm('demo', 'render'))
  await launchModule(page, 'Demo Module')

  // The window carries the in-world MODULE FAULT console card — not a crash.
  const demoWindow = page.locator('.wm-window[data-app-id="demo"]')
  const faultCard = demoWindow.locator('[data-module-fault]')
  await expect(faultCard).toBeVisible()
  await expect(faultCard).toHaveAttribute('data-fault-kind', 'code')
  await expect(faultCard).toContainText('Demo Module')

  // The OS, other windows and persistence keep running: another module opens
  // and mounts its real surface while the faulted window stands.
  await launchModule(page, 'Specimen Notepad')
  const notepadWindow = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepadWindow).toBeVisible()
  await expect(notepadWindow.locator('[data-module-fault]')).toHaveCount(0)
  await expect(faultCard).toBeVisible() // still faulted, still isolated

  // Reload module: disarm first (the module's code is fine), RAISE the demo
  // window (the notepad now sits on top of it), press the card's button, and
  // the app re-mounts fresh inside the same window.
  await page.evaluate(() => window.__holdFaults?.disarm('demo'))
  await demoWindow.locator('.wm-titlebar').click()
  await faultCard.getByRole('button', { name: 'Reload module' }).click()
  await expect(demoWindow.locator('[data-module-fault]')).toHaveCount(0)
  await expect(demoWindow).toContainText('IM-3 CONTRACT DEMO')
  // The sibling never noticed.
  await expect(notepadWindow).toBeVisible()
})

test('a real aborted chunk load lands on the same card, classified network; Reload module re-fetches and recovers', async ({
  page,
}) => {
  await toDesktop(page)
  await registerDemoModule(page) // TH-2: demo is the test-only fixture now

  // The HONEST network fault: the dev server aborts the module's own chunk.
  await page.route('**/demo/DemoSurface*', (route) => route.abort('connectionrefused'))
  await launchModule(page, 'Demo Module')

  const demoWindow = page.locator('.wm-window[data-app-id="demo"]')
  const faultCard = demoWindow.locator('[data-module-fault]')
  await expect(faultCard).toBeVisible()
  await expect(faultCard).toHaveAttribute('data-fault-kind', 'network')
  await expect(faultCard).toContainText('MODULE TRANSFER FAILED (network)')

  // Copy diagnostics names the network-vs-code distinction + the module.
  await faultCard.getByRole('button', { name: 'Copy diagnostics' }).click()
  await expect(faultCard.getByRole('button', { name: 'Diagnostics copied' })).toBeVisible()
  const diagnostics = await page.evaluate(() => navigator.clipboard.readText())
  expect(diagnostics).toContain('module: Demo Module (demo)')
  expect(diagnostics).toContain('MODULE TRANSFER FAILED (network)')
  expect(diagnostics).toContain('HOLD/OS 0.1.0')

  // Connection restored: Reload module re-attempts the REAL import and the
  // module mounts in the same window.
  await page.unroute('**/demo/DemoSurface*')
  await faultCard.getByRole('button', { name: 'Reload module' }).click()
  await expect(demoWindow.locator('[data-module-fault]')).toHaveCount(0)
  await expect(demoWindow).toContainText('IM-3 CONTRACT DEMO')
})

test('a corrupted archive recovers on boot: the notice card surfaces, links once to the vault readout, and dismisses', async ({
  page,
}) => {
  await toDesktop(page)
  await corruptStateEnvelope(page)
  await page.reload()

  // Boot read the corrupt envelope, reseeded from the seed collection, and
  // surfaced the recovery — the desktop is up (not a recovery screen: the
  // catalog was recoverable in-place).
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  const notice = page.locator('[data-storage-notice]')
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('data-notice-kind', 'recovery')
  await expect(notice).toContainText('ARCHIVE RECOVERED')

  // The one-time link opens Console Settings ON the vault readout. Wait for
  // the SURFACE (not the window frame — the console's chunk is lazy, and the
  // vault focus lands when the surface's mount effect runs).
  await notice.getByRole('button', { name: 'View vault readout' }).click()
  const consoleWindow = page.locator('.wm-window[data-app-id="settings"]')
  await expect(consoleWindow.locator('[data-settings-surface]')).toBeVisible({
    timeout: 10_000,
  })
  const focused = await page.evaluate(
    () =>
      document.activeElement?.matches('[data-settings-vault-section]') === true &&
      document.querySelector('[data-settings-vault-section]') === document.activeElement,
  )
  expect(focused).toBe(true)

  // One-time: the link is gone while the notice itself waits to be dismissed.
  await expect(notice.getByRole('button', { name: 'View vault readout' })).toHaveCount(0)
  await expect(notice).toBeVisible()

  // Dismiss is the only expiry — one press, the channel empties.
  await notice.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.locator('[data-storage-notice]')).toHaveCount(0)
})
