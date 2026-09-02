/**
 * Settings surface (AP-4) — the CONSOLE PANEL: the hold's hardware bay, not a
 * preferences webpage. Singleton window (the manifest's `singleton: true`;
 * the registry dedupes every re-open into a raise + focus — this component
 * manages none of it). Four bays:
 *
 *   WALLPAPER PLATES  the registry's plate list (UI-4) — 40px swatch, name,
 *                     kind chip; the live plate wears the MOUNTED lamp.
 *                     Selecting writes the settings store, which the desktop
 *                     seam already renders live (and MF-2 persists).
 *   CONSOLE HARDWARE  two real switches (role="switch", Space throws on
 *                     keyDOWN, focus-visible rides the global beam): UI
 *                     SOUNDS (ships muted; UI-6 wires the playback to this
 *                     switch) and REDUCED-MOTION FOLLOW (governs whether the
 *                     console's authored motion follows the OS preference —
 *                     see settings-model.ts for the seam ledger).
 *   ARCHIVE RESET     the guarded destructive: an oxide COVER over the
 *                     switch. Lift → the confirm strip names the consequences
 *                     and arms the switch → throw → storage resetDesktop() +
 *                     rehydrate (every window closes, this console included)
 *                     → the console relights itself with the in-world
 *                     ARCHIVE RESEALED report. NO browser dialogs anywhere.
 *   VAULT             read-only diagnostics in a B612 well: estimateStorage()
 *                     + the storage status store (last write, write count,
 *                     boot origin, recovery/failure when surfaced).
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { listWallpaperPlates } from '../../platform/desktop'
import { estimateStorage, useStorageStatusStore } from '../../lib/storage'
import { useSettingsStore } from '../../platform/stores'
import {
  archiveResealedAt,
  clearArchiveResealed,
  formatBytes,
  formatReadoutClock,
  motionHoldsStill,
  quotaPercent,
  throwGuardedReset,
} from './settings-model'
import './settings.css'

/** The plate set, read once at module scope — the registry is static at runtime. */
const PLATES = listWallpaperPlates()

const NEVER = 'NEVER'
const UNREPORTED = '—'
const BOOT_WORDS = {
  stored: 'STORED',
  migrated: 'MIGRATED',
  seed: 'SEED',
  backup: 'BACKUP',
} as const

