import { expect, test } from '@playwright/test'
import { startPreviewServer, type PreviewServer } from './e2e-helpers'

/**
 * CA-1 privacy & hygiene gates — the SHIPPED artifact, served by `vite preview`
 * (e2e-helpers builds first when dist/ is missing or stale), so the policy
 * under test is the strict CSP that index.html ships VERBATIM. The functional
 * suite runs on the dev server, where vite.config.ts swaps in the same policy
 * plus two documented dev-only tokens (script-src 'unsafe-inline' for the
 * react-refresh preamble, ws: for the HMR socket); these gates ride the
 * production preview precisely because it carries no such relaxation.
 *
 * 1. NETWORK AUDIT — one full user session with EVERY request recorded:
 *    first-visit boot (full POST, no skip) → all six apps opened through real
 *    affordances (lazy chunks fetched) → notepad edit+save (FS write path) →
 *    ground context menu (New Drawer) → settings (wallpaper switch + sound
 *    toggle) → the guarded archive reset → reload (return-visit boot path).
 *    Law: only same-origin requests (+ the shipped `data:,` favicon), only
 *    js/css/font/image/document resource types, zero failed requests, zero
 *    console errors/warnings. The full inventory is logged + annotated as
 *    the CA-1 production-log evidence.
 * 2. STORAGE CONTAINMENT — after that same session: no service workers, no
 *    cookies, no CacheStorage, no sessionStorage; localStorage holds exactly
 *    the MF-2 boot flag; IndexedDB holds exactly idb-keyval's database.
 * 3. CSP ENFORCED (not just served) — canaries inside the page: an injected
 *    inline script must NOT run (script-src), an off-origin fetch and image
 *    must be BLOCKED with real securitypolicyviolation events (connect-src,
 *    img-src), and the referrer meta must be no-referrer.
 */

let preview: PreviewServer | null = null

test.beforeAll(async () => {
  // Serial workers (playwright.config.ts) → one preview server for the file.
  preview = await startPreviewServer()
})

test.afterAll(async () => {
  await preview?.close()
  preview = null
})

interface RecordedRequest {
  readonly url: string
  readonly type: string
}

const SHIPPED_FAVICON = 'data:,'
const ALLOWED_TYPES = new Set(['document', 'script', 'stylesheet', 'image', 'font'])

