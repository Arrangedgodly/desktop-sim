import { expect, test, type Page } from '@playwright/test'

/**
 * UI-7 e2e — the LIMITED BANDWIDTH CONSOLE (the phone notice card) against
 * the real app graph, at the viewport classes the task names.
 *
 * Gates (docs/ultron/plan.md UI-7 acceptance: "at 390px viewport card
 * replaces desktop; links correct; a11y clean"):
 * 1. Phone portrait (390×844): the notice card IS the page — the desktop
 *    never mounts beneath it (no stage, no icons, no taskbar, no windows, no
 *    POST screen, #root holds exactly one element), no AudioContext is ever
 *    constructed, and no template debris leaks into the served DOM.
 * 2. Smallest phone (320×568 — also the 200%-zoom stress shape): no
 *    horizontal scrollbar, every part of the card reachable by scroll.
 * 3. Landscape phone (740×360): the plate scrolls vertically, never clips
 *    and never scrolls sideways.
 * 4. Desktop (1280×800): the full desktop boots exactly as before.
 * 5. The gate swaps cleanly BOTH ways across the 1024px floor (1023 is a
 *    phone, 1024 is a desktop — the boundary itself, in a real engine).
 *
 * REFINEMENT #1 UNFREEZE: the pack on this repo is FILLED (Graydon Wasil's
 * content/author.json), so the card serves the officer's own name and three
 * brass channel rows as REAL safe anchors — target=_blank +
 * rel=noopener noreferrer, live-asserted here (the placeholder-era honest
 * limit is retired).
 */

/** Patch-count: every AudioContext the page EVER constructs (settings.spec precedent). */
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

async function audioContexts(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __audioContexts?: number }).__audioContexts ?? 0,
  )
}

/** The page must never scroll sideways at any tested viewport. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement
    return { scrollWidth: el.scrollWidth, innerWidth: window.innerWidth }
  })
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
}

/** Nothing of the desktop graph may exist — the notice replaced the page. */
async function expectDesktopAbsent(page: Page): Promise<void> {
  await expect(page.locator('[data-desktop-stage]')).toHaveCount(0)
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(0)
  await expect(page.locator('[data-taskbar]')).toHaveCount(0)
  await expect(page.locator('.wm-window')).toHaveCount(0)
  await expect(page.locator('[data-boot-screen]')).toHaveCount(0)
  await expect(page.locator('[data-docent]')).toHaveCount(0)
  // …and #root holds exactly the one card element (nothing mounted beneath).
  const rootChildren = await page.evaluate(() => document.getElementById('root')?.childElementCount)
  expect(rootChildren).toBe(1)
}

test('phone portrait 390×844: the notice card replaces the desktop, nothing mounts beneath', async ({
  page,
}) => {
  await patchAudioContextCount(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  // The card is the page: title, POST-style well, the officer's own record,
  // brass channel rows (the filled pack — refinement #1).
  const card = page.locator('[data-notice-card]')
  await expect(card).toBeVisible()
  await expect(page.locator('h1[data-notice-title]')).toHaveText('Limited Bandwidth Console')
  await expect(page.locator('[data-notice-status]')).toContainText('BANDWIDTH CHECK')
  await expect(page.locator('[data-notice-status]')).toContainText('LIMITED')
  await expect(page.locator('[data-notice-message]')).toContainText(
    'This console requires a larger viewport',
  )
  await expect(page.locator('[data-notice-name]')).toHaveText('Graydon Wasil')
  await expect(page.locator('[data-notice-awaiting]')).toHaveCount(0)

  // The three channels are real safe anchors with verbatim hosts.
  const links = page.locator('[data-notice-link]')
  await expect(links).toHaveCount(3)
  await expect(links.nth(0)).toHaveAttribute('href', 'mailto:hello@graydonwasil.com')
  await expect(links.nth(1)).toHaveAttribute('href', 'https://graydonwasil.com')
  await expect(links.nth(2)).toHaveAttribute('href', 'https://github.com/arrangedgodly')
  for (let i = 0; i < 3; i += 1) {
    await expect(links.nth(i)).toHaveAttribute('target', '_blank')
    await expect(links.nth(i)).toHaveAttribute('rel', 'noopener noreferrer')
  }
  await expect(page.locator('[data-notice-domain]')).toHaveText([
    'hello@graydonwasil.com',
    'graydonwasil.com',
    'github.com',
  ])

  // Filled honesty: no fill-in-form debris anywhere.
  const debris = await page.evaluate(() => {
    const text = document.documentElement.innerText
    return {
      markers: text.includes('REPLACE VIA CONTENT PACK'),
      brackets: text.includes('[YOUR') || text.includes('[BIO'),
    }
  })
  expect(debris.markers).toBe(false)
  expect(debris.brackets).toBe(false)

  // The desktop graph never mounted — and no audio context was ever built.
  await expectDesktopAbsent(page)
  expect(await audioContexts(page)).toBe(0)

  // Page semantics + portrait floor: one h1, no sideways scroll.
  await expect(page.locator('h1')).toHaveCount(1)
  await expectNoHorizontalScroll(page)
})

test('smallest phone 320×568 (the 200%-zoom stress shape): no horizontal scroll, all reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')

  await expect(page.locator('[data-notice-card]')).toBeVisible()
  await expect(page.locator('[data-notice-message]')).toBeVisible()
  await expectNoHorizontalScroll(page)

  // The foot of the card is reachable by scroll (wrapping, not clipping).
  await page.locator('[data-notice-colophon]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-notice-colophon]')).toBeVisible()
  await expect(page.locator('[data-notice-colophon]')).toContainText('HOLD/OS 0.1.0')
})

test('landscape phone 740×360: the plate scrolls vertically, never sideways', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 })
  await page.goto('/')

  await expect(page.locator('[data-notice-card]')).toBeVisible()
  await expectNoHorizontalScroll(page)

  // A 360px-tall viewport must still reach every part of the card.
  await page.locator('[data-notice-colophon]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-notice-colophon]')).toBeVisible()
  await expect(page.locator('h1[data-notice-title]')).toBeVisible()
})

test('desktop 1280×800: the full desktop boots unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  // Skip the POST and land on the desktop, exactly as before UI-7.
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)
  await expect(page.locator('[data-taskbar]')).toBeVisible()
  await expect(page.locator('[data-timecode]')).toBeVisible()
  await expect(page.locator('[data-notice-card]')).toHaveCount(0)
})

test('the gate swaps cleanly both ways across the 1024px floor', async ({ page }) => {
  await patchAudioContextCount(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)

  // Cross DOWN to 1023 — the notice takes over, the desktop unmounts entirely.
  await page.setViewportSize({ width: 1023, height: 768 })
  await expect(page.locator('[data-notice-card]')).toBeVisible()
  await expectDesktopAbsent(page)
  expect(await audioContexts(page)).toBe(0)

  // Cross back UP to 1024 — the desktop boots again (a return visit: the
  // boot flag already wrote, so the POST short-circuits on its own).
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.icon-field [data-specimen-id]')).toHaveCount(5)
  await expect(page.locator('[data-taskbar]')).toBeVisible()
  await expect(page.locator('[data-notice-card]')).toHaveCount(0)
})
