// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { APP_ID_PATTERN, LAUNCHER_LAUNCH } from '../../platform/app-registry'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { vivariumApp } from './index'
import { MOTE_LAW, SPECIES } from './vivarium-species'
import VivariumSurface from './VivariumSurface'

/**
 * Vivarium surface (batch 2, brief 1) — the wiring, through the real manifest
 * and the real settings seam, with the two host seams held still: rAF is
 * stubbed to never fire (the loop's own law is pinned in vivarium-loop.test;
 * here nothing may tick on a timer) and matchMedia is stubbed per test (the
 * reduced-motion tableau needs it to answer "reduce"). jsdom's canvas has no
 * 2d context — the surface's draw no-ops there by design, which is exactly
 * the guard under test: the model lives even when the glass cannot be inked.
 */

const NEVER_FIRES = 0

function stubRaf(): void {
  vi.stubGlobal('requestAnimationFrame', () => NEVER_FIRES)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn().mockReturnValue(false),
    })),
  )
}

function mount(markReduced = false) {
  stubRaf()
  stubMatchMedia(markReduced)
  return render(<VivariumSurface windowId="w-vivarium-test" launch={LAUNCHER_LAUNCH} />)
}

beforeEach(() => {
  useSettingsStore.getState().setReducedMotionFollow(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const expectedPop = SPECIES.minnow.census + SPECIES.drifter.census + SPECIES.predator.census + MOTE_LAW.census

describe('vivarium · manifest', () => {
  it('declares the singleton tank under a contract-clean id', () => {
    expect(vivariumApp.id).toBe('vivarium')
    expect(vivariumApp.id).toMatch(APP_ID_PATTERN)
    expect(vivariumApp.singleton).toBe(true)
    expect(vivariumApp.name).toBe('Hold Vivarium')
    expect(vivariumApp.acceptedFileTypes).toBeUndefined() // a habitat, not a specimen handler
    expect(vivariumApp.defaultGeometry).toEqual({ w: 640, h: 520 })
  })

  it('renders its icon (render-only SVG glyph)', () => {
    const { container } = render(<vivariumApp.icon size={20} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
  })
})

describe('vivarium · the live console (motion allowed)', () => {
  it('opens with the honest census on the B612 wells and an empty larder', () => {
    const { getByText } = mount()
    expect(getByText(`POP ${String(expectedPop).padStart(3, '0')}`).className).toContain('well')
    expect(getByText('FOOD 00')).toBeDefined()
    // The living console: a run switch, a lit life lamp, and NO step control.
    expect(document.querySelector('[data-vivarium-step]')).toBeNull()
    expect((document.querySelector('[data-vivarium-pause]') as HTMLButtonElement).disabled).toBe(false)
    expect(document.querySelector('.vivarium-lamp')?.getAttribute('data-lit')).toBe('true')
  })

  it('tapping the glass drops a nutrient (pointer AND keyboard), the readout snaps', () => {
    const { container } = mount()
    const tank = container.querySelector('[data-vivarium-tank]') as HTMLElement
    fireEvent.click(tank, { clientX: 40, clientY: 30 })
    expect(container.querySelector('[data-vivarium-food]')!.textContent).toBe('FOOD 01')

    const canvas = container.querySelector('.vivarium-canvas') as HTMLElement
    fireEvent.keyDown(canvas, { key: 'Enter' })
    expect(container.querySelector('[data-vivarium-food]')!.textContent).toBe('FOOD 02')

    fireEvent.keyDown(canvas, { key: ' ' })
    expect(container.querySelector('[data-vivarium-food]')!.textContent).toBe('FOOD 03')
  })

  it('the PAUSE bat throws: aria-checked flips, HELD shows, the lamp dies; it throws back', () => {
    const { container } = mount()
    const pause = container.querySelector('[data-vivarium-pause]') as HTMLElement
    expect(pause.getAttribute('aria-checked')).toBe('false')
    expect(container.querySelector('[data-vivarium-hold]')).toBeNull()

    fireEvent.click(pause)
    expect(pause.getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector('[data-vivarium-hold]')!.textContent).toBe('HELD')
    expect(container.querySelector('.vivarium-lamp')?.getAttribute('data-lit')).toBe('false')

    fireEvent.click(pause)
    expect(pause.getAttribute('aria-checked')).toBe('false')
    expect(container.querySelector('[data-vivarium-hold]')).toBeNull()
  })
})

describe('vivarium · reduced motion (the composed tableau)', () => {
  it('replaces the loop with a still arrangement + STEP control; the bat stands down', () => {
    const { container } = mount(true)
    const tank = container.querySelector('[data-vivarium-tank]') as HTMLElement

    // The tableau: same honest census, no loop, step control present at 0.
    expect(container.querySelector('[data-vivarium-pop]')!.textContent).toBe(
      `POP ${String(expectedPop).padStart(3, '0')}`,
    )
    expect(tank.getAttribute('data-vivarium-frames')).toBe('0')
    const step = container.querySelector('[data-vivarium-step]') as HTMLElement
    expect(step).not.toBeNull()

    // The pause bat is disarmed under reduced motion (there is nothing to hold).
    const pause = container.querySelector('[data-vivarium-pause]') as HTMLButtonElement
    expect(pause.disabled).toBe(true)
    expect(container.querySelector('.vivarium-lamp')?.getAttribute('data-lit')).toBe('false')

    // A glass tap still feeds (state honestly read out) and re-inks on command.
    fireEvent.click(tank, { clientX: 50, clientY: 50 })
    expect(container.querySelector('[data-vivarium-food]')!.textContent).toBe('FOOD 01')
    expect(tank.getAttribute('data-vivarium-frames')).toBe('1')

    // The frame advance steps the world by exactly one tableau dt.
    fireEvent.click(step)
    expect(tank.getAttribute('data-vivarium-frames')).toBe('2')
  })

  it('honors the settings seam too: follow OFF restores the live console despite the OS preference', () => {
    useSettingsStore.getState().setReducedMotionFollow(false)
    const { container } = mount(true) // OS says reduce…
    expect(container.querySelector('[data-vivarium-step]')).toBeNull() // …the console overrides
    expect(container.querySelector('.vivarium-lamp')?.getAttribute('data-lit')).toBe('true')
  })
})
