/**
 * Archive Backup surface (batch-2 brief 10) — the honest vault utility,
 * mounted lazy in its own chunk. Singleton: one vault door on the console.
 *
 *   ┌ toolbar (console chrome) ────────────────────────────────────────────┐
 *   │ ARCHIVE BACKUP        [ SPECIMENS 12 · DRAWERS 4 ]  (live B612 well)  │
 *   ├ body (console chrome — an instrument bay, not reading matter) ───────┤
 *   │ EXPORT   DOWNLOAD ARCHIVE (brass action — hardware you press)        │
 *   │          · last export line in the well                              │
 *   │ IMPORT   CHOOSE BACKUP FILE… (chrome plate over a hidden input)      │
 *   │          · refusal strip (oxide text) — OR —                         │
 *   │          · the vault readout (phosphor well: version, saved,         │
 *   │            specimens, drawers, windows, size)                        │
 *   │          · restore strip: consequence note + the oxide two-step      │
 *   │            (arm → CONFIRM RESTORE; Esc or a new file disarms)        │
 *   │          · ARCHIVE RESTORED line in the well after the commit        │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * - EXPORT serializes the REAL current state through the platform's public
 *   `buildStoredState` seam (stores → envelope) → Blob → object URL → anchor
 *   download → revoke. The painter's export pattern, verbatim; local by
 *   construction, CSP-clean, no network.
 * - IMPORT is a PREVIEW until the guard is lifted: file text → the pure
 *   validator (backup-model) → the manifest summary. Nothing mutates.
 * - RESTORE exists because the seam does: `hydrateStores(validated)` is the
 *   platform's public envelope→stores seam (the boot path's own unfold), so
 *   the guarded restore is the oxide TWO-STEP — arm, then commit — per the
 *   brief. It REPLACES the living archive, windows included; the autosave
 *   writer that is attached in normal operation persists the restored
 *   envelope within its debounce (no extra write path is opened here).
 * - Window appState: deliberately NONE — a vault session is not worth
 *   persisting (nothing is lost by a reload; the archive itself is the
 *   persisted thing). Documented in the session log.
 * - Reduced-motion: trivial by construction — zero transitions, zero
 *   animation; state swaps instantly (furniture law).
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { playCue } from '../../lib/audio'
import { buildStoredState, hydrateStores } from '../../lib/storage'
import type { StoredState } from '../../lib/storage'
import { useFSStore } from '../../platform/stores'
import {
  REFUSAL_LABELS,
  exportFileName,
  formatBytes,
  formatStamp,
  readImportText,
  serializeBackup,
  type BackupRefusalCode,
  type BackupSummary,
} from './backup-model'
import './archive-backup.css'

/** A validated import held for preview — the door's only "yes" state. */
interface HeldImport {
  readonly state: StoredState
  readonly summary: BackupSummary
  readonly fileName: string
}

/** The refusal the surface renders in-world (typed code + honest detail). */
interface HeldRefusal {
  readonly code: BackupRefusalCode
  readonly message: string
}

