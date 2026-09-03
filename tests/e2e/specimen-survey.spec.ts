import { expect, test, type Page } from '@playwright/test'

/**
 * Specimen Survey e2e (batch 2, brief 5) — the dig against the real app
 * graph: fresh context per test = a genuine first visit.
 *
 * Gates (brief 5 acceptance):
 * 1. Manifest: a launcher open deals a fresh FIELD survey (multi-instance);
 *    the preset selector re-deals the chosen field; New Survey reseals.
 * 2. Keyboard floor: roving tabindex on the grid — arrows walk plots (edges
 *    stop), Enter reveals, F pins.
 * 3. A scripted WIN on a deterministic FIELD board — the model-level
 *    fixture seam (see seedField below), not a weakened prod path.
 * 4. A scripted DISTURB: the loss renders as a STATIC oxide state.
 * 5. Reload resumes the dig: the board rides the window record's appState.
 *
 * The deterministic channel, documented: `setSurveyTestFixture` in
 * src/apps/specimen-survey/survey-model.ts accepts a persisted-shape board
 * (it passes the SAME hostile validation as the window record's appState),
 * the NEXT mounted surface peeks it at its initializer, and the surface
 * clears the channel on its first commit — production behavior is
 * untouched. This spec reaches it through a page-context dynamic import of
 * the dev-server module, the registerDemoModule pattern
 * (tests/e2e/e2e-helpers.ts). The integrator runs this AFTER registering
 * `specimen-survey` in src/apps/index.ts.
 *
 * Selectors ride stable seams (data-* attributes), never CSS pixels.
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

/** Open the survey through the module drawer — the launcher route. */
async function openSurvey(page: Page) {
  await page.locator('[data-launcher-pull]').click()
  await page.locator('[data-launcher-menu] [data-launch-app="specimen-survey"]').click()
  const win = page.locator('.wm-window[data-app-id="specimen-survey"]').last()
  await expect(win).toBeVisible()
  return win
}

/** The newest survey window's plot by row-major index. */
const plot = (page: Page, index: number | string) =>
  page.locator(`[data-survey-plot="${index}"]`).last()

const statusText = (page: Page) => page.locator('[data-survey-status]').last()

const readout = (page: Page, kind: string) =>
  page.locator(`[data-survey-readout="${kind}"]`).last()

/** A persisted-shape FIELD board with every specimen in the bottom row
 *  (indices 56–63): revealing A1 cascades rows 0–6 and CLEARS the dig;
 *  revealing any bottom-row plot DISTURBS it. Deterministic by construction. */
function bottomRowField(): Record<string, unknown> {
  const total = 64
  const specimens = new Array<string>(total).fill('0')
  for (let i = 56; i < total; i++) specimens[i] = '1'
  return {
    v: 1,
    presetId: 'field',
    specimens: specimens.join(''),
    revealed: '0'.repeat(total),
    marked: '0'.repeat(total),
    status: 'digging',
    disturbedAt: null,
    elapsedMs: 0,
    runningSince: null,
  }
}

/** The keyboard floor's field: same bottom row minus one, with a specimen at
 *  B1 — A1 becomes a NUMBERED rim plot, so Enter reveals it WITHOUT the
 *  cascade (the dig stays live for the pin steps that follow). */
function rimField(): Record<string, unknown> {
  const state = bottomRowField()
  const specimens = (state['specimens'] as string).split('')
  specimens[56] = '0'
  specimens[8] = '1'
  return { ...state, specimens: specimens.join('') }
}

/** Seed the model-level fixture for the NEXT mounted surface (see header). */
async function seedField(page: Page, state: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (payload) => {
    const modelUrl = '/src/apps/specimen-survey/survey-model.ts'
    const { setSurveyTestFixture } = (await import(modelUrl)) as {
      setSurveyTestFixture: (state: unknown) => void
    }
    setSurveyTestFixture(payload)
  }, state)
}

/* ------------------------------------------------------------------ */

test('a launcher open deals a fresh FIELD survey; presets re-deal; New Survey reseals', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)

  const win = await openSurvey(page)

  // The dig site: one well, an 8×8 field, B612 readouts, status digging.
  await expect(page.locator('[data-survey-well].well').last()).toBeVisible()
  await expect(win.locator('[data-survey-plot]')).toHaveCount(64)
  await expect(readout(page, 'specimens')).toHaveText('08')
  await expect(readout(page, 'marks')).toHaveText('00')
  await expect(readout(page, 'elapsed')).toHaveText('00:00')
  await expect(statusText(page)).toHaveText('DIG UNDERWAY')
  await expect(
    page.locator('[data-survey-preset="field"]').last(),
  ).toHaveAttribute('aria-pressed', 'true')

  // Multi-instance: a second launcher open is a SECOND dig window.
  await openSurvey(page)
  await expect(page.locator('.wm-window[data-app-id="specimen-survey"]')).toHaveCount(2)

  // The preset selector deals the chosen field (the raised, newest window).
  const newest = page.locator('.wm-window[data-app-id="specimen-survey"]').last()
  await newest.locator('[data-survey-preset="survey"]').click()
  await expect(newest.locator('[data-survey-plot]')).toHaveCount(144)
  await expect(readout(page, 'specimens')).toHaveText('20')
  await expect(
    newest.locator('[data-survey-preset="survey"]'),
  ).toHaveAttribute('aria-pressed', 'true')

  // New Survey reseals the same preset's field.
  await newest.locator('[data-survey-new]').click()
  await expect(newest.locator('[data-survey-plot]')).toHaveCount(144)
  await expect(
    newest.locator('[data-survey-plot][data-state="sealed"]'),
  ).toHaveCount(144)
  await expect(statusText(page)).toHaveText('DIG UNDERWAY')
})

