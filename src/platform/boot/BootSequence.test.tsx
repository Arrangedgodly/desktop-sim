// @vitest-environment jsdom
// UI-2 boot orchestrator, component-level: POST sequencing, skip (mouse +
// keyboard), reduced-motion static variant, return-visit short-circuit,
// first-visit flag-after-hydrate, milestones, session restore, and "storage
// failure never blocks the desktop". Real bootPersistence against in-memory
// adapters; fake timers drive the POST schedule.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { demoApp } from '../../apps/demo'
import { useFSStore } from '../stores/fs-store'
import { useWMStore } from '../stores/wm-store'
import { useSettingsStore } from '../stores/settings-store'
import { bootPersistence } from '../../lib/storage/persistence'
import { stopAutosave } from '../../lib/storage/autosave'
import { StorageError } from '../../lib/storage/errors'
import { useStorageStatusStore } from '../../lib/storage/status'
import { BOOT_FLAG_KEY } from '../../lib/storage/boot-flag'
import { seedStoredState } from '../../lib/storage/stored-state'
import type { StorageAdapter, StoredState } from '../../lib/storage/types'
import { readBootTimeline, resetBootTimeline } from '../../lib/perf/boot-timeline'
import { registerApps, resetAppRegistry } from '../app-registry'
import { BootSequence } from './BootSequence'
import { buildPostLines } from './post-lines'
import { FULL_POST_TIMING, postSequenceDurationMs } from './post-machine'

/* ------------------------------ fixtures --------------------------------- */

/** First-visit memory adapter: nothing persisted, writes succeed. */
function memoryAdapter(): StorageAdapter {
  return {
    async load() {
      return null
    },
    async save() {},
    async saveBackup() {},
    async loadBackup() {
      return null
    },
    async clear() {},
  }
}

/** Adapter whose load() the test resolves LATE — proves desktop gates on hydrate. */
function deferredAdapter(): {
  adapter: StorageAdapter
  resolveLoad: (value: StoredState | null) => void
} {
  let resolveLoad!: (value: StoredState | null) => void
  const load = new Promise<StoredState | null>((resolve) => {
    resolveLoad = resolve
  })
  return {
    adapter: {
      load: () => load,
      async save() {},
      async saveBackup() {},
      async loadBackup() {
        return null
      },
      async clear() {},
    },
    resolveLoad,
  }
}

/** Adapter that makes storage itself unusable (private mode / blocked IDB). */
function unavailableAdapter(): StorageAdapter {
  const boom = (): never => {
    throw new StorageError('unavailable', 'test: storage blocked')
  }
  return { load: boom, save: boom, saveBackup: boom, loadBackup: boom, clear: boom }
}

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()
const initialStatus = useStorageStatusStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true)
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  useStorageStatusStore.setState(initialStatus, true)
  stopAutosave()
  localStorage.clear()
  resetBootTimeline()
  // MODULE REGISTRY is a REAL POST line: register exactly the demo manifest so
  // the component reads a live registry (…1 MODULE REGISTERED).
  resetAppRegistry()
  registerApps([demoApp])
})

afterEach(() => {
  cleanup()
  stopAutosave()
  vi.useRealTimers()
})

/* ------------------------------ helpers ---------------------------------- */

interface RenderBootOptions {
  readonly firstVisit?: boolean
  readonly reducedMotion?: boolean
  readonly adapter?: StorageAdapter
  readonly strictMode?: boolean
}

/** Render + await the boot promise inside one act — the committed POST state. */
async function renderBoot(options: RenderBootOptions = {}): Promise<void> {
  const adapter = options.adapter ?? memoryAdapter()
  const boot = bootPersistence({ adapter, autosave: false })
  const tree = (
    <BootSequence
      boot={boot}
      firstVisit={options.firstVisit ?? true}
      {...(options.reducedMotion !== undefined ? { reducedMotion: options.reducedMotion } : {})}
    />
  )
  await act(async () => {
    render(options.strictMode ? <StrictMode>{tree}</StrictMode> : tree)
    await boot
  })
}

function line(id: string): HTMLElement {
  const el = document.querySelector(`[data-post-line="${id}"]`)
  if (!(el instanceof HTMLElement)) throw new Error(`POST line "${id}" not rendered`)
  return el
}

