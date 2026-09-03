import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Chart Plate visual law (batch 2, brief 9, acceptance 4) — the repo's token
 * law applied to this app's own sheet, plus the world laws the sheet must
 * carry: no glow outside the accession well's flare, no oxide (this module
 * destroys nothing), no radius (no lamps either), no transitions, exactly one
 * authored moment, and the plate rendered as AUTHORED elements (never
 * dangerouslySetInnerHTML — the same law the field reader holds).
 */

const here = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

const css = here('./chart-plate.css')
const surface = here('./ChartPlateSurface.tsx')

describe('chart plate · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--chrome-raised',
      '--chrome-sunken',
      '--parchment',
      '--parchment-ink',
      '--brass',
      '--phosphor',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('typesets legends in the label face, digits in mono — serif only for notes', () => {
    expect(css).toContain('font-family: var(--font-label)')
    expect(css).toContain('font-family: var(--font-mono)') // value fields + the × glyph
    // The serif appears ONLY in the reading voice: the two marginal notes and
    // the authoring label field.
    expect(css.match(/font-family: var\(--font-content\)/g)?.length).toBe(3)
  })

  it('confines phosphor GLOW to the accession well flare — the plate never glows', () => {
    for (const block of css.split('\n\n')) {
      if (!block.includes('phosphor-glow')) continue
      expect(block).toMatch(/chart-plate-flare/)
    }
    // The plate block itself carries no glow vocabulary at all.
    const plateBlock = css.slice(
      css.indexOf('.chart-plate-plate {'),
      css.indexOf('}', css.indexOf('.chart-plate-plate {')),
    )
    expect(plateBlock).not.toContain('phosphor')
  })

  it('keeps oxide OUT of the module — the engraver destroys nothing', () => {
    // Comments may NAME the law; the rules themselves may not use it.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toContain('oxide')
  })

  it('rounds NOTHING (no lamps in this module — the Machined Edge Rule)', () => {
    expect(css.match(/border-radius:/g)).toBeNull()
  })

  it('authors exactly ONE motion moment — the accession flare', () => {
    // The flare (a plate filed, the well's ink running hot for a beat) is the
    // module's single authored moment; the name-reject shake is the fleet's
    // refusal law, not a moment. No transitions anywhere.
    expect(css).toContain('@keyframes chart-plate-flare')
    expect(css).toContain('@keyframes chart-plate-name-reject')
    expect(css.match(/@keyframes/g)?.length).toBe(2)
    expect(css.match(/transition:/g)).toBeNull()
  })

  it('keeps the focus beam on the in-world tokens', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })

  it('renders the plate as AUTHORED elements — never injected markup', () => {
    expect(surface).not.toContain('dangerouslySetInnerHTML')
    expect(surface).not.toContain('innerHTML')
  })
})
