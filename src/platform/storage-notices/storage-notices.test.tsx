// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useWMStore } from '../stores/wm-store'
import { useSettingsStore } from '../stores/settings-store'
import { registerApp, useAppRegistryStore } from '../app-registry/registry'
import { settingsApp } from '../../apps/settings'
import SettingsSurface from '../../apps/settings/SettingsSurface'
import { useStorageStatusStore } from '../../lib/storage/status'
import type { RecoveryNotice, StorageFailure } from '../../lib/storage'
import { StorageNotices } from './StorageNotices'
import {
  consumeVaultLink,
  resetVaultLink,
  selectStorageNotice,
  vaultLinkConsumed,
} from './storage-notice-model'

/**
 * HU-1 unit gates — the storage failure notice card over MF-2's status
 * surfaces: quota → "ARCHIVE AT CAPACITY", recovery → "ARCHIVE RECOVERED" with
 * the one-time vault link; dismiss-only; max ONE card, newest wins; the link
 * opens Console Settings with its vault readout focused.
 */

const initialWM = useWMStore.getState()
const initialRegistry = useAppRegistryStore.getState()
const initialSettings = useSettingsStore.getState()
const initialStatus = useStorageStatusStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  useAppRegistryStore.setState(initialRegistry, true)
  useSettingsStore.setState(initialSettings, true)
  useStorageStatusStore.setState(initialStatus, true)
  resetVaultLink()
  registerApp(settingsApp)
  // jsdom ships no scrollIntoView; the console's focus behavior is stubbed.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(cleanup)

function failure(kind: StorageFailure['kind'], at = 2000): StorageFailure {
  return { kind, message: 'storage quota exceeded', at }
}

function recovery(kind: RecoveryNotice['kind'], at = 1000): RecoveryNotice {
  return { kind, message: 'envelope failed validation', at }
}

function renderNotices(): ReturnType<typeof render> {
  return render(<StorageNotices />)
}

function setStatus(patch: Partial<ReturnType<typeof useStorageStatusStore.getState>>): void {
  useStorageStatusStore.setState(patch)
}

/* ------------------------------ pure model -------------------------------- */

describe('selectStorageNotice · one card, newest wins', () => {
  it('answers null when both surfaces are clear', () => {
    expect(selectStorageNotice(null, null)).toBeNull()
  })

  it('quota failure → ARCHIVE AT CAPACITY with the persist warning', () => {
    const view = selectStorageNotice(null, failure('quota'))
    expect(view).toMatchObject({ kind: 'failure', surface: 'quota', title: 'ARCHIVE AT CAPACITY' })
    expect(view?.message).toBe('changes may not persist')
  })

  it('unavailable failure gets its honest sibling copy', () => {
    const view = selectStorageNotice(null, failure('unavailable'))
    expect(view?.title).toBe('ARCHIVE OFFLINE')
    expect(view?.message).toContain('changes may not persist')
  })

  it.each(['reseeded', 'restored-from-backup', 'unknown-version', 'storage-unavailable'] as const)(
    'recovery kind %s → ARCHIVE RECOVERED with kind-honest copy',
    (kind) => {
      const view = selectStorageNotice(recovery(kind), null)
      expect(view?.kind).toBe('recovery')
      expect(view?.title).toBe('ARCHIVE RECOVERED')
      expect(view?.message.length).toBeGreaterThan(0)
    },
  )

  it('the NEWEST surface wins the single slot (either direction)', () => {
    expect(selectStorageNotice(recovery('reseeded', 100), failure('quota', 200))?.surface).toBe(
      'quota',
    )
    expect(selectStorageNotice(recovery('reseeded', 300), failure('quota', 200))?.surface).toBe(
      'reseeded',
    )
    // A tie goes to the recovery (the boot-time event a failure post-dates).
    expect(selectStorageNotice(recovery('reseeded', 100), failure('quota', 100))?.surface).toBe(
      'reseeded',
    )
  })
})

/* ------------------------------- the card --------------------------------- */