function milestone(name: string): number | undefined {
  return readBootTimeline().find((m) => m.name === name)?.order
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Comfortably beyond the full typing schedule (~1.3s with the real lines). */
const FULL_DURATION = postSequenceDurationMs(
  buildPostLines({
    bootOrigin: 'seed',
    schemaVersion: 1,
    nodeCount: 99,
    moduleCount: 1,
    recovery: null,
  }),
  FULL_POST_TIMING,
)
/** FULL_DURATION minus the hold: every line fully typed, desktop NOT yet. */
const FULLY_TYPED = FULL_DURATION - FULL_POST_TIMING.holdMs

const desktopStage = (): Element | null => document.querySelector('[data-desktop-stage]')

/* ------------------------------ tests ------------------------------------ */

describe('BootSequence · first visit, full POST', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('types the real subsystem lines in order, then renders the desktop', async () => {
    await renderBoot()

    // The beam is on line 1 (first char synchronous); nothing else exists yet.
    expect(line('archive-integrity').textContent?.startsWith('A')).toBe(true)
    expect(line('module-registry').getAttribute('data-state')).toBe('pending')
    expect(desktopStage()).toBeNull()

    // Partway (t=280ms): line 1 finished, line 2 typing, later lines pending.
    advance(280)
    expect(line('archive-integrity').getAttribute('data-state')).toBe('done')
    expect(line('module-registry').getAttribute('data-state')).toBe('typing')
    expect(line('plugin-bus').getAttribute('data-state')).toBe('pending')
    expect(desktopStage()).toBeNull()

    // Run the whole schedule out: the desktop replaces the POST screen.
    advance(FULL_DURATION)
    expect(desktopStage()).not.toBeNull()
    expect(document.querySelector('[data-boot-screen]')).toBeNull()
  })

  it('reports real subsystem readings: seed origin, registry length, OS banner', async () => {
    await renderBoot()
    advance(FULLY_TYPED) // all lines typed; still holding before the desktop

    expect(line('archive-integrity').textContent).toMatch(/SEEDED/)
    expect(line('archive-integrity').textContent).toMatch(/V1/)
    expect(line('module-registry').textContent).toMatch(/1 MODULE REGISTERED/)
    expect(line('plugin-bus').textContent).toMatch(/READY/)
    expect(line('console').textContent).toMatch(/ONLINE/)
    expect(line('os-banner').textContent).toMatch(/HOLD\/OS 0\.1\.0/)
  })

  it('marks post-complete then desktop-ready, in order, and opens NO windows', async () => {
    await renderBoot()
    advance(FULL_DURATION)

    expect(milestone('post-complete')).toBeDefined()
    expect(milestone('desktop-ready')).toBeDefined()
    expect(milestone('post-complete')).toBeLessThan(milestone('desktop-ready')!)

    // The demo module no longer auto-opens on the real desktop (UI-2): a first
    // visit seeds an empty session, so zero windows render — but the WM host
    // (and the registry behind it) is mounted and waiting.
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
    expect(document.querySelector('[data-wm-host]')).not.toBeNull()
  })

  it('is StrictMode-safe: double-invoked effects mark milestones once', async () => {
    await renderBoot({ strictMode: true })
    advance(FULL_DURATION)

    const names = readBootTimeline().map((m) => m.name)
    expect(names.filter((n) => n === 'post-complete')).toHaveLength(1)
    expect(names.filter((n) => n === 'desktop-ready')).toHaveLength(1)
    expect(desktopStage()).not.toBeNull()
  })
})

describe('BootSequence · skip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('a click anywhere on the boot screen jumps straight to the desktop', async () => {
    await renderBoot()
    advance(60) // mid-line-1

    fireEvent.click(document.querySelector('[data-boot-screen]')!)

    expect(desktopStage()).not.toBeNull()
    expect(milestone('post-complete')).toBeDefined() // a skipped POST still completed
  })

  it('any key jumps straight to the desktop', async () => {
    await renderBoot()
    advance(60)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(desktopStage()).not.toBeNull()
    expect(milestone('post-complete')).toBeDefined()
  })

  it('a skip pressed during the storage probe completes the POST the instant data lands', async () => {
    const { adapter, resolveLoad } = deferredAdapter()
    const boot = bootPersistence({ adapter, autosave: false })
    await act(async () => {
      render(<BootSequence boot={boot} firstVisit={true} />)
    })
    // Probe phase: caret only, no subsystem lines, no desktop.
    expect(document.querySelector('[data-post-line="archive-integrity"]')).toBeNull()
    expect(desktopStage()).toBeNull()

    fireEvent.click(document.querySelector('[data-boot-screen]')!) // skip before data

    await act(async () => {
      resolveLoad(null) // storage answers → seed → hydrate
      await boot
    })

    // Controller started AND skipped in the same commit — no typing wait.
    expect(desktopStage()).not.toBeNull()
    expect(milestone('post-complete')).toBeDefined()
  })
})

