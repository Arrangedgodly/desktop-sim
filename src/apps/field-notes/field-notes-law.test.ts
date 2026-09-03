import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Field Notes law tests (batch 2, brief 6, acceptance 2 + 5) — the repo's
 * greps applied to THIS app: no dangerouslySetInnerHTML anywhere in the
 * module (React elements from the AST only — raw HTML cannot render), and
 * the visual law over the app sheet (zero raw hex, one authored moment,
 * sharp corners, no oxide — nothing here can be lost, no phosphor outside
 * the global well primitive).
 */

const here = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

// The scan covers SHIPPED sources — tests may name the forbidden APIs to
// assert them (the same reason the string lives in this file, not the app).
const files = readdirSync(fileURLToPath(new URL('.', import.meta.url))).filter(
  (name) => /\.(ts|tsx|css)$/.test(name) && !/\.test\./.test(name),
)
const sources: readonly (readonly [string, string])[] = files.map((name) => [name, here(name)])
const css = here('./field-notes.css')

describe('field-notes · the rendering law (no HTML string, ever)', () => {
  it('carries ZERO dangerouslySetInnerHTML — every glyph is a React element from the AST', () => {
    expect(files.length).toBeGreaterThan(5) // the scan actually scanned the module
    for (const [name, source] of sources) {
      expect(source, name).not.toContain('dangerouslySetInnerHTML')
    }
  })

  it('never touches the raw HTML injection surfaces', () => {
    for (const [name, source] of sources) {
      expect(source, name).not.toMatch(/\.innerHTML\s*=/)
      expect(source, name).not.toMatch(/\.outerHTML\s*=/)
      expect(source, name).not.toContain('insertAdjacentHTML')
      expect(source, name).not.toContain('document.write')
    }
  })

  it('declares no markdown dependency — the parser is hand-written in-module', () => {
    for (const [name, source] of sources) {
      expect(source, name).not.toMatch(/from ['"](marked|remark|micromark|markdown-it|commonmark)/)
    }
  })
})

describe('field-notes · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--chrome-raised',
      '--chrome-sunken',
      '--parchment',
      '--parchment-ink',
      '--parchment-shade',
      '--brass',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('typesets prose in the serif, legends in the label face, digits in mono', () => {
    expect(css).toContain('font-family: var(--font-content)') // the marginal notes
    expect(css).toContain('font-family: var(--font-label)') // legends + ledger rows
    expect(css).toContain('font-family: var(--font-mono)') // code spans + B612 markers
    // The reading rhythm itself: Lora inherited from .parchment-surface at
    // 1.8 leading, the 60ch field-notes measure.
    expect(css).toContain('line-height: 1.8')
    expect(css).toContain('max-width: 60ch')
  })

  it('authors exactly ONE motion moment — the sheet settles; zero transitions', () => {
    expect(css).toContain('field-notes-settle')
    expect(css.match(/@keyframes/g)?.length).toBe(1)
    expect(css.match(/transition:/g)).toBeNull()
  })

  it('rounds NOTHING — no hardware circles live in this module (the Machined Edge Rule)', () => {
    expect(css).not.toContain('border-radius')
  })

  it('keeps phosphor OUT of the sheet — glow belongs to the global well primitive only', () => {
    // The accession readout rides the platform's `.well` class; this app's
    // own sheet declares no phosphor ink and no glow of its own.
    expect(css).not.toContain('phosphor')
    expect(css).not.toContain('text-shadow: 0 0') // no bloom outside wells
  })

  it('uses NO oxide — nothing in a reading room can be lost', () => {
    expect(css).not.toContain('--oxide')
  })

  it('keeps the focus beam on the in-world tokens', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })

  it('brass appears only at hardware touchpoints — the desk action and its bevel', () => {
    // Every --brass reference in the sheet belongs to the Open-catalog action
    // (a button you press is hardware) or the inherited parchment focus ring.
    for (const block of css.split('\n\n')) {
      if (!block.includes('--brass')) continue
      expect(block).toMatch(/field-notes-desk-open/)
    }
  })
})
