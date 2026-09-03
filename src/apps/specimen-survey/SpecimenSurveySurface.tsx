/**
 * Specimen Survey surface (batch 2, brief 5) — the dig, mounted lazy in its
 * own chunk. Minesweeper wearing the world: a field of survey plots in ONE
 * deep phosphor well; clear plots open, chisel numerals report specimen
 * proximity in amber levels, brass pins mark plots for review, and a
 * disturbed specimen ends the dig in a STATIC oxide state (no explosion
 * animation — the loss is a state, never a cartoon, so reduced-motion is
 * identical BY CONSTRUCTION).
 *
 *   ┌ toolbar (console chrome) ──────────────────────────────────────┐
 *   │ [FIELD][SURVEY][EXCAVATION] (engraved selector)  [NEW SURVEY]  │
 *   ├ readout rail ──────────────────────────────────────────────────┤
 *   │ SPECIMENS [08] · MARKS [00] · ELAPSED [00:00]    DIG UNDERWAY  │
 *   ├ the well (THE dig site — amber lives here and only here) ──────┤
 *   │  grid of plots (raised = sealed soil, flat = excavated,          │
 *   │  B612 numerals, brass pins, oxide only on the disturbed plot)   │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * - KEYBOARD (brief 5): arrows walk the plots (roving tabindex — exactly
 *   one plot tabbable, edges stop, Home/End jump), Enter/Space reveal, F
 *   pins. Right-click pins too (pointer parity with the classic gesture).
 * - PERSISTENCE: the whole board rides the window record's opaque
 *   `appState` (mirrored like the notepad's draft, re-anchored so time the
 *   page spent closed never counts) and is validated on read through the
 *   model's hostile gate — a reload resumes the SAME dig.
 * - The ONE authored moment: the well warms up on mount (35% → lit, the
 *   POST's own tube vocabulary). Everything else snaps between states —
 *   instrument readouts never tween.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { playCue } from '../../lib/audio'
import { useWMStore } from '../../platform/stores'
import type { AppSurfaceProps } from '../../platform/app-registry'
import {
  type PresetId,
  type SurveyBoard,
  SURVEY_HEARTBEAT_MS,
  SURVEY_MIRROR_DELAY_MS,
  SURVEY_PRESETS,
  SURVEY_TICK_MS,
  formatElapsed,
  freshSurvey,
  liveElapsedMs,
  markPlot,
  proximityMap,
  peekSurveyTestFixture,
  readSurveyState,
  reanchorSurvey,
  revealPlot,
  serializeSurvey,
  setSurveyTestFixture,
} from './survey-model'
import './specimen-survey.css'

/** Largest a plot renders before the grid shrinks (EXCAVATION fits 16 across). */
const PLOT_MAX_PX = 34

/** The pinned plot's brass pin — an authored hardware mark, not a unicode flag. */
function PinMark() {
  return (
    <svg viewBox="0 0 16 16" className="survey-pin" aria-hidden="true" focusable="false">
      <path d="M8 1.6 a3 3 0 0 1 3 3 c0 2.2 -3 5 -3 5 s-3 -2.8 -3 -5 a3 3 0 0 1 3 -3 Z" />
      <circle cx="8" cy="4.6" r="1.1" className="survey-pin-eye" />
    </svg>
  )
}

/** The specimen burst — what lies under a specimen plot when it lies open. */
function SpecimenMark({ disturbed }: { readonly disturbed: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={disturbed ? 'survey-specimen survey-specimen--disturbed' : 'survey-specimen'}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 2.2 L8 13.8 M2.2 8 L13.8 8 M3.9 3.9 L12.1 12.1 M12.1 3.9 L3.9 12.1"
        strokeWidth="1.5"
      />
    </svg>
  )
}

/** A plot's grid reference — archival coordinates, the catalog's own voice. */
const plotRef = (width: number, index: number): string =>
  `${String.fromCharCode(65 + (index % width))}${Math.floor(index / width) + 1}`

type PlotState =
  | 'sealed' // raised soil, nothing known
  | 'pinned' // sealed + a brass pin for review
  | 'clear' // excavated, no neighbors
  | 'numbered' // excavated, n adjacent specimens
  | 'specimen' // lies open after a loss (not the disturbed one)
  | 'disturbed' // THE disturbed specimen — the oxide plot

function plotState(board: SurveyBoard, proximity: readonly number[], index: number): PlotState {
  if (board.revealed[index]) {
    if (board.specimens[index]) {
      return board.disturbedAt === index ? 'disturbed' : 'specimen'
    }
    return proximity[index] === 0 ? 'clear' : 'numbered'
  }
  return board.marked[index] ? 'pinned' : 'sealed'
}

