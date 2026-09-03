import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Specimen Survey visual law (batch 2, brief 5 — acceptance 4): the repo's
 * token law applied to this app's own sheet, plus the brief's own floor —
 * the dig site is ONE well, the disturbed specimen is STATIC (no explosion
 * animation exists anywhere in the sheet), and the module's single authored
 * moment is the well warm-up.
 */

const css = readFileSync(fileURLToPath(new URL('./specimen-survey.css', import.meta.url)), 'utf8')

describe('survey · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--chrome-raised',
      '--chrome-sunken',
      '--chrome-ground',
      '--well-ground',
      '--phosphor',
      '--phosphor-bright',
      '--phosphor-dim',
      '--brass',
      '--brass-hi',
      '--brass-lo',
      '--oxide-deep',
      '--oxide-bright',
      '--font-label',
      '--font-mono',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('typesets legends in the label face and digits in mono — no serif anywhere', () => {
    expect(css).toContain('font-family: var(--font-label)')
    expect(css).toContain('font-family: var(--font-mono)') // the numerals (Measuring Law)
    expect(css).not.toContain('--font-content') // a dig site is a machine, not a reading room
  })

  it('confines phosphor GLOW to the well primitive — the sheet adds none of its own', () => {
    // The .well class (global.css) supplies ground + mono + bloom together;
    // this sheet never writes a glow of its own (the terminal's discipline).
    expect(css).not.toContain('phosphor-glow')
    expect(css).not.toContain('text-shadow: 0 0')
  })

  it('keeps oxide ONLY on the disturbed plot and the loss status', () => {
    for (const block of css.split('\n\n')) {
      if (!block.includes('--oxide')) continue
      expect(block).toMatch(/data-state='disturbed'|survey-specimen|survey-status/)
    }
  })

  it('rounds nothing (the Machined Edge Rule — no hardware circles here)', () => {
    expect(css.match(/border-radius:/g)).toBeNull() // pins and marks are drawn SVG, not radii
  })

  it('authors exactly ONE motion moment — the well warm-up — and holds still otherwise', () => {
    expect(css).toContain('survey-well-warm')
    expect(css.match(/@keyframes/g)).toHaveLength(1)
    expect(css.match(/transition:/g)).toBeNull() // reveals, pins, and ends all SNAP
    // The warm-up starts from a VISIBLE default (the tube is never blank).
    expect(css).toContain('opacity: 0.35')
  })

  it('gives every control the in-world focus beam', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })
})
