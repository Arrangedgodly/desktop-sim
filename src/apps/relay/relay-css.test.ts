import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Relay visual law (batch 2, brief 3, acceptance 5) — the repo's token law
 * applied to this app's own sheet, plus the relay's own world-laws: the
 * duality (engraved ledger chrome over a parchment letter sheet), phosphor
 * confined to the readout well and the SEATED lamps, brass ONLY at the
 * filing action, NO oxide anywhere (nothing can be lost on this wire), one
 * authored motion moment, and the machined edge.
 */

const here = (name: string): string => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

const css = here('./relay.css')

describe('relay · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--chrome-raised',
      '--chrome-sunken',
      '--parchment',
      '--parchment-shade',
      '--parchment-ink',
      '--parchment-ink-dim',
      '--brass',
      '--brass-hi',
      '--brass-lo',
      '--phosphor',
      '--phosphor-dim',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('typesets legends in the label face and every digit/readout in mono; the serif reads parchment only', () => {
    expect(css).toContain('font-family: var(--font-label)') // engraved legends + brass action
    expect(css).toContain('font-family: var(--font-mono)') // watch clock, counts, codes, stamps
    // The serif appears ONLY as parchment marginal notes (the reading voice
    // rides the .parchment-surface primitive otherwise).
    expect(css.match(/font-family: var\(--font-content\)/g)?.length).toBe(2) // quiet note + refusal
  })

  it('confines phosphor GLOW to the seated lamps — the letter sheet never glows', () => {
    // The only phosphor bloom in the sheet belongs to lamps in their own
    // drilled recesses (the toolbar arrival lamp + the ledger row lamps) —
    // the two sanctioned families besides the .well primitive itself, which
    // this sheet consumes via the global class, not by re-authoring.
    for (const block of css.split('\n\n')) {
      if (!block.includes('phosphor-glow')) continue
      expect(block).toMatch(/relay-lamp|relay-row-lamp/)
    }
  })

  it('carries NO oxide — nothing can be lost on this wire (warnings/destructive only)', () => {
    expect(css).not.toContain('--oxide') // in-world honesty, mechanically held
  })

  it('keeps brass to the ONE hardware touchpoint — the filing action', () => {
    for (const block of css.split('\n\n')) {
      if (!block.includes('--brass')) continue
      expect(block).toMatch(/\.relay-file|\.relay-ledger/)
    }
    // (the ledger bay rides brass-in-shadow only as its scrollbar thumb —
    // the fleet's scrollbar convention, not ornament)
  })

  it('rounds nothing but the hardware lamps (the Machined Edge Rule)', () => {
    const radii = css.match(/border-radius:\s*([^;]+);/g) ?? []
    expect(radii.length).toBe(2) // the arrival lamp + the row lamp
    for (const match of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(match[1]!.trim()).toBe('50%')
    }
  })

  it('authors exactly ONE motion moment — the fresh row settling into the ledger', () => {
    expect(css).toContain('relay-arrive')
    // exactly one animation rule: the settle; nothing else moves
    expect((css.match(/animation:/g) ?? []).length).toBe(1)
    expect(css).toContain('animation: relay-arrive')
    // Control feedback (hover lift) is the ONLY transition — the brass
    // action's; furniture swaps instantly (zero transitions elsewhere).
    const transitions = css.match(/transition:/g) ?? []
    expect(transitions.length).toBe(1)
    const fileBlock = css.slice(css.indexOf('.relay-file {'), css.indexOf('}', css.indexOf('.relay-file {')))
    expect(fileBlock).toContain('transition: transform')
  })

  it('adds no focus styling of its own — the global in-world beam owns it', () => {
    expect(css).not.toContain('outline') // no drift from the fleet's focus law
  })
})