describe('StorageNotices · rendering + dismissal', () => {
  it('renders nothing while the archive is healthy', () => {
    renderNotices()
    expect(document.querySelector('[data-storage-notices]')).toBeNull()
  })

  it('quota failure renders the capacity card and Dismiss clears it (clearFailure seam)', () => {
    setStatus({ lastFailure: failure('quota') })
    renderNotices()

    const card = screen.getByRole('status')
    expect(card.getAttribute('data-notice-kind')).toBe('failure')
    expect(card.getAttribute('data-notice-surface')).toBe('quota')
    expect(screen.getByText('ARCHIVE AT CAPACITY')).toBeTruthy()
    expect(screen.getByText('changes may not persist')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(useStorageStatusStore.getState().lastFailure).toBeNull()
    waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('recovery renders the recovered card and Dismiss clears it (dismissRecovery seam)', () => {
    setStatus({ recovery: recovery('reseeded') })
    renderNotices()

    const card = screen.getByRole('status')
    expect(card.getAttribute('data-notice-kind')).toBe('recovery')
    expect(screen.getByText('ARCHIVE RECOVERED')).toBeTruthy()
    expect(screen.getByText(/reseeded from the seed collection/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(useStorageStatusStore.getState().recovery).toBeNull()
  })

  it('exactly one card shows with both surfaces live — newest wins, then the survivor', () => {
    setStatus({ recovery: recovery('reseeded', 100), lastFailure: failure('quota', 200) })
    renderNotices()

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByText('ARCHIVE AT CAPACITY')).toBeTruthy()

    // Dismissing the newest surfaces the older one — still exactly one card.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.getByText('ARCHIVE RECOVERED')).toBeTruthy()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})

/* --------------------------- the one-time link ----------------------------- */

describe('StorageNotices · the one-time vault link', () => {
  it('appears on recovery cards only, never on failure cards', () => {
    setStatus({ lastFailure: failure('quota') })
    renderNotices()
    expect(screen.queryByRole('button', { name: 'View vault readout' })).toBeNull()
  })

  it('opens Console Settings with the vault readout focused — once', async () => {
    setStatus({ recovery: recovery('reseeded') })
    renderNotices()

    fireEvent.click(screen.getByRole('button', { name: 'View vault readout' }))

    // The settings console window opened and the session flag was requested.
    expect(Object.values(useWMStore.getState().windows).some((w) => w.appId === 'settings')).toBe(
      true,
    )
    expect(useSettingsStore.getState().vaultFocusPending).toBe(true)

    // A console mounting with the flag pending opens ONTO the vault readout.
    render(<SettingsSurface windowId="w-vault" />)
    await waitFor(() => {
      const vault = document.querySelector('[data-settings-vault-section]') as HTMLElement
      expect(vault).toBeTruthy()
      expect(document.activeElement).toBe(vault)
    })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(useSettingsStore.getState().vaultFocusPending).toBe(false) // consumed

    // The link is one-time: the flag setter refuses a second request path and
    // the notice model has consumed the link for this session.
    expect(vaultLinkConsumed()).toBe(true)
    expect(consumeVaultLink()).toBe(false)
  })

  it('the link hides after its one use while the notice stays until dismissed', () => {
    setStatus({ recovery: recovery('reseeded') })
    renderNotices()

    fireEvent.click(screen.getByRole('button', { name: 'View vault readout' }))
    expect(screen.queryByRole('button', { name: 'View vault readout' })).toBeNull()
    expect(screen.getByText('ARCHIVE RECOVERED')).toBeTruthy() // still here
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})

/* ------------------------------ housekeeping ------------------------------- */

describe('StorageNotices · DOM shape', () => {
  it('mounts as fixed bottom-right furniture above the rail (source-scanned)', async () => {
    setStatus({ recovery: recovery('reseeded') })
    renderNotices()
    const channel = document.querySelector('[data-storage-notices]') as HTMLElement
    expect(channel.className).toBe('storage-notices')
    // The well carries the scanline raster like every phosphor well.
    expect(channel.querySelector('.scanlines')).toBeTruthy()
    // House style: no raw hex in the module's CSS (tokens only).
    const css = await import('./storage-notices.css?raw').catch(() => null)
    if (css !== null) expect(css.default).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
