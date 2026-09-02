// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { lazy, useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useWMStore } from '../stores/wm-store'
import { WindowHost } from '../wm/WindowHost'
import type { AppManifest, AppSurfaceProps } from './contract'
import { appContentFor } from './content'
import { openApp, registerApp, useAppRegistryStore } from './registry'
import { retryableLazy, resetLazyMount } from './lazy-mount'
import {
  buildModuleDiagnostics,
  classifyModuleFault,
  copyTextWithFallback,
  extractModuleUrl,
  isChunkLoadError,
} from './module-fault-model'
import { useStorageStatusStore } from '../../lib/storage/status'

/**
 * HU-1 unit gates — the per-window app boundary:
 *  · a thrown render error in ANY app isolates to that window's MODULE FAULT
 *    card while the OS, sibling windows and the WM keep running;
 *  · a lazy-chunk load failure lands on the SAME card, classified network;
 *  · Reload module remounts the app fresh (and re-attempts a failed chunk
 *    through retryableLazy);
 *  · Copy diagnostics rides the clipboard → execCommand → reveal fallbacks;
 *  · fallback stability: a repeat fault lands on the card again — the
 *    boundary never feeds its own render errors back into a loop.
 */

const initialWM = useWMStore.getState()
const initialRegistry = useAppRegistryStore.getState()
const initialStatus = useStorageStatusStore.getState()

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  useAppRegistryStore.setState(initialRegistry, true)
  useStorageStatusStore.setState(initialStatus, true)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  cleanup()
})

const VIEWPORT = { w: 900, h: 700 }

function renderHost() {
  return render(<WindowHost viewport={VIEWPORT} contentFor={appContentFor} />)
}

function TestIcon() {
  return null
}

function manifest(id: string, mount: ComponentType<AppSurfaceProps>, name = id): AppManifest {
  return { id, name, icon: TestIcon, mount }
}

function openInHost(appId: string): void {
  act(() => {
    openApp(appId)
  })
}

/**
 * Fault-injecting test surfaces. React 19 reports an error thrown during the
 * FIRST concurrent render pass as a recoverable error (rethrown through the
 * global reporter even though the boundary catches it), so the test faults
 * land the way real in-session faults do: the module mounts, then a bad read
 * makes a LATER render throw. `shouldThrow` is consulted at mount time.
 */
function makeFaultingSurface(
  testId: string,
  shouldThrow: () => boolean,
): ComponentType<AppSurfaceProps> {
  function FaultingSurface(): ReactNode {
    const [boom, setBoom] = useState(false)
    const armed = useRef(false)
    armed.current = shouldThrow()
    useEffect(() => {
      if (armed.current) setBoom(true)
      // arm check runs once per mount — the reload path re-evaluates it
    }, [])
    if (boom) throw new Error('specimen ledger exploded')
    return <div data-testid={testId}>{testId} standing</div>
  }
  return FaultingSurface
}

/** Render counter across mounts (reload-module remount assertions). */
let renders = 0

describe('module-fault-model · classification + diagnostics', () => {
  it('recognises every shipping engine chunk-failure phrase as a network fault', () => {
    expect(
      isChunkLoadError('Failed to fetch dynamically imported module: "/src/apps/x/Surface.tsx"'),
    ).toBe(true) // Chromium
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true) // Firefox
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true) // Safari
    expect(isChunkLoadError('specimen ledger exploded')).toBe(false)
  })

  it('classifies a TypeError with a code message as a code fault, keeping the first line', () => {
    const fault = classifyModuleFault(new TypeError('boiler jammed\nsecond line'))
    expect(fault.kind).toBe('code')
    expect(fault.errorName).toBe('TypeError')
    expect(fault.message).toBe('boiler jammed')
  })

  it('builds the diagnostics report with module id, fault-kind line and storage facts', () => {
    const fault = classifyModuleFault(
      new TypeError('Failed to fetch dynamically imported module: "/src/apps/x/Surface.tsx"'),
    )
    const report = buildModuleDiagnostics({
      appId: 'x',
      moduleName: 'X Module',
      fault,
      storage: { phase: 'ready', boot: 'stored', writes: 3 },
      at: new Date('2026-09-01T12:00:00Z'),
      userAgent: 'spec-agent',
    })
    expect(report).toContain('HOLD/OS 0.1.0 — module fault report')
    expect(report).toContain('module: X Module (x)')
    expect(report).toContain('MODULE TRANSFER FAILED (network)')
    expect(report).toContain('TypeError: Failed to fetch dynamically imported module')
    expect(report).toContain('storage: phase=ready boot=stored writes=3')
    expect(report).toContain('time: 2026-09-01T12:00:00.000Z')
    expect(report).toContain('agent: spec-agent')
  })
})