const STATUS_TEXT: Readonly<Record<SurveyBoard['status'], string>> = {
  digging: 'DIG UNDERWAY',
  cleared: 'SURVEY CLEARED',
  disturbed: 'SPECIMEN DISTURBED',
}

export default function SpecimenSurveySurface({ windowId }: AppSurfaceProps) {
  /**
   * Seed order (documented for the e2e): the model's test fixture (a
   * deterministic field for scripted play — PEEKED, because StrictMode
   * double-invokes initializers in development), then the window record's
   * own appState (the reloaded dig), then a fresh default board. Both
   * restored paths re-anchor the clock so closed time never counts.
   */
  const [board, setBoard] = useState<SurveyBoard>(() => {
    const fixture = peekSurveyTestFixture()
    if (fixture !== null) return reanchorSurvey(fixture)
    const persisted = readSurveyState(useWMStore.getState().windows[windowId]?.appState)
    return persisted !== null ? reanchorSurvey(persisted) : freshSurvey('field')
  })

  /** Roving tabindex seat (the one tabbable plot). */
  const [focusIndex, setFocusIndex] = useState(0)
  /** Redraw clock for the elapsed readout. */
  const [nowTick, setNowTick] = useState(() => Date.now())

  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])
  const boardRef = useRef(board)
  useEffect(() => {
    boardRef.current = board
  }, [board])

  // The fixture serves exactly ONE window: cleared on its first commit.
  useEffect(() => {
    setSurveyTestFixture(null)
  }, [])

  const proximity = useMemo(() => proximityMap(board), [board])
  const running = board.status === 'digging' && board.runningSince !== null

  /* ------------------------------- moves -------------------------------- */

  const reveal = (index: number): void => {
    setBoard((current) => {
      if (current.status !== 'digging') return current
      if (current.revealed[index]) return current
      playCue('menu-select') // the console's select tick; a no-op while muted
      return revealPlot(current, index)
    })
  }

  const togglePin = (index: number): void => {
    setBoard((current) => {
      if (current.status !== 'digging') return current
      if (current.revealed[index]) return current
      playCue('toggle')
      return markPlot(current, index)
    })
  }

  const startSurvey = (presetId: PresetId): void => {
    playCue('menu-select')
    setBoard(freshSurvey(presetId))
    setFocusIndex(0)
    cellRefs.current[0]?.focus()
  }

  /* ------------------------------ the clock ------------------------------ */

  // The readout ticks while the dig runs (snap redraws, never tweens).
  useEffect(() => {
    if (!running) return
    const tick = window.setInterval(() => setNowTick(Date.now()), SURVEY_TICK_MS)
    return () => window.clearInterval(tick)
  }, [running])

  /* --------------------- appState mirror (reload resumes) ----------------- */

  // Trailing debounce on every board change: the dig rides the window record
  // (opaque appState, validated on read by the model's hostile gate).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      useWMStore
        .getState()
        .setWindowAppState(windowId, serializeSurvey(reanchorSurvey(board, Date.now())))
    }, SURVEY_MIRROR_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [windowId, board])

  // Slow heartbeat: a long dig with no moves still mirrors an honest clock.
  useEffect(() => {
    if (!running) return
    const beat = window.setInterval(() => {
      useWMStore
        .getState()
        .setWindowAppState(windowId, serializeSurvey(reanchorSurvey(boardRef.current, Date.now())))
    }, SURVEY_HEARTBEAT_MS)
    return () => window.clearInterval(beat)
  }, [windowId, running])

  /* --------------------------- grid keyboard ------------------------------ */

  /**
   * Arrows walk the plots (edges STOP — the explorer's law); Home/End jump
   * to the field's ends. Focus and the roving seat move together; Enter and
   * Space ride the plot button's native activation (reveal), F pins.
   */
  const handleGridKeys = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const { width, height } = board
    const total = width * height
    let next: number
    switch (event.key) {
      case 'ArrowLeft':
        next = focusIndex % width > 0 ? focusIndex - 1 : focusIndex
        break
      case 'ArrowRight':
        next = focusIndex % width < width - 1 ? focusIndex + 1 : focusIndex
        break
      case 'ArrowUp':
        next = focusIndex >= width ? focusIndex - width : focusIndex
        break
      case 'ArrowDown':
        next = focusIndex < total - width ? focusIndex + width : focusIndex
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = total - 1
        break
      default:
        return
    }
    event.preventDefault() // the page never scrolls under the survey
    if (next !== focusIndex) {
      setFocusIndex(next)
      cellRefs.current[next]?.focus()
    }
  }

  /* ------------------------------- render --------------------------------- */

  const elapsed = formatElapsed(liveElapsedMs(board, nowTick))
  const marks = board.marked.reduce((count, pinned) => count + (pinned ? 1 : 0), 0)

  const rows = Array.from({ length: board.height }, (_, y) => y)
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${board.width}, minmax(0, 1fr))`,
    width: `min(100%, ${PLOT_MAX_PX * board.width + 2 * (board.width - 1)}px)`,
  }

  return (
    <div className="survey" data-survey-surface data-ended={board.status !== 'digging' || undefined}>
      <div className="survey-toolbar">
        <div className="survey-presets" role="group" aria-label="Survey preset">
          {SURVEY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="survey-preset"
              data-survey-preset={preset.id}
              aria-pressed={preset.id === board.presetId}
              title={`${preset.width}×${preset.height} plots · ${preset.specimens} specimens`}
              onClick={() => startSurvey(preset.id)}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="survey-new"
          data-survey-new
          onClick={() => startSurvey(board.presetId)}
        >
          New Survey
        </button>
      </div>

      <div className="survey-rail">
        <span className="survey-readout-label">Specimens</span>
        <span className="survey-readout well" data-survey-readout="specimens">
          {String(board.specimenCount).padStart(2, '0')}
        </span>
        <span className="survey-readout-label">Marks</span>
        <span className="survey-readout well" data-survey-readout="marks">
          {String(marks).padStart(2, '0')}
        </span>
        <span className="survey-readout-label">Elapsed</span>
        <span className="survey-readout well" data-survey-readout="elapsed">
          {elapsed}
        </span>
        <span className="survey-status" data-survey-status data-status={board.status}>
          {STATUS_TEXT[board.status]}
        </span>
      </div>

      <div className="survey-well well" data-survey-well>
        <div
          className="survey-grid"
          data-survey-grid
          role="grid"
          aria-label={`Survey field, ${board.width} by ${board.height} plots`}
          style={gridStyle}
          onKeyDown={handleGridKeys}
        >
          {rows.map((y) => (
            <div className="survey-row" role="row" key={y}>
              {Array.from({ length: board.width }, (_, x) => {
                const index = y * board.width + x
                const state = plotState(board, proximity, index)
                const label =
                  state === 'pinned'
                    ? `${plotRef(board.width, index)} marked for review`
                    : state === 'numbered'
                      ? `${plotRef(board.width, index)}, ${proximity[index]} specimens adjacent`
                      : state === 'clear'
                        ? `${plotRef(board.width, index)} clear`
                        : state === 'sealed'
                          ? `${plotRef(board.width, index)} sealed`
                          : state === 'disturbed'
                            ? `${plotRef(board.width, index)} specimen disturbed here`
                            : `${plotRef(board.width, index)} specimen`
                return (
                  <button
                    key={x}
                    ref={(node) => {
                      cellRefs.current[index] = node
                    }}
                    type="button"
                    className="survey-plot"
                    data-survey-plot={index}
                    data-state={state}
                    data-prox={state === 'numbered' ? proximity[index] : undefined}
                    tabIndex={index === focusIndex ? 0 : -1}
                    aria-label={label}
                    onClick={() => {
                      setFocusIndex(index)
                      reveal(index)
                    }}
                    onFocus={() => setFocusIndex(index)} // the seat follows real focus
                    onContextMenu={(event) => {
                      event.preventDefault() // never the browser's menu
                      setFocusIndex(index)
                      togglePin(index)
                    }}
                    onKeyDown={(event) => {
                      // Enter/Space reveal (owned here — activation never
                      // depends on the host); F pins. Arrows bubble to the
                      // grid walker below.
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        reveal(index)
                      } else if (event.key === 'f' || event.key === 'F') {
                        event.preventDefault()
                        togglePin(index)
                      }
                    }}
                  >
                    {state === 'pinned' ? (
                      <PinMark />
                    ) : state === 'numbered' ? (
                      proximity[index]
                    ) : state === 'specimen' || state === 'disturbed' ? (
                      <SpecimenMark disturbed={state === 'disturbed'} />
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="scanlines" aria-hidden="true" />
      </div>

      {/* Assistive mirror of the dig's state (the well is a picture). */}
      <span className="survey-sr" role="status">
        {board.status === 'cleared'
          ? 'Survey cleared — every specimen found.'
          : board.status === 'disturbed'
            ? 'Specimen disturbed. Start a new survey.'
            : `${board.width} by ${board.height} field. ${marks} plots marked.`}
      </span>
    </div>
  )
}