test('the keyboard floor: arrows walk the grid (edges stop), Enter reveals, F pins', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await seedField(page, rimField())
  await openSurvey(page)

  // Roving tabindex: exactly one tabbable seat, at A1.
  await expect(page.locator('[data-survey-plot][tabindex="0"]')).toHaveCount(1)
  await plot(page, 0).focus()

  // Arrows walk; the roving seat follows focus.
  await page.keyboard.press('ArrowRight')
  await expect(plot(page, 1)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(plot(page, 9)).toBeFocused()
  await page.keyboard.press('End')
  await expect(plot(page, 63)).toBeFocused()
  await page.keyboard.press('ArrowRight') // east edge stops — no wrap
  await expect(plot(page, 63)).toBeFocused()
  await page.keyboard.press('ArrowDown') // south edge stops
  await expect(plot(page, 63)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(plot(page, 0)).toBeFocused()
  await page.keyboard.press('ArrowUp') // north edge stops
  await expect(plot(page, 0)).toBeFocused()

  // Enter reveals the focused plot (A1 is a numbered rim plot on this field —
  // it opens ALONE, the dig stays live).
  await page.keyboard.press('Enter')
  await expect(plot(page, 0)).toHaveAttribute('data-state', 'numbered')
  await expect(plot(page, 0)).toHaveAttribute('data-prox', '1')

  // F pins a sealed plot; Enter no longer opens a pinned plot; F again unpins.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(plot(page, 10)).toBeFocused()
  await page.keyboard.press('f')
  await expect(plot(page, 10)).toHaveAttribute('data-state', 'pinned')
  await expect(readout(page, 'marks')).toHaveText('01')
  await page.keyboard.press('Enter')
  await expect(plot(page, 10)).toHaveAttribute('data-state', 'pinned')
  await page.keyboard.press('f')
  await expect(plot(page, 10)).toHaveAttribute('data-state', 'sealed')

  // Right-click pins too (pointer parity with the classic gesture).
  await plot(page, 30).click({ button: 'right' })
  await expect(plot(page, 30)).toHaveAttribute('data-state', 'pinned')
})

test('a scripted WIN on the deterministic field: A1 cascades the dig to CLEARED', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await seedField(page, bottomRowField())
  await openSurvey(page)

  // One click on A1: the flood opens every clear plot (rows 0–6), the dig
  // ends CLEARED, and every specimen is auto-pinned — the found catalog.
  await plot(page, 0).click()
  await expect(statusText(page)).toHaveText('SURVEY CLEARED')
  await expect(readout(page, 'marks')).toHaveText('08')
  for (let i = 56; i < 64; i++) {
    await expect(plot(page, i)).toHaveAttribute('data-state', 'pinned')
  }
  await expect(plot(page, 55)).toHaveAttribute('data-state', 'numbered')

  // The ended dig is inert: further clicks change nothing.
  await plot(page, 56).click()
  await expect(plot(page, 56)).toHaveAttribute('data-state', 'pinned')
})

test('a scripted DISTURB: the loss is a STATIC oxide state, never an animation', async ({
  page,
}) => {
  await toDesktop(page)
  await retireDocent(page)
  await seedField(page, bottomRowField())
  await openSurvey(page)

  // Straight onto a specimen: the dig ends DISTURBED, the plot wears the
  // static oxide state, every specimen lies open.
  await plot(page, 57).click()
  await expect(statusText(page)).toHaveText('SPECIMEN DISTURBED')
  await expect(plot(page, 57)).toHaveAttribute('data-state', 'disturbed')
  for (let i = 56; i < 64; i++) {
    if (i === 57) continue
    await expect(plot(page, i)).toHaveAttribute('data-state', 'specimen')
  }
  await expect(page.locator('[data-survey-surface]').last()).toHaveAttribute(
    'data-ended',
    'true',
  )
})

test('a reload resumes the dig: the board rides the window record', async ({ page }) => {
  await toDesktop(page)
  await retireDocent(page)
  await seedField(page, bottomRowField())
  await openSurvey(page)

  // One deterministic move: plot 48 opens alone (a numbered rim plot).
  await plot(page, 48).click()
  await expect(plot(page, 48)).toHaveAttribute('data-state', 'numbered')
  await plot(page, 12).click({ button: 'right' })
  await expect(plot(page, 12)).toHaveAttribute('data-state', 'pinned')

  // The mirror debounce + MF-2 writer flush the envelope.
  await page.waitForTimeout(1_200)
  await page.reload()
  await expect(page.locator('[data-desktop-stage]')).toBeVisible({ timeout: 10_000 })

  const restored = page.locator('.wm-window[data-app-id="specimen-survey"]')
  await expect(restored).toBeVisible({ timeout: 10_000 })
  await expect(plot(page, 48)).toHaveAttribute('data-state', 'numbered') // the same dig
  await expect(plot(page, 12)).toHaveAttribute('data-state', 'pinned')
  await expect(statusText(page)).toHaveText('DIG UNDERWAY')
})
