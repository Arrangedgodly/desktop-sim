// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createPointerEvent, simulatePointerGesture } from './gesture'

/** TH-1 unit tests: the pointer-gesture simulator drives real DOM events that
 * listeners on the element (and its ancestors — bubbles:true) observe. */

function record(target: Element): {
  types: string[]
  coords: { x: number; y: number }[]
  buttons: number[]
} {
  const types: string[] = []
  const coords: { x: number; y: number }[] = []
  const buttons: number[] = []
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    target.addEventListener(type, (event) => {
      const pointerEvent = event as PointerEvent
      types.push(type)
      coords.push({ x: pointerEvent.clientX, y: pointerEvent.clientY })
      buttons.push(pointerEvent.buttons)
    })
  }
  return { types, coords, buttons }
}

describe('TH-1 · simulatePointerGesture', () => {
  it('dispatches down → moves → up with the scripted coordinates', () => {
    const el = document.createElement('div')
    const seen = record(el)

    const dispatched = simulatePointerGesture(el, [
      { x: 10, y: 10 },
      { x: 40, y: 12 },
      { x: 70, y: 20 },
      { x: 100, y: 30 },
    ])

    expect(dispatched).toEqual([
      'pointerdown',
      'pointermove',
      'pointermove',
      'pointermove',
      'pointerup',
    ])
    expect(seen.types).toEqual(dispatched)
    expect(seen.coords).toEqual([
      { x: 10, y: 10 },
      { x: 40, y: 12 },
      { x: 70, y: 20 },
      { x: 100, y: 30 },
      { x: 100, y: 30 }, // up repeats the last point
    ])
    expect(seen.buttons).toEqual([1, 1, 1, 1, 0]) // buttons released on up
  })

  it('single point is a tap: down + up at the same coordinates', () => {
    const el = document.createElement('div')
    const seen = record(el)
    const dispatched = simulatePointerGesture(el, [{ x: 5, y: 5 }])
    expect(dispatched).toEqual(['pointerdown', 'pointerup'])
    expect(seen.coords).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ])
  })

  it('can end with pointercancel (RQ-3 end-matrix)', () => {
    const el = document.createElement('div')
    const seen = record(el)
    const dispatched = simulatePointerGesture(
      el,
      [
        { x: 0, y: 0 },
        { x: 9, y: 9 },
      ],
      { end: 'cancel' },
    )
    expect(dispatched).toEqual(['pointerdown', 'pointermove', 'pointercancel'])
    expect(seen.types).toContain('pointercancel')
    expect(seen.types).not.toContain('pointerup')
  })

  it('events bubble to ancestors (handlers often live above the target)', () => {
    const child = document.createElement('div')
    const parent = document.createElement('div')
    parent.appendChild(child)
    const parentTypes: string[] = []
    parent.addEventListener('pointerdown', () => parentTypes.push('pointerdown'))
    parent.addEventListener('pointerup', () => parentTypes.push('pointerup'))

    simulatePointerGesture(child, [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])
    expect(parentTypes).toEqual(['pointerdown', 'pointerup'])
  })

  it('carries pointer identity: id, type, primary; observes via onDispatch', () => {
    const el = document.createElement('div')
    const observed: { type: string; id: number; pointerType: string; primary: boolean }[] = []

    simulatePointerGesture(
      el,
      [
        { x: 0, y: 0 },
        { x: 3, y: 3 },
      ],
      {
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: false,
        onDispatch: (event, type) =>
          observed.push({
            type,
            id: event.pointerId,
            pointerType: event.pointerType,
            primary: event.isPrimary,
          }),
      },
    )

    expect(observed).toEqual([
      { type: 'pointerdown', id: 7, pointerType: 'touch', primary: false },
      { type: 'pointermove', id: 7, pointerType: 'touch', primary: false },
      { type: 'pointerup', id: 7, pointerType: 'touch', primary: false },
    ])
  })

  it('empty sequence dispatches nothing', () => {
    const el = document.createElement('div')
    const seen = record(el)
    expect(simulatePointerGesture(el, [])).toEqual([])
    expect(seen.types).toEqual([])
  })

  it('createPointerEvent exposes the pointer fields on the fallback path too', () => {
    // Simulate an old-jsdom host (no PointerEvent) and check the synthesized
    // event still reads like one.
    const original = (globalThis as { PointerEvent?: unknown }).PointerEvent
    try {
      // @ts-expect-error — deleting a global on purpose for the fallback test
      delete globalThis.PointerEvent
      const event = createPointerEvent(
        'pointerdown',
        { x: 12, y: 34 },
        { pointerId: 42, pointerType: 'pen' },
      )
      const pointerEvent = event as PointerEvent
      expect(pointerEvent.type).toBe('pointerdown')
      expect(pointerEvent.clientX).toBe(12)
      expect(pointerEvent.clientY).toBe(34)
      expect(pointerEvent.pointerId).toBe(42)
      expect(pointerEvent.pointerType).toBe('pen')
      expect(pointerEvent.isPrimary).toBe(true)
      expect(pointerEvent.buttons).toBe(1)
      expect(pointerEvent.bubbles).toBe(true)
      expect(pointerEvent.cancelable).toBe(true)
    } finally {
      if (original !== undefined) (globalThis as { PointerEvent?: unknown }).PointerEvent = original
    }
  })
})
