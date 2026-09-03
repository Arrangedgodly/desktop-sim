// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { LAUNCHER_LAUNCH } from '../../platform/app-registry'
import ReliquarySurface from './ReliquarySurface'

/**
 * Reliquary surface (batch 2, worker 8, acceptance 3 end-to-end) — rendered
 * DOM-free of WebGL: jsdom ships no GL context, so mounting the surface HERE
 * exercises the HONEST DEGRADE for real — the tube cannot light, and the
 * case answers with the engraved catalog plate (never a broken canvas, never
 * a crash). The picker, label card, camera hook, and the plate's arrow-key
 * rotation are the wired paths under test.
 */

const windowProps = { windowId: 'win-e2e', launch: LAUNCHER_LAUNCH } as const

afterEach(cleanup)

const cameraHook = (): string | null =>
  document.querySelector('[data-reliquary-camera]')?.getAttribute('data-reliquary-camera') ?? null

describe('reliquary · the surface under an absent tube (the degrade)', () => {
  it('mounts into PLATE MODE with the honest notice — no canvas, an engraved silhouette', () => {
    const { getByText, container } = render(<ReliquarySurface {...windowProps} />)
    expect(getByText('Reliquary')).toBeTruthy() // the engraved module name
    expect(getByText(/optics offline — engraved plate/i)).toBeTruthy() // the honest notice
    expect(container.querySelector('[data-reliquary-canvas]')).toBeNull() // the tube never mounted
    const plate = container.querySelector('[data-reliquary-plate]')
    expect(plate).not.toBeNull()
    // The engraving is REAL: a closed hull outline + a stipple field.
    expect(plate!.querySelectorAll('polygon').length).toBe(1)
    expect(plate!.querySelectorAll('rect').length).toBeGreaterThan(20)
  })

  it('opens on the first specimen: three cards, one seated, the label introduces it', () => {
    const { getAllByRole, getAllByText } = render(<ReliquarySurface {...windowProps} />)
    const cards = getAllByRole('button').filter((button) => button.hasAttribute('data-reliquary-pick'))
    expect(cards).toHaveLength(3)
    expect(cards[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(cards[1]!.getAttribute('aria-pressed')).toBe('false')
    // The name rides the seated card AND the label card; the accession likewise.
    expect(getAllByText('Vent Prism').length).toBeGreaterThanOrEqual(2)
    expect(getAllByText('RQ-0001').length).toBeGreaterThanOrEqual(2)
  })

  it('seats specimen 2 from the picker: pressed card + label card follow', () => {
    const { container } = render(<ReliquarySurface {...windowProps} />)
    fireEvent.click(container.querySelector('[data-reliquary-pick="gyre-shell"]')!)
    expect(container.querySelector('[data-reliquary-pick="gyre-shell"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-reliquary-pick="vent-prism"]')!.getAttribute('aria-pressed')).toBe('false')
    const label = container.querySelector('[data-reliquary-label]')!
    expect(label.textContent).toContain('Gyre Shell')
    expect(label.textContent).toContain('RQ-0002')
    // The plate re-engraved for the new body (a different stipple/hull pair).
    expect(label.textContent).not.toContain('RQ-0001')
  })

  it('arrow keys ROTATE the plate — the camera hook moves (the e2e method, DOM-proven)', () => {
    const { container } = render(<ReliquarySurface {...windowProps} />)
    const before = cameraHook()
    expect(before).toMatch(/^az:[\d.]+;el:-?[\d.]+;r:[\d.]+$/)
    const plate = container.querySelector('[data-reliquary-plate]')! as HTMLElement
    fireEvent.keyDown(plate, { key: 'ArrowRight' })
    fireEvent.keyDown(plate, { key: 'ArrowUp' })
    expect(cameraHook()).not.toBe(before)
  })

  it('clamps the keyboard orbit at the case stops (pitch cannot leave the case)', () => {
    const { container } = render(<ReliquarySurface {...windowProps} />)
    const plate = container.querySelector('[data-reliquary-plate]')! as HTMLElement
    for (let i = 0; i < 60; i += 1) fireEvent.keyDown(plate, { key: 'ArrowUp' })
    const el = Number(/el:(-?[\d.]+)/.exec(cameraHook()!)![1])
    expect(el).toBeLessThanOrEqual(72.5) // 1.25 rad in degrees, with rounding room
  })

  it('unmounts clean (the renderer dispose path never throws past the surface)', () => {
    const { unmount } = render(<ReliquarySurface {...windowProps} />)
    expect(() => unmount()).not.toThrow()
  })
})
