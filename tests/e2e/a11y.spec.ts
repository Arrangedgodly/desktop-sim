import { expect, test, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { registerDemoModule } from './e2e-helpers'

/**
 * DD-2 e2e — the accessibility audit, automated half. Two families:
 *
 * 1. AXE SURFACES — axe-core 4.x (devDep; `axe.source` injected into the page
 *    via addScriptTag — the DEV server's relaxed CSP carries the
 *    'unsafe-inline' token CA-1 documented for react-refresh, which is what
 *    makes script injection possible; the shipped strict CSP never sees this)
 *    over every surface of the world: boot POST, desktop, explorer, notepad
 *    clean + dirty-guard-open, viewer, settings with the guard seated AND
 *    armed, atlas index + plate page, nameplate manifest, the 390px notice
 *    card, an open ground context menu, and the injected MODULE FAULT card.
 *    GATE: zero critical/serious violations per surface. Every
 *    moderate/minor finding is logged to stdout (`[axe] …` lines) and each
 *    disposition is recorded in docs/ultron/production-log.md (DD-2 entry).
 *
 * 2. MANUAL-CHECKLIST GATES — the durable parts of the DD-2 manual
 *    checklist, expressed as e2e: focus-visible rings on every interactive
 *    family, focus traps (guard strip + menu), reduced-motion coverage of
 *    every authored motion moment (the global kill-switch, computed-style
 *    asserted), 200% zoom operability on desktop + notice, and a
 *    screen-reader smoke expressed as DOM/ARIA assertions (roles, names,
 *    idref resolution — the honest headless proxy for what an AT would
 *    announce; method documented in the production log).
 *
 * Selectors ride stable seams (data-* attributes / roles / accessible names).
 */

/* --------------------------------------------------------------------------
 * Axe plumbing
 * ------------------------------------------------------------------------ */

interface ViolationView {
  readonly id: string
  readonly impact: string | null
  readonly help: string
  readonly nodes: number
  readonly targets: readonly string[]
}

declare global {
  interface Window {
    /** Injected by this spec (dev-server pages only — never shipped). */
    axe?: {
      run: (
        context: Document | undefined,
        options: { resultTypes: string[] },
      ) => Promise<{
        violations: {
          id: string
          impact: string | null
          help: string
          nodes: { target: unknown[] }[]
        }[]
      }>
    }
  }
}

const axeInjected = new WeakSet<Page>()

/**
 * axe-core's browser build (the full script source string), read through
 * Node's require — the cleanest interop with axe-core's `export =` shape
 * under Playwright's esbuild transform.
 */
const axeSource: string = createRequire(import.meta.url)('axe-core').source as string

/** Run axe over the whole document; violations only (passes trimmed away). */
async function axeViolations(page: Page): Promise<readonly ViolationView[]> {
  if (!axeInjected.has(page)) {
    await page.addScriptTag({ content: axeSource })
    axeInjected.add(page)
  }
  return page.evaluate(async () => {
    const results = await window.axe!.run(document, { resultTypes: ['violations'] })
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 3).map((node) => JSON.stringify(node.target)),
    }))
  })
}

/**
 * Boot-screen variant: the POST tableau is TRANSIENT (~1.3s under the typed
 * cadence), so axe is installed as an init script (CDP-injected pre-app —
 * ready the moment the document exists, and never subject to page CSP) and
 * the scan runs against the first typed frame. Freezing the clock does not
 * work here — axe's own scheduler rides page timers.
 */
async function bootAxeViolations(page: Page): Promise<readonly ViolationView[]> {
  await page.addInitScript({ content: axeSource })
  await page.goto('/')
  await expect(page.locator('[data-post-well]')).toBeVisible()
  return page.evaluate(async () => {
    const results = await window.axe!.run(document, { resultTypes: ['violations'] })
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 3).map((node) => JSON.stringify(node.target)),
    }))
  })
}

