// @vitest-environment jsdom
// AP-4 · settings — the console panel through its real seams: the registration
// manifest (singleton reserved id, lazy mount, render-only icon), the
// singleton window dedupe, the plate list rendered from the wallpaper
// registry with the live MOUNTED indicator, selection applying live through
// the settings store (the seam the desktop renders + MF-2 persists), the
// hardware switches (role=switch, Space throws, store writes), the guarded
// reset (cover → confirm strip → throw → storage resetDesktop + rehydrate +
// windows close + the relit ARCHIVE RESEALED console), the vault readout
// (estimateStorage + the storage status store), and the pure model helpers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { CURRENT_SCHEMA_VERSION, createNode } from '../../lib/fs'
import {
  registerActiveAdapter,
  readBootFlag,
  useStorageStatusStore,
  writeBootFlag,
  type StorageAdapter,
  type StorageFailure,
  type StoredState,
} from '../../lib/storage'
import {
  listApps,
  openApp,
  registerApps,
  resetAppRegistry,
} from '../../platform/app-registry'
import { resetLazyMount } from '../../platform/app-registry/lazy-mount'
import { useFSStore } from '../../platform/stores/fs-store'
import { useSettingsStore, DEFAULT_WALLPAPER } from '../../platform/stores/settings-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { listWallpaperPlates } from '../../platform/desktop'
import { apps } from '../index'
import { demoApp } from '../demo' // TH-2: test-only fixture, not shipped (see apps.test.ts)
import { settingsApp } from './index'
import { SettingsIcon } from './SettingsIcon'
import SettingsSurface from './SettingsSurface'
import {
  archiveResealedAt,
  clearArchiveResealed,
  formatBytes,
  formatReadoutClock,
  motionHoldsStill,
  quotaPercent,
} from './settings-model'

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()
const initialStatus = useStorageStatusStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  useStorageStatusStore.setState(initialStatus, true)
  clearArchiveResealed()
  resetAppRegistry()
  registerApps(apps) // the REAL startup registration (notepad + viewer + explorer + about + browser + settings)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/* -------------------------------- helpers --------------------------------- */

const windowCount = (): number => Object.keys(useWMStore.getState().windows).length
const commit = useFSStore.getState().commit

/** Mount the console against a REAL registry window. */
function mountConsole() {
  const windowId = openApp('settings')!
  const view = render(<SettingsSurface windowId={windowId} />)
  return { windowId, view }
}

const switchEl = (key: string): HTMLButtonElement =>
  document.querySelector(`[data-settings-switch="${key}"]`)!

const coverEl = (): HTMLButtonElement => document.querySelector('[data-guard-cover]')!

/** In-memory adapter that counts transports — the reset path's observer. */
function fakeAdapter() {
  const calls = { cleared: 0, saved: 0 }
  let stored: StoredState | null = null
  const adapter: StorageAdapter = {
    load: async () => stored,
    save: async (state) => {
      calls.saved += 1
      stored = state
    },
    saveBackup: async () => {},
    loadBackup: async () => null,
    clear: async () => {
      calls.cleared += 1
      stored = null
    },
  }
  return { adapter, calls, stored: () => stored }
}

/* ------------------------------ the manifest ------------------------------- */

