import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Cursor visual law (batch 2, brief 4, acceptance 4) — the repo's token law
 * applied to this app's own sheet, the way src/styles/tokens.test.ts holds
 * the platform and terminal-css.test.ts holds the shell: ZERO raw hex in
 * cursor.css (every ink rides a token), B612 Mono on every digit-bearing
 * rule, brass confined to the hardware touchpoint, oxide confined to the
 * refusal ink and the armed Clear, exactly ONE authored motion moment (the
 * tape feed) whose collapse lands visible, and nothing round.
 */

const css = readFileSync(fileURLToPath(new URL('./cursor.css', import.meta.url)), 'utf8')

describe('cursor · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--phosphor',
      '--phosphor-bright',
      '--parchment',
      '--parchment-ink',
      '--brass',
      '--oxide-deep',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('sets the mono face on the digit-bearing rules (the Measuring Law)', () => {
    expect(css).toContain('font-family: var(--font-mono)') // the entry line + tape rows
    expect(css).toContain('font-variant-numeric: tabular-nums') // the tape's printed digits
  })

  it('confines brass to the hardware touchpoint — the "=" key only', () => {
    // every var(--brass*) reference lives inside the .cursor-enter rules
    const enterStart = css.indexOf('.cursor-enter {')
    const enterEnd = css.indexOf('/* -- the ledger tape')
    const enterBlock = css.slice(enterStart, enterEnd)
    const totalUses = css.match(/var\(--brass/g)?.length ?? 0
    const enterUses = enterBlock.match(/var\(--brass/g)?.length ?? 0
    expect(totalUses).toBeGreaterThan(0)
    expect(totalUses).toBe(enterUses)
  })

  it('confines oxide to warnings/destructive — refusal ink + the armed Clear', () => {
    // the refusal ink rule
    expect(css).toContain(".cursor-row[data-refused='true'] .cursor-line")
    const refusalRule = css.slice(
      css.indexOf(".cursor-row[data-refused='true'] .cursor-line"),
      css.indexOf('}', css.indexOf(".cursor-row[data-refused='true'] .cursor-line")) + 1,
    )
    expect(refusalRule).toContain('var(--oxide)')
    // every other oxide use sits in the armed-Clear rules
    for (const match of css.matchAll(/\.cursor-clear[^{]*\{[^}]*\}/g)) {
      if (match[0].includes('var(--oxide')) {
        expect(match[0], match[0]).toMatch(/data-armed='true'/)
      }
    }
  })

  it('authors exactly one motion moment — the tape feed, collapsing visible', () => {
    expect(css).toContain('cursor-feed var(--dur-beat) var(--ease-console) both')
    expect(css.match(/animation:/g)?.length).toBe(1)
    expect(css.match(/@keyframes/g)?.length).toBe(1)
    // the feed STARTS visible (the law's ≥35% floor) and ENDS settled, so the
    // reduced-motion collapse (global.css's kill-switch) lands on the printed
    // line at rest — never blank.
    const start = css.indexOf('@keyframes cursor-feed')
    const keyframes = css.slice(start, css.indexOf('\n}', start) + 2)
    expect(keyframes).toContain('opacity: 0.35')
    expect(keyframes).toContain('opacity: 1')
  })

  it('keeps the focus beam on the in-world token inside the well', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })

  it('rounds nothing (the Machined Edge Rule — no radius, no hardware circles here)', () => {
    expect(css.match(/border-radius/)).toBeNull()
  })
})