/**
 * The DD-2 gate: zero critical/serious findings on the surface; every other
 * finding logged for the production log's before→after table.
 */
function gate(surface: string, violations: readonly ViolationView[]): void {
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const recorded = violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical')
  // The audit record — the [axe] lines are harvested into the production log.
  console.log(
    `[axe] ${surface}: blocking=${blocking.length} recorded=[${recorded
      .map((v) => `${v.id}/${v.impact}x${v.nodes}`)
      .join(', ')}]`,
  )
  expect(
    blocking.map((v) => `${v.id} (${v.help}) x${v.nodes} -> ${v.targets.join(' ')}`),
    `${surface}: axe critical/serious findings`,
  ).toEqual([])
}

/* --------------------------------------------------------------------------
 * Navigation helpers (the honest affordances, same as the fleet's specs)
 * ------------------------------------------------------------------------ */

/** Skip the POST (any key) and wait out the desktop hand-off. */
async function toDesktop(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
}

/** Launch a module from the taskbar drawer. */
async function launchModule(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Module drawer — launch a module' }).click()
  await page.getByRole('menuitem', { name }).click()
}

/** Open Console Settings from the drawer and wait for the panel mount. */
async function openSettings(page: Page): Promise<void> {
  await launchModule(page, 'Console Settings')
  await expect(page.locator('[data-settings-surface]')).toBeVisible({ timeout: 10_000 })
}

/* --------------------------------------------------------------------------
 * 1 — Axe surfaces
 * ------------------------------------------------------------------------ */

test('axe: boot screen (POST tableau)', async ({ page }) => {
  gate('boot', await bootAxeViolations(page))
})

test('axe: desktop surface (first visit — docent, icons, taskbar)', async ({ page }) => {
  await toDesktop(page)
  await expect(page.locator('[data-docent]')).not.toHaveCount(0) // first-visit hints are in the scan
  gate('desktop', await axeViolations(page))
})

test('axe: explorer (drawer catalog)', async ({ page }) => {
  await toDesktop(page)
  await page.locator('[data-specimen-id="projects"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
  gate('explorer', await axeViolations(page))
})

test('axe: notepad — clean sheet', async ({ page }) => {
  await toDesktop(page)
  await page.locator('[data-specimen-id="charter"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toBeVisible()
  gate('notepad-clean', await axeViolations(page))
})

test('axe: notepad — dirty close guard open', async ({ page }) => {
  await toDesktop(page)
  await page.locator('[data-specimen-id="charter"]').dblclick()
  const sheet = page.locator('[data-notepad-textarea]')
  await sheet.fill(`${await sheet.inputValue()}\nAUDIT ENTRY — guard open.`)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-notepad-strip]')).toBeVisible()
  gate('notepad-guard', await axeViolations(page))
})

test('axe: plate viewer (matted specimen)', async ({ page }) => {
  await toDesktop(page)
  await page.locator('[data-specimen-id="projects"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="explorer"]')).toBeVisible()
  await page.locator('[data-explorer-option="reference-plate"]').dblclick()
  await expect(page.locator('.wm-window[data-app-id="image-viewer"]')).toBeVisible()
  gate('viewer', await axeViolations(page))
})

test('axe: settings console — guard seated', async ({ page }) => {
  await toDesktop(page)
  await openSettings(page)
  gate('settings-seated', await axeViolations(page))
})

test('axe: settings console — guard armed (cover lifted, confirm strip)', async ({ page }) => {
  await toDesktop(page)
  await openSettings(page)
  await page.getByRole('button', { name: 'Lift guard cover' }).click()
  await expect(page.locator('[data-reset-strip]')).toBeVisible()
  gate('settings-armed', await axeViolations(page))
})

test('axe: field atlas — index ledger', async ({ page }) => {
  await toDesktop(page)
  await launchModule(page, 'Field Atlas')
  await expect(page.locator('[data-browser-card]').first()).toBeVisible()
  gate('atlas-index', await axeViolations(page))
})

