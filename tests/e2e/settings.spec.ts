import { expect, test, type Page } from '@playwright/test'

/**
 * AP-4 e2e — the Console Settings against the real app graph (boot, real
 * IndexedDB persistence, real stores; fresh context per test = a genuine
 * first visit).
 *
 * Gates (docs/ultron/plan.md AP-4 acceptance — "each setting applies live +
 * persists; reset reseeds cleanly"):
 * 1. The module drawer lists Console Settings; opening it mounts the console
 *    panel, and the SINGLETON rule holds — re-opening raises the one window.
 * 2. Switching the wallpaper plate IN THE PANEL changes the desktop's
 *    data-wallpaper live and survives a reload (UI-4's store seam, now with
 *    a real UI on it; desktop.spec drives the store module directly).
 * 3. The UI SOUNDS hardware switch persists (ships muted; UI-6 wires the
 *    playback itself).
 * 4. The guarded reset: the oxide cover hides a disabled switch; lifting it
 *    arms the switch + names consequences; throwing reseeds the desktop LIVE
 *    (a created test specimen vanishes), closes every window but the relit
 *    console carrying ARCHIVE RESEALED, and the reseed survives a reload.
 *
 * Selectors ride stable seams (data-* attributes / accessible names).
 */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

// UI-6 spec helper bookkeeping: the patched-constructor counter (see
// patchAudioContextCount below) lives on the page's window.
declare global {
  interface Window {
    __audioContexts?: number
  }
}

/** Launch Console Settings from the module drawer (the honest affordance). */
async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Console Settings' }).click()
  await expect(page.locator('.wm-window[data-app-id="settings"]')).toBeVisible()
}

/** The desktop's icon count — the reseed assertion reads it before + after. */
async function iconCount(page: Page): Promise<number> {
  return page.locator('.icon-field [data-specimen-id]').count()
}

test('the drawer launches the console; the singleton rule holds', async ({ page }) => {
  await toDesktop(page)
  await openSettings(page)

  const consoleWindow = page.locator('.wm-window[data-app-id="settings"]')
  await expect(consoleWindow).toHaveCount(1)
  await expect(page.locator('[data-settings-surface]')).toBeVisible()

  // A second launch raises + focuses THE window — never a second console.
  await openSettings(page)
  await expect(consoleWindow).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Console Settings, focused' })).toBeVisible()
})

test('switching the wallpaper plate in the panel changes the desktop live and persists', async ({
  page,
}) => {
  await toDesktop(page)
  await openSettings(page)

  // The live plate wears the mounted indicator; the default is the star chart.
  const plateLayer = page.locator('[data-wallpaper]')
  await expect(plateLayer).toHaveAttribute('data-wallpaper', 'star-chart')
  await expect(page.locator('[data-settings-plate="star-chart"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.locator('.settings-plate-flag')).toHaveText('MOUNTED')

  // Select the survey measuring sheet IN THE PANEL — the desktop follows live.
  await page.locator('[data-settings-plate="survey"]').click()
  await expect(plateLayer).toHaveAttribute('data-wallpaper', 'survey')
  await expect(page.locator('.wallpaper-layer svg')).toHaveCount(1)
  await expect(page.locator('[data-settings-plate="survey"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.locator('[data-settings-plate="star-chart"]')).toHaveAttribute(
    'aria-checked',
    'false',
  )

  // The archive remembers: the debounced autosave flushes, then a reload
  // comes back on the SAME plate — console window and all (MF-2 restores it).
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(plateLayer).toHaveAttribute('data-wallpaper', 'survey')
  await expect(page.locator('[data-settings-surface]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-settings-plate="survey"]')).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('the UI sounds switch throws and persists', async ({ page }) => {
  await toDesktop(page)
  await openSettings(page)

  const sounds = page.getByRole('switch', { name: 'UI sounds' })
  await expect(sounds).toHaveAttribute('aria-checked', 'false') // ships muted
  await sounds.click()
  await expect(sounds).toHaveAttribute('aria-checked', 'true')

  // Space throws it back for a beat (the hardware keyboard path), then on.
  await sounds.focus()
  await page.keyboard.press('Space')
  await expect(sounds).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Space')
  await expect(sounds).toHaveAttribute('aria-checked', 'true')

  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-settings-surface]')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('switch', { name: 'UI sounds' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('the guarded reset reseeds the desktop live and the reseed survives reload', async ({
  page,
}) => {
  await toDesktop(page)

  // A created test specimen — the thing the reset must destroy.
  await page.mouse.click(900, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-drawer"]').click()
  const created = page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })
  await expect(created).toBeVisible()
  const beforeReset = await iconCount(page)
  expect(beforeReset).toBe(6)

  await openSettings(page)

  // Under the oxide cover the reset switch is DEAD.
  const resetSwitch = page.getByRole('switch', { name: 'Reseal archive' })
  await expect(resetSwitch).toBeDisabled()
  await expect(page.locator('[data-reset-strip]')).toHaveCount(0)

  // Lift the guard: the confirm strip names the consequences, the switch arms.
  await page.getByRole('button', { name: 'Lift guard cover' }).click()
  await expect(page.locator('[data-settings-guard]')).toHaveAttribute('data-lifted', 'true')
  const strip = page.locator('[data-reset-strip]')
  await expect(strip).toBeVisible()
  await expect(strip).toContainText('reseeds the catalog')
  await expect(strip).toContainText('reset on reload')
  await expect(resetSwitch).toBeEnabled()

  // THROW. The specimen vanishes live, every window closes but the relit
  // console, and the ARCHIVE RESEALED report renders in-world.
  await resetSwitch.click()
  await expect(created).toHaveCount(0)
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)
  await expect(page.locator('.wm-window')).toHaveCount(1)
  await expect(page.locator('.wm-window[data-app-id="settings"]')).toHaveCount(1)
  const report = page.locator('[data-resealed]')
  await expect(report).toBeVisible()
  await expect(report).toContainText('Archive resealed')

  // The archive remembers the reseed: reload, and the specimen stays gone
  // (the wallpaper reseeded to its default with everything else).
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)
  await expect(page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })).toHaveCount(0)
  await expect(page.locator('[data-wallpaper]')).toHaveAttribute('data-wallpaper', 'star-chart')
})

