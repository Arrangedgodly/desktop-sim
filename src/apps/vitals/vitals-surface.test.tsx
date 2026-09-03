// @vitest-environment jsdom
/**
 * Vitals surface tests (federated batch 2) — the panel through its real
 * seams: mounted against a REAL registry window (openApp singleton), the
 * fleet + this module registered, telemetry SOURCES injected so the honest
 * paths are provable:
 *  - live seams render true readings (storage estimate, heap, ladder, counts);
 *  - ABSENT seams render the engraved NOT TELEMETRIED plate — never a
 *    fabricated number (acceptance case 2, simulated at the source);
 *  - the sample tick lands (stepped render: the readout moves to the new
 *    truth), the rate selector walks by keyboard and persists through the
 *    window's opaque appState, and hostile appState falls back to the
 *    default rate (validated on read).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LAUNCHER_LAUNCH, openApp, registerApps, resetAppRegistry } from '../../platform/app-registry'
import { useWMStore } from '../../platform/stores'
import { apps } from '../index'
import { vitalsApp } from './index'
import VitalsSurface from './VitalsSurface'
import { type ArchiveEstimate, type TelemetrySources } from './vitals-telemetry'
import type { BootMilestone } from '../../lib/perf'

/* ------------------------- store/module hygiene --------------------------- */

const initialWM = useWMStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  registerApps(apps) // the REAL startup registration — vitals rides in the fleet (18 modules)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* --------------------------------- helpers -------------------------------- */

const MIB = 1024 * 1024

const TIMELINE: readonly BootMilestone[] = [
  { name: 'boot-start', t: 100, order: 0 },
  { name: 'app-mounted', t: 480, order: 1 },
  { name: 'desktop-ready', t: 1320, order: 2 },
]

/** A fully-controllable telemetry source (the real one's shape, faked). */
function stubTelemetry(over: Partial<TelemetrySources> = {}): TelemetrySources {
  return {
    now: () => 1000,
    epochNow: () => 11_000,
    timeOrigin: () => 1_000,
    heap: () => ({ used: 12 * MIB, total: 24 * MIB, limit: 2048 * MIB }),
    bootTimeline: () => TIMELINE,
    supportsLongTasks: () => true,
    observeLongTasks: () => () => undefined,
    estimate: () => Promise.resolve<ArchiveEstimate | null>({ usage: 1024, quota: 2048 }),
    ...over,
  }
}

/** Mount the singleton panel against a REAL registry window. */
function mountPanel(telemetry: TelemetrySources = stubTelemetry()) {
  const windowId = openApp('vitals')!
  expect(windowId).toBeTruthy()
  const view = render(<VitalsSurface windowId={windowId} launch={LAUNCHER_LAUNCH} telemetry={telemetry} />)
  return { windowId, view }
}

const query = (q: string): HTMLElement | null => document.querySelector(q)!
const plate = (name: string): HTMLElement => query(`[data-vitals-plate="${name}"]`)!

/* ------------------------------ the manifest ------------------------------ */

describe('vitals · manifest', () => {
  it('declares the singleton instrument panel with a lazy mount', () => {
    expect(vitalsApp.id).toBe('vitals')
    expect(vitalsApp.name).toBe('Console Vitals')
    expect(vitalsApp.singleton).toBe(true)
    expect(vitalsApp.defaultGeometry).toEqual({ w: 720, h: 520 })
    expect(vitalsApp.acceptedFileTypes).toBeUndefined() // opened, never opened-onto
    expect(typeof vitalsApp.icon).toBe('function')
  })

  it('is a singleton: a second open raises the SAME window', () => {
    const first = openApp('vitals')
    const second = openApp('vitals')
    expect(first).toBe(second)
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(1)
  })
})

/* ------------------------------ live readings ------------------------------ */

