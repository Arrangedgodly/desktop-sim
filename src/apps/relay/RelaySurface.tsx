/**
 * Relay surface (batch 2, brief 3) — SURVEY RELAY, the hold's mail wire,
 * mounted lazy in its own chunk. Correspondence from the survey vessel's
 * home office arrives on a drip schedule once the relay is first opened:
 * first post ~20s in, then minutes apart. Arrival is QUIET — a dim lamp and
 * a count, never a modal. Letters are read on parchment (the reading
 * surface); the ledger is engraved chrome.
 *
 * Anatomy:
 *
 *   ┌ toolbar (console chrome) ──────────────────────────────────────────┐
 *   │ SURVEY RELAY · home office wire   [WATCH 00:00:47 MAIL 01/06 NEXT  │
 *   │                                    01:40]  ● arrival lamp (dim)    │
 *   └────────────────────────────────────────────────────────────────────┘
 *   ┌ ledger (engraved chrome) ───────┬ parchment sheet (reading side) ───┐
 *   │ ● Channel check — relay la…     │ FROM The Watch Desk · OF-101 · …  │
 *   │   OF-101 · DAY 4471-114         │ CHANNEL CHECK — RELAY LAMP LIT    │
 *   │   (dim rows = read; FILED tag)  │ …body, Lora at reading leading…   │
 *   │ Awaiting first post…            │              [ FILE TO ARCHIVE ]  │
 *   └─────────────────────────────────┴ ← brass: a button you press ──────┘
 *
 * - THE RELAY CLOCK (hidden-pause by construction): the drip schedule runs
 *   on ACCRUED VISIBLE WATCH TIME, not wall time. A 1s tick adds one second
 *   only while `document.hidden` is false — the wire pauses when the hold's
 *   display is away, and `due()` (pure over timestamps — relay-model.ts)
 *   simply never sees hidden time. The clock and the read/filed marks ride
 *   the WM window record's opaque appState (validated on read), so a reload
 *   restores the SAME watch; closing the window ends the watch (the brief's
 *   window-scoped state), and filing is idempotent by label so a new watch
 *   never duplicates a transcript.
 * - Reading a letter marks it read the moment it is opened (the read-lamp
 *   state: unread rows carry a lit lamp, read rows a dark one).
 * - FILE TO THE ARCHIVE bootstraps a `Relay` drawer on the hold's ground on
 *   the first file, then accessions the letter's transcript as a REAL text
 *   specimen through lib/fs's pure ops (the archive gains a story). A
 *   name-squatting FSError renders as an in-world refusal line — no browser
 *   dialogs, ever.
 * - The ONE authored moment: a fresh letter's row settles into the ledger
 *   (console ease, from visible). Under reduced motion it collapses to the
 *   settled row + the lamp change via the global kill — arrival stays
 *   legible, never animated beyond the lamp.
 * - `playCue`: a small console blip on arrival, the select tock on opening,
 *   the drawer-drop cue on filing — no-ops while the console is muted.
 * - TEST HOOK (see index.ts): `window.__relayTestHook.advance(ms)` advances
 *   the relay clock directly — the e2e seam the brief sanctions.
 * - Keyboard: arrows walk the ledger (roving rows, wrapping), Home/End jump,
 *   Enter/Space opens the focused row (native button); no app Esc claim —
 *   nothing here needs to intercept the OS's Escape.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { FSError } from '../../lib/fs'
import { playCue } from '../../lib/audio'
import { useFSStore, useWMStore } from '../../platform/stores'
import type { AppSurfaceProps } from '../../platform/app-registry'
import {
  RELAY_CLOCK_ORIGIN,
  RELAY_CORPUS,
  RELAY_CORPUS_COUNT,
  arrivedLetters,
  due,
  fileLetter,
  formatDelay,
  formatWatch,
  freshWatch,
  mailCountReadout,
  nextArrivalDelayMs,
  readRelayState,
  type RelayWindowState,
} from './relay-model'
import './relay.css'

/** The tick the wire wakes to (accrual granularity; arrivals are 20s+ apart). */
const TICK_MS = 1_000

