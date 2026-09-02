import { expect, test, type Page } from '@playwright/test'

/**
 * UI-2 e2e — the boot contract, against the real app graph (main.tsx runs the
 * boot orchestrator; Playwright's dev-server webServer runs dev mode, so these
 * specs exercise the same StrictMode double-effect environment users' HMR does).
 *
 * Gates (docs/ultron/plan.md UI-2 acceptance):
 * 1. First visit: POST types the real subsystem lines, then the desktop; the
 *    whole boot lands ≤2s (`window.__BOOT_TIMELINE` carries boot-start →
 *    post-complete → desktop-ready) and no window auto-opens.
 * 2. Click skips the POST; any key skips the POST.
 * 3. Reload (return visit, boot flag set): no POST — post-complete is ABSENT
 *    from the timeline and desktop-ready lands ≤200ms after boot-start.
 * 4. prefers-reduced-motion: the static POST variant still completes to desktop.
 *
 * Selectors ride stable seams (data-* attributes / roles), never CSS pixels.
 */

interface MilestoneView {
  name: string
  t: number
  order: number
}

async function timeline(page: Page): Promise<MilestoneView[]> {
  return page.evaluate(() =>
    (window.__BOOT_TIMELINE ?? []).map((m) => ({ name: m.name, t: m.t, order: m.order })),
  )
}

/**
 * Read one milestone, polling: passive effects (which mark desktop-ready) can
 * land a beat after the element is visible — a one-shot read would race.
 */
async function milestone(page: Page, name: string): Promise<MilestoneView> {
  await expect.poll(async () => (await timeline(page)).some((m) => m.name === name)).toBe(true)
  return (await timeline(page)).find((m) => m.name === name)!
}

test('first visit: POST checks real subsystems, then gives way to the desktop (≤2s)', async ({
  page,
}) => {
  await page.goto('/')

  // The POST well is the first viewport: amber lines inside the recessed well.
  await expect(page.locator('[data-post-well]')).toBeVisible()

  // Real subsystem lines type in (toContainText waits out the typing cadence).
  const archive = page.locator('[data-post-line="archive-integrity"]')
  await expect(archive).toContainText('ARCHIVE INTEGRITY')
  await expect(archive).toContainText('SEEDED') // first visit → fresh catalog
  // The registry line reads the LIVE registry (AP-1 made it 2 modules; the
  // fleet grows it) — assert the readout shape, not a frozen count.
  await expect(page.locator('[data-post-line="module-registry"]')).toContainText(
    /\d+ MODULES? REGISTERED/,
  )
  await expect(page.locator('[data-post-line="plugin-bus"]')).toContainText('READY')
  await expect(page.locator('[data-post-line="console"]')).toContainText('ONLINE')
  await expect(page.locator('[data-post-line="os-banner"]')).toContainText('HOLD/OS')

  // …then the hold lights come up: the desktop stage replaces the POST screen.
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-boot-screen]')).toHaveCount(0)

  // The WM host is mounted but a first visit opens NO windows (nothing has
  // auto-opened since the UI-2 boot sequence owns the first viewport).
  await expect(page.locator('[data-wm-host]')).toBeAttached()
  await expect(page.locator('.wm-window')).toHaveCount(0)

  // TH-1 timeline: full boot ≤2s, phases in order.
  const start = await milestone(page, 'boot-start')
  await milestone(page, 'app-mounted')
  const post = await milestone(page, 'post-complete')
  const ready = await milestone(page, 'desktop-ready')
  expect(start.order).toBeLessThan(post.order)
  expect(post.order).toBeLessThan(ready.order)
  expect(ready.t - start.t).toBeLessThanOrEqual(2000)
})

test('a click anywhere skips the POST straight to the desktop', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-post-well]')).toBeVisible()

  await page.mouse.click(640, 360) // the whole boot screen is the skip control

  await expect(page.locator('[data-desktop-stage]')).toBeVisible()
  const names = (await timeline(page)).map((m) => m.name)
  expect(names).toContain('post-complete') // a skipped POST still completed
})

test('any key skips the POST straight to the desktop', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-post-well]')).toBeVisible()

  await page.keyboard.press('Space')

  await expect(page.locator('[data-desktop-stage]')).toBeVisible()
  expect((await timeline(page)).map((m) => m.name)).toContain('post-complete')
})

test('reload (return visit, boot flag set) short-circuits the POST', async ({ page }) => {
  await page.goto('/')
  // First visit: skip through to the desktop so the boot flag is written.
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('ds:boot'))).not.toBeNull()

  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible()
  // The RESUME flash may appear for ≤200ms; the full POST never does.
  await expect(page.locator('[data-post-line="archive-integrity"]')).toHaveCount(0)

  await milestone(page, 'desktop-ready') // poll past the passive-effect beat
  const milestones = await timeline(page)
  const names = milestones.map((m) => m.name)
  expect(names).toContain('boot-start')
  expect(names).not.toContain('post-complete') // the short-circuit ran no POST

  const start = milestones.find((m) => m.name === 'boot-start')!
  const ready = milestones.find((m) => m.name === 'desktop-ready')!
  expect(ready.t - start.t).toBeLessThanOrEqual(200) // near-instant desktop
})