describe('AP-4 · registration manifest', () => {
  it('rides the startup apps array under the RESERVED id "settings"', () => {
    expect(apps).toContain(settingsApp)
    expect(settingsApp.id).toBe('settings')
    expect(settingsApp.name).toBe('Console Settings')
  })

  it('declares SINGLETON (one console ever), no file routing, and geometry hints', () => {
    expect(settingsApp.singleton).toBe(true)
    expect(settingsApp.acceptedFileTypes).toBeUndefined() // the console is opened, never opened-onto
    expect(settingsApp.defaultGeometry).toEqual({ w: 560, h: 620 })
  })

  it('mounts a LAZY surface (own chunk) and a render-only icon', () => {
    expect(typeof settingsApp.mount).toBe('function') // retryableLazy(() => import(...)) — HU-1
    expect(resetLazyMount(settingsApp.mount)).toBe(true) // it IS a retryable lazy mount
    expect(settingsApp.icon).toBe(SettingsIcon)
    const { container } = render(<SettingsIcon size={20} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('registers LAST — the launcher first item stays the notepad', () => {
    const ids = listApps().map((app) => app.id)
    expect(ids.indexOf('notepad')).toBe(0) // taskbar launcher floor rides it
    expect(ids.indexOf('settings')).toBe(ids.length - 1)
  })
})

/* ---------------------- the singleton window rule -------------------------- */

describe('AP-4 · singleton: one console ever', () => {
  it('every open raises + focuses THE window — launcher opens included', () => {
    const first = openApp('settings')!
    const again = openApp('settings') // launcher re-open
    const third = openApp('settings')

    expect(again).toBe(first)
    expect(third).toBe(first)
    expect(windowCount()).toBe(1)
    const record = useWMStore.getState().windows[first]!
    expect(record.appId).toBe('settings')
    expect(record.instanceId).toBe('singleton')
  })

  it('re-opening a minimized console restores + focuses it (no duplicate)', () => {
    const id = openApp('settings')!
    act(() => {
      useWMStore.getState().minimizeWindow(id)
    })
    const again = openApp('settings')

    expect(again).toBe(id)
    expect(windowCount()).toBe(1)
    expect(useWMStore.getState().windows[id]!.minimized).toBe(false)
    expect(useWMStore.getState().focusedId).toBe(id)
  })
})

/* ------------------------- the wallpaper plate list ------------------------ */

describe('AP-4 · wallpaper plates (registry-driven)', () => {
  it('renders every registered plate with swatch, name, and kind chip', () => {
    mountConsole()

    const rows = document.querySelectorAll('[data-settings-plate]')
    expect(rows).toHaveLength(listWallpaperPlates().length)
    for (const plate of listWallpaperPlates()) {
      const row = document.querySelector(`[data-settings-plate="${plate.id}"]`)!
      expect(row.getAttribute('role')).toBe('radio')
      expect(row.querySelector('.settings-plate-name')!.textContent).toBe(plate.name)
      expect(row.querySelector('.settings-plate-kind')!.textContent).toBe(plate.kind)
      expect(row.querySelector('.settings-plate-swatch svg')).not.toBeNull() // the 40px preview
    }
  })

  it('the LIVE plate wears the mounted indicator; selection moves it', () => {
    mountConsole()

    const starChart = document.querySelector('[data-settings-plate="star-chart"]')!
    expect(starChart.getAttribute('aria-checked')).toBe('true')
    expect(starChart.hasAttribute('data-mounted')).toBe(true)
    expect(document.querySelector('.settings-plate-flag')!.textContent).toBe('MOUNTED')

    fireEvent.click(document.querySelector('[data-settings-plate="survey"]')!)
    expect(useSettingsStore.getState().wallpaper).toBe('survey')
    expect(starChart.getAttribute('aria-checked')).toBe('false')
    expect(starChart.hasAttribute('data-mounted')).toBe(false)
    const survey = document.querySelector('[data-settings-plate="survey"]')!
    expect(survey.getAttribute('aria-checked')).toBe('true')
    expect(survey.hasAttribute('data-mounted')).toBe(true)
  })

  it('radiogroup keys: arrows MOVE selection (radios, not tabs)', () => {
    mountConsole()
    const group = document.querySelector('[data-settings-plates]')!

    fireEvent.keyDown(group, { key: 'ArrowDown' })
    expect(useSettingsStore.getState().wallpaper).toBe('anatomy')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(useSettingsStore.getState().wallpaper).toBe('phytograph')
    fireEvent.keyDown(group, { key: 'ArrowUp' })
    expect(useSettingsStore.getState().wallpaper).toBe('anatomy')
    fireEvent.keyDown(group, { key: 'End' })
    expect(useSettingsStore.getState().wallpaper).toBe('survey')
    fireEvent.keyDown(group, { key: 'Home' })
    expect(useSettingsStore.getState().wallpaper).toBe('star-chart')
  })
})

/* --------------------------- hardware switches ------------------------------ */

describe('AP-4 · hardware switches', () => {
  it('are real role="switch" controls reflecting + writing the settings store', () => {
    mountConsole()

    const sounds = switchEl('sounds')
    expect(sounds.getAttribute('role')).toBe('switch')
    expect(sounds.getAttribute('aria-checked')).toBe('false') // ships muted
    expect(sounds.hasAttribute('data-on')).toBe(false)

    fireEvent.click(sounds)
    expect(useSettingsStore.getState().soundsEnabled).toBe(true)
    expect(sounds.getAttribute('aria-checked')).toBe('true')
    expect(sounds.hasAttribute('data-on')).toBe(true)

    fireEvent.click(sounds)
    expect(useSettingsStore.getState().soundsEnabled).toBe(false)
    expect(sounds.getAttribute('aria-checked')).toBe('false')
  })

  it('SPACE throws the switch (keyDown — hardware fires the instant it is pressed)', () => {
    mountConsole()

    const sounds = switchEl('sounds')
    fireEvent.keyDown(sounds, { key: ' ' })
    expect(useSettingsStore.getState().soundsEnabled).toBe(true)
    fireEvent.keyDown(sounds, { key: ' ' })
    expect(useSettingsStore.getState().soundsEnabled).toBe(false)
  })

  it('the reduced-motion switch writes reducedMotionFollow (default on)', () => {
    mountConsole()

    const reduced = switchEl('reduced-motion')
    expect(reduced.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(reduced, { key: ' ' })
    expect(useSettingsStore.getState().reducedMotionFollow).toBe(false)
    expect(reduced.getAttribute('aria-checked')).toBe('false')
  })

  it('switch anatomy is drawn hardware: screws, track + bat, state lamp', () => {
    mountConsole()
    const hw = switchEl('sounds')
    expect(hw.querySelector('.settings-hw-screw--l')).not.toBeNull()
    expect(hw.querySelector('.settings-hw-screw--r')).not.toBeNull()
    expect(hw.querySelector('.settings-hw-track .settings-hw-bat')).not.toBeNull()
    expect(hw.querySelector('.settings-hw-lamp')).not.toBeNull()
    // A web checkbox it is not:
    expect(hw.tagName).toBe('BUTTON')
    expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  })
})

/* --------------------------- the guarded reset ------------------------------ */

describe('AP-4 · guarded reset (cover → strip → throw)', () => {
  it('the covered switch is DISABLED with no confirm strip until the cover lifts', () => {
    mountConsole()

    expect(switchEl('reset').disabled).toBe(true)
    expect(document.querySelector('[data-reset-strip]')).toBeNull()

    // Firing at the covered switch does nothing — not even through keys.
    fireEvent.keyDown(switchEl('reset'), { key: ' ' })
    expect(useFSStore.getState().fs).toBe(initialFS.fs) // byte-identical: untouched
  })

  it('lifting the cover arms the switch and names the consequences', () => {
    mountConsole()

    fireEvent.click(coverEl())
    const guard = document.querySelector('[data-settings-guard]')!
    expect(guard.hasAttribute('data-lifted')).toBe(true)
    expect(switchEl('reset').disabled).toBe(false)

    const strip = document.querySelector('[data-reset-strip]')!
    expect(strip.getAttribute('role')).toBe('note')
    const text = strip.textContent ?? ''
    expect(text).toContain('reseeds the catalog')
    expect(text).toContain('icon position and open window')
    expect(text).toContain('reset on reload')
  })

  it('the strip release re-seats the guard (the two-step is repeatable)', () => {
    mountConsole()

    fireEvent.click(coverEl()) // lift
    fireEvent.click(document.querySelector('[data-guard-lower]')!) // re-seat via the release
    const guard = document.querySelector('[data-settings-guard]')!
    expect(guard.hasAttribute('data-lifted')).toBe(false)
    expect(switchEl('reset').disabled).toBe(true)
    expect(document.querySelector('[data-reset-strip]')).toBeNull()

    // And again, end to end — the guard is a repeater, not a fuse.
    fireEvent.click(coverEl())
    expect(switchEl('reset').disabled).toBe(false)
    fireEvent.click(document.querySelector('[data-guard-lower]')!)
    expect(switchEl('reset').disabled).toBe(true)
  })

  it('throwing runs the storage reset + rehydrate: catalog reseeded, windows closed, console relit', async () => {
    const fake = fakeAdapter()
    registerActiveAdapter(fake.adapter) // the seam resetDesktop defaults to

    // A desk's worth of state to destroy: a created specimen, dirtied
    // settings, a written boot flag, and two foreign windows.
    act(() => {
      commit(
        createNode(useFSStore.getState().fs, {
          parentId: useFSStore.getState().fs.rootId,
          name: 'specimen-to-vanish',
          kind: 'text',
          id: 'specimen-to-vanish',
        }),
      )
    })
    act(() => {
      useSettingsStore.getState().setWallpaper('survey')
      useSettingsStore.getState().setSoundsEnabled(true)
    })
    writeBootFlag(CURRENT_SCHEMA_VERSION)
    // TH-2: the demo module is the multi-instance FOREIGN window fixture now
    // (de-registered from the shipped fleet) — registered here through the
    // registry's public seam so the two foreign windows stay real.
    registerApps([demoApp])
    const demoOne = openApp('demo')!
    const demoTwo = openApp('demo')!
    expect(demoOne).toBeTruthy()
    expect(demoTwo).toBeTruthy()
    expect(demoTwo).not.toBe(demoOne) // multi-instance: two windows, not a focus
    const { windowId: consoleWindow } = mountConsole()

    fireEvent.click(coverEl())
    fireEvent.keyDown(switchEl('reset'), { key: ' ' })

    // The storage seam ran: cleared, then persisted the fresh seed.
    await vi.waitFor(() => expect(fake.calls.cleared).toBe(1))
    await vi.waitFor(() => expect(fake.calls.saved).toBeGreaterThan(0))
    await vi.waitFor(() => expect(archiveResealedAt()).not.toBeNull())

    // Rehydrated: the created specimen is gone, settings are defaults again.
    const fs = useFSStore.getState().fs
    expect(fs.nodes['specimen-to-vanish']).toBeUndefined()
    expect(useSettingsStore.getState().wallpaper).toBe(DEFAULT_WALLPAPER)
    expect(useSettingsStore.getState().soundsEnabled).toBe(false)

    // Windows: every one closed by the rehydrate — the foreign pair AND this
    // console's own window — then the console RELIT itself (singleton id) to
    // carry the report.
    const windows = useWMStore.getState().windows
    expect(Object.keys(windows)).toHaveLength(1)
    const relit = Object.values(windows)[0]!
    expect(relit.appId).toBe('settings')
    expect(relit.id).not.toBe(demoOne)
    expect(relit.id).not.toBe(demoTwo)
    expect(relit.id).not.toBe(consoleWindow)

    // The boot flag cleared: the next boot paces as a first visit.
    expect(readBootFlag()).toBeNull()

    // The report renders in-world (this surface survived the reseed in the
    // test harness — in the app the RELIT console renders it from the flag).
    await vi.waitFor(() => expect(document.querySelector('[data-resealed]')).not.toBeNull())
    expect(document.querySelector('[data-resealed]')!.textContent).toContain(
      'Archive resealed',
    )
  })

  it('the report dismisses back to a seated guard (session memory, reload-cleared)', async () => {
    const fake = fakeAdapter()
    registerActiveAdapter(fake.adapter)
    mountConsole()
    fireEvent.click(coverEl())
    fireEvent.click(switchEl('reset'))
    await vi.waitFor(() => expect(document.querySelector('[data-resealed]')).not.toBeNull())

    fireEvent.click(document.querySelector('[data-resealed-dismiss]')!)
    expect(archiveResealedAt()).toBeNull()
    expect(document.querySelector('[data-resealed]')).toBeNull()
    expect(switchEl('reset').disabled).toBe(true) // guard re-seated
  })
})

/* ----------------------------- the vault readout ---------------------------- */

describe('AP-4 · vault readout', () => {
  it('renders the storage status store: last write, write count, boot origin', () => {
    const stamp = Date.UTC(2087, 2, 14, 9, 26, 5)
    act(() => {
      useStorageStatusStore.getState().noteSaved(stamp)
      useStorageStatusStore.getState().noteSaved(stamp + 1000)
      useStorageStatusStore.getState().setBoot({ bootOrigin: 'stored' })
    })
    mountConsole()

    expect(document.querySelector('[data-vault-last-write]')!.textContent).toBe('09:26:06')
    expect(document.querySelector('[data-vault-writes]')!.textContent).toBe('2')
    expect(document.querySelector('[data-vault-boot]')!.textContent).toBe('STORED')
  })

  it('renders estimateStorage() usage + quota with the percent share', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ usage: 1_234_567, quota: 536_870_912 }),
      },
    })
    mountConsole()

    await vi.waitFor(() =>
      expect(document.querySelector('[data-vault-usage]')!.textContent).toBe('1.2 MB'),
    )
    expect(document.querySelector('[data-vault-quota]')!.textContent).toBe('512 MB · 0%')
  })

  it('a fresh hold reads NEVER / zero / em-dash (no estimate, no origin)', () => {
    mountConsole()

    expect(document.querySelector('[data-vault-last-write]')!.textContent).toBe('NEVER')
    expect(document.querySelector('[data-vault-writes]')!.textContent).toBe('0')
    expect(document.querySelector('[data-vault-usage]')!.textContent).toBe('—')
    expect(document.querySelector('[data-vault-boot]')!.textContent).toBe('—')
  })

  it('surfaces recovery + write failures when the status store carries them', () => {
    act(() => {
      useStorageStatusStore.getState().noteRecovery({
        kind: 'reseeded',
        message: 'archive reseeded from backup failure',
        at: Date.now(),
      })
      useStorageStatusStore.getState().noteFailure({
        kind: 'quota',
        message: 'quota exhausted',
        at: Date.now(),
      } satisfies StorageFailure)
    })
    mountConsole()

    expect(document.querySelector('[data-vault-recovery]')!.textContent).toContain(
      'archive reseeded from backup failure',
    )
    expect(document.querySelector('[data-vault-failure]')!.textContent).toContain(
      'quota exhausted',
    )
  })
})

