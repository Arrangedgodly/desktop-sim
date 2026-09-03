/**
 * Vitals visual law (federated batch 2) — the repo's token law applied to
 * this app's own sheet + markup, the way terminal-css.test.ts holds the
 * terminal to it: ZERO raw hex anywhere in the app's CSS or its TSX (every
 * ink rides a token — the SVG charts included), the well primitives
 * actually consumed, sharp corners only (no border-radius at all — this
 * app has no hardware circles), and MOTION-MINIMAL BY DESIGN: zero
 * animation and zero transition declarations, because every update is a
 * stepped swap at sample time (the brief's own law — reduced-motion is
 * identical because there is nothing to collapse).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('./vitals.css', import.meta.url)), 'utf8')
const surface = readFileSync(fileURLToPath(new URL('./VitalsSurface.tsx', import.meta.url)), 'utf8')
const charts = readFileSync(fileURLToPath(new URL('./VitalsCharts.tsx', import.meta.url)), 'utf8')
const icon = readFileSync(fileURLToPath(new URL('./VitalsIcon.tsx', import.meta.url)), 'utf8')

describe('vitals · visual law over the app sheet + markup', () => {
  it('carries ZERO raw hex — every ink rides a token (CSS AND SVG markup)', () => {
    for (const [name, text] of [
      ['vitals.css', css],
      ['VitalsSurface.tsx', surface],
      ['VitalsCharts.tsx', charts],
      ['VitalsIcon.tsx', icon],
    ] as const) {
      expect(text.match(/#[0-9a-fA-F]{3,8}\b/), name).toBeNull()
    }
    // …and the sheet actually consumes the palette's custom properties.
    for (const token of [
      '--phosphor',
      '--phosphor-bright',
      '--phosphor-dim',
      '--phosphor-glow',
      '--well-scan-ink',
      '--chrome-ink-dim',
      '--brass-lo',
    ]) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('keeps phosphor discipline — the chart inks are the amber family only', () => {
    // the chart markup styles through classes; the classes' inks are all
    // the amber family, seated on the well primitives' ground
    for (const cls of ['.vitals-trace-line', '.vitals-trace-envelope', '.vitals-ladder-bar']) {
      expect(css).toContain(cls)
    }
    // no oxide inside the charts (oxide never enters a well), no parchment
    // surfaces in an instrument panel
    expect(css).not.toContain('--oxide')
    expect(css).not.toContain('--parchment')
    expect(charts).not.toContain('--oxide')
    expect(charts).not.toContain('--parchment')
  })

  it('rounds nothing (the Machined Edge Rule — no hardware circles here)', () => {
    expect(css.match(/border-radius/)).toBeNull()
  })

  it('is motion-minimal by design: ZERO animations, ZERO transitions', () => {
    expect(css.match(/animation\s*:/)).toBeNull()
    expect(css.match(/@keyframes/)).toBeNull()
    expect(css.match(/transition\s*:/)).toBeNull()
    // stepped updates ride state swaps, never CSS motion — so
    // prefers-reduced-motion changes nothing here by construction
  })

  it('seats every readout in a well (the Phosphor Wells Rule)', () => {
    // the readout chip and both chart wells class onto the global primitive
    expect(surface).toContain('vitals-readout well')
    expect(surface).toContain('vitals-plate-well well')
    expect(surface).toContain('scanlines')
  })
})