test('prefers-reduced-motion: static POST (all lines at once), then the desktop', async ({
  page,
}) => {
  // DD-2 durable rewrite of the racy shape (IM-4b record): never poll the
  // TRANSIENT POST DOM — the ~300ms static hold could come and go before the
  // first assertion poll on a warm dev server. Instead a MutationObserver,
  // installed before any app code runs, records whether any POST line was
  // EVER mid-typing (data-state="typing" — the static variant lands every
  // line fully-typed at once), and the __BOOT_TIMELINE milestones carry the
  // completion + ordering evidence. (The observer watches `document`, not
  // documentElement: an init script runs before <html> exists, and
  // observe(null-equivalent) throws the observer away silently.)
  await page.addInitScript(() => {
    const w = window as unknown as { __sawTypingPostLine: boolean }
    w.__sawTypingPostLine = false
    const record = () => {
      for (const row of Array.from(document.querySelectorAll('[data-post-line]'))) {
        if ((row as HTMLElement).dataset.state === 'typing') w.__sawTypingPostLine = true
      }
    }
    new MutationObserver(record).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // The static variant ran and completed — no typing cadence was ever observed.
  expect(await page.evaluate(() => (window as { __sawTypingPostLine?: boolean }).__sawTypingPostLine)).toBe(false)
  const milestones = await timeline(page)
  const names = milestones.map((m) => m.name)
  expect(names).toContain('post-complete')
  const start = milestones.find((m) => m.name === 'boot-start')!
  const post = milestones.find((m) => m.name === 'post-complete')!
  const ready = milestones.find((m) => m.name === 'desktop-ready')!
  expect(start.order).toBeLessThan(post.order)
  expect(post.order).toBeLessThan(ready.order)
  expect(ready.t - start.t).toBeLessThanOrEqual(2000) // the boot contract holds
})

test('reduced-motion follow OFF: the boot seam demands the console\u2019s motion', async ({
  page,
}) => {
  // DD-2 — AP-4's REDUCED-MOTION FOLLOW switch reaches the boot seam: with
  // the OS asking for reduced motion, a follow=ON console holds still (the
  // 'none' return-visit boot runs NO POST line at all) while a follow=OFF
  // console DEMANDS its motion (the RESUME flash runs). Whether any POST line
  // ever mounted is recorded by a MutationObserver installed pre-app — the
  // RESUME flash is itself ~120ms, so polling its DOM would be a race. (The
  // observer watches `document` — see the note on the static-POST spec.)
  await page.addInitScript(() => {
    const w = window as unknown as { __sawPostLine: boolean }
    w.__sawPostLine = false
    const record = () => {
      if (document.querySelector('[data-post-line]')) w.__sawPostLine = true
    }
    new MutationObserver(record).observe(document, {
      childList: true,
      subtree: true,
    })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.keyboard.press('Space') // through the static POST
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // Throw the console's REDUCED-MOTION FOLLOW switch OFF through the real UI.
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Console Settings' }).click()
  await expect(page.locator('[data-settings-surface]')).toBeVisible({ timeout: 10_000 })
  const follow = page.getByRole('switch', { name: 'Reduced-motion follow' })
  await expect(follow).toHaveAttribute('aria-checked', 'true') // follows by default
  await follow.click()
  await expect(follow).toHaveAttribute('aria-checked', 'false')
  await page.waitForTimeout(700) // the debounced envelope write settles

  await page.reload() // return visit + OS reduced + follow=OFF
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  expect(await page.evaluate(() => (window as { __sawPostLine?: boolean }).__sawPostLine)).toBe(
    true,
  ) // the console demanded its motion: the RESUME line ran

  // Control: follow back ON → the OS ask holds still again (no POST at all).
  await page.evaluate(() => {
    ;(window as unknown as { __sawPostLine: boolean }).__sawPostLine = false
  })
  const restored = page.getByRole('switch', { name: 'Reduced-motion follow' })
  await expect(restored).toBeVisible({ timeout: 10_000 }) // the console window restored
  await restored.click()
  await expect(restored).toHaveAttribute('aria-checked', 'true')
  await page.waitForTimeout(700)

  await page.reload() // return visit + OS reduced + follow=ON
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  expect(await page.evaluate(() => (window as { __sawPostLine?: boolean }).__sawPostLine)).toBe(
    false,
  ) // 'none': the OS ask is honored — no POST line of any kind
})
