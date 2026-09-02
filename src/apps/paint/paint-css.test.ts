import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Paint visual + storage law (federated session 2, acceptance 7 + 8) — the
 * repo's token law applied to this app's own sheet, and the storage-honesty
 * grep: every `toDataURL`/`toBlob` call site lives in this app and is bound
 * to the ONE capped plate (960×600) — no encode at an unbounded size exists.
 */

const here = (name: string): string => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

const css = here('./paint.css')
const surface = here('./PaintSurface.tsx')

describe('paint · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--chrome-raised',
      '--chrome-sunken',
      '--parchment',
      '--parchment-ink',
      '--brass',
      '--oxide',
      '--phosphor',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('typesets legends in the label face and digits in mono — no serif chrome', () => {
    expect(css).toContain('font-family: var(--font-label)')
    expect(css).toContain('font-family: var(--font-mono)') // accession + size readouts
    // The serif appears ONLY as the parchment marginal note (the reading voice)
    expect(css.match(/font-family: var\(--font-content\)/g)?.length).toBe(2) // plate note + notices
  })

  it('confines phosphor GLOW to the lamp seat — the artwork never glows', () => {
    // The only phosphor glow in the sheet belongs to the dirty lamp's drilled
    // recess (a seated lamp is a sanctioned family); the plate block has none.
    const plateRule = css.slice(css.indexOf('.paint-plate {'), css.indexOf('}', css.indexOf('.paint-plate {')))
    expect(plateRule).not.toContain('phosphor')
    expect(plateRule).not.toContain('text-shadow')
    // And the sheet as a whole carries no free-floating glow (no non-inset
    // box-shadow with phosphor-glow outside the lamp keyframes/seat).
    for (const block of css.split('\n\n')) {
      if (!block.includes('phosphor-glow')) continue
      expect(block).toMatch(/paint-lamp|paint-lamp-flare/)
    }
  })

  it('keeps oxide ONLY on the destructive control and the guard Discard', () => {
    for (const block of css.split('\n\n')) {
      if (!block.includes('--oxide')) continue
      expect(block).toMatch(/paint-control--clear|paint-strip-discard|paint-strip-title|:root/)
    }
  })

  it('rounds nothing but the hardware lamp (the Machined Edge Rule)', () => {
    for (const match of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(match[1]!.trim()).toBe('50%')
    }
  })

  it('authors exactly ONE motion moment — the close-guard interposition', () => {
    // Strip rise + lamp flare are the notepad's single guard moment, verbatim
    // vocabulary; the name-reject shake is the fleet's refusal law, not a
    // moment. No transitions anywhere.
    expect(css).toContain('paint-strip-rise')
    expect(css).toContain('paint-lamp-flare')
    expect(css.match(/transition:/g)).toBeNull()
  })

  it('keeps the focus beam on the in-world tokens', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })
})

describe('paint · storage discipline (acceptance 7)', () => {
  it('pins the cap constants (the manifest of the fixed plate)', async () => {
    const model = await import('./paint-model')
    expect(model.PLATE_WIDTH).toBe(960)
    expect(model.PLATE_HEIGHT).toBe(600)
    expect(model.UNDO_CAP).toBe(20)
  })

  it('encodes ONLY at the capped size — every toDataURL/toBlob call site is bound to the cap', () => {
    // The surface's two encode sites: the plate canvas (sized PLATE_*×dpr in
    // the mount effect) and the baseline scratch canvas (sized PLATE_*×1).
    // The export rides toBlob on the same plate canvas.
    expect(surface.match(/toDataURL\(/g)?.length).toBe(2)
    expect(surface.match(/toBlob\(/g)?.length).toBe(1)
    // EVERY canvas backing-store dimension in the surface is created from the
    // cap constants — no literal dimension, no measured size, ever.
    for (const match of surface.matchAll(/\.(width|height)\s*=\s*([^\n;]+)/g)) {
      expect(match[2]!.trim()).toMatch(/^PLATE_(WIDTH|HEIGHT) \* dpr$/)
    }
    expect(surface).toContain('canvas.width = PLATE_WIDTH * dpr')
    expect(surface).toContain('canvas.height = PLATE_HEIGHT * dpr')
  })
})