describe('vitals · live seams render true readings', () => {
  it('shows the storage estimate, heap readout, ladder, and counts', async () => {
    mountPanel()

    // storage: 1 KiB of 2 KiB = 50%, usage formatted honestly
    await waitFor(() => {
      expect(query('[data-vitals-storage-readout]')?.textContent).toBe('50%')
    })
    expect(query('[data-vitals-storage-usage]')?.textContent).toBe('1.0 KiB')

    // heap: the current used bytes, B612-formatted
    expect(query('[data-vitals-heap-readout]')?.textContent).toBe('12.0 MiB')

    // the boot ladder carries the session's real milestones
    expect(screen.getAllByText('DESKTOP-READY').length).toBeGreaterThan(0)

    // console counts: this window is open; the fleet reads 18 registered
    expect(query('[data-vitals-windows]')?.textContent).toBe('1')
    expect(query('[data-vitals-modules]')?.textContent).toBe('18')

    // uptime came from the timeline (first mark t=100, now=1000 -> 900ms)
    expect(query('[data-vitals-uptime]')?.textContent).toBe('00:00:00')

    // no NOT TELEMETRIED plates on a fully-live panel
    expect(document.querySelectorAll('[data-vitals-na]')).toHaveLength(0)
  })

  it('totals long tasks in the plate as they arrive', () => {
    const windowId = openApp('vitals')!
    const telemetry = stubTelemetry({
      now: () => 5_000,
      observeLongTasks: (sink) => {
        sink({ t: 4_000, dur: 120 })
        sink({ t: 4_500, dur: 80 })
        return () => undefined
      },
    })
    const view = render(<VitalsSurface windowId={windowId} launch={LAUNCHER_LAUNCH} telemetry={telemetry} />)

    // events land in the ledger during mount effects; the plate reads them
    // on the next render (a tick, or this explicit one) — never mid-flight
    view.rerender(<VitalsSurface windowId={windowId} launch={LAUNCHER_LAUNCH} telemetry={telemetry} />)
    expect(query('[data-vitals-longtasks-count]')?.textContent).toBe('2')
    expect(query('[data-vitals-longtasks-worst]')?.textContent).toBe('120MS')

    // markers ride the frame trace only once a trace exists (x-mapping
    // needs the window); the empty trace states itself honestly
    expect(plate('fps').querySelector('.vitals-trace-await')?.textContent).toBe(
      'AWAITING FIRST SAMPLE',
    )
  })
})

/* --------------------------- honest unavailability -------------------------- */

describe('vitals · absent seams render NOT TELEMETRIED, never a lie', () => {
  it('cuts the engraved plate for heap, long tasks, boot, and storage', async () => {
    mountPanel(
      stubTelemetry({
        heap: () => null,
        supportsLongTasks: () => false,
        bootTimeline: () => [],
        estimate: () => Promise.resolve(null),
      }),
    )

    await waitFor(() => {
      expect(document.querySelectorAll('[data-vitals-na]')).toHaveLength(4)
    })
    for (const seam of ['heap', 'longtasks', 'boot', 'storage']) {
      const na = query(`[data-vitals-na="${seam}"]`)!
      expect(na).toBeTruthy()
      expect(na.textContent).toContain('NOT TELEMETRIED')
      expect(na.querySelector('.vitals-na')).toBeTruthy() // the dashed provisional frame
    }

    // the frame plate still renders — rAF is a live seam here
    expect(plate('fps')).toBeTruthy()
    // and the console counts need no optional seam at all (the full fleet)
    expect(query('[data-vitals-modules]')?.textContent).toBe('18')
  })

  it('renders the estimating state before the estimate resolves', async () => {
    let release: ((value: ArchiveEstimate | null) => void) | null = null
    mountPanel(
      stubTelemetry({
        estimate: () => new Promise((resolve) => (release = resolve)),
      }),
    )
    expect(query('[data-vitals-storage-pending]')).toBeTruthy()
    expect(document.querySelector('[data-vitals-na="storage"]')).toBeNull()
    // resolve null -> the honest NA plate (the async act flushes the microtask)
    await act(async () => {
      release?.(null)
    })
    expect(document.querySelector('[data-vitals-na="storage"]')).not.toBeNull()
  })
})

/* --------------------------- sampling + persistence ------------------------- */