test('axe: field atlas — plate page', async ({ page }) => {
  await toDesktop(page)
  await launchModule(page, 'Field Atlas')
  await page.locator('[data-browser-card]').first().click()
  await expect(page.locator('[data-browser-readout]')).toBeVisible()
  gate('atlas-plate', await axeViolations(page))
})

test('axe: nameplate manifest (about)', async ({ page }) => {
  await toDesktop(page)
  await launchModule(page, 'Nameplate Manifest')
  await expect(page.locator('.wm-window[data-app-id="about"]')).toBeVisible()
  gate('about', await axeViolations(page))
})

test.describe('axe: notice card (390px phone viewport)', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('scan', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-notice-title]')).toBeVisible()
    gate('notice-390', await axeViolations(page))
  })
})

test('axe: ground context menu open (incl. the destructive confirm row)', async ({ page }) => {
  await toDesktop(page)
  await page.mouse.click(900, 420, { button: 'right' })
  const menu = page.locator('[role="menu"][aria-label="Hold menu"]')
  await expect(menu).toBeVisible()
  gate('context-menu', await axeViolations(page))

  // The two-step DELETE confirm row — the destructive oxide surface is the
  // scan's real subject (light parchment ink on the deep oxide).
  await page.locator('[data-specimen-id="charter"]').click({ button: 'right' })
  await page.locator('[data-menu-item="delete"]').click()
  await expect(page.locator('[data-menu-confirm]')).toBeVisible()
  gate('context-menu-confirm', await axeViolations(page))
})

test('axe: module fault card (injected render fault)', async ({ page }) => {
  await page.goto('/?injectFaults=1')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await page.waitForFunction(() => window.__holdFaults !== undefined)
  await registerDemoModule(page)
  await page.evaluate(() => window.__holdFaults?.arm('demo', 'render'))
  await launchModule(page, 'Demo Module')
  await expect(page.locator('[data-module-fault]')).toBeVisible()
  gate('module-fault', await axeViolations(page))
})

/* --------------------------------------------------------------------------
 * 2 — Manual-checklist gates
 * ------------------------------------------------------------------------ */

