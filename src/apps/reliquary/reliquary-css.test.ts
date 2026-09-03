import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Reliquary visual law (batch 2, worker 8, acceptance 5) — the repo's token
 * law applied to this app's own sheet: zero raw hex, the well/brass/
 * parchment discipline, the Measuring Law's faces, the radius law, and
 * exactly ONE authored motion moment.
 */

const here = (name: string): string => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

const css = here('./reliquary.css')

describe('reliquary · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--chrome-raised',
      '--parchment',
      '--parchment-ink-dim',
      '--brass',
      '--brass-lo',
      '--phosphor-dim',
      '--font-mono',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('keeps phosphor INSIDE the case — the warm-up is the well family, the only phosphor use', () => {
    for (const block of css.split('\n\n')) {
      if (!block.includes('--phosphor')) continue
      // The one phosphor consumer is the case's tube warm-up overlay —
      // phosphor clipped inside the bezel, over the well (the world's law).
      expect(block).toMatch(/reliquary-caseframe/)
    }
  })

  it('typesets legends in the label face and digits/accessions in mono', () => {
    expect(css).toContain('font-family: var(--font-label)')
    expect(css).toContain('font-family: var(--font-mono)') // accession codes
    // The serif appears ONLY in the reading voice: the bench hint + the label note.
    expect(css.match(/font-family: var\(--font-content\)/g)?.length).toBe(2)
  })

  it('rounds NOTHING — no border-radius exists in the sheet at all', () => {
    // The vitrine owns no lamps; the world permits only 50% hardware circles,
    // and this app has none — the Machined Edge Rule at its strictest.
    expect(css.match(/border-radius:/g)).toBeNull()
  })

  it('authors exactly ONE motion moment — the tube warm-up', () => {
    expect(css).toContain('reliquary-warm')
    expect(css).toContain('var(--ease-console)') // exponential ease-out, from a visible default
    expect(css.match(/transition:/g)).toBeNull() // furniture swaps state, never tweens
    // The warm-up starts visible (≥35% — the tube is never blank).
    expect(css).toContain('opacity: 0.5;')
  })

  it('keeps the focus beam on the in-world token', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })

  it('shadows parchment in warm ink tones, never black (the Ink Shadow Rule)', () => {
    // Every parchment block (cards, the label, the plate) casts its shadows
    // in warm INK tones; black washes live on chrome blocks only.
    for (const block of css.split('\n\n')) {
      if (!/reliquary-(card|label|plate)/.test(block)) continue
      expect(block, block).not.toContain('rgb(0 0 0')
    }
    // The plate-on-the-mat and label-card shadows are warm ink, as authored:
    expect(css).toContain('3px 4px 12px rgb(51 41 28 / 38%)')
    expect(css).toContain('0 1px 2px rgb(51 41 28 / 12%)')
  })
})
