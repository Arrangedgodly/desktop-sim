import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Vivarium visual law (batch 2, brief 1, acceptance 3) — the repo's token law
 * applied to this app's WHOLE folder (sheet, surface, canvas, model — canvas
 * ink resolves tokens at draw time, so the app carries zero raw hex anywhere),
 * plus the well/scanline law, the radius law, the one-transition law, and the
 * Measuring Law's font split.
 */

const dir = fileURLToPath(new URL('.', import.meta.url))

const sourceFiles = readdirSync(dir).filter((name) => /\.(ts|tsx|css)$/.test(name) && !name.includes('.test.'))
const sources: Readonly<Record<string, string>> = Object.fromEntries(
  sourceFiles.map((name) => [name, readFileSync(`${dir}/${name}`, 'utf8')]),
)
const css = sources['vivarium.css']!

describe('vivarium · the token law over the whole app folder', () => {
  it('carries ZERO raw hex in every source file — all ink rides tokens', () => {
    for (const [name, text] of Object.entries(sources)) {
      expect(text.match(/#[0-9a-fA-F]{3,8}\b/), name).toBeNull()
    }
  })

  it('consumes the world\'s tokens (chrome, phosphor via the well, brass)', () => {
    for (const token of ['--chrome-raised', '--chrome-sunken', '--chrome-ground', '--brass', '--focus-ring']) {
      expect(css, token).toContain(`var(${token}`)
    }
  })
})

describe('vivarium · well + scanline law (the tank IS a well)', () => {
  it('builds the tank on the global .well primitive with the .scanlines overlay', () => {
    const surface = sources['VivariumSurface.tsx']!
    expect(surface).toContain('className="well vivarium-well"')
    expect(surface).toContain('className="scanlines"')
    // The sheet never paints the tank's ground or glow itself — the well
    // primitive owns ground, mono, bloom; the canvas inks inside it.
    const wellRule = css.slice(css.indexOf('.vivarium-well {'), css.indexOf('}', css.indexOf('.vivarium-well {')))
    expect(wellRule).not.toContain('phosphor')
    expect(wellRule).not.toContain('text-shadow')
  })

  it('confines the sheet\'s phosphor glow to the switch lamp\'s drilled recess', () => {
    for (const block of css.split('\n\n')) {
      if (!block.includes('phosphor-glow')) continue
      expect(block).toMatch(/vivarium-lamp/)
    }
  })
})

describe('vivarium · mechanical laws', () => {
  it('rounds nothing but the hardware lamp (the Machined Edge Rule)', () => {
    const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    expect(radii.length).toBeGreaterThan(0)
    for (const radius of radii) expect(radius).toBe('50%')
  })

  it('authors exactly ONE transition (the switch bat throw) and zero animations', () => {
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '') // the law counts code, not prose
    expect(declarations.match(/transition:/g)?.length).toBe(1)
    expect(declarations).toContain('.vivarium-bat')
    expect(declarations.match(/animation:/g)).toBeNull()
  })

  it('splits the faces by law: engraved legends in the label face; readouts ride the well\'s mono', () => {
    expect(css).toContain('font-family: var(--font-label)')
    expect(css).not.toContain('var(--font-content)') // no prose surface in this app
    // The readout rule must NOT re-face the well's B612 (the Measuring Law).
    const readoutRule = css.slice(
      css.indexOf('.vivarium-readout {'),
      css.indexOf('}', css.indexOf('.vivarium-readout {')),
    )
    expect(readoutRule).not.toContain('font-family')
  })

  it('keeps the in-world focus beam on every control', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })
})
