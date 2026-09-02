import { describe, expect, it } from 'vitest'
import { CUES, cueSpanMs, MAX_CUE_MS, MAX_STEP_GAIN, type CueName } from './palette'

/** UI-6 palette law: the console's whole sound vocabulary fits the committed
 * ceilings — every cue short, quiet, square/triangle hardware only. */

const CUE_NAMES: readonly CueName[] = [
  'window-open',
  'window-close',
  'minimize',
  'toggle',
  'menu-open',
  'menu-select',
  'drop-on-folder',
  'boot-complete',
]

describe('UI-6 · cue palette definitions', () => {
  it('knows exactly the committed eight cues', () => {
    expect(Object.keys(CUES).sort()).toEqual([...CUE_NAMES].sort())
  })

  it('every cue has at least one step', () => {
    for (const name of CUE_NAMES) {
      expect(CUES[name].steps.length).toBeGreaterThan(0)
    }
  })

  it('every step is sane: duration, gain, shape, frequency, offset', () => {
    for (const name of CUE_NAMES) {
      for (const step of CUES[name].steps) {
        expect(step.d).toBeGreaterThan(0)
        expect(step.d).toBeLessThanOrEqual(MAX_CUE_MS)
        expect(step.g).toBeGreaterThan(0)
        expect(step.g).toBeLessThanOrEqual(MAX_STEP_GAIN) // ≤ 0.3 by construction
        expect(['square', 'triangle']).toContain(step.shape) // console hardware only
        expect(step.f).toBeGreaterThan(0)
        if (step.f2 !== undefined) expect(step.f2).toBeGreaterThan(0)
        if (step.at !== undefined) expect(step.at).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('every cue SPAN (latest at + d) stays within 300 ms', () => {
    for (const name of CUE_NAMES) {
      expect(cueSpanMs(CUES[name])).toBeLessThanOrEqual(MAX_CUE_MS)
    }
  })

  it('the boot chime is a single low tone under 300 ms', () => {
    const boot = CUES['boot-complete']
    expect(boot.steps).toHaveLength(1)
    expect(boot.steps[0]!.shape).toBe('triangle')
    expect(boot.steps[0]!.f).toBeLessThan(400) // low chime, not a beep
    expect(cueSpanMs(boot)).toBeLessThanOrEqual(300)
  })

  it('the drop-on-folder cue is a true double-tick (two steps, second offset)', () => {
    const drop = CUES['drop-on-folder']
    expect(drop.steps).toHaveLength(2)
    expect(drop.steps[1]!.at).toBeGreaterThan(0)
    expect(cueSpanMs(drop)).toBe(drop.steps[1]!.at! + drop.steps[1]!.d)
  })

  it('window-open reads as thunk + blip (low triangle first, square after)', () => {
    const [thunk, blip] = CUES['window-open'].steps
    expect(thunk!.shape).toBe('triangle')
    expect(thunk!.f).toBeLessThan(blip!.f)
    expect(blip!.shape).toBe('square')
    expect(blip!.at).toBeGreaterThan(0)
  })

  it('the committed ceilings are the values the docs promise', () => {
    expect(MAX_STEP_GAIN).toBe(0.3)
    expect(MAX_CUE_MS).toBe(300)
  })
})