export default function SettingsSurface({ windowId }: { readonly windowId: string }) {
  const wallpaper = useSettingsStore((s) => s.wallpaper)
  const soundsEnabled = useSettingsStore((s) => s.soundsEnabled)
  const reducedMotionFollow = useSettingsStore((s) => s.reducedMotionFollow)

  /* --------------------------- guarded reset state --------------------------- */

  const [guardLifted, setGuardLifted] = useState(false)
  const [throwing, setThrowing] = useState(false)
  const [resealed, setResealed] = useState(() => archiveResealedAt() !== null)
  const coverRef = useRef<HTMLButtonElement | null>(null)
  const resetSwitchRef = useRef<HTMLButtonElement | null>(null)
  const resealedRef = useRef<HTMLDivElement | null>(null)
  const vaultSectionRef = useRef<HTMLElement | null>(null)

  // HU-1: the storage-recovery notice's one-time "View vault readout" link
  // flags the settings store; a console mounting with the flag pending opens
  // ONTO the vault (scrolled into view, focused) — the operator asked for the
  // readout, not the wallpaper bay. Ref-guarded so StrictMode's second effect
  // pass cannot strand the focus (the first pass focused, the flag is gone);
  // the store flag is cleared only once the section actually took focus.
  const vaultFocusedRef = useRef(false)
  useEffect(() => {
    if (vaultFocusedRef.current) return
    if (!useSettingsStore.getState().vaultFocusPending) return
    const section = vaultSectionRef.current
    if (section === null) return
    vaultFocusedRef.current = true
    section.scrollIntoView({ block: 'start' })
    section.focus()
    useSettingsStore.getState().consumeVaultFocus() // clears the session flag
  }, [])

  // Guard ENGAGEMENT moves the operator's hand: lifting focuses the armed
  // switch (the revealed state owns focus); lowering hands it back to the
  // cover. Mount deliberately steals NOTHING — a focused guard would also
  // scroll the panel mid-list on open (found in the visual pass). The
  // previous-VALUE comparison keeps that law under StrictMode's double effect
  // pass (the old first-run flag made the second pass focus the cover on
  // mount — found by HU-1's vault-link e2e).
  const prevGuardLiftedRef = useRef(false)
  useEffect(() => {
    if (prevGuardLiftedRef.current === guardLifted) return
    prevGuardLiftedRef.current = guardLifted
    if (guardLifted) resetSwitchRef.current?.focus()
    else coverRef.current?.focus()
  }, [guardLifted])

  // The relit console opens onto its report: the strip takes focus so the
  // seal is announced (role="status" carries the words).
  useEffect(() => {
    if (resealed) resealedRef.current?.focus()
  }, [resealed])

  const toggleCover = (): void => {
    setGuardLifted((was) => !was)
  }

  const throwReset = (): void => {
    if (!guardLifted || throwing || resealed) return
    setThrowing(true)
    void throwGuardedReset().finally(() => {
      // In-world this surface unmounts at the rehydrate (the relit console
      // reads the module flag instead); when it survives (tests), it reports.
      setThrowing(false)
      setResealed(true)
    })
  }

  const dismissResealed = (): void => {
    clearArchiveResealed()
    setResealed(false)
    setGuardLifted(false)
  }

  /* ------------------------------ plate bay ---------------------------------- */

  const selectPlate = (id: string): void => {
    useSettingsStore.getState().setWallpaper(id)
  }

  const onPlatesKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const count = PLATES.length
    if (count === 0) return
    const current = Math.max(
      0,
      PLATES.findIndex((p) => p.id === wallpaper),
    )
    // Radios: arrows MOVE selection (not just focus); Home/End run the rails.
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowLeft: -1,
    }
    let target: number
    if (event.key in step) {
      target = (current + step[event.key]! + count) % count
    } else if (event.key === 'Home') {
      target = 0
    } else if (event.key === 'End') {
      target = count - 1
    } else {
      return
    }
    event.preventDefault()
    const plate = PLATES[target]!
    selectPlate(plate.id)
    document.querySelector<HTMLButtonElement>(`[data-settings-plate="${plate.id}"]`)?.focus()
  }

  /* -------------------------------- render ----------------------------------- */

  const snap = motionHoldsStill(reducedMotionFollow)

  return (
    <div className="settings" data-settings-surface data-owner-window={windowId}>
      <div className="settings-scroll">
        {/* -- wallpaper plates ------------------------------------------------- */}
        <section aria-labelledby="settings-plates-head">
          <p className="engraved settings-head" id="settings-plates-head">
            Wallpaper plates
          </p>
          <div
            className="settings-bay settings-plates"
            role="radiogroup"
            aria-labelledby="settings-plates-head"
            data-settings-plates
            onKeyDown={onPlatesKeyDown}
          >
            {PLATES.map((plate) => {
              const mounted = plate.id === wallpaper
              const Swatch = plate.Swatch
              return (
                <button
                  key={plate.id}
                  type="button"
                  role="radio"
                  aria-checked={mounted}
                  className="settings-plate"
                  data-settings-plate={plate.id}
                  data-mounted={mounted || undefined}
                  onClick={() => selectPlate(plate.id)}
                >
                  <span className="settings-plate-swatch">
                    <Swatch />
                  </span>
                  <span className="settings-plate-text">
                    <span className="settings-plate-name">{plate.name}</span>
                    <span className="settings-plate-kind">{plate.kind}</span>
                  </span>
                  {mounted && <span className="settings-plate-flag well">MOUNTED</span>}
                </button>
              )
            })}
          </div>
        </section>

        {/* -- console hardware --------------------------------------------------- */}
        <section aria-labelledby="settings-hardware-head">
          <p className="engraved settings-head" id="settings-hardware-head">
            Console hardware
          </p>
          <div className="settings-bay settings-rows">
            <div className="settings-row">
              <span className="settings-row-text">
                <span className="settings-row-name">UI sounds</span>
                <span className="settings-row-hint">
                  Console bleeps at module actions. Ships muted; throw the switch to arm the
                  speaker.
                </span>
              </span>
              <HardwareSwitch
                dataKey="sounds"
                label="UI sounds"
                checked={soundsEnabled}
                onThrow={() => useSettingsStore.getState().setSoundsEnabled(!soundsEnabled)}
              />
            </div>
            <div className="settings-row">
              <span className="settings-row-text">
                <span className="settings-row-name">Reduced-motion follow</span>
                <span className="settings-row-hint">
                  Console motion follows the vessel&rsquo;s reduced-motion preference — boot pacing
                  and authored moments hold still on request. Off demands full motion, enforced at
                  the boot seam (platform lane).
                </span>
              </span>
              <HardwareSwitch
                dataKey="reduced-motion"
                label="Reduced-motion follow"
                checked={reducedMotionFollow}
                onThrow={() =>
                  useSettingsStore.getState().setReducedMotionFollow(!reducedMotionFollow)
                }
              />
            </div>
          </div>
        </section>

        {/* -- the guarded reset --------------------------------------------------- */}
        <section aria-labelledby="settings-reset-head">
          <p className="engraved settings-head" id="settings-reset-head">
            Archive reset
          </p>
          <div
            className="settings-bay settings-guard"
            data-settings-guard
            data-lifted={guardLifted || undefined}
            data-snap={snap || undefined}
          >
            {resealed ? (
              <ResealedReport ref={resealedRef} onDismiss={dismissResealed} />
            ) : (
              <>
                <div className="settings-guard-inner">
                  <div className="settings-row">
                    <span className="settings-row-text">
                      <span className="settings-row-name">Reseal archive</span>
                      <span className="settings-reset-hint">
                        Guarded switch — lift the oxide cover to arm it.
                      </span>
                    </span>
                    <HardwareSwitch
                      ref={resetSwitchRef}
                      dataKey="reset"
                      label="Reseal archive"
                      checked={throwing}
                      disabled={!guardLifted || throwing}
                      onThrow={throwReset}
                    />
                  </div>
                  {guardLifted && (
                    <div className="settings-reset-strip" role="note" data-reset-strip>
                      <p className="settings-reset-strip-title">
                        Guard lifted — reseal the archive?
                      </p>
                      <p className="settings-reset-strip-body">
                        Throwing reseeds the catalog from the seed collection and clears every icon
                        position and open window. Per-session module memories reset on reload.
                      </p>
                      {/* The release: re-seat the guard without throwing. */}
                      <button
                        type="button"
                        className="settings-guard-lower"
                        data-guard-lower
                        onClick={() => setGuardLifted(false)}
                      >
                        Lower guard
                      </button>
                    </div>
                  )}
                </div>
                {/* The oxide cover — a physical flap over the armed switch. */}
                <button
                  ref={coverRef}
                  type="button"
                  className="settings-guard-cover"
                  data-guard-cover
                  aria-label={guardLifted ? 'Lower guard cover' : 'Lift guard cover'}
                  onClick={toggleCover}
                >
                  <span className="settings-cover-engraved">Reset guard</span>
                  <span className="settings-cover-action">
                    {guardLifted ? 'Lower cover' : 'Lift cover to arm'}
                  </span>
                  {/* The machined finger grip — the flap's handle. */}
                  <span className="settings-cover-grip" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </section>

        {/* -- the vault readout --------------------------------------------------- */}
        <section
          ref={vaultSectionRef}
          aria-labelledby="settings-vault-head"
          tabIndex={-1}
          data-settings-vault-section
        >
          <p className="engraved settings-head" id="settings-vault-head">
            Vault
          </p>
          <VaultReadout />
        </section>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * The hardware switch — a real <button role="switch">: bevel + brass screws +
 * thrown brass bat + phosphor state lamp. Space throws on keyDOWN (hardware
 * throws the instant it is pressed; preventDefault keeps native activation
 * from double-firing on keyUP), Enter rides native activation. React 19:
 * `ref` is an ordinary prop.
 * ------------------------------------------------------------------------ */

interface HardwareSwitchProps {
  readonly dataKey: string
  readonly label: string
  readonly checked: boolean
  readonly disabled?: boolean
  readonly onThrow: () => void
  readonly ref?: RefObject<HTMLButtonElement | null>
}

function HardwareSwitch({
  dataKey,
  label,
  checked,
  disabled = false,
  onThrow,
  ref,
}: HardwareSwitchProps) {
  const throwIfArmed = (): void => {
    if (!disabled) onThrow()
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === ' ') {
      event.preventDefault() // suppress the native keyup click — one throw per press
      throwIfArmed()
    }
  }
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="settings-hw"
      data-settings-switch={dataKey}
      data-on={checked || undefined}
      disabled={disabled}
      onClick={throwIfArmed}
      onKeyDown={onKeyDown}
    >
      <span className="settings-hw-screw settings-hw-screw--l" aria-hidden="true" />
      <span className="settings-hw-screw settings-hw-screw--r" aria-hidden="true" />
      <span className="settings-hw-track" aria-hidden="true">
        <span className="settings-hw-bat" />
      </span>
      <span className="settings-hw-lamp" aria-hidden="true" />
    </button>
  )
}

/* --------------------------------------------------------------------------
 * The resealed report — the reset's in-world receipt, focused on arrival.
 * ------------------------------------------------------------------------ */

function ResealedReport({
  ref,
  onDismiss,
}: {
  readonly ref: RefObject<HTMLDivElement | null>
  readonly onDismiss: () => void
}) {
  const lastFailure = useStorageStatusStore((s) => s.lastFailure)
  const resealedAt = archiveResealedAt()
  return (
    <div
      ref={ref}
      className="well settings-resealed"
      role="status"
      data-resealed
      tabIndex={-1}
      aria-label="Archive resealed"
    >
      <span className="scanlines" aria-hidden="true" />
      <p className="settings-resealed-title">Archive resealed</p>
      <p className="settings-resealed-body">
        The seed collection is re-filed and the vault rewritten
        {resealedAt !== null ? ` at ${formatReadoutClock(resealedAt)}` : ''}. This console relit
        itself to report the seal.
      </p>
      {lastFailure !== null && (
        <p className="settings-resealed-body" data-resealed-fault>
          The vault reported a fault on the rewrite — see the readout below.
        </p>
      )}
      <button
        type="button"
        className="settings-resealed-dismiss"
        data-resealed-dismiss
        onClick={onDismiss}
      >
        Return to console
      </button>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * The vault readout — read-only diagnostics: navigator.storage.estimate()
 * (re-sampled after each write) + the storage status store's live fields.
 * ------------------------------------------------------------------------ */

interface Estimate {
  readonly usage: number
  readonly quota: number
}

function VaultReadout() {
  const lastSavedAt = useStorageStatusStore((s) => s.lastSavedAt)
  const saveCount = useStorageStatusStore((s) => s.saveCount)
  const bootOrigin = useStorageStatusStore((s) => s.bootOrigin)
  const recovery = useStorageStatusStore((s) => s.recovery)
  const lastFailure = useStorageStatusStore((s) => s.lastFailure)
  const [estimate, setEstimate] = useState<Estimate | null>(null)

  // Sample once, then after every successful write (the count ticks then).
  useEffect(() => {
    let live = true
    void estimateStorage().then((result) => {
      if (live && result !== null) setEstimate(result)
    })
    return () => {
      live = false
    }
  }, [saveCount])

  const percent = estimate !== null ? quotaPercent(estimate.usage, estimate.quota) : null

  return (
    <div className="well settings-vault" data-settings-vault>
      <span className="scanlines" aria-hidden="true" />
      <dl className="settings-vault-grid">
        <div className="settings-vault-cell">
          <dt>Last write</dt>
          <dd data-vault-last-write>
            {lastSavedAt === null ? NEVER : formatReadoutClock(lastSavedAt)}
          </dd>
        </div>
        <div className="settings-vault-cell">
          <dt>Writes</dt>
          <dd data-vault-writes>{saveCount}</dd>
        </div>
        <div className="settings-vault-cell">
          <dt>Boot</dt>
          <dd data-vault-boot>{bootOrigin === null ? UNREPORTED : BOOT_WORDS[bootOrigin]}</dd>
        </div>
        <div className="settings-vault-cell">
          <dt>Usage</dt>
          <dd data-vault-usage>{estimate === null ? UNREPORTED : formatBytes(estimate.usage)}</dd>
        </div>
        <div className="settings-vault-cell">
          <dt>Quota</dt>
          <dd data-vault-quota>
            {estimate === null
              ? UNREPORTED
              : percent === null
                ? formatBytes(estimate.quota)
                : `${formatBytes(estimate.quota)} · ${percent}%`}
          </dd>
        </div>
      </dl>
      {recovery !== null && (
        <p className="settings-vault-note" data-vault-recovery>
          Recovery on boot: {recovery.message}
        </p>
      )}
      {lastFailure !== null && (
        <p className="settings-vault-note settings-vault-note--failure" data-vault-failure>
          Last write failed: {lastFailure.message}
        </p>
      )}
    </div>
  )
}
