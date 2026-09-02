/**
 * Terminal surface (federated session 1) — the CATALOG TERMINAL, mounted lazy
 * in its own chunk. The window content is ONE recessed phosphor well: the
 * whole module is display (the design brief's "one app that is ALL display
 * well and no parchment"), amber monochrome on the deepest ground, B612 Mono,
 * scanlines from the cheap repeating-gradient primitive.
 *
 * Anatomy:
 *
 *   ┌ the well (the whole window content) ─────────────────────────────┐
 *   │ CATALOG — THE SURVEY ARCHIVE          ← the log (role="log")      │
 *   │ ARC-0000  hold   ………………… Hold/                                    │
 *   │ …                                                                  │
 *   ├───────────────────────────────────────────────────────────────────┤
 *   │ DRW-0001:/Projects> █                ← the input line (a real     │
 *   └───────────────────────────────────────  <input>, in-world label) ─┘
 *
 * - Every command runs the PURE model (terminal-model.ts) against the REAL
 *   catalog state; mutations come back as `nextFs` and ride the FS store's
 *   single atomic `commit` seam, so MF-2 persistence picks them up with zero
 *   terminal-specific wiring. `open` routes through the registry's `openApp`
 *   with the node's real file launch context. NO EVAL — the model matches a
 *   fixed command table, nothing else (the hard rule is structural).
 * - Session (cwd + command history) rides the WM window record's opaque
 *   `appState` (`setWindowAppState`), validated defensively on read — it
 *   crossed the persistence boundary. A reload restores the same session.
 * - Keyboard-first: the line pulls focus on open (the notepad-sheet
 *   precedent); Up/Down walk history, Tab completes sibling names, Esc
 *   CLEARS THE LINE (claimed — apps get first claim; docs/KEYBOARD.md).
 * - The authored moment is the caret blink (the POST's own vocabulary);
 *   reduced-motion collapses it to a solid block via the global kill-switch.
 * - `playCue('menu-select')` on command commit — the one sanctioned cue
 *   boundary; no-ops while the console is muted.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { playCue } from '../../lib/audio'
import { useFSStore, useWMStore } from '../../platform/stores'
import { openApp, type AppSurfaceProps } from '../../platform/app-registry'
import {
  bannerLines,
  completeInput,
  executeLine,
  freshSession,
  historyDown,
  historyUp,
  historyValue,
  promptFor,
  pushHistory,
  readSessionState,
  type HistoryCursor,
  type TermLine,
  type TerminalSession,
} from './terminal-model'
import './terminal.css'

export default function TerminalSurface({ windowId }: AppSurfaceProps) {
  const fs = useFSStore((s) => s.fs)

  /** The session as restored across a reload (mount-only read). */
  const restoredRef = useRef<TerminalSession | null>(null)
  const [session, setSession] = useState<TerminalSession>(() => {
    const boot = useFSStore.getState().fs
    const restored = readSessionState(
      useWMStore.getState().windows[windowId]?.appState,
      boot,
    )
    restoredRef.current = restored
    return restored ?? freshSession(boot)
  })
  const [lines, setLines] = useState<readonly TermLine[]>(() => bannerLines(restoredRef.current))
  const [input, setInput] = useState('')
  const [cursor, setCursor] = useState<HistoryCursor>(null)

  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  /* The line owns the window (keyboard-first): pull focus on open. */
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /* If the drawer this shell sits in is decommissioned elsewhere, the shell
   * climbs back to the hold — never a dead cwd. */
  useEffect(() => {
    const node = fs.nodes[session.cwd]
    if (!node || node.kind !== 'folder') {
      setSession((current) => ({ ...current, cwd: fs.rootId }))
    }
  }, [fs, session.cwd])

  /* Session persistence: cwd + history ride the window record (opaque
   * appState, validated defensively on the read above). */
  useEffect(() => {
    useWMStore.getState().setWindowAppState(windowId, {
      cwd: session.cwd,
      history: session.history,
    })
  }, [windowId, session])

  /* The log follows the newest line (instant — instrument scroll, no motion). */
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  /* ------------------------------ the command loop ------------------------- */

  const submit = (): void => {
    const raw = input
    if (raw.trim().length === 0) return // blank commits nothing, remembers nothing

    const current = useFSStore.getState().fs
    const outcome = executeLine(current, session, raw)

    if (outcome.nextFs !== null) {
      useFSStore.getState().commit(outcome.nextFs) // the single atomic seam
    }

    const effect = outcome.effect
    if (effect.type === 'cd') {
      setSession((s) => ({ ...s, cwd: effect.cwd }))
    } else if (effect.type === 'open') {
      openApp(effect.appId, effect.launch) // the only sanctioned open path
    }

    const echo: TermLine = { kind: 'in', text: `${promptFor(current, session.cwd)} ${raw}` }
    setLines((existing) =>
      effect.type === 'clear' ? [echo] : [...existing, echo, ...outcome.lines],
    )
    setSession((s) => ({ ...s, history: pushHistory(s.history, raw) }))
    playCue('menu-select') // the console's own select tick; no-op while muted

    setInput('')
    setCursor(null)
  }

  /** Tab completes sibling names; ambiguity echoes the candidates. */
  const complete = (): void => {
    const outcome = completeInput(useFSStore.getState().fs, session.cwd, input)
    if (outcome.value === input && outcome.options.length === 0) return
    setInput(outcome.value)
    if (outcome.options.length > 0) {
      setLines((existing) => [
        ...existing,
        { kind: 'in', text: `${promptFor(useFSStore.getState().fs, session.cwd)} ${input}` },
        { kind: 'dim', text: outcome.options.join('   ') },
      ])
    }
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
      // The terminal's FIRST CLAIM on Esc: clear the current line (modifier
      // Escapes stay the OS's — Alt+Esc walks windows).
      event.preventDefault()
      setInput('')
      setCursor(null)
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const history = session.history
      const next =
        event.key === 'ArrowUp' ? historyUp(history, cursor) : historyDown(history, cursor)
      if (next !== cursor) {
        setCursor(next)
        setInput(historyValue(history, next))
      }
      return
    }
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      complete()
    }
  }

  /* Clicking the well seats the line (never mid-selection — the log is
   * reading material; a live text selection keeps the pointer). */
  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const selection = document.defaultView?.getSelection()
    if (selection && !selection.isCollapsed) return
    event.preventDefault() // keep the line's focus without killing selection drags
    inputRef.current?.focus()
  }

  /* ------------------------------ render ----------------------------------- */

  const prompt = promptFor(fs, session.cwd)

  return (
    <div
      className="terminal well"
      data-terminal-surface
      onMouseDown={handleMouseDown}
    >
      <div
        ref={logRef}
        className="terminal-log"
        data-terminal-log
        role="log"
        aria-live="polite"
        aria-label="Catalog terminal output"
      >
        {lines.map((line, index) => (
          <div key={index} className="terminal-line" data-kind={line.kind}>
            {line.text}
          </div>
        ))}
      </div>
      <div className="terminal-inputrow">
        <span className="terminal-prompt" aria-hidden="true">
          {prompt}{' '}
        </span>
        <span className="terminal-entry">
          <span className="terminal-mirror" aria-hidden="true">
            {input}
          </span>
          <input
            ref={inputRef}
            className="terminal-input"
            data-terminal-input
            type="text"
            value={input}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label={`Archive command line — current drawer ${prompt}`}
            onChange={(event) => {
              setInput(event.target.value)
              setCursor(null)
            }}
            onKeyDown={handleKeys}
          />
        </span>
      </div>
      {/* the CRT raster — the cheap repeating-gradient primitive */}
      <div className="scanlines" aria-hidden="true" />
    </div>
  )
}
