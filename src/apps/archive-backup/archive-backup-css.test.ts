import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Archive Backup visual law (batch-2 brief 10, acceptance 5) — the repo's
 * token law applied to this app's own sheet: zero raw hex, phosphor confined
 * to the well-bound readouts, brass only on the export action, oxide only on
 * the guarded restore and the refusal ink, machined edges, furniture-still.
 */

const css = readFileSync(fileURLToPath(new URL('./archive-backup.css', import.meta.url)), 'utf8')

/** The rules (block text) that mention a given token. */
const blocksMentioning = (token: string): string[] =>
  css
    .split('\n\n')
    .filter((block) => block.includes(token))
    .map((block) => block.replace(/\s+/g, ' ').trim())

describe('archive-backup · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--chrome-raised',
      '--chrome-ground',
      '--chrome-sunken',
      '--engraved-ink',
      '--chrome-ink-dim',
      '--phosphor',
      '--phosphor-dim',
      '--brass',
      '--oxide-deep',
      '--oxide-bright',
      '--parchment',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('typesets legends in the label face; machine text rides mono', () => {
    expect(css).toContain('font-family: var(--font-label)')
    expect(css).toContain('font-family: var(--font-mono)') // the held filename
    // No serif anywhere: this bay is machine chrome, not reading matter.
    expect(css).not.toContain('font-content')
  })

  it('confines phosphor ink to the well-bound readouts — nothing else glows', () => {
    // The sheet never names the glow token at all: every bloom arrives with
    // the platform's .well primitive, never from this app's own rules.
    expect(css).not.toContain('phosphor-glow')
    expect(css).not.toMatch(/text-shadow[^;]*phosphor/)
    // And every phosphor-colored rule belongs to a well-bound readout class
    // (the live count, the vault facts, the restored line — all .well in JSX).
    for (const block of blocksMentioning('var(--phosphor')) {
      expect(block).toMatch(/\.backup-(live-k|live-sep|fact d[td]|restoredline)/)
    }
  })

  it('keeps brass ONLY on the export action — the one hardware touchpoint', () => {
    for (const block of blocksMentioning('var(--brass')) {
      expect(block).toMatch(/\.backup-export(:|\s|,|$)/)
    }
  })

  it('keeps oxide ONLY on the guarded restore and the refusal ink', () => {
    for (const block of blocksMentioning('var(--oxide')) {
      expect(block).toMatch(/\.backup-(restore|refusal)/)
    }
  })

  it('rounds nothing — sharp corners; no hardware circles in this bay', () => {
    expect(css).not.toContain('border-radius')
  })

  it('authors ZERO motion — furniture law; the utility swaps state instantly', () => {
    expect(css).not.toContain('transition')
    expect(css).not.toContain('animation')
    // The brass action's hover lift is a state swap, not a tween.
    expect(css).toContain('transform: translateY(-1px)')
  })

  it('keeps the focus beam on the in-world token', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })
})
