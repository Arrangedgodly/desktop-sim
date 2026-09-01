// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { lazy } from 'react'
import { useWMStore } from '../stores/wm-store'
import { WindowHost } from '../wm/WindowHost'
import { demoApp } from '../../apps/demo'
import type { AppManifest, AppSurfaceProps } from './contract'
import { appContentFor } from './content'
import { openApp, registerApp, unregisterApp, useAppRegistryStore } from './registry'

// Module singletons — snapshot pristine state and hard-reset before each test.
const initialWM = useWMStore.getState()
const initialRegistry = useAppRegistryStore.getState()

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  useAppRegistryStore.setState(initialRegistry, true)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  cleanup()
})

const VIEWPORT = { w: 800, h: 600 }

function renderHost() {
  return render(<WindowHost viewport={VIEWPORT} contentFor={appContentFor} />)
}

// A synchronous test app: renders its launch context, deterministically.
function TestSurface({ launch, windowId }: AppSurfaceProps) {
  const file = launch.source === 'file' ? `:${launch.file.name}` : ''
  return (
    <div data-testid="test-surface">
      {launch.source}
      {file}@{windowId.slice(0, 4)}
    </div>
  )
}

function testManifest(overrides: Partial<AppManifest> & Pick<AppManifest, 'id'>): AppManifest {
  const TestIcon = () => null
  return { name: overrides.id, icon: TestIcon, mount: TestSurface, ...overrides }
}

function actState(fn: () => void): void {
  act(fn)
}

describe('appContentFor · registered apps mount in the window content slot', () => {
  it('renders the app surface with its launch context (file open)', () => {
    registerApp(testManifest({ id: 'reader', name: 'Reader' }))
    renderHost()

    let id = ''
    actState(() => {
      id = openApp('reader', {
        source: 'file',
        file: { id: 'n1', parentId: 'root', name: 'note-1.txt', kind: 'text' },
      })!
    })

    const dialog = screen.getByRole('dialog', { name: 'Reader' })
    expect(within(dialog).getByTestId('test-surface').textContent).toContain('file:note-1.txt')
    expect(within(dialog).getByTestId('test-surface').textContent).toContain(id.slice(0, 4))
  })

  it('defaults a launch-less window (opened via the wm-store directly) to a launcher open', () => {
    registerApp(testManifest({ id: 'reader' }))
    renderHost()

    actState(() => {
      useWMStore.getState().openWindow({ appId: 'reader' })
    })

    expect(screen.getByTestId('test-surface').textContent).toContain('launcher')
  })

  it('renders the lazy demo app once its chunk resolves, under its manifest title', async () => {
    registerApp(demoApp)
    renderHost()

    actState(() => {
      openApp('demo')
    })

    // Suspense fallback first, then the real surface (dynamic import resolved).
    const surface = await screen.findByText('IM-3 CONTRACT DEMO')
    const dialog = screen.getByRole('dialog', { name: 'Demo Module' })
    expect(dialog.contains(surface)).toBe(true)
    expect(within(dialog).getByText('windowId')).toBeTruthy()
  })

  it('keeps the Suspense fallback mounted while a lazy chunk never resolves', () => {
    const NeverLoads = lazy(() => new Promise(() => {}))
    registerApp(testManifest({ id: 'never', name: 'Lazy One', mount: NeverLoads }))
    renderHost()

    actState(() => {
      openApp('never')
    })

    expect(screen.getByRole('status').textContent).toBe('Mounting Lazy One…')
  })
})

describe('appContentFor · unregister lifecycle (graceful open-window warning)', () => {
  it('register → open → unregister: launcher entry gone, open window shows the notice, window stays closable', () => {
    registerApp(testManifest({ id: 'reader', name: 'Reader' }))
    renderHost()

    let id = ''
    actState(() => {
      id = openApp('reader')!
    })
    const dialog = screen.getByRole('dialog', { name: 'Reader' })
    expect(within(dialog).getByTestId('test-surface')).toBeTruthy()

    actState(() => {
      unregisterApp('reader')
    })

    // Manifest removed from the ledger…
    expect(useAppRegistryStore.getState().apps['reader']).toBeUndefined()
    // …but the window is STILL open and now warns gracefully (no crash, no forced close).
    const stillOpen = screen.getByRole('dialog', { name: 'Reader' })
    expect(stillOpen.querySelector('[data-app-unregistered]')).toBeTruthy()
    expect(within(stillOpen).getByText('MODULE UNAVAILABLE')).toBeTruthy()
    expect(useWMStore.getState().windows[id]).toBeDefined()
  })

  it('a window whose app was never registered shows the notice immediately', () => {
    renderHost()
    actState(() => {
      useWMStore.getState().openWindow({ appId: 'phantom', title: 'Phantom' })
    })

    const dialog = screen.getByRole('dialog', { name: 'Phantom' })
    expect(within(dialog).getByText('MODULE UNAVAILABLE')).toBeTruthy()
    expect(within(dialog).getByText(/phantom/)).toBeTruthy()
  })
})