/*
 * UI-6 audio gates — the autoplay/mute laws against the REAL app graph.
 *
 * Context creation is counted by PATCHING the AudioContext constructor via an
 * init script (independent of engine bookkeeping); cue firing is read from the
 * engine's own `audioStats()` through a page-context dynamic import of the
 * engine module (the desktop.spec settings-store precedent — the same module
 * instance the app graph holds, no test-only setter in the bundle).
 */

/** Patch-count: every AudioContext the page EVER constructs. */
async function patchAudioContextCount(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Original = window.AudioContext
    window.__audioContexts = 0
    window.AudioContext = class extends Original {
      constructor() {
        super()
        window.__audioContexts = (window.__audioContexts ?? 0) + 1
      }
    }
  })
}

/** The live patch count (0 when the engine never built a context). */
async function audioContexts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __audioContexts?: number }).__audioContexts ?? 0)
}

/** Shape asserted instead of importing the module into the spec's graph. */
interface AudioStatsView {
  contextsCreated: number
  cuesPlayed: number
  cuesDropped: number
  lastCue: string | null
}

/** Engine observability through the SAME module instance the app holds. */
async function audioStats(page: Page): Promise<AudioStatsView> {
  return page.evaluate(async () => {
    const url = '/src/lib/audio/engine.ts'
    const module = (await import(url)) as { audioStats: () => AudioStatsView }
    return module.audioStats()
  })
}

test('sounds off by default: a full session of gestures makes ZERO AudioContexts', async ({
  page,
}) => {
  await patchAudioContextCount(page)
  const consoleNoise: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') consoleNoise.push(message.text())
  })

  await toDesktop(page) // boot + a keypress (a real gesture) + desktop-ready
  await openSettings(page) // window-open cue ATTEMPT (muted → no-op)

  // A context menu with a real selection (menu-open / menu-select attempts).
  await page.mouse.click(900, 420, { button: 'right' })
  await page.locator('[data-menu-item="new-drawer"]').click()
  await expect(page.getByRole('button', { name: /^New Drawer, DRW-\d{4}, drawer$/ })).toBeVisible()

  // A second window, then both close (window-open / window-close attempts).
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Specimen Notepad' }).click()
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepad).toBeVisible()
  await notepad.getByRole('button', { name: 'Close' }).click()
  await expect(notepad).toHaveCount(0)

  // MUTE LAW: no AudioContext was ever constructed — not at load, not on any
  // gesture — and the engine never played (or attempted) a single cue.
  await expect.poll(() => audioContexts(page)).toBe(0)
  const stats = await audioStats(page)
  expect(stats.contextsCreated).toBe(0)
  expect(stats.cuesPlayed).toBe(0)

  // AUTOPLAY LAW: nothing in the console smells of blocked audio.
  expect(consoleNoise.filter((text) => /audio|autoplay|user gesture/i.test(text))).toEqual([])
})

test('sounds armed through the switch: ONE shared AudioContext, cues fire on the seams', async ({
  page,
}) => {
  await patchAudioContextCount(page)

  await toDesktop(page)
  await openSettings(page)

  // Arm the console with the real hardware switch — a genuine click.
  const sounds = page.getByRole('switch', { name: 'UI sounds' })
  await expect(sounds).toHaveAttribute('aria-checked', 'false') // still ships muted
  await sounds.click()
  await expect(sounds).toHaveAttribute('aria-checked', 'true')

  // The arming click is the FIRST enabled gesture: it builds the one context.
  await expect.poll(() => audioContexts(page)).toBe(1)
  let stats = await audioStats(page)
  expect(stats.contextsCreated).toBe(1)
  expect(stats.lastCue).toBe('toggle')

  // A real window open (module drawer → notepad) rides the WM seam.
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name: 'Specimen Notepad' }).click()
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepad).toBeVisible()
  stats = await audioStats(page)
  expect(stats.lastCue).toBe('window-open')

  // Close it — the lower close blip, still through the SAME context.
  await notepad.getByRole('button', { name: 'Close' }).click()
  await expect(notepad).toHaveCount(0)
  stats = await audioStats(page)
  expect(stats.lastCue).toBe('window-close')
  expect(stats.cuesPlayed).toBeGreaterThanOrEqual(3) // toggle + open + close

  // Exactly one AudioContext for the whole armed session (patch-count + the
  // engine's own bookkeeping agree).
  expect(await audioContexts(page)).toBe(1)
  expect(stats.contextsCreated).toBe(1)
})
