// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { useWMStore } from '../stores/wm-store'
import { WindowHost } from '../wm/WindowHost'
import type { AppManifest, AppSurfaceProps } from './contract'
import { appContentFor } from './content'
import { openApp, registerApp, useAppRegistryStore } from './registry'
import { renderFault } from './fault-seam'
import {
  armAppFault,
  clearInjectedFaults,
  disarmAppFault,
  installFaultHooks,
  listArmedFaults,
  uninstallFaultHooks,
} from './fault-injection'

/**
 * HU-1 fault-injection hooks — the dev/test seam that lets a suite throw from
 * an app or fail its chunk load through the REAL platform machinery (the
 * per-window AppBoundary; zero fault-specific UI). Gates: the seam's null
 * product when uninstalled, both fault kinds through AppSlot, the window
 * hooks surface, and clean uninstall.
 */

const initialWM = useWMStore.getState()
const initialRegistry = useAppRegistryStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  useAppRegistryStore.setState(initialRegistry, true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  installFaultHooks()
})

afterEach(() => {
  uninstallFaultHooks()
  vi.restoreAllMocks()
  cleanup()
})

function TestIcon() {
  return null
}

function HealthySurface({ windowId }: AppSurfaceProps) {
  return <div data-testid="healthy">{windowId ? 'standing' : 'standing'}</div>
}

const manifest: AppManifest = {
  id: 'target',
  name: 'Target Module',
  icon: TestIcon,
  mount: HealthySurface,
}

function openTarget(): void {
  act(() => {
    openApp('target')
  })
}

describe('fault seam · the null product', () => {
  it('answers null for every app while no renderer is installed', () => {
    uninstallFaultHooks()
    expect(renderFault('target')).toBeNull()
  })
})

describe('fault-injection · render faults through the real boundary', () => {
  it('an armed render fault mounts a throwing module → MODULE FAULT card', () => {
    armAppFault('target', 'render')
    registerApp(manifest)
    render(<WindowHost viewport={{ w: 800, h: 600 }} contentFor={appContentFor} />)
    openTarget()

    const card = screen.getByRole('alert')
    expect(card.hasAttribute('data-module-fault')).toBe(true)
    expect(card.getAttribute('data-fault-kind')).toBe('code')
    expect(within(card).getByText('Target Module')).toBeTruthy()
  })

  it('an armed chunk fault rejects the load → the SAME card, classified network', async () => {
    armAppFault('target', 'chunk')
    registerApp(manifest)
    render(<WindowHost viewport={{ w: 800, h: 600 }} contentFor={appContentFor} />)
    openTarget()

    const card = await screen.findByRole('alert')
    expect(card.getAttribute('data-fault-kind')).toBe('network')
    expect(within(card).getByText(/MODULE TRANSFER FAILED \(network\)/i)).toBeTruthy()
  })

  it('a disarmed app mounts healthy again', async () => {
    armAppFault('target', 'render')
    disarmAppFault('target')
    registerApp(manifest)
    render(<WindowHost viewport={{ w: 800, h: 600 }} contentFor={appContentFor} />)
    openTarget()
    expect(await screen.findByTestId('healthy')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('arms are scoped per app and clearable', () => {
    armAppFault('target', 'render')
    armAppFault('other', 'chunk')
    expect(listArmedFaults().get('target')).toBe('render')
    expect(listArmedFaults().get('other')).toBe('chunk')
    clearInjectedFaults()
    expect(listArmedFaults().size).toBe(0)
  })
})

describe('fault-injection · window hooks surface', () => {
  it('install exposes window.__holdFaults; uninstall removes it', () => {
    expect(typeof window.__holdFaults?.arm).toBe('function')
    window.__holdFaults?.arm('target', 'render')
    expect(listArmedFaults().get('target')).toBe('render')
    uninstallFaultHooks()
    expect(window.__holdFaults).toBeUndefined()
  })
})
