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

test('prefers-reduced-motion: static POST state, then the desktop', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  // The final POST state appears at once (no typing animation to reduce away)…
  await expect(page.locator('[data-post-line="archive-integrity"]')).toContainText('SEEDED')

  // …holds ~300ms, then the desktop takes over with the milestone intact.
  await expect(page.locator('[data-desktop-stage]')).toBeVisible()
  expect((await timeline(page)).map((m) => m.name)).toContain('post-complete')
})
