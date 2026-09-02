// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// UI-1: the token stylesheet must actually MOUNT. In the built app that mount
// is src/main.tsx's `import './styles/global.css'` (Vite emits it as the app
// stylesheet); this test pins the seam and then mounts the same content into
// the jsdom document the way the bundler would, asserting the sheet registers.
const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

const mainTsx = read('../main.tsx')
const globalCss = read('global.css')
const tokensCss = read('tokens.css')
const fontsCss = read('fonts.css')
const wmCss = read('../platform/wm/wm.css')

/** Every provisional name the WM shell consumed pre-UI-1 — still defined,
 *  now in the token sheet (renames would break the shell silently). */
const PROVISIONAL_TOKENS = [
  '--chrome-ground',
  '--chrome-raised',
  '--chrome-edge-hi',
  '--chrome-edge-lo',
  '--chrome-ink',
  '--parchment',
  '--parchment-ink',
  '--phosphor',
  '--oxide',
] as const

describe('UI-1 · token stylesheet mounts', () => {
  it('is imported exactly once from the app entry (the mount seam)', () => {
    expect(mainTsx).toMatch(/import\s+'\.\/styles\/global\.css'/)
  })

  it('pulls tokens and fonts through global.css', () => {
    expect(globalCss).toContain("@import './tokens.css'")
    expect(globalCss).toContain("@import './fonts.css'")
  })

  it('registers as a real stylesheet in the document', () => {
    const style = document.createElement('style')
    style.dataset.holdOsStyles = 'global'
    style.textContent = `${tokensCss}\n${fontsCss}\n${globalCss.replace(/@import[^;]+;\n?/g, '')}`
    document.head.appendChild(style)

    const sheets = Array.from(document.styleSheets)
    expect(sheets.length).toBeGreaterThan(0)
    const sheet = sheets.find((s) => s.ownerNode === style)
    expect(sheet).toBeDefined()
    // the primitives parse into the CSSOM as real rules
    const selectors = Array.from(sheet?.cssRules ?? []).map((r) => (r as CSSStyleRule).selectorText)
    for (const primitive of [
      '.bevel-raised',
      '.bevel-recessed',
      '.bevel-pressed',
      '.engraved',
      '.well',
      '.scanlines',
      '.parchment-surface',
    ]) {
      expect(selectors, primitive).toContain(primitive)
    }
  })

  it('defines the committed palette, including every provisional name the shell used', () => {
    for (const token of PROVISIONAL_TOKENS) {
      expect(tokensCss, token).toMatch(new RegExp(`${token}\\s*:`))
    }
    // the committed families beyond the provisional set
    for (const token of [
      '--well-ground',
      '--chrome-sunken',
      '--chrome-ink-dim',
      '--engraved-ink',
      '--phosphor-bright',
      '--phosphor-dim',
      '--phosphor-glow',
      '--parchment-shade',
      '--parchment-ink-dim',
      '--brass',
      '--brass-hi',
      '--brass-lo',
      '--oxide-deep',
      '--oxide-bright',
      '--focus-ring',
      '--font-label',
      '--font-content',
      '--font-mono',
      '--size-legend',
      '--size-legend-lg',
      '--size-legend-xl',
      '--track-legend',
      '--track-legend-narrow',
      '--track-legend-wide',
    ]) {
      expect(tokensCss, token).toMatch(new RegExp(`${token}\\s*:`))
    }
  })

  // Refinement #2 (typeset): the Engraved Legend Law's whole size+tracking
  // ramp is tokens — the floor, the off-ramp ceiling, and the band's three
  // stops — so no legend instance can drift off it silently.
  it('pins the engraved legend ramp (floor 11px, off-ramp 14px, band 0.08–0.12em)', () => {
    expect(tokensCss).toContain('--size-legend: 0.6875rem')
    expect(tokensCss).toContain('--size-legend-lg: 0.75rem')
    expect(tokensCss).toContain('--size-legend-xl: 0.875rem')
    expect(tokensCss).toContain('--track-legend-narrow: 0.08em')
    expect(tokensCss).toContain('--track-legend: 0.1em')
    expect(tokensCss).toContain('--track-legend-wide: 0.12em')
  })

  it('removes the provisional :root block from wm.css (single definition site)', () => {
    expect(wmCss).not.toContain(':root')
    // …and wm.css defines no custom properties of its own anymore
    expect(wmCss).not.toMatch(/--[a-z][a-z0-9-]*\s*:/)
  })

  it('keeps the committed type roles on their faces (labels/content/mono split)', () => {
    expect(tokensCss).toContain("--font-label: 'Chakra Petch'")
    expect(tokensCss).toContain("--font-content: 'Lora'")
    expect(tokensCss).toContain("--font-mono: 'B612 Mono'")
  })
})

describe('UI-1 · global browser surfaces + motion hook', () => {
  it('themes selection, caret, focus-visible and scrollbars from the palette', () => {
    expect(globalCss).toContain('::selection')
    expect(globalCss).toContain('caret-color: var(--phosphor)')
    expect(globalCss).toContain(':focus-visible')
    expect(globalCss).toContain('scrollbar-width: thin')
    expect(globalCss).toContain('scrollbar-color: var(--brass) var(--chrome-sunken)')
  })

  it('scopes the parchment duality (brass ring + light-world overrides)', () => {
    expect(globalCss).toMatch(/\.parchment-surface\s*\{[^}]*--focus-ring:\s*var\(--brass-lo\)/s)
    expect(globalCss).toMatch(/\.parchment-surface\s*\{[^}]*font-family:\s*var\(--font-content\)/s)
  })

  it('ships the global reduced-motion hook', () => {
    expect(globalCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(globalCss).toContain('animation-duration: 0.01ms !important')
    expect(globalCss).toContain('transition-duration: 0.01ms !important')
  })

  it('keeps phosphor glow inside wells only (no glow on chrome selectors)', () => {
    expect(globalCss).toMatch(/\.well\s*\{[^}]*text-shadow:\s*0 0 6px var\(--phosphor-glow\)/s)
    // the only text-shadow carrying phosphor outside a well is the engraved
    // legend's light lip — never an amber glow
    const nonWellShadows = (globalCss.split(/\.well\s*\{/)[0] ?? '')
      .split('\n')
      .filter((line) => line.includes('text-shadow'))
    for (const line of nonWellShadows) expect(line).not.toContain('--phosphor-glow')
  })
})
