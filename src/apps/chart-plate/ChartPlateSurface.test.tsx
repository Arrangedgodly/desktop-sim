// @vitest-environment jsdom
/**
 * Chart Plate · the surface through its real seams (batch 2, brief 9): the
 * manifest's singleton law through the registry, the bench's empty state,
 * the ledger (add/fill/strike, the cap, the provisional dashed frame), the
 * cut toggles (bar/line, parchment/plate — the inline preview follows), the
 * save flow (name offered inline → a REAL image specimen in the store → the
 * accession readout; a collision shakes in-world), and the appState session
 * mirror (debounced write, defensive restore — hostile payloads boot fresh).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { openApp, registerApps, resetAppRegistry, type FSNodeRef } from '../../platform/app-registry'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { chartPlateApp } from './index'
import ChartPlateSurface from './ChartPlateSurface'
import { CHART_MIRROR_DELAY_MS, MAX_ROWS } from './chart-model'

/** An image specimen through the contract's node union (the painter's pattern). */
type FSImageNodeForTest = Extract<FSNodeRef, { kind: 'image' }>

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()

beforeEach(() => {
  vi.useRealTimers()
  useFSStore.setState(initialFS, true)
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  resetAppRegistry()
  registerApps([chartPlateApp]) // this app's own startup registration
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/* -------------------------------- helpers --------------------------------- */

/** Mount the engraver in a REAL registry window (singleton instance). */
function mountBench(): { windowId: string; view: ReturnType<typeof render> } {
  const windowId = openApp('chart-plate')!
  expect(windowId).toBeTruthy()
  const view = render(<ChartPlateSurface windowId={windowId} launch={{ source: 'launcher' }} />)
  return { windowId, view }
}

const plateEl = (): HTMLElement => {
  const el = document.querySelector('[data-chart-plate]')
  if (!(el instanceof HTMLElement)) throw new Error('plate not rendered')
  return el
}

const labelInput = (index: number): HTMLInputElement => {
  const el = document.querySelectorAll<HTMLInputElement>('[data-chart-label-input]')[index]
  if (!el) throw new Error(`label input ${index} not rendered`)
  return el
}

const valueInput = (index: number): HTMLInputElement => {
  const el = document.querySelectorAll<HTMLInputElement>('[data-chart-value-input]')[index]
  if (!el) throw new Error(`value input ${index} not rendered`)
  return el
}

const addLine = (): void => {
  fireEvent.click(document.querySelector('[data-chart-add]')!)
}

const fillRow = (index: number, label: string, value: string): void => {
  fireEvent.change(labelInput(index), { target: { value: label } })
  fireEvent.change(valueInput(index), { target: { value } })
}

const imageNodes = (): FSImageNodeForTest[] =>
  Object.values(useFSStore.getState().fs.nodes).filter(
    (node): node is FSImageNodeForTest => node.kind === 'image',
  )

/** Narrow fake timers: ONLY the debounce/flare seams (the notepad's law). */
const useBenchTimers = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

/* -------------------------------- the bench -------------------------------- */

describe('chart plate surface · the bench', () => {
  it('opens SINGLETON through the registry — a second open raises the same window', () => {
    const first = openApp('chart-plate')
    const second = openApp('chart-plate')
    expect(second).toBe(first)
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(1)
  })

  it('boots the honest empty state: a plate no data rules, a disabled Save', () => {
    mountBench()
    expect(plateEl().hasAttribute('data-empty')).toBe(true)
    expect(plateEl().textContent).toContain('No data rules this plate')
    expect(document.querySelector('[data-chart-rows-readout]')!.textContent).toContain(
      `ROWS 00/${MAX_ROWS}`,
    )
    const save = document.querySelector('[data-chart-save]') as HTMLButtonElement
    expect(save.disabled).toBe(true)
  })

  it('authors rows: add → fill → the plate cuts bars; the census reads', () => {
    mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')
    addLine()
    fillRow(1, 'Beta', '7')

    expect(document.querySelectorAll('[data-chart-row]')).toHaveLength(2)
    expect(document.querySelector('[data-chart-rows-readout]')!.textContent).toContain(
      `ROWS 02/${MAX_ROWS}`,
    )
    expect(plateEl().hasAttribute('data-empty')).toBe(false)
    // Ground rect + two hatched bars ride the inline preview.
    expect(plateEl().querySelectorAll('svg rect').length).toBe(3)
    // Tick numerals ride B612 in the preview too (the Measuring Law).
    const ticks = Array.from(plateEl().querySelectorAll('svg text')).map((t) => t.textContent)
    expect(ticks).toContain('0')
    expect(ticks).toContain('10')
  })

  it('strikes a line from the ledger', () => {
    mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')
    addLine()
    fillRow(1, 'Beta', '7')
    fireEvent.click(document.querySelectorAll('[data-chart-remove]')[0]!)
    expect(document.querySelectorAll('[data-chart-row]')).toHaveLength(1)
    expect(labelInput(0).value).toBe('Beta')
  })

  it('marks an unmeasured value PROVISIONAL (dashed), parseable ones clean', () => {
    mountBench()
    addLine()
    fillRow(0, 'Alpha', 'x')
    expect(valueInput(0).hasAttribute('data-provisional')).toBe(true)
    fireEvent.change(valueInput(0), { target: { value: '4.5' } })
    expect(valueInput(0).hasAttribute('data-provisional')).toBe(false)
  })

  it('HOLDS the ledger cap: the add control stands down at the line', () => {
    mountBench()
    for (let i = 0; i < MAX_ROWS; i += 1) addLine()
    const add = document.querySelector('[data-chart-add]') as HTMLButtonElement
    expect(document.querySelectorAll('[data-chart-row]')).toHaveLength(MAX_ROWS)
    expect(add.disabled).toBe(true)
    expect(document.querySelector('.chart-plate-ledger-note')!.textContent).toContain(
      'Ledger full',
    )
  })

  it('Enter walks the ledger rhythm: label → value → the next line', () => {
    mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')
    fireEvent.keyDown(valueInput(0), { key: 'Enter' })
    expect(document.querySelectorAll('[data-chart-row]')).toHaveLength(2)
  })
})

/* ------------------------------ the cut toggles ----------------------------- */

describe('chart plate surface · the cut', () => {
  it('switches bar ↔ line — the preview trades hatch for a ruled line', () => {
    mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')
    addLine()
    fillRow(1, 'Beta', '7')

    expect(plateEl().querySelectorAll('svg polyline').length).toBe(0)
    const lineToggle = document.querySelector('[data-chart-kind-toggle="line"]')!
    fireEvent.click(lineToggle)
    expect(lineToggle.getAttribute('aria-pressed')).toBe('true')
    expect(plateEl().querySelectorAll('svg polyline').length).toBe(1)
    expect(plateEl().querySelectorAll('svg rect').length).toBe(1) // the ground only
    expect(plateEl().querySelectorAll('svg circle').length).toBe(2) // node dots
  })

  it('switches parchment ↔ plate ground — the plate re-inks', () => {
    mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')
    expect(plateEl().getAttribute('data-ground')).toBe('parchment')

    fireEvent.click(document.querySelector('[data-chart-ground-toggle="plate"]')!)
    expect(plateEl().getAttribute('data-ground')).toBe('plate')
    // The preview re-inks through the resolved plate palette (fallback values
    // in the test host): the dark ground rect carries the sunken chrome.
    const ground = plateEl().querySelector('svg rect')! as SVGSVGElement
    expect(ground.getAttribute('fill')).toBeTruthy()
  })
})

/* -------------------------------- the save flow ------------------------------ */

describe('chart plate surface · the save flow (the painter\'s first-save pattern)', () => {
  it('offers the name inline; Enter cuts and files a REAL image specimen', () => {
    useBenchTimers()
    mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')
    addLine()
    fillRow(1, 'Beta', '7')

    fireEvent.click(document.querySelector('[data-chart-save]')!)
    const nameField = document.querySelector('[data-chart-name-input]') as HTMLInputElement
    expect(nameField).toBeTruthy()
    expect(nameField.value).toBe('Chart plate') // the offered default
    fireEvent.change(nameField, { target: { value: 'unit-survey-44' } })
    fireEvent.keyDown(nameField, { key: 'Enter' })

    // Filed: a real image specimen under the hold, a PLT accession readout.
    const filed = imageNodes().find((node) => node.name === 'unit-survey-44')
    expect(filed).toBeDefined()
    expect(filed!.src.startsWith('data:image/svg+xml,')).toBe(true)
    expect(document.querySelector('[data-chart-name-input]')).toBeNull() // the field closed
    expect(document.querySelector('[data-chart-accession]')!.textContent).toMatch(/^PLT-\d{4}$/)

    // The stamp flare settles without a trace.
    act(() => vi.advanceTimersByTime(800))
  })

  it('refuses a duplicate label IN-WORLD: the shake, and nothing new filed', () => {
    useBenchTimers()
    mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')

    const cut = (name: string): void => {
      fireEvent.click(document.querySelector('[data-chart-save]')!)
      const field = document.querySelector('[data-chart-name-input]') as HTMLInputElement
      fireEvent.change(field, { target: { value: name } })
      fireEvent.keyDown(field, { key: 'Enter' })
    }
    cut('twin-plate')
    expect(imageNodes().filter((n) => n.name === 'twin-plate')).toHaveLength(1)

    cut('TWIN-PLATE') // the catalog's case-insensitive sibling rule
    const field = document.querySelector('[data-chart-name-input]') as HTMLInputElement
    expect(field).toBeTruthy() // still editing — refused, not filed
    expect(field.hasAttribute('data-rename-rejected')).toBe(true)
    expect(imageNodes().filter((n) => n.name === 'twin-plate')).toHaveLength(1)
    act(() => vi.advanceTimersByTime(500))
  })

  it('Ctrl+S rides the same cut path', () => {
    useBenchTimers()
    const { view } = mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')
    fireEvent.keyDown(view.container.firstElementChild as Element, {
      key: 's',
      ctrlKey: true,
    })
    expect(document.querySelector('[data-chart-name-input]')).toBeTruthy()
  })
})

/* ------------------------------ the session mirror --------------------------- */

describe('chart plate surface · the appState session mirror', () => {
  it('mirrors the bench (debounced) and RESTORES it on a fresh mount', () => {
    useBenchTimers()
    const { windowId } = mountBench()
    addLine()
    fillRow(0, 'Alpha', '12')
    fireEvent.click(document.querySelector('[data-chart-kind-toggle="line"]')!)

    act(() => vi.advanceTimersByTime(CHART_MIRROR_DELAY_MS))
    const mirrored = useWMStore.getState().windows[windowId]?.appState as {
      rows: { label: string; value: number }[]
      kind: string
    }
    expect(mirrored.rows).toEqual([{ label: 'Alpha', value: 12 }])
    expect(mirrored.kind).toBe('line')

    // A fresh mount on the same window restores the bench.
    cleanup()
    render(<ChartPlateSurface windowId={windowId} launch={{ source: 'launcher' }} />)
    expect(labelInput(0).value).toBe('Alpha')
    expect(valueInput(0).value).toBe('12')
    expect(
      document.querySelector('[data-chart-kind-toggle="line"]')!.getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('boots a FRESH bench against a hostile appState — never a crash', () => {
    const { windowId } = mountBench()
    cleanup()
    useWMStore.getState().setWindowAppState(windowId, { rows: 'nope', kind: 'pie' })
    render(<ChartPlateSurface windowId={windowId} launch={{ source: 'launcher' }} />)
    expect(document.querySelectorAll('[data-chart-row]')).toHaveLength(0)
    expect(plateEl().hasAttribute('data-empty')).toBe(true)
  })
})
