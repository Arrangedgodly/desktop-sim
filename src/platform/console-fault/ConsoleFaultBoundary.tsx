/**
 * OS-level error boundary (HU-1) — one boundary at the app root, mounted by
 * main.tsx around EACH session tree (desktop and phone notice alike). If the
 * OS shell itself throws, the visitor sees a full-page in-world CONSOLE FAULT
 * plate instead of a white screen or a raw React error dump: HOLD/OS names
 * the fault, the recovery advice is a reload, and the nuclear option — Reset
 * archive, clearing storage + reseeding + reloading — hides behind a confirm
 * strip so it can never fire on one click.
 *
 * Fallback stability: the plate is dependency-free chrome (no store reads, no
 * children, no effects that can throw); a fault landing DURING the plate is
 * impossible by construction, and the plate never re-renders the faulting
 * subtree. `resetDesktop()` is MF-2's own seam (typed failures surface, the
 * in-memory reset proceeds); the reload happens either way.
 */

import { Component, useState } from 'react'
import type { ReactNode } from 'react'
import { OS_VERSION } from '../boot/os'
import { resetDesktop } from '../../lib/storage/persistence'
import './console-fault.css'

export interface ConsoleFaultBoundaryProps {
  /** What the plate calls the session it guards (diagnostics only). */
  readonly session?: string
  readonly children: ReactNode
}

interface ConsoleFaultBoundaryState {
  readonly faulted: boolean
}

export class ConsoleFaultBoundary extends Component<
  ConsoleFaultBoundaryProps,
  ConsoleFaultBoundaryState
> {
  state: ConsoleFaultBoundaryState = { faulted: false }

  static getDerivedStateFromError(): Partial<ConsoleFaultBoundaryState> {
    return { faulted: true }
  }

  componentDidCatch(error: unknown): void {
    // The engine log keeps the real story; the visitor sees only the plate.
    console.error('[console-fault] the OS shell faulted:', error)
  }

  render() {
    if (this.state.faulted) return <ConsoleFaultPlate session={this.props.session} />
    return this.props.children
  }
}

/* --------------------------------------------------------------------------
 * The CONSOLE FAULT plate — full-page, in-world, no error dump.
 * -------------------------------------------------------------------------- */

function reloadConsole(): void {
  window.location.reload()
}

function ConsoleFaultPlate({ session }: { readonly session?: string }) {
  const [resetArmed, setResetArmed] = useState(false)
  const [resetting, setResetting] = useState(false)

  const throwReset = (): void => {
    if (!resetArmed || resetting) return
    setResetting(true)
    void resetDesktop()
      .catch(() => {}) // typed failure: the reload is still the honest next step
      .finally(() => window.location.reload())
  }

  return (
    <div className="console-fault" data-console-fault role="alert" aria-label="Console fault">
      <div className="console-fault-module">
        <p className="console-fault-os">
          HOLD/OS <span className="console-fault-version">{OS_VERSION}</span>
        </p>
        <h1 className="console-fault-head">CONSOLE FAULT</h1>
        <div className="well console-fault-well" data-console-fault-well>
          <span className="scanlines" aria-hidden="true" />
          <p className="console-fault-line" data-state="fault">
            CORE SHELL ..... FAULTED
          </p>
          <p className="console-fault-line">ARCHIVE ........ INTACT (DISK)</p>
          <p className="console-fault-line">MODULES ........ HALTED</p>
          <p className="console-fault-advice">
            The console itself faulted and was halted{session ? ` (${session} side)` : ''}. The
            archive on this vessel is intact — reloading the page usually clears the fault.
          </p>
        </div>
        <div className="console-fault-actions">
          <button
            type="button"
            className="console-fault-reload"
            data-console-fault-reload
            onClick={reloadConsole}
          >
            Reload console
          </button>
          <button
            type="button"
            className="console-fault-reset-toggle"
            data-console-fault-reset-toggle
            aria-expanded={resetArmed}
            onClick={() => setResetArmed((was) => !was)}
          >
            Reset archive…
          </button>
        </div>
        {resetArmed && (
          <div className="console-fault-strip" role="note" data-console-fault-strip>
            <p className="console-fault-strip-title">Reset the archive?</p>
            <p className="console-fault-strip-body">
              This clears everything the console has stored on this vessel and reseeds it from the
              seed collection, then reloads. Specimens, icon positions and open windows are lost —
              this cannot be undone.
            </p>
            <div className="console-fault-strip-actions">
              <button
                type="button"
                className="console-fault-reset"
                data-console-fault-reset
                disabled={resetting}
                onClick={throwReset}
              >
                {resetting ? 'Resetting…' : 'Clear archive and reload'}
              </button>
              <button
                type="button"
                className="console-fault-cancel"
                data-console-fault-cancel
                onClick={() => setResetArmed(false)}
              >
                Keep archive
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