/** Computed focus ring of the active element (the :focus-visible beam). */
function ringOf(page: Page): Promise<{ style: string; width: number; where: string }> {
  return page.evaluate(() => {
    const el = document.activeElement
    const describe = (node: Element | null): string =>
      node ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${(node as HTMLElement).className?.split?.(' ')[0] ?? ''}` : 'none'
    if (!el) return { style: 'none', width: 0, where: 'no-active-element' }
    const cs = getComputedStyle(el)
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) || 0, where: describe(el) }
  })
}

/** Keyboard-driven focus must light the in-world beam (≥2px solid ring). */
async function expectVisibleBeam(page: Page, where: string): Promise<void> {
  const ring = await ringOf(page)
  expect(ring.style, `${where}: focus-visible outline style (${ring.where})`).toBe('solid')
  expect(ring.width, `${where}: focus-visible outline width (${ring.where})`).toBeGreaterThanOrEqual(2)
}

/** Press Tab until the selector owns the active element (bounded). */
async function tabUntilFocused(page: Page, selector: string, maxPresses = 15): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    const focused = await page.evaluate(
      (sel) => document.querySelector(sel) === document.activeElement,
      selector,
    )
    if (focused) return
    await page.keyboard.press('Tab')
  }
  await expect(page.locator(selector), `${selector} reachable by Tab`).toBeFocused()
}

test('checklist: keyboard focus draws the visible ring on every interactive family', async ({
  page,
}) => {
  await toDesktop(page)
  // One dismiss press sees the whole docent off (UI-3's persisted
  // docentDismissed covers every card) — the steady-state desktop.
  await page.locator('[data-docent] button').first().click()
  await expect(page.locator('[data-docent]')).toHaveCount(0)

  // 1. The specimen field (the ground) — the desktop's first tab stop.
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-icon-field]')).toBeFocused()
  await expectVisibleBeam(page, 'icon field (ground)')

  // 2. A specimen icon — arrows move selection AND focus (DD-1).
  await page.keyboard.press('ArrowRight')
  expect(
    await page.evaluate(() => document.activeElement?.matches('[data-specimen-id]') === true),
    'an arrow from the ground walks onto a specimen icon',
  ).toBe(true)
  await expectVisibleBeam(page, 'specimen icon')

  // 3. A taskbar LED — F6 zone ring to the rail, arrows walk to the LED.
  await launchModule(page, 'Specimen Notepad') // mouse launch; the window takes focus
  await expect(page.locator('.wm-window[data-app-id="notepad"]')).toBeVisible()
  await page.keyboard.press('F6') // window -> desktop
  await page.keyboard.press('F6') // desktop -> taskbar (the pull is the stop)
  await expect(page.locator('[data-launcher-pull]')).toBeFocused()
  await expectVisibleBeam(page, 'taskbar drawer pull')
  await page.keyboard.press('ArrowRight') // pull -> first LED
  await expect(page.locator('.tb-led').first()).toBeFocused()
  await expectVisibleBeam(page, 'taskbar LED')

  // 4. A settings plate swatch (radiogroup row) + the oxide guard cover.
  await page.keyboard.press('Escape') // leave the rail's roving stop
  await openSettings(page)
  await tabUntilFocused(page, '[data-settings-plate="star-chart"]')
  await expect(page.locator('[data-settings-plate="star-chart"]')).toBeFocused()
  await expectVisibleBeam(page, 'settings plate swatch row')
  await tabUntilFocused(page, '[data-guard-cover]')
  await expect(page.locator('[data-guard-cover]')).toBeFocused()
  await expectVisibleBeam(page, 'settings guard cover')
})

test('checklist: focus traps hold — the dirty guard strip and the ground menu', async ({ page }) => {
  await toDesktop(page)

  /** Is the active element inside the container at this instant? */
  const focusInside = (selector: string): Promise<boolean> =>
    page.evaluate((sel) => {
      const container = document.querySelector(sel)
      return container !== null && container.contains(document.activeElement)
    }, selector)

  // The notepad's alertdialog strip: Tab/Shift+Tab never leave the strip.
  await page.locator('[data-specimen-id="charter"]').dblclick()
  const notepadWindow = page.locator('.wm-window[data-app-id="notepad"]')
  const sheet = page.locator('[data-notepad-textarea]')
  await sheet.fill(`${await sheet.inputValue()}\nTRAP PROBE.`)
  await page.keyboard.press('Escape')
  const strip = page.locator('[data-notepad-strip]')
  await expect(strip).toBeVisible()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    expect(await focusInside('[data-notepad-strip]'), `guard strip holds focus (Tab x${i + 1})`).toBe(
      true,
    )
  }
  await page.keyboard.press('Shift+Tab')
  expect(await focusInside('[data-notepad-strip]')).toBe(true)

  // The ground context menu: Tab walks rows WITHIN the menu (DD-1 law).
  await page.locator('[data-notepad-keep]').click() // withdraw the strip
  await page.keyboard.press('ControlOrMeta+s') // commit the probe — sheet is clean
  await expect(page.locator('.notepad-lamp')).toHaveAttribute('data-lit', 'false')
  await page.keyboard.press('Escape') // clean close
  await expect(notepadWindow).toHaveCount(0)
  await expect(page.locator('[data-icon-field]')).toBeFocused() // ground re-seat
  await page.keyboard.press('ContextMenu') // the ground's own menu key
  const menu = page.locator('[role="menu"][aria-label="Hold menu"]')
  await expect(menu).toBeVisible()
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    expect(await focusInside('[role="menu"]'), `menu holds focus (Tab x${i + 1})`).toBe(true)
  }
  await page.keyboard.press('Escape') // Esc closes; focus returns to the invoker
  await expect(menu).toHaveCount(0)
  await expect(page.locator('[data-icon-field]')).toBeFocused()
})

/* -- reduced-motion coverage ------------------------------------------------ */

/**
 * Computed animation + transition durations (seconds) of a selector, with an
 * optional pseudo-element. -1 = selector not found (asserted separately by
 * the callers' visibility gates).
 */
function computedMotion(
  page: Page,
  selector: string,
  pseudo: '' | '::after' = '',
): Promise<{ animation: number; transition: number }> {
  return page.evaluate(
    ({ selector, pseudo }) => {
      const el = document.querySelector(selector)
      if (!el) return { animation: -1, transition: -1 }
      const cs = getComputedStyle(el, pseudo || undefined)
      return {
        animation: parseFloat(cs.animationDuration) || 0,
        transition: parseFloat(cs.transitionDuration) || 0,
      }
    },
    { selector, pseudo },
  )
}

test('checklist: reduced motion collapses every authored motion moment', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })

  // Boot POST caret blink — collapsed to effectively-none by the global floor.
  await page.goto('/')
  await expect(page.locator('.post-caret').first()).toBeVisible()
  expect((await computedMotion(page, '.post-caret')).animation).toBeLessThanOrEqual(0.001)

  // Settings guard rail slide — the transition collapses.
  await page.keyboard.press('Space')
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })
  await openSettings(page)
  expect((await computedMotion(page, '.settings-guard-cover')).transition).toBeLessThanOrEqual(0.001)

  // About commissioning stamp — the module's one authored moment collapses.
  await launchModule(page, 'Nameplate Manifest')
  await expect(page.locator('.wm-window[data-app-id="about"] [data-about-stamp]')).toBeVisible()
  expect((await computedMotion(page, '[data-about-stamp]')).animation).toBeLessThanOrEqual(0.001)

  // Atlas plate page settle — collapses.
  await launchModule(page, 'Field Atlas')
  await page.locator('[data-browser-card]').first().click()
  await expect(page.locator('[data-browser-readout]')).toBeVisible()
  expect((await computedMotion(page, '.browser-page-turn')).animation).toBeLessThanOrEqual(0.001)

  // Icon drag phosphor trail + window drag shimmer — the pseudo-element
  // animations collapse while the gesture is armed.
  const charter = page.locator('[data-specimen-id="charter"]')
  const charterBox = await charter.boundingBox()
  if (!charterBox) throw new Error('charter icon not visible')
  await page.mouse.move(charterBox.x + charterBox.width / 2, charterBox.y + charterBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(charterBox.x + 40, charterBox.y + 40)
  expect(
    (await computedMotion(page, "[data-specimen-id='charter']", '::after')).animation,
  ).toBeLessThanOrEqual(0.001)
  await page.mouse.up()

  await launchModule(page, 'Specimen Notepad')
  const notepadWindow = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepadWindow).toBeVisible()
  const titleBox = await notepadWindow.locator('.wm-titlebar').boundingBox()
  if (!titleBox) throw new Error('notepad title bar not visible')
  await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(titleBox.x + 40, titleBox.y + 30)
  expect(
    (await computedMotion(page, '.wm-window[data-app-id="notepad"]', '::after')).animation,
  ).toBeLessThanOrEqual(0.001)
  await page.mouse.up()
})

/* -- 200% zoom sanity -------------------------------------------------------- */

test('checklist: 200% zoom keeps the desktop operable (1024x576 logical)', async ({ page }) => {
  // Browser zoom has no Playwright API; the honest equivalent is a logical
  // viewport at half the design surface. The phone gate owns every logical
  // width below 1024 (UI-7 — a 200%-zoomed small window is SUPPOSED to
  // become the notice card), so 1024x576 is the smallest — the most
  // zoom-stressed — desktop shape the OS will run at.
  await page.setViewportSize({ width: 1024, height: 576 })
  await toDesktop(page)

  // Open the BOUND charter specimen (a launcher notepad would be an untitled
  // draft whose Ctrl+S offers a name instead of committing).
  await page.locator('[data-specimen-id="charter"]').dblclick()
  const notepad = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepad).toBeVisible()
  const sheet = page.locator('[data-notepad-textarea]')
  await sheet.fill('200% ZOOM ENTRY — the console still answers.')
  await expect(sheet).toHaveValue(/200% ZOOM ENTRY/)

  // Close it through the keyboard path — operability, not just layout.
  // (Commit first: a dirty sheet guards the close, by design.)
  await page.keyboard.press('ControlOrMeta+s')
  await page.keyboard.press('Escape')
  await expect(notepad).toHaveCount(0)

  // No horizontal document overflow: the world fits the doubled content size.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('checklist: 200% zoom keeps the notice card readable (195x422 logical)', async ({ page }) => {
  await page.setViewportSize({ width: 195, height: 422 }) // 390x844 at 200%
  await page.goto('/')
  await expect(page.locator('[data-notice-title]')).toBeVisible()

  // The plate fits: no horizontal scrolling, every long string wraps.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  // The placeholder card's honest limit: it carries no external anchors
  // (zero-URL pack) — readability + fit is the operability surface here.
  await expect(page.locator('.notice-plate')).toBeVisible()
})

/* -- screen-reader smoke (DOM/ARIA proxy) ------------------------------------ */

test('screen-reader smoke: the roles and names an AT would announce', async ({ page }) => {
  await toDesktop(page)

  // Boot POST well was a labeled log (checked live in boot.spec; the desktop
  // is this spec's subject). The specimen field names itself.
  const field = page.locator('[data-icon-field]')
  await expect(field).toHaveAttribute('aria-label', 'Specimen field')

  // Specimen icons: buttons with name/accession/kind names.
  const charterIcon = page.locator('[data-specimen-id="charter"]')
  await expect(charterIcon).toHaveAttribute(
    'aria-label',
    'accession-charter.txt, SPC-0008, specimen',
  )

  // Windows: dialog pattern with a resolvable labelledby title.
  await charterIcon.dblclick()
  const notepadWindow = page.locator('.wm-window[data-app-id="notepad"]')
  await expect(notepadWindow).toHaveAttribute('role', 'dialog')
  const labelledBy = await notepadWindow.getAttribute('aria-labelledby')
  expect(labelledBy).toBeTruthy()
  const titleResolved = await page.evaluate((id) => {
    const title = document.getElementById(id ?? '')
    return title !== null && (title.textContent ?? '').trim().length > 0
  }, labelledBy)
  expect(titleResolved).toBe(true)

  // Taskbar: a labeled toolbar whose LEDs name window + state.
  const rail = page.locator('[role="toolbar"][aria-label="Drawer rail"]')
  await expect(rail).toBeVisible()
  await expect(rail.locator('.tb-led').first()).toHaveAttribute(
    'aria-label',
    /Specimen Notepad.*(?:open|focused|stowed)/,
  )

  // Menus: role=menu with a name; rows are menuitems with names.
  await page.mouse.click(900, 420, { button: 'right' })
  const menu = page.locator('[role="menu"][aria-label="Hold menu"]')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'New Drawer' })).toBeVisible()
  await page.keyboard.press('Escape')

  // The dirty guard strip: a named alertdialog with labelled title + body.
  const sheet = page.locator('[data-notepad-textarea]')
  await sheet.fill(`${await sheet.inputValue()}\nSR SMOKE.`)
  await page.keyboard.press('Escape')
  const strip = page.locator('[data-notepad-strip]')
  await expect(strip).toHaveAttribute('role', 'alertdialog')
  const stripLabelledBy = await strip.getAttribute('aria-labelledby')
  expect(stripLabelledBy).toBeTruthy()
  await expect(page.locator(`#${stripLabelledBy}`)).toContainText(/unsaved changes/i)
  await page.locator('[data-notepad-keep]').click()
})