describe('BootSequence · reduced motion (first visit → static POST)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('shows the FINAL POST state immediately, holds ~300ms, then the desktop', async () => {
    await renderBoot({ reducedMotion: true })

    for (const id of [
      'archive-integrity',
      'module-registry',
      'plugin-bus',
      'console',
      'os-banner',
    ]) {
      expect(line(id).getAttribute('data-state')).toBe('done') // full text at t≈0
    }
    expect(desktopStage()).toBeNull() // still holding the final state

    advance(350)
    expect(desktopStage()).not.toBeNull()
    expect(milestone('post-complete')).toBeDefined()
  })
})

describe('BootSequence · return visit (boot-flag short-circuit)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('flashes a single RESUME line within 200ms and marks NO post-complete', async () => {
    await renderBoot({ firstVisit: false })

    expect(line('resume').textContent).toContain('RESUME')
    expect(desktopStage()).toBeNull()

    advance(200)
    expect(desktopStage()).not.toBeNull()
    expect(readBootTimeline().map((m) => m.name)).not.toContain('post-complete')
    expect(milestone('desktop-ready')).toBeDefined()
  })

  it('reduced motion + return visit renders no POST at all — ground, then desktop', async () => {
    // Deferred storage keeps the pre-hydration state observable deterministically.
    const { adapter, resolveLoad } = deferredAdapter()
    const boot = bootPersistence({ adapter, autosave: false })
    await act(async () => {
      render(<BootSequence boot={boot} firstVisit={false} reducedMotion={true} />)
    })
    expect(document.querySelector('[data-boot-ground]')).not.toBeNull() // no POST screen
    expect(document.querySelector('[data-post-well]')).toBeNull()

    await act(async () => {
      resolveLoad(null)
      await boot
    })
    advance(100)
    expect(desktopStage()).not.toBeNull()
    expect(readBootTimeline().map((m) => m.name)).not.toContain('post-complete')
  })

  it('a stored session reopens its windows on the desktop (hydrate-then-render)', async () => {
    const stored: StoredState = {
      ...seedStoredState(),
      windows: [
        {
          id: 'w-restored',
          appId: 'demo',
          instanceId: 'singleton',
          geometry: { x: 10, y: 10, w: 300, h: 200 },
          z: 1,
          minimized: false,
          maximized: false,
          title: 'Demo Module',
          openedAt: 5,
        },
      ],
    }
    const adapter: StorageAdapter = { ...memoryAdapter(), load: async () => stored }

    await renderBoot({ firstVisit: false, adapter })
    advance(200)

    expect(useWMStore.getState().windows['w-restored']).toBeDefined()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
})

describe('BootSequence · first visit writes the boot flag AFTER hydrate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('flag is absent while storage is pending, present once the desktop renders', async () => {
    const { adapter, resolveLoad } = deferredAdapter()
    const boot = bootPersistence({ adapter, autosave: false })
    await act(async () => {
      render(<BootSequence boot={boot} firstVisit={true} />)
    })

    advance(1000) // storage still probing — no flag, no desktop
    expect(localStorage.getItem(BOOT_FLAG_KEY)).toBeNull()
    expect(desktopStage()).toBeNull()

    await act(async () => {
      resolveLoad(null)
      await boot
    })
    advance(FULL_DURATION)

    expect(localStorage.getItem(BOOT_FLAG_KEY)).not.toBeNull() // set AFTER the hydrate
    expect(desktopStage()).not.toBeNull()
  })
})

describe('BootSequence · storage failure never blocks boot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('unavailable storage surfaces MEMORY ONLY on the archive line and still boots', async () => {
    await renderBoot({ adapter: unavailableAdapter() })

    advance(200) // line 1 fully typed, the rest still typing
    expect(line('archive-integrity').textContent).toMatch(/MEMORY ONLY/)

    advance(FULL_DURATION)
    expect(desktopStage()).not.toBeNull()
    expect(useStorageStatusStore.getState().recovery?.kind).toBe('storage-unavailable')
  })

  it('an UNCLASSIFIED boot rejection still reaches the desktop (fault logged)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boot = Promise.reject(new Error('unexpected fault'))
    await act(async () => {
      render(<BootSequence boot={boot} firstVisit={true} />)
    })
    advance(FULL_DURATION)

    expect(desktopStage()).not.toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('BootSequence · budget guard', () => {
  it('the full first-visit typing schedule stays within the 2s contract', () => {
    const lines = buildPostLines({
      bootOrigin: 'stored',
      schemaVersion: 1,
      nodeCount: 99,
      moduleCount: 6,
      recovery: null,
    })
    expect(postSequenceDurationMs(lines, FULL_POST_TIMING)).toBeLessThanOrEqual(2000)
  })
})