/* -------------------------------- pure model -------------------------------- */

describe('AP-4 · model helpers (pure)', () => {
  it('formatReadoutClock: mission-clock HH:MM:SS, UTC, zero-padded', () => {
    expect(formatReadoutClock(Date.UTC(2087, 2, 14, 9, 26, 5))).toBe('09:26:05')
    expect(formatReadoutClock(Date.UTC(2087, 11, 31, 23, 59, 59))).toBe('23:59:59')
    expect(formatReadoutClock(Date.UTC(2087, 0, 1, 0, 0, 0))).toBe('00:00:00')
  })

  it('formatBytes: whole bytes, one decimal above the first unit, degenerate-safe', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1_234_567)).toBe('1.2 MB')
    expect(formatBytes(987_654_321)).toBe('942 MB') // ≥100 of a unit reads whole
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(-5)).toBe('0 B')
  })

  it('quotaPercent: whole percents clamped at 100; null when uncomputable', () => {
    expect(quotaPercent(1, 4)).toBe(25)
    expect(quotaPercent(99.6, 100)).toBe(100) // clamped
    expect(quotaPercent(0, 100)).toBe(0)
    expect(quotaPercent(10, 0)).toBeNull()
    expect(quotaPercent(Number.NaN, 100)).toBeNull()
    expect(quotaPercent(10, Number.NaN)).toBeNull()
  })

  it('motionHoldsStill: only when following AND the OS asks', () => {
    expect(motionHoldsStill(false)).toBe(false) // follow off = full motion, always
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    expect(motionHoldsStill(true)).toBe(Boolean(reduce))
  })
})