export default function BackupSurface() {
  const fs = useFSStore((s) => s.fs)

  const [held, setHeld] = useState<HeldImport | null>(null)
  const [refusal, setRefusal] = useState<HeldRefusal | null>(null)
  const [restoreArmed, setRestoreArmed] = useState(false)
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  const [lastExport, setLastExport] = useState<{ name: string; bytes: number; at: number } | null>(
    null,
  )

  const fileInputRef = useRef<HTMLInputElement>(null)

  /** The live hold, counted from the real store — the toolbar's honest well. */
  const live = useMemo(() => {
    let drawers = 0
    let specimens = 0
    for (const node of Object.values(fs.nodes)) {
      if (node.kind === 'folder') drawers += 1
      else specimens += 1
    }
    return { drawers, specimens }
  }, [fs])

  /* ------------------------------- export -------------------------------- */

  const runExport = useCallback((): void => {
    const state = buildStoredState() // the REAL current envelope, from the seam
    const text = serializeBackup(state)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = exportFileName(state.version, Date.now())
    anchor.rel = 'noopener'
    anchor.click()
    URL.revokeObjectURL(url) // the blob outlives the revoked URL in flight
    setLastExport({ name: anchor.download, bytes: text.length, at: Date.now() })
    playCue('toggle')
  }, [])

  /* ------------------------------- import -------------------------------- */

  const onFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = '' // the same file may be picked again to retry
    if (!file) return
    const text = await file.text()
    setRefusal(null)
    setRestoreArmed(false) // a new file re-seats the guard
    const verdict = readImportText(text)
    if (!verdict.ok) {
      setHeld(null)
      setRefusal({ code: verdict.code, message: verdict.message })
      return
    }
    setHeld({ state: verdict.state, summary: verdict.summary, fileName: file.name })
  }, [])

  /* --------------------------- guarded restore --------------------------- */

  /**
   * The oxide two-step. First press ARMS (the button re-labels to CONFIRM
   * RESTORE and keeps focus); the second press commits through the platform's
   * public hydrateStores seam. Esc anywhere in the module disarms an armed
   * guard (and claims the key so the OS's unclaimed-Esc close stands down —
   * the guard-strip law).
   */
  const onRestoreClick = useCallback((): void => {
    if (!held) return
    if (!restoreArmed) {
      setRestoreArmed(true)
      return
    }
    hydrateStores(held.state) // the guarded commit — the whole living archive
    setRestoreArmed(false)
    setRestoredAt(Date.now())
    playCue('toggle')
    // After the commit the live well re-counts from the NEW store state
    // (reactive), and this window may no longer be among the session's
    // windows — the restored envelope owns the session now; React unmounts
    // cleanly if so. The operator reopens the module from the drawer.
  }, [held, restoreArmed])

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape' && restoreArmed) {
        event.preventDefault()
        event.stopPropagation()
        setRestoreArmed(false)
      }
    },
    [restoreArmed],
  )

  /* ------------------------------- render -------------------------------- */

  return (
    <div className="backup" onKeyDown={onKeyDown}>
      <div className="backup-toolbar">
        <h2 className="backup-name">Archive Backup</h2>
        <p className="backup-live well" data-backup-live>
          <span className="backup-live-k">SPECIMENS</span> {live.specimens}
          <span className="backup-live-sep"> · </span>
          <span className="backup-live-k">DRAWERS</span> {live.drawers}
          <span className="scanlines" aria-hidden="true" />
        </p>
      </div>

      <div className="backup-body">
        {/* ---------------------------- export bay ------------------------- */}
        <section className="backup-bay" aria-labelledby="backup-export-legend">
          <h3 className="backup-legend" id="backup-export-legend">
            Export
          </h3>
          <p className="backup-note">THE WHOLE LIVING ARCHIVE — ONE JSON FILE, WRITTEN LOCALLY</p>
          <button type="button" className="backup-export" data-backup-export onClick={runExport}>
            Download archive
          </button>
          {lastExport && (
            <p className="backup-lastline well" data-backup-last>
              WROTE {lastExport.name} · {formatBytes(lastExport.bytes)} ·{' '}
              {formatStamp(lastExport.at)}
              <span className="scanlines" aria-hidden="true" />
            </p>
          )}
        </section>

        {/* ---------------------------- import bay ------------------------- */}
        <section className="backup-bay" aria-labelledby="backup-import-legend">
          <h3 className="backup-legend" id="backup-import-legend">
            Import
          </h3>
          <p className="backup-note">PREVIEW UNTIL THE GUARD IS LIFTED — RESTORE REPLACES THIS CONSOLE'S ARCHIVE</p>
          <button
            type="button"
            className="backup-pick"
            data-backup-import
            onClick={() => fileInputRef.current?.click()}
          >
            Choose backup file…
          </button>
          <input
            ref={fileInputRef}
            className="backup-sr-input"
            type="file"
            accept="application/json,.json"
            data-backup-file-input
            onChange={(e) => void onFileChange(e)}
            tabIndex={-1}
            aria-hidden="true"
          />

          {refusal && (
            <p className="backup-refusal" role="alert" data-backup-refusal data-code={refusal.code}>
              {REFUSAL_LABELS[refusal.code]} — {refusal.message}
            </p>
          )}

          {held && (
            <>
              <p className="backup-fileline" data-backup-file>
                {held.fileName}
              </p>
              <div className="backup-summary well" data-backup-summary role="status">
                <dl className="backup-facts">
                  <div className="backup-fact">
                    <dt>ENVELOPE</dt>
                    <dd data-backup-version>v{held.summary.version}</dd>
                  </div>
                  <div className="backup-fact">
                    <dt>SAVED</dt>
                    <dd>{formatStamp(held.summary.savedAt)}</dd>
                  </div>
                  <div className="backup-fact">
                    <dt>SPECIMENS</dt>
                    <dd data-backup-specimens>{held.summary.specimens}</dd>
                  </div>
                  <div className="backup-fact">
                    <dt>DRAWERS</dt>
                    <dd>{held.summary.drawers}</dd>
                  </div>
                  <div className="backup-fact">
                    <dt>WINDOWS</dt>
                    <dd data-backup-windows>{held.summary.windows}</dd>
                  </div>
                  <div className="backup-fact">
                    <dt>SIZE</dt>
                    <dd>{formatBytes(held.summary.bytes)}</dd>
                  </div>
                </dl>
                <span className="scanlines" aria-hidden="true" />
              </div>

              <div className="backup-restore-strip" data-backup-restore-strip>
                <p className="backup-restore-note">
                  RESTORE SEATS THIS ENVELOPE — CATALOG, DRAWERS, WINDOWS, SETTINGS
                </p>
                <button
                  type="button"
                  className="backup-restore"
                  data-backup-restore
                  data-armed={restoreArmed}
                  aria-pressed={restoreArmed}
                  onClick={onRestoreClick}
                >
                  {restoreArmed ? 'Confirm restore' : 'Restore archive'}
                </button>
              </div>

              {restoredAt !== null && (
                <p className="backup-restoredline well" data-backup-restored>
                  ARCHIVE RESTORED {formatStamp(restoredAt)}
                  <span className="scanlines" aria-hidden="true" />
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