/** How often accrued time rides the window record between mark changes. */
const PERSIST_CADENCE_MS = 5_000

declare global {
  interface Window {
    /** Test seam (see index.ts): advance the relay clock directly. */
    __relayTestHook?: { advance: (ms: number) => void }
  }
}

export default function RelaySurface({ windowId }: AppSurfaceProps) {
  /* ------------------------------ the watch -------------------------------- */

  /** Mount-only read of the persisted watch (hostile payloads → fresh). */
  const [watch, setWatch] = useState<RelayWindowState>(
    () => readRelayState(useWMStore.getState().windows[windowId]?.appState) ?? freshWatch(Date.now()),
  )
  const [openId, setOpenId] = useState<string | null>(null)
  /** The just-arrived row — the one that settles (the authored moment). */
  const [freshId, setFreshId] = useState<string | null>(null)
  /** Filing refusal line (a caught FSError's in-world message). */
  const [refusal, setRefusal] = useState<string | null>(null)
  /** Letter id → the accession its filed specimen carries (the FILED chip). */
  const [accessions, setAccessions] = useState<Readonly<Record<string, string>>>({})

  const readSet = useMemo(() => new Set(watch.read), [watch.read])
  const filedSet = useMemo(() => new Set(watch.filed), [watch.filed])

  const arrived = useMemo(
    () => arrivedLetters(watch.elapsedMs, RELAY_CLOCK_ORIGIN),
    [watch.elapsedMs],
  )
  const unread = useMemo(() => due(watch.elapsedMs, RELAY_CLOCK_ORIGIN, readSet), [watch.elapsedMs, readSet])
  const nextDelay = nextArrivalDelayMs(watch.elapsedMs, RELAY_CLOCK_ORIGIN)
  const openLetter = useMemo(() => {
    if (openId === null) return null
    const letter = RELAY_CORPUS.find((candidate) => candidate.id === openId)
    return letter && letter.offsetMs <= watch.elapsedMs ? letter : null
  }, [openId, watch.elapsedMs])

  const listRef = useRef<HTMLUListElement | null>(null)
  const watchRef = useRef(watch)
  useEffect(() => {
    watchRef.current = watch
  })

  /* --------------------------- the relay clock ------------------------------ */

  // Accrue one tick per second while the hold's display is away from no eyes:
  // `document.hidden` stops accrual entirely — the wire pauses, and the pure
  // schedule below simply stops advancing. (Minimize keeps the document
  // visible; the surface stays mounted and the watch honestly continues.)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) {
        setWatch((current) => ({ ...current, elapsedMs: current.elapsedMs + TICK_MS }))
      }
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  /* ------------------------------ arrivals ---------------------------------- */

  // The quiet arrival: a fresh row settles in (the one authored moment) and a
  // small console blip sounds. Baseline at mount: a RESTORED watch does not
  // re-flare its history. RELAY_CORPUS is arrival-ordered, so count-1 is the
  // newest letter.
  const arrivedCount = arrived.length
  const baselineRef = useRef<number | null>(null)
  useEffect(() => {
    if (baselineRef.current === null) {
      baselineRef.current = arrivedCount
      return
    }
    if (arrivedCount <= baselineRef.current) return
    baselineRef.current = arrivedCount
    const newest = RELAY_CORPUS[arrivedCount - 1]
    if (newest) setFreshId(newest.id)
    playCue('menu-open') // the wire's small attention blip; no-op while muted
  }, [arrivedCount])

  /* --------------------------- persistence (appState) ----------------------- */

  // Read/filed marks ride the window record the moment they change (this also
  // anchors the watch at mount, so a reload restores it).
  const lastMarksRef = useRef<string | null>(null)
  useEffect(() => {
    const marks = `${watch.read.join(',')}|${watch.filed.join(',')}`
    if (lastMarksRef.current === marks) return
    lastMarksRef.current = marks
    useWMStore.getState().setWindowAppState(windowId, watch)
  }, [watch, windowId])

  // Accrued time rides at a 5s cadence — arrivals are 20s+ apart, so a hard
  // reload loses at most five seconds of wait (documented in the log).
  const lastElapsedPersistRef = useRef(0)
  useEffect(() => {
    if (watch.elapsedMs - lastElapsedPersistRef.current < PERSIST_CADENCE_MS) return
    lastElapsedPersistRef.current = watch.elapsedMs
    useWMStore.getState().setWindowAppState(windowId, watch)
  }, [watch, windowId])

  // Close/unmount: the watch's final reading rides the record (if the record
  // still exists — a closing window takes its record with it, honestly).
  useEffect(() => {
    return () => {
      useWMStore.getState().setWindowAppState(windowId, watchRef.current)
    }
  }, [windowId])

  /* ------------------------------ test hook --------------------------------- */

  // The e2e seam (brief acceptance 8, documented in index.ts + the log):
  // advance the relay clock directly. Installed on mount, withdrawn on
  // unmount; an operator pacing their own sandbox harms nothing.
  useEffect(() => {
    const hook = {
      advance: (ms: number): void => {
        if (!Number.isFinite(ms) || ms <= 0) return
        setWatch((current) => ({ ...current, elapsedMs: current.elapsedMs + ms }))
      },
    }
    window.__relayTestHook = hook
    return () => {
      if (window.__relayTestHook === hook) delete window.__relayTestHook
    }
  }, [])

  /* ------------------------------- actions ---------------------------------- */

  /** Open a letter — reading starts the moment the envelope is opened. */
  const open = (id: string): void => {
    setOpenId(id)
    playCue('menu-select')
    setWatch((current) =>
      current.read.includes(id) ? current : { ...current, read: [...current.read, id] },
    )
  }

  /** File the open letter into the archive — a real text specimen, or the
   *  in-world refusal line when the catalog refuses (FSError). */
  const file = (): void => {
    const letter = openLetter
    if (!letter || filedSet.has(letter.id)) return
    try {
      const { fs, commit } = useFSStore.getState()
      const result = fileLetter(fs, letter, { id: crypto.randomUUID(), now: Date.now() })
      if (result.fs !== fs) commit(result.fs)
      setAccessions((current) => ({ ...current, [letter.id]: result.accession }))
      setWatch((current) =>
        current.filed.includes(letter.id)
          ? current
          : { ...current, filed: [...current.filed, letter.id] },
      )
      setRefusal(null)
      playCue('drop-on-folder') // it literally files into a drawer; muted-safe
    } catch (error) {
      if (!(error instanceof FSError)) throw error
      // The refusal names the problem and the recovery (in-world ink, never
      // a browser dialog; the raw error carries a machine code prefix).
      setRefusal(
        error.code === 'name-collision'
          ? 'A specimen by that name is already catalogued in the Relay drawer — relabel it there, then file again.'
          : 'The catalog refused the filing. The letter stays on the wire.',
      )
    }
  }

  /* ------------------------------- keyboard --------------------------------- */

  /** Arrows walk the ledger's rows (roving focus, wrapping); Home/End jump. */
  const handleLedgerKeys = (event: ReactKeyboardEvent<HTMLElement>): void => {
    const list = listRef.current
    if (!list) return
    const rows = Array.from(list.querySelectorAll<HTMLElement>('button[data-relay-row]'))
    if (rows.length === 0) return
    const index = rows.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % rows.length
    else if (event.key === 'ArrowUp') next = index < 0 ? rows.length - 1 : (index - 1 + rows.length) % rows.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = rows.length - 1
    if (next === null) return
    event.preventDefault()
    rows[next]!.focus()
  }

  /* -------------------------------- render ---------------------------------- */

  return (
    <div className="relay" data-relay-surface>
      <div className="relay-toolbar">
        <span className="relay-name engraved">Survey Relay</span>
        <span className="relay-sub">home office wire</span>
        {/* The instrument readout — one recessed well, B612, tabular. */}
        <span className="relay-readout well" data-relay-readout>
          <span data-relay-watch>{`WATCH ${formatWatch(watch.elapsedMs)}`}</span>
          <span data-relay-count>{`MAIL ${mailCountReadout(arrivedCount, RELAY_CORPUS_COUNT)}`}</span>
          <span data-relay-next>
            {nextDelay === null ? 'NEXT —' : `NEXT ${formatDelay(nextDelay)}`}
          </span>
          <span className="scanlines" aria-hidden="true" />
        </span>
        {/* The arrival lamp: lit dim amber while post is unread. */}
        <span className="relay-lamp" data-relay-lamp data-lit={unread.length > 0} aria-hidden="true" />
      </div>

      <div className="relay-body">
        <nav className="relay-ledger" aria-label="Correspondence ledger" onKeyDown={handleLedgerKeys}>
          {arrived.length === 0 ? (
            <p className="relay-awaiting" data-relay-awaiting>
              Awaiting first post…
            </p>
          ) : (
            <ul className="relay-list" ref={listRef}>
              {arrived.map((letter, index) => (
                <li key={letter.id}>
                  <button
                    type="button"
                    className="relay-row"
                    data-relay-row={letter.id}
                    data-unread={!readSet.has(letter.id)}
                    data-fresh={letter.id === freshId}
                    aria-current={letter.id === openId ? 'true' : undefined}
                    tabIndex={index === 0 ? 0 : -1}
                    onClick={() => open(letter.id)}
                  >
                    <span className="relay-row-lamp" aria-hidden="true" />
                    <span className="relay-row-text">
                      <span className="relay-row-subject engraved">{letter.subject}</span>
                      <span className="relay-row-code">{`${letter.fromCode} · ${letter.stamp}`}</span>
                    </span>
                    {filedSet.has(letter.id) && <span className="relay-row-filed">FILED</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="relay-sheet parchment-surface" data-relay-sheet>
          {openLetter ? (
            <article className="relay-letter" data-relay-letter={openLetter.id}>
              <header className="relay-letter-head">
                <p className="relay-letter-code">{`${openLetter.from} · ${openLetter.fromCode} · ${openLetter.stamp}`}</p>
                <h2 className="relay-letter-subject engraved--parchment">{openLetter.subject}</h2>
              </header>
              <div className="relay-letter-body" data-relay-letter-body>
                {openLetter.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
              <footer className="relay-letter-foot">
                {filedSet.has(openLetter.id) ? (
                  <span className="relay-filed-chip" data-relay-filed>
                    {`FILED${accessions[openLetter.id] ? ` · ${accessions[openLetter.id]}` : ''}`}
                  </span>
                ) : (
                  <button type="button" className="relay-file" data-relay-file onClick={file}>
                    File to the archive
                  </button>
                )}
                {refusal && (
                  <p className="relay-refuse" data-relay-refusal role="alert">
                    {refusal}
                  </p>
                )}
              </footer>
            </article>
          ) : (
            <p className="relay-marginal" data-relay-marginal>
              {arrived.length === 0
                ? 'The wire is quiet. First post is expected within the minute.'
                : 'Select a transmission from the ledger.'}
            </p>
          )}
        </div>
      </div>

      {/* Arrival sentence for assistive tech (the lamp itself is decorative). */}
      <span className="relay-sr" role="status">
        {arrived.length === 0
          ? 'The wire is quiet.'
          : `Post ${arrived.length} of ${RELAY_CORPUS_COUNT} received${unread.length > 0 ? `, ${unread.length} unread` : ''}.`}
      </span>
    </div>
  )
}