describe('vitals · the stepped sample tick + the persisted rate', () => {
  it('moves the heap readout when a tick lands (stepped, on the cadence)', async () => {
    vi.useFakeTimers()
    const values = [12 * MIB, 12 * MIB, 24 * MIB, 24 * MIB, 24 * MIB]
    let calls = 0
    mountPanel(
      stubTelemetry({
        heap: () => {
          const v = values[Math.min(calls, values.length - 1)]!
          calls += 1
          return { used: v, total: 64 * MIB, limit: 2048 * MIB }
        },
      }),
    )
    expect(query('[data-vitals-heap-readout]')?.textContent).toBe('12.0 MiB')

    // one cadence beat at the default 1S rate -> the tick reads 24 MiB
    await act(async () => {
      vi.advanceTimersByTime(1_100)
    })
    expect(query('[data-vitals-heap-readout]')?.textContent).toBe('24.0 MiB')

    // and the tick kept the cadence armed (a second beat lands too)
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(query('[data-vitals-heap-readout]')?.textContent).toBe('24.0 MiB')
  })

  it('choosing a rate persists it through the window appState', async () => {
    const { windowId } = mountPanel()
    expect(query('[data-vitals-root]')?.getAttribute('data-vitals-rate')).toBe('1000')

    fireEvent.click(query('[data-vitals-rate-option="250"]')!)
    expect(query('[data-vitals-rate-option="250"]')!.getAttribute('aria-checked')).toBe('true')
    expect(useWMStore.getState().windows[windowId]?.appState).toEqual({ rateMs: 250 })
    expect(query('[data-vitals-root]')?.getAttribute('data-vitals-rate')).toBe('250')
  })

  it('arrows walk the radiogroup: selection AND the persisted rate move', () => {
    const { windowId } = mountPanel()
    const checkedRate = (): string =>
      document.querySelector('[data-vitals-rate-option][aria-checked="true"]')!.getAttribute(
        'data-vitals-rate-option',
      )!

    const group = document.querySelector('[role="radiogroup"]')!

    // from the default 1S: right -> 5S, right -> wraps to 250MS
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(checkedRate()).toBe('5000')
    expect(useWMStore.getState().windows[windowId]?.appState).toEqual({ rateMs: 5000 })

    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(checkedRate()).toBe('250')
    expect(useWMStore.getState().windows[windowId]?.appState).toEqual({ rateMs: 250 })

    // left from 250MS wraps back to 5S
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(checkedRate()).toBe('5000')

    // the rails: End -> the last stop, Home -> the first
    fireEvent.keyDown(group, { key: 'End' })
    expect(checkedRate()).toBe('5000')
    fireEvent.keyDown(group, { key: 'Home' })
    expect(checkedRate()).toBe('250')
    expect(useWMStore.getState().windows[windowId]?.appState).toEqual({ rateMs: 250 })
  })

  it('a hostile persisted appState falls back to the default rate', () => {
    const windowId = openApp('vitals')!
    useWMStore.getState().setWindowAppState(windowId, { rateMs: 'fast' })
    mountPanel()
    expect(query('[data-vitals-rate-option="1000"]')!.getAttribute('aria-checked')).toBe('true')

    cleanup()
    useWMStore.getState().setWindowAppState(windowId, { rateMs: 777 })
    mountPanel()
    expect(query('[data-vitals-rate-option="1000"]')!.getAttribute('aria-checked')).toBe('true')
    expect(query('[data-vitals-root]')?.getAttribute('data-vitals-rate')).toBe('1000')
  })
})

/* -------------------------------- replay ----------------------------------- */

describe('vitals · the boot replay (the one authored moment)', () => {
  it('replays the ladder in stepped succession at true durations', async () => {
    vi.useFakeTimers()
    mountPanel()

    const replay = query('[data-vitals-replay]')!
    expect(replay).toBeTruthy()
    fireEvent.click(replay)

    // mark 0 lights immediately (never starts blank)
    const litNow = (): Element | null =>
      document.querySelector('.vitals-ladder-name--now')
    expect(litNow()?.textContent).toBe('BOOT-START')

    // 380ms later the second mark is the playhead
    await act(async () => {
      vi.advanceTimersByTime(380)
    })
    expect(litNow()?.textContent).toBe('APP-MOUNTED')

    await act(async () => {
      vi.advanceTimersByTime(840)
    })
    expect(litNow()?.textContent).toBe('DESKTOP-READY')

    // and the moment ends: the ladder returns to rest, all marks visible
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(litNow()).toBeNull()
    expect(screen.getAllByText('DESKTOP-READY').length).toBeGreaterThan(0)
  })
})