describe('module-fault-model · copyTextWithFallback chain', () => {
  const originalClipboard = navigator.clipboard
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    })
  })

  it('uses the async clipboard when present', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await expect(copyTextWithFallback('report')).resolves.toBe('clipboard')
    expect(writeText).toHaveBeenCalledWith('report')
  })

  it('falls back to execCommand when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    const exec = vi.fn().mockReturnValue(true)
    document.execCommand = exec as unknown as typeof document.execCommand
    try {
      await expect(copyTextWithFallback('report')).resolves.toBe('fallback')
      expect(exec).toHaveBeenCalledWith('copy')
    } finally {
      delete (document as { execCommand?: unknown }).execCommand
    }
  })

  it('answers manual when neither path works (the card reveals the text)', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    // jsdom ships no execCommand — the honest "neither works" environment.
    await expect(copyTextWithFallback('report')).resolves.toBe('manual')
  })
})

describe('AppBoundary · a thrown app error isolates to its window', () => {
  it('shows the MODULE FAULT card inside the faulting window only', async () => {
    registerApp(
      manifest(
        'faulting',
        makeFaultingSurface('faulting-surface', () => true),
        'Faulting Module',
      ),
    )
    registerApp(manifest('healthy', () => <div data-testid="healthy-surface">fine</div>))
    renderHost()
    openInHost('faulting')
    openInHost('healthy')

    const dialog = screen.getByRole('dialog', { name: 'Faulting Module' })
    const card = await within(dialog).findByRole('alert')
    expect(card.hasAttribute('data-module-fault')).toBe(true)
    expect(card.getAttribute('data-fault-kind')).toBe('code')
    expect(within(card).getByText('MODULE FAULT')).toBeTruthy()
    expect(within(card).getByText(/Faulting Module/)).toBeTruthy()
    expect(within(card).getByText(/internal fault and was taken offline/i)).toBeTruthy()

    // The sibling window is alive, the WM still holds both windows, and the
    // host did not crash: the OS kept running.
    expect(screen.getByTestId('healthy-surface').textContent).toBe('fine')
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(2)
  })

  it('lands a lazy chunk failure on the same card, classified network', async () => {
    const FaultyChunk = lazy(() =>
      Promise.reject(
        new TypeError('Failed to fetch dynamically imported module: "/src/apps/x/Surface.tsx"'),
      ),
    )
    registerApp(manifest('chunked', FaultyChunk, 'Chunked Module'))
    renderHost()
    openInHost('chunked')

    const card = await screen.findByRole('alert')
    expect(card.getAttribute('data-fault-kind')).toBe('network')
    expect(
      within(card).getByText(
        'MODULE TRANSFER FAILED (network) — the module’s code could not be fetched',
      ),
    ).toBeTruthy()
    expect(within(card).getByText(/connection or transfer fault/i)).toBeTruthy()
  })

  it('Reload module remounts the app fresh (a real remount, not a re-render)', async () => {
    renders = 0
    registerApp(
      manifest(
        'flaky',
        makeFaultingSurface('flaky-surface', () => {
          renders += 1
          return renders === 1 // the first mount faults; the reload mounts healthy
        }),
        'Flaky Module',
      ),
    )
    renderHost()
    openInHost('flaky')
    expect(await screen.findByRole('alert')).toBeTruthy()

    act(() => {
      screen.getByRole('button', { name: 'Reload module' }).click()
    })
    // The reloaded module is a FRESH mount — the faulted tree was unmounted,
    // its state gone, and its render consulted the arm flag anew.
    expect(await screen.findByTestId('flaky-surface')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Copy diagnostics reveals the report when no clipboard path exists', async () => {
    registerApp(
      manifest(
        'faulting',
        makeFaultingSurface('faulting-surface', () => true),
      ),
    )
    renderHost()
    openInHost('faulting')
    await screen.findByRole('alert')

    await act(async () => {
      screen.getByRole('button', { name: 'Copy diagnostics' }).click()
    })
    const button = screen.getByRole('button', {
      name: 'Copy unavailable — select below',
    })
    expect(button).toBeTruthy()
    const report = document.querySelector('[data-module-fault-report]') as HTMLElement
    expect(report.textContent).toContain('module: faulting (faulting)')
    expect(report.textContent).toContain('MODULE FAULT (code)')
  })

  it('reports copied when the async clipboard works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    registerApp(
      manifest(
        'faulting',
        makeFaultingSurface('faulting-surface', () => true),
      ),
    )
    renderHost()
    openInHost('faulting')
    await screen.findByRole('alert')

    await act(async () => {
      screen.getByRole('button', { name: 'Copy diagnostics' }).click()
    })
    expect(screen.getByRole('button', { name: 'Diagnostics copied' })).toBeTruthy()
    expect(writeText).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-module-fault-report]')).toBeNull()
  })

  it('fallback stability: a fault landing again after a reload returns to the card, never a loop', async () => {
    let armed = true
    registerApp(
      manifest(
        'flaky',
        makeFaultingSurface('flaky-surface', () => armed),
        'Flaky Module',
      ),
    )
    renderHost()
    openInHost('flaky')
    expect(await screen.findByRole('alert')).toBeTruthy()

    // Reload while STILL armed: the fresh mount faults again — back on the card.
    act(() => {
      screen.getByRole('button', { name: 'Reload module' }).click()
    })
    expect(await screen.findByRole('alert')).toBeTruthy()

    armed = false
    act(() => {
      screen.getByRole('button', { name: 'Reload module' }).click()
    })
    // Two faults, two cards, one stable window — no unmount, no cascade, no loop.
    expect(await screen.findByTestId('flaky-surface')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(1)
    expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe('retryableLazy · reload-module honesty for chunk faults', () => {
  it('a plain lazy caches its rejection forever — the reason the helper exists', async () => {
    let attempts = 0
    const Faulty = lazy(() => {
      attempts += 1
      return Promise.reject(new TypeError('Failed to fetch dynamically imported module: "x"'))
    })
    registerApp(manifest('chunked', Faulty, 'Chunked Module'))
    renderHost()
    openInHost('chunked')
    await screen.findByRole('alert')

    act(() => {
      screen.getByRole('button', { name: 'Reload module' }).click()
    })
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    // React lazy memoized the rejection: the re-mount threw the SAME payload.
    expect(attempts).toBe(1)
  })

  it('retryableLazy + Reload module re-attempts the real import and recovers', async () => {
    let failFirst = true
    let attempts = 0
    const Mount = retryableLazy(async () => {
      attempts += 1
      if (failFirst) {
        throw new TypeError('Failed to fetch dynamically imported module: "x"')
      }
      return { default: () => <div data-testid="recovered">recovered module</div> }
    })
    registerApp(manifest('chunked', Mount, 'Chunked Module'))
    renderHost()
    openInHost('chunked')
    const card = await screen.findByRole('alert')
    expect(card.getAttribute('data-fault-kind')).toBe('network')

    failFirst = false
    act(() => {
      screen.getByRole('button', { name: 'Reload module' }).click()
    })
    expect(await screen.findByTestId('recovered')).toBeTruthy()
    expect(attempts).toBe(2) // a REAL second import attempt happened
    expect(resetLazyMount(Mount)).toBe(true)
  })

  it('resetLazyMount is a no-op for eager mounts', () => {
    const Eager = () => <div />
    expect(resetLazyMount(Eager)).toBe(false)
  })

  it('extractModuleUrl reads the URL browsers name in chunk failures', () => {
    const fault = classifyModuleFault(
      new TypeError(
        'Failed to fetch dynamically imported module: "http://localhost:5180/src/apps/demo/DemoSurface.tsx"',
      ),
    )
    expect(extractModuleUrl(fault)).toBe('http://localhost:5180/src/apps/demo/DemoSurface.tsx')
    // Safari's URL-less message degrades honestly.
    expect(
      extractModuleUrl(classifyModuleFault(new Error('Importing a module script failed.'))),
    ).toBeNull()
  })

  it('resetLazyMount honors the cache-bust URL — the retry imports under a fresh key', async () => {
    let imports = 0
    // The failing loader names a SAME-ORIGIN module (as Chrome does) so the
    // boundary's same-origin check accepts it for the busted re-import.
    const origin = window.location.origin
    const Mount = retryableLazy(async () => {
      imports += 1
      throw new TypeError(
        `Failed to fetch dynamically imported module: "${origin}/src/apps/chunked/Surface.tsx"`,
      )
    })
    registerApp(manifest('chunked', Mount, 'Chunked Module'))
    renderHost()
    openInHost('chunked')
    expect(await screen.findByRole('alert')).toBeTruthy()

    act(() => {
      screen.getByRole('button', { name: 'Reload module' }).click()
    })
    // The retry went through a FRESH cache-busted lazy (not React's cached
    // rejection, not the app's own loader): in jsdom the busted URL is
    // unreachable, so the module faults again — the honest result for a dead
    // host. The original loader ran exactly once; the real-browser network
    // classification + recovery is e2e-proven (resilience.spec.ts).
    const card = await screen.findByRole('alert')
    expect(card.hasAttribute('data-module-fault')).toBe(true)
    expect(imports).toBe(1)
  })
})

describe('AppBoundary · diagnostics read the live storage status', () => {
  it('the report carries the storage phase/boot/writes at copy time', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    act(() => {
      useStorageStatusStore.setState({ phase: 'ready', bootOrigin: 'backup', saveCount: 7 })
    })
    registerApp(
      manifest(
        'faulting',
        makeFaultingSurface('faulting-surface', () => true),
      ),
    )
    renderHost()
    openInHost('faulting')
    await screen.findByRole('alert')

    await act(async () => {
      screen.getByRole('button', { name: 'Copy diagnostics' }).click()
    })
    expect(writeText.mock.calls[0]?.[0]).toContain('storage: phase=ready boot=backup writes=7')
  })
})
