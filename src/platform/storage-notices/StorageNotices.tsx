/**
 * Storage failure notices (HU-1) — the bottom-right in-world notice card that
 * surfaces MF-2's two health events to the operator: a write failure (quota →
 * "ARCHIVE AT CAPACITY — changes may not persist"; unavailable → its honest
 * sibling) and a boot recovery ("ARCHIVE RECOVERED — …"). One card, dismiss
 * only, newest wins (storage-notice-model.ts). The recovery card carries a
 * ONE-TIME link that opens Console Settings at the vault readout.
 *
 * Rendered by DesktopSurface above the taskbar rail; persistence failures
 * must be visible even when every window is closed.
 */

import { useState } from 'react'
import { useStorageStatusStore } from '../../lib/storage/status'
import { openApp } from '../app-registry'
import { SETTINGS_APP_ID } from '../app-registry/app-ids'
import { useSettingsStore } from '../stores/settings-store'
import {
  consumeVaultLink,
  selectStorageNotice,
  vaultLinkConsumed,
  type StorageNoticeView,
} from './storage-notice-model'
import './storage-notices.css'

export function StorageNotices() {
  const recovery = useStorageStatusStore((s) => s.recovery)
  const lastFailure = useStorageStatusStore((s) => s.lastFailure)
  const notice = selectStorageNotice(recovery, lastFailure)
  if (notice === null) return null

  return (
    <div className="storage-notices" data-storage-notices>
      <StorageNoticeCard key={notice.kind + notice.at} notice={notice} />
    </div>
  )
}

function StorageNoticeCard({ notice }: { readonly notice: StorageNoticeView }) {
  const dismissRecovery = useStorageStatusStore((s) => s.dismissRecovery)
  const clearFailure = useStorageStatusStore((s) => s.clearFailure)
  // The one-time link: consumed model state (session-wide) mirrored in local
  // state so the click itself re-renders the card and the link vanishes.
  const [linkUsed, setLinkUsed] = useState(vaultLinkConsumed())
  const showVaultLink = notice.kind === 'recovery' && !linkUsed

  const dismiss = (): void => {
    // Dismiss clears THE SHOWN surface (the card is one surface at a time).
    if (notice.kind === 'recovery') dismissRecovery()
    else clearFailure()
  }

  const viewVault = (): void => {
    if (!consumeVaultLink()) return // one-time by law
    setLinkUsed(true)
    // Session flag on the settings store (HU-1 seam): the console consumes it
    // on mount and opens onto its vault readout.
    useSettingsStore.getState().requestVaultFocus()
    openApp(SETTINGS_APP_ID) // singleton console — re-open raises the one window
  }

  return (
    <div
      className="well storage-notice"
      data-storage-notice
      data-notice-kind={notice.kind}
      data-notice-surface={notice.surface}
      role="status"
      aria-live="polite"
      aria-label={notice.title}
    >
      <span className="scanlines" aria-hidden="true" />
      <p className="storage-notice-title">{notice.title}</p>
      <p className="storage-notice-body">{notice.message}</p>
      <div className="storage-notice-actions">
        {showVaultLink && (
          <button
            type="button"
            className="storage-notice-link"
            data-storage-notice-vault-link
            onClick={viewVault}
          >
            View vault readout
          </button>
        )}
        <button
          type="button"
          className="storage-notice-dismiss"
          data-storage-notice-dismiss
          onClick={dismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