test('network audit: a full session makes ONLY same-origin asset requests', async ({ page }) => {
  const requests: RecordedRequest[] = []
  const failures: string[] = []
  const consoleNoise: string[] = []
  page.on('request', (request) => {
    requests.push({ url: request.url(), type: request.resourceType() })
  })
  page.on('requestfailed', (request) => {
    failures.push(`${request.resourceType()} ${request.url()} ${request.failure()?.errorText}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleNoise.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => consoleNoise.push(`pageerror: ${error.message}`))

  // FIRST VISIT — the full POST boot, nothing skipped.
  await page.goto(preview!.baseUrl)
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // The ground context menu (menu open/select through the platform shell) —
  // while the ground is still bare, before six windows cover it.
  await page.mouse.click(900, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-drawer"]').click()
  await expect(
    page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ }),
  ).toBeVisible()

  // All six shipped apps through the real affordances (the lazy chunks fetch).
  await page.locator('[data-specimen-id="projects"]').dblclick()
  const explorer = page.locator('.wm-window[data-app-id="explorer"]')
  await expect(explorer.locator('[data-explorer-surface]')).toBeVisible({ timeout: 10_000 })
  await explorer.locator('[data-explorer-option="exhibit-01"]').dblclick()
  await expect(page.locator('[data-notepad-textarea]')).toBeVisible({ timeout: 10_000 })
  await explorer.locator('.wm-titlebar').click()
  await explorer.locator('[data-explorer-option="reference-plate"]').dblclick()
  await expect(page.locator('[data-viewer-image]')).toBeVisible({ timeout: 10_000 })
  for (const name of ['Console Settings', 'Nameplate Manifest', 'Field Atlas']) {
    await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
    await page.getByRole('menuitem', { name }).click()
  }
  await expect(page.locator('.wm-window')).toHaveCount(6)

  // A real FS write: edit the specimen, then save it (Ctrl+S — a clean
  // notepad keeps the later archive reset out of the dirty-guard's reach).
  await page.locator('[data-notepad-textarea]').fill('CA-1 network audit entry.')
  await page.keyboard.press('ControlOrMeta+s')

  // Settings: re-open through the drawer (a singleton re-open RAISES it back
  // above the windows opened after it), then wallpaper plate switch + the
  // sound hardware switch, both ways.
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Console Settings' }).click()
  await expect(page.locator('[data-settings-surface]')).toBeVisible()
  await page.locator('[data-settings-plate="survey"]').click()
  await expect(page.locator('[data-wallpaper]')).toHaveAttribute('data-wallpaper', 'survey')
  const sounds = page.getByRole('switch', { name: 'UI sounds' })
  await sounds.click()
  await expect(sounds).toHaveAttribute('aria-checked', 'true')
  await sounds.click()
  await expect(sounds).toHaveAttribute('aria-checked', 'false')

  // The guarded archive reset, end to end (reseed + relit console).
  await page.getByRole('button', { name: 'Lift guard cover' }).click()
  await expect(page.locator('[data-settings-guard]')).toHaveAttribute('data-lifted', 'true')
  await page.getByRole('switch', { name: 'Reseal archive' }).click()
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)
  await expect(page.locator('[data-resealed]')).toBeVisible()

  // Reload — the return-visit boot path (boot-flag short-circuit).
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // ---- The request inventory (the CA-1 production-log evidence) ----
  const origin = new URL(preview!.baseUrl).origin
  const sameOriginOrFavicon = (url: string) => url === SHIPPED_FAVICON || url.startsWith(`${origin}/`)
  const foreign = requests.filter((r) => !sameOriginOrFavicon(r.url))
  const badTypes = requests.filter((r) => !ALLOWED_TYPES.has(r.type))

  const byTypeThenPath = new Map<string, Map<string, number>>()
  for (const r of requests) {
    const path = r.url === SHIPPED_FAVICON ? SHIPPED_FAVICON : new URL(r.url).pathname
    const perType = byTypeThenPath.get(r.type) ?? new Map<string, number>()
    perType.set(path, (perType.get(path) ?? 0) + 1)
    byTypeThenPath.set(r.type, perType)
  }
  const inventory = [...byTypeThenPath.entries()]
    .flatMap(([type, perType]) =>
      [...perType.entries()].map(([path, n]) => `${type} ×${n} ${path}`),
    )
    .sort()
  const summary = `full-session requests: ${requests.length} across ${byTypeThenPath.size} types\n  ${inventory.join('\n  ')}`
  console.log(`[ca-1] ${summary}`)
  test.info().annotations.push({ type: 'ca-1-request-inventory', description: summary })

  // THE LAWS.
  expect(foreign, 'every request must be same-origin (or the shipped data:, favicon)').toEqual([])
  expect(badTypes, 'only document/script/stylesheet/image/font resource types').toEqual([])
  expect(failures, 'no failed/blocked requests').toEqual([])
  expect(consoleNoise, 'zero console warnings/errors/pageerrors across the session').toEqual([])

  // ---- Storage containment, on this same lived-in session ----
  const containment = await page.evaluate(async () => {
    const sw = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : []
    const cacheKeys = 'caches' in window ? await caches.keys() : []
    return {
      swCount: sw.length,
      cookie: document.cookie,
      cacheKeys,
      sessionKeys: Object.keys(sessionStorage).sort(),
      localKeys: Object.keys(localStorage).sort(),
      idbNames: ((await indexedDB.databases()) ?? []).map((d) => d.name).sort(),
    }
  })
  const containmentSummary = JSON.stringify(containment)
  console.log(`[ca-1] containment: ${containmentSummary}`)
  test.info().annotations.push({
    type: 'ca-1-storage-containment',
    description: containmentSummary,
  })
  expect(containment.swCount, 'no service workers registered').toBe(0)
  expect(containment.cookie, 'no cookies written').toBe('')
  expect(containment.cacheKeys, 'no CacheStorage entries').toEqual([])
  expect(containment.sessionKeys, 'no sessionStorage').toEqual([])
  expect(containment.localKeys, 'localStorage = exactly the MF-2 boot flag').toEqual(['ds:boot'])
  expect(
    containment.idbNames,
    'IndexedDB = exactly the MF-2 state envelope (desktop-sim/state via idb-keyval)',
  ).toEqual(['desktop-sim'])
})

test('CSP: the strict policy is served AND enforced (canaries are blocked)', async ({ page }) => {
  await page.goto(preview!.baseUrl)
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  // SERVED: the shipped meta carries the strict directives, verbatim.
  const served = await page.evaluate(() => ({
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute(
      'content',
    ),
    referrer: document.querySelector('meta[name="referrer"]')?.getAttribute('content'),
    unsafeInlineScript: document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content')
      ?.includes("script-src 'self'"),
  }))
  expect(served.csp).toContain("default-src 'self'")
  expect(served.csp).toContain("script-src 'self'")
  expect(served.csp).toContain("connect-src 'self'")
  expect(served.csp).toContain("frame-src 'none'")
  expect(served.csp).toContain("base-uri 'none'")
  expect(served.csp).toContain("form-action 'none'")
  expect(served.referrer).toBe('no-referrer')

  // ENFORCED: what the browser actually did to three canaries. The lazy app
  // chunks loading in the audit test above already proves same-origin
  // scripts/styles/fonts/images are ALLOWED; these prove the denials bite.
  const canaries = await page.evaluate(async () => {
    const violations: { directive: string; blocked: string }[] = []
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI })
    })

    // 1. Inline script injection (the XSS shape) — must not execute.
    const script = document.createElement('script')
    script.textContent = 'window.__ca1Canary = "ran"'
    document.head.appendChild(script)
    await new Promise((resolve) => setTimeout(resolve, 50))

    // 2. Off-origin connect — must be blocked before any network.
    let fetchError = 'none'
    try {
      await fetch('https://ca1-canary.invalid/beacon', { mode: 'no-cors' })
    } catch (error) {
      fetchError = (error as Error).name
    }

    // 3. Off-origin image — must be blocked before any network.
    const img = document.createElement('img')
    img.src = 'https://ca1-canary.invalid/pixel.gif'
    document.body.appendChild(img)
    await new Promise((resolve) => setTimeout(resolve, 50))

    return {
      violations,
      inlineScriptRan: (window as unknown as Record<string, unknown>).__ca1Canary === 'ran',
      fetchError,
    }
  })
  const canarySummary = JSON.stringify(canaries)
  console.log(`[ca-1] canaries: ${canarySummary}`)
  test.info().annotations.push({ type: 'ca-1-csp-canaries', description: canarySummary })

  expect(canaries.inlineScriptRan, 'inline script must NOT execute').toBe(false)
  expect(canaries.fetchError, 'off-origin fetch must be blocked').toBe('TypeError')
  const directives = canaries.violations.map((v) => v.directive)
  expect(directives, 'a script-src violation must be reported').toContain('script-src-elem')
  expect(directives, 'a connect-src violation must be reported').toContain('connect-src')
  expect(directives, 'an img-src violation must be reported').toContain('img-src')
  expect(
    canaries.violations.every((v) => v.blocked.startsWith('https://ca1-canary.invalid') || v.blocked === 'inline'),
    'only the canaries themselves were blocked',
  ).toBe(true)
})
