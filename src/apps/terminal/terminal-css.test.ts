import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Terminal visual law (federated session 1, acceptance 6) — the repo's
 * token law applied to this app's own sheet, the way src/styles/tokens.test.ts
 * holds the platform to it: ZERO raw hex in terminal.css (every ink from a
 * token), the mono face throughout, and the one authored moment (the caret
 * blink) present in the POST's own stepped vocabulary so the global
 * reduced-motion kill-switch collapses it to a solid visible block.
 */

const css = readFileSync(fileURLToPath(new URL('./terminal.css', import.meta.url)), 'utf8')

describe('terminal · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of ['--phosphor', '--phosphor-bright', '--phosphor-dim', '--phosphor-glow']) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('sets the mono face on every text-bearing rule it typesets', () => {
    expect(css).toContain('font-family: var(--font-mono)')
    expect(css).not.toContain('--font-label') // no legends inside the well
    expect(css).not.toContain('--font-content') // no serif inside the well
  })

  it('authors exactly one motion moment — the stepped caret blink', () => {
    expect(css).toContain('terminal-caret-blink 1.1s steps(1) infinite')
    expect(css.match(/animation:/g)?.length).toBe(1)
    // The blink's mid-frame hides; its ends are visible, so the reduced-motion
    // collapse (global.css's kill-switch) lands on a SOLID block, never blank.
    const start = css.indexOf('@keyframes terminal-caret-blink')
    const keyframes = css.slice(start, css.indexOf('\n}', start) + 2)
    expect(keyframes).toContain('50%')
    expect(keyframes).not.toContain('100%')
  })

  it('keeps the focus beam on the in-world token', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })

  it('rounds nothing (the Machined Edge Rule — no radius outside hardware)', () => {
    expect(css.match(/border-radius/)).toBeNull()
  })
})
