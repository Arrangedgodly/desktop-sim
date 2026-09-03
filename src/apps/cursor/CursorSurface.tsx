/**
 * Cursor surface (batch 2, brief 4) — the BRASS CALCULATING MACHINE, mounted
 * lazy in its own chunk. Expression in at the well's input line; the machine
 * prints the answer to a parchment ledger tape (newest line feeding up out
 * of the slot, like the adding machine it is).
 *
 * Anatomy:
 *
 *   ┌ toolbar (console chrome) ────────────────────────────────────────┐
 *   │ CURSOR · CALCULATING MACHINE                [ CLEAR ]  ← oxide,   │
 *   └───────────────────────────────────────────────── two-step armed ┘│
 *   ┌ the bay (chrome ground) ─────────────────────────────────────────┐
 *   │ ┌ the well (recessed phosphor) ┐  ┌──────┐                        │
 *   │ │ > 2^3^2█                     │  │  =   │ ← brass hardware       │
 *   │ └──────────────────────────────┘  └──────┘   (a button you press) │
 *   ├───────────────────────────────────────────────────────────────────┤
 *   │ PARCHMENT TAPE (scrolls) — newest first:                          │
 *   │   2^3^2 ................... = 512                                 │
 *   │   1/0 ......... DIVISION BY ZERO  ← refusal ink (oxide, a warning) │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 * - EVERY line of math runs the PURE model (cursor-model.ts): hand-written
 *   tokenizer → recursive-descent parser → evaluator; typed refusals render
 *   as in-world lines (MALFORMED EXPRESSION / DIVISION BY ZERO / OUT OF
 *   DOMAIN / OUT OF RANGE). NO eval of any kind exists in this app — the
 *   model's vocabulary is arithmetic and nothing else (grep-tested).
 * - The tape rides the WM window record's opaque appState (validated
 *   defensively on read — it crossed the persistence boundary). Reload
 *   restores the same tape (the window record survives); CLOSE tears it off
 *   (session-only — the brief's sanctioned choice, documented in the log).
 * - Keyboard-first: the entry line pulls focus on open; Enter prints, Esc
 *   clears the line and disarms the guarded Clear (the line's first claim on
 *   Esc, the terminal's own law). Typing keys are the field's — the OS
 *   input-field law (stopPropagation like the fleet's shells).
 * - The authored moment is exactly one: the tape FEED — the fresh line
 *   settles up out of the slot (240ms, console ease, from visible). Native
 *   caret (themed) carries the waiting beam instead of a second moment;
 *   reduced-motion collapses the feed to its end-state via the global kill.
 * - `playCue('menu-select')` prints; `playCue('toggle')` throws the guarded
 *   Clear — no-ops while the console is muted.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { playCue } from '../../lib/audio'
import { useWMStore } from '../../platform/stores'
import type { AppSurfaceProps } from '../../platform/app-registry'
import {
  appendEntry,
  calculate,
  clearTape,
  entryFor,
  nextEntryId,
  readTapeState,
  type TapeEntry,
} from './cursor-model'
import './cursor.css'

export default function CursorSurface({ windowId }: AppSurfaceProps) {
  /** The tape as restored across a reload (mount-only read, hostile-safe —
   *  an absent or hostile payload degrades to a fresh tape). */
  const [tape, setTape] = useState<readonly TapeEntry[]>(() =>
    readTapeState(useWMStore.getState().windows[windowId]?.appState) ?? [],
  )
  const [input, setInput] = useState('')
  /** The just-printed entry — the one row that feeds (the authored moment). */
  const [freshId, setFreshId] = useState<number | null>(null)
  /** The guarded Clear: first click arms, second tears the tape off. */
  const [armed, setArmed] = useState(false)

  const inputRef = useRef<HTMLInputElement | null>(null)

  /* The line owns the window (keyboard-first): pull focus on open. */
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /* Tape persistence: the printed lines ride the window record (opaque
   * appState; validated defensively on the read above). */
  useEffect(() => {
    useWMStore.getState().setWindowAppState(windowId, { version: 1, tape })
  }, [windowId, tape])

  /* ------------------------------ the print -------------------------------- */

  const submit = (): void => {
    const expr = input
    if (expr.trim().length === 0) return // a blank line prints nothing

    const outcome = calculate(expr)
    const entry = entryFor(nextEntryId(tape), expr, outcome)
    setTape((current) => appendEntry(current, entry))
    setFreshId(entry.id)
    playCue('menu-select') // the console's own select tock; no-op while muted
    setInput('')
  }

  /** The guarded Clear — two-step, oxide only here (destroying the tape). */
  const clear = (): void => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    setFreshId(null)
    setTape(clearTape())
    playCue('toggle') // hardware throw; no-op while muted
  }

  /* ------------------------------ keyboard --------------------------------- */

  const handleKeys = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation() // the line's keys are the line's (the OS input law)
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
      return
    }
    if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      // The line's FIRST CLAIM on Esc: clear the entry — and stand down the
      // guarded Clear with the same stroke (modifier Escapes stay the OS's).
      event.preventDefault()
      setArmed(false)
      setInput('')
    }
  }

  /** Clicking anywhere in the bay seats the line (never mid-selection). */
  const seatLine = (): void => {
    inputRef.current?.focus()
  }

  /** The guarded Clear claims Escape wherever focus sits while it is open
   *  (KEYBOARD.md: an app surface that handles Escape wins) — the guard
   *  stands down; the WINDOW must not close out from under an armed guard. */
  const claimEscape = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && armed && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      setArmed(false)
    }
  }

  /* ------------------------------ render ----------------------------------- */

  return (
    <div className="cursor" data-cursor-surface onKeyDown={claimEscape}>
      <div className="cursor-toolbar">
        <span className="cursor-name engraved">Cursor</span>
        <span className="cursor-sub">Calculating Machine</span>
        <button
          type="button"
          className="cursor-clear"
          data-cursor-clear
          data-armed={armed}
          aria-label={armed ? 'Confirm: tear the tape off' : 'Clear the tape'}
          onClick={clear}
          onBlur={() => setArmed(false)}
        >
          {armed ? 'Confirm' : 'Clear'}
        </button>
      </div>

      <div className="cursor-bay" onMouseDown={seatLine}>
        <div className="cursor-well well">
          <span className="cursor-prompt" aria-hidden="true">
            &gt;
          </span>
          <input
            ref={inputRef}
            className="cursor-input"
            data-cursor-input
            type="text"
            value={input}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Expression entry line — Enter prints the result to the tape"
            onChange={(event) => {
              setInput(event.target.value)
            }}
            onKeyDown={handleKeys}
          />
          <div className="scanlines" aria-hidden="true" />
        </div>
        <button
          type="button"
          className="cursor-enter"
          data-cursor-enter
          aria-label="Equals — print the result to the tape"
          onClick={() => {
            submit()
            inputRef.current?.focus() // the machine's hand returns to the line
          }}
        >
          =
        </button>
      </div>

      <div
        className="cursor-tape parchment-surface"
        data-cursor-tape
        role="log"
        aria-live="polite"
        aria-label="Ledger tape"
      >
        {tape.length === 0 ? (
          <p className="cursor-empty" data-cursor-empty>
            Tape empty — type an expression and press Enter.
          </p>
        ) : (
          tape.map((entry) => (
            <div
              key={entry.id}
              className="cursor-row"
              data-cursor-row
              data-refused={entry.refused}
              data-fresh={entry.id === freshId}
            >
              <span className="cursor-expr" data-cursor-expr>
                {entry.expr}
              </span>
              <span className="cursor-line" data-cursor-line>
                {entry.refused ? entry.line : `= ${entry.line}`}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
