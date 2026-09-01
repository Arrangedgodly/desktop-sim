import { describe, expect, it } from 'vitest'
import type { AppManifest } from '../app-registry'
import type { WindowRecord } from '../stores/wm-store'
import {
  MODULE_UNAVAILABLE_LABEL,
  buildWindowLeds,
  ledAriaLabel,
  ledTitle,
  type WindowLed,
} from './leds'

/* Pure derivation tests (node env — no DOM, no React). Fixtures are hand-built
 * window records + manifests; only shape matters, never store identity. */

let seq = 0

function record(
  id: string,
  appId: string,
  openedAt: number,
  extra: Partial<WindowRecord> = {},
): WindowRecord {
  seq += 1
  return {
    id,
    appId,
    instanceId: `auto:${id}`,
    geometry: { x: 0, y: 0, w: 320, h: 200 },
    z: seq,
    minimized: false,
    maximized: false,
    title: `${appId} window`,
    openedAt,
    ...extra,
  }
}

function manifest(id: string, name: string): AppManifest {
  return {
    id,
    name,
    icon: () => null,
    mount: () => null,
  }
}

const PROBE = manifest('probe', 'Probe Module')
const SINGLE = manifest('single', 'Singleton Module')

describe('leds · buildWindowLeds', () => {
  it('an empty registry yields an empty strip', () => {
    expect(buildWindowLeds({}, [], null, { probe: PROBE })).toEqual([])
  })

  it('one window per app: the manifest name, no instance suffix', () => {
    const a = record('a', 'probe', 100)
    const b = record('b', 'single', 200)
    const leds = buildWindowLeds({ a, b }, ['a', 'b'], 'a', { probe: PROBE, single: SINGLE })
    expect(leds.map((led) => led.label)).toEqual(['Probe Module', 'Singleton Module'])
    expect(leds.every((led) => led.instanceCount === 1 && led.instanceIndex === 1)).toBe(true)
  })

  it('multi-instance windows carry the 1-based open-order suffix', () => {
    const first = record('w1', 'probe', 100)
    const second = record('w2', 'probe', 250)
    const third = record('w3', 'probe', 400)
    const leds = buildWindowLeds(
      { w1: first, w2: second, w3: third },
      ['w1', 'w2', 'w3'],
      null,
      { probe: PROBE },
    )
    expect(leds.map((led) => led.label)).toEqual(['Probe Module 1', 'Probe Module 2', 'Probe Module 3'])
    expect(leds.every((led) => led.instanceCount === 3)).toBe(true)
  })

  it('orders by openedAt even when stacking was raised in between', () => {
    const early = record('early', 'probe', 100)
    const late = record('late', 'probe', 300)
    // late was raised: zOrder lists it last-first (bottom→top: early below late)
    const leds = buildWindowLeds({ early, late }, ['early', 'late'], 'late', { probe: PROBE })
    expect(leds.map((led) => led.id)).toEqual(['early', 'late'])
    expect(leds.map((led) => led.label)).toEqual(['Probe Module 1', 'Probe Module 2'])

    // raise swaps stacking but never the LED order (launch order is the rail's)
    const raised = buildWindowLeds({ early, late }, ['late', 'early'], 'early', { probe: PROBE })
    expect(raised.map((led) => led.id)).toEqual(['early', 'late'])
  })

  it('same-millisecond opens fall back to stacking order (deterministic)', () => {
    const a = record('a', 'probe', 500)
    const b = record('b', 'probe', 500)
    const leds = buildWindowLeds({ a, b }, ['a', 'b'], null, { probe: PROBE })
    expect(leds.map((led) => led.id)).toEqual(['a', 'b'])
    expect(leds.map((led) => led.label)).toEqual(['Probe Module 1', 'Probe Module 2'])
  })

  it('minimized windows stay on the rail and carry the flag', () => {
    const a = record('a', 'probe', 100, { minimized: true })
    const leds = buildWindowLeds({ a }, ['a'], null, { probe: PROBE })
    expect(leds).toHaveLength(1)
    expect(leds[0]!.minimized).toBe(true)
    expect(leds[0]!.focused).toBe(false)
  })

  it('focus follows focusedId across apps', () => {
    const a = record('a', 'probe', 100)
    const b = record('b', 'single', 200)
    const leds = buildWindowLeds({ a, b }, ['a', 'b'], 'b', { probe: PROBE, single: SINGLE })
    expect(leds[0]!.focused).toBe(false)
    expect(leds[1]!.focused).toBe(true)
  })

  it('an unregistered app shows the MODULE UNAVAILABLE state (IM-3)', () => {
    const a = record('a', 'gone', 100)
    const leds = buildWindowLeds({ a }, ['a'], 'a', {})
    expect(leds).toHaveLength(1)
    expect(leds[0]!.label).toBe(MODULE_UNAVAILABLE_LABEL)
    expect(leds[0]!.unavailable).toBe(true)
    // the window itself still reports: focused flag survives the app leaving
    expect(leds[0]!.focused).toBe(true)
  })
})

describe('leds · accessible names and tooltips', () => {
  const base: WindowLed = {
    id: 'a',
    appId: 'probe',
    label: 'Probe Module 2',
    instanceIndex: 2,
    instanceCount: 3,
    minimized: false,
    focused: true,
    unavailable: false,
  }

  it('the aria label carries caption + live state word', () => {
    expect(ledAriaLabel(base)).toBe('Probe Module 2, focused')
    expect(ledAriaLabel({ ...base, focused: false, minimized: true })).toBe(
      'Probe Module 2, minimized',
    )
    expect(ledAriaLabel({ ...base, focused: false })).toBe('Probe Module 2, open')
    expect(
      ledAriaLabel({ ...base, label: MODULE_UNAVAILABLE_LABEL, unavailable: true, focused: false }),
    ).toBe(`${MODULE_UNAVAILABLE_LABEL}, open`)
  })

  it('the tooltip names the action the click will take', () => {
    expect(ledTitle(base)).toContain('minimize')
    expect(ledTitle({ ...base, focused: false, minimized: true })).toContain('restore')
    expect(ledTitle({ ...base, focused: false })).toContain('focus')
    expect(ledTitle({ ...base, unavailable: true, appId: 'gone' })).toContain(
      'not registered with the archive',
    )
  })
})
