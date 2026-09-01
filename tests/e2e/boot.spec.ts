import { expect, test } from '@playwright/test'

/**
 * HE-1 e2e smoke skeleton — boot path against what exists TODAY.
 *
 * Current reality (until UI-2/UI-3 land): `src/main.tsx` is a dev-preview
 * fixture that registers the app manifests, opens the `demo` module window
 * (IM-3 contract proof) and renders the WindowHost (IM-4a). This spec pins
 * exactly that chain: app loads → host mounts → demo window opens → title
 * bar renders. When the real boot sequence replaces the fixture, these
 * assertions keep holding and the file grows the UI-2 gates (boot ≤2s from
 * `window.__BOOT_TIMELINE`, POST lines, return-visit short-circuit).
 *
 * Selectors deliberately ride stable seams (data attributes / ARIA roles the
 * WM ships for accessibility), never CSS pixel details.
 */

test('app loads → window host mounts → demo module window opens with title bar', async ({
  page,
}) => {
  await page.goto('/')

  // IM-4a: the open-windows host is mounted.
  const host = page.locator('[data-wm-host]')
  await expect(host).toBeAttached()

  // IM-3 via the main.tsx fixture: exactly the demo module window is open,
  // registered through the app registry (title comes from the manifest name).
  const demoWindow = host.locator('.wm-window[data-app-id="demo"]')
  await expect(demoWindow).toHaveCount(1)
  await expect(demoWindow).toBeVisible()
  await expect(demoWindow).toHaveAttribute('role', 'dialog')

  // Title bar renders: manifest name + chrome controls (min/max/close).
  const titleBar = demoWindow.locator('.wm-titlebar')
  await expect(titleBar).toBeVisible()
  await expect(titleBar.locator('.wm-title')).toHaveText('Demo Module')
  await expect(titleBar.getByRole('button', { name: 'Minimize' })).toBeVisible()
  await expect(titleBar.getByRole('button', { name: 'Maximize' })).toBeVisible()
  await expect(titleBar.getByRole('button', { name: 'Close' })).toBeVisible()

  // Demo surface mounts through the registry content seam (lazy chunk loads).
  await expect(demoWindow.locator('[data-wm-content] > *')).toBeVisible()
})

test('TH-1 boot-timeline seam exists after load', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-wm-host]')).toBeAttached()

  // `window.__BOOT_TIMELINE` is the TH-1 seam every future boot gate reads
  // (UI-2's ≤2s assertion). The skeleton marks 'app-mounted' at startup;
  // poll for it because the mark lands right after the first render commits.
  await expect
    .poll(async () => page.evaluate(() => window.__BOOT_TIMELINE?.length ?? 0))
    .toBeGreaterThan(0)

  const milestones = await page.evaluate(() =>
    (window.__BOOT_TIMELINE ?? []).map((m) => ({ name: m.name, t: m.t, order: m.order })),
  )
  expect(milestones.length).toBeGreaterThan(0)
  expect(milestones.map((m) => m.name)).toContain('app-mounted')
  // Milestones are ordered by call; t is a performance.now() reading.
  for (const m of milestones) {
    expect(m.t).toBeGreaterThanOrEqual(0)
    expect(m.order).toBeGreaterThanOrEqual(0)
  }
})
