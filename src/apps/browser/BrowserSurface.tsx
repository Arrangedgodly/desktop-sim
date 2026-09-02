/**
 * Browser surface (AP-6) — the archive's FIELD ATLAS, mounted lazy in its own
 * chunk. Singleton window (the manifest's `singleton: true`; every re-open
 * raises the one window — this component manages none of that). A URL-FREE
 * ZONE by committed decision: curated plates only, never an iframe; every
 * external departure is a real anchor that leaves the sim.
 *
 * Anatomy — the brief's duality, a plate book:
 *
 *   ┌ toolbar (dark console chrome) ──────────────────────────────────┐
 *   │ [ ‹ LEDGER ]  WHERE: THE OFFICER'S PROJECT LEDGER   [ 2 PLATES ] [‹][›] │
 *   └──────────────────────────────────────────────────────────────────┘
 *   ┌ the parchment sheet (the archive's reading side) ────────────────┐
 *   │  (AWAITING FIELD ACCESSION — placeholder mode only)              │
 *   │  ┌ card ─────────┐ ┌ card ─────────┐ ┌ card ─────────┐           │
 *   │  │ [plate preview]│ │               │ │               │  ← index │
 *   │  │ NAME (engraved)│ │               │ │               │          │
 *   │  │ one-line note  │ │               │ │               │          │
 *   │  │ [chip][chip]   │ │               │ │               │          │
 *   │  └────────────────┘ └───────────────┘ └───────────────┘          │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 *   ┌ the plate page (click a card — same window) ─────────────────────┐
 *   │  PLATE II                                    [ SPC-0004 ]        │
 *   │  Atlas of Nowhere                             (accession well)   │
 *   │  ┌ the plate (screenshot / PLATE NOT DEVELOPED) ┐  one-line note  │
 *   │  │                                              │  FIELD NOTES    │
 *   │  │                                              │  (story, Lora)  │
 *   │  └──────────────────────────────────────────────┘  [chip][chip]   │
 *   │  SPC-0004 · ATLAS OF NOWHERE                      [OPEN LIVE SITE]│
 *   │                                                    [REPOSITORY]   │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * - PLACEHOLDER LAW: while isPlaceholderContent() the ledger renders
 *   in-world stand-ins ("Unindexed Specimen 01", awaiting-field-notes copy)
 *   and NEVER a raw `[REPLACE VIA CONTENT PACK]` marker (atlasView enforces
 *   this by construction).
 * - The accession well on each plate page cites the LIVE archive record: the
 *   seeded exhibit specimen whose node id IS the pack slot id (the MF-3
 *   join). No record → the honest UNFILED, never a stale code.
 * - External actions are real anchors (target _blank + rel noopener
 *   noreferrer); a URL the pack does not carry renders the button DISABLED
 *   with an engraved reason — absent is stated, never hidden.
 * - Navigation: LEDGER returns to the index; prev/next WRAP the ledger (a
 *   plate book is a ring); keyboard floor — arrows page while a plate is
 *   open, Backspace returns to the index (DD-1 owns the deep pass).
 * - One authored moment: the plate page SETTLES on the mat when it turns
 *   (opacity+translate, exponential ease-out; the global reduced-motion
 *   floor collapses it to the settled state).
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useFSStore, useWMStore } from '../../platform/stores'
import type { AppSurfaceProps } from '../../platform/app-registry'
import { getContent, isPlaceholderContent } from '../../lib/content'
import {
  EMPTY_BODY,
  EMPTY_TITLE,
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  NO_LIVE_REASON,
  NO_REPO_REASON,
  UNDEVELOPED_HINT,
  UNDEVELOPED_TITLE,
  AWAITING_BODY,
  AWAITING_TITLE,
  UNFILED_ACCESSION,
  atlasView,
  exhibitAccession,
  linkHost,
  plateReadout,
  platesLabel,
  romanNumeral,
  screenshotSrc,
  wrapIndex,
  type AtlasPlate,
  type AtlasView,
  type CatalogSheet,
} from './browser-model'
import { BrowserIcon } from './BrowserIcon'
import './browser.css'

/**
 * Build-time embed of exhibit screenshots, if any. Zero matches (directory
 * absent — today's state) → {} and every plate renders its PLATE NOT
 * DEVELOPED frame; the moment the fill task drops images under
 * content/screenshots/ they light up through the same pure resolver
 * (loader.ts's glob discipline, mirrored app-side — zero platform edits).
 */
const embeddedShots = import.meta.glob('/content/screenshots/*.{png,jpg,jpeg,webp,gif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** The embedded shots keyed by normalized path (the resolver's dictionary). */
const SHOTS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(embeddedShots).map(([key, url]) => [
    key.replace(/^\//, '').replace(/^\.\//, ''),
    url,
  ]),
)

/** The pack resolves once per build (immutable display data; MF-3's seam). */
const VIEW: AtlasView = atlasView(getContent(), isPlaceholderContent())

/**
 * The mounted surface: the platform's window reading the ambient seams
 * (content pack + the live archive) and handing them to the atlas document.
 */
export default function BrowserSurface({ windowId }: AppSurfaceProps) {
  // The accession record rides the LIVE archive: each plate's specimen is the
  // seeded exhibit whose node id IS the pack slot id (seed.ts's join).
  const fs = useFSStore((s) => s.fs)
  const focused = useWMStore((s) => s.focusedId === windowId)
  const seatRef = useRef<HTMLDivElement | null>(null)

  // The atlas holds the focus seat whenever the window is raised while focus
  // sits outside it — so arrows/Backspace are live whenever the operator is
  // reading the atlas (the viewer's stage discipline).
  useEffect(() => {
    if (!focused) return
    const el = seatRef.current
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [focused])

  return (
    <div ref={seatRef} className="browser" data-browser-surface tabIndex={-1}>
      <FieldAtlas view={VIEW} sheet={fs} shots={SHOTS} />
    </div>
  )
}

/** Where the atlas is: the ledger, or one plate deep in it. */
type AtlasMode = 'index' | 'plate'

/**
 * The atlas document itself — presentational, proven against fixture packs
 * in tests (the exact code path a filled content/author.json drives).
 */
export function FieldAtlas({
  view,
  sheet,
  shots,
}: {
  readonly view: AtlasView
  readonly sheet: CatalogSheet
  readonly shots: Readonly<Record<string, string>>
}) {
  const [mode, setMode] = useState<AtlasMode>('index')
  const [index, setIndex] = useState(0)

  const plates = view.plates
  const count = plates.length
  const plate: AtlasPlate | undefined = plates[index]
  const paging = count > 1 // a one-plate ring pages to itself — honestly disabled

  /* ----------------------------- navigation ------------------------------ */

  const openPlate = (at: number): void => {
    setIndex(at)
    setMode('plate')
  }
  const backToLedger = (): void => {
    setMode('index')
  }
  const page = (delta: number): void => {
    setIndex((current) => wrapIndex(current, delta, count))
  }

  /* --------------------------- keyboard floor ----------------------------- */

  // Arrows page while a PLATE is open; Backspace returns to the ledger. The
  // guard is defensive only — the atlas holds no editable fields, but a
  // future in-world control must not have its keys stolen (DD-1 owns the
  // deep pass).
  const onKeyDown = (event: ReactKeyboardEvent): void => {
    const target = event.target
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
    ) {
      return
    }
    if (event.key === 'Backspace' && mode === 'plate') {
      event.preventDefault()
      backToLedger()
      return
    }
    if (mode !== 'plate') return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      page(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      page(-1)
    }
  }

  /* ------------------------------ focus law -------------------------------- */

  // Focus follows the TURN, not the re-render: entering a plate lands focus
  // on the page (the reading seat — arrows are live from anywhere inside),
  // returning to the ledger lands it back on the card that was open. A page
  // TURN keeps focus where the operator put it (the prev/next plates stay
  // live under a clicking or arrowing hand), and mount steals nothing
  // (AP-4's lesson: an unearned focus scroll hides the first plate row).
  const pageRef = useRef<HTMLElement | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const prevModeRef = useRef<AtlasMode>('index')
  useEffect(() => {
    const enteredPlate = mode === 'plate' && prevModeRef.current !== 'plate'
    const leftPlate = mode === 'index' && prevModeRef.current === 'plate'
    if (enteredPlate) {
      pageRef.current?.focus()
    } else if (leftPlate) {
      cardRefs.current[index]?.focus()
    }
    prevModeRef.current = mode
  }, [mode, index])

  /* -------------------------------- render --------------------------------- */

  const where =
    mode === 'plate' && plate ? plate.name : 'The officer\u2019s project ledger'

  return (
    <div className="browser-atlas" onKeyDown={onKeyDown}>
      {/* -- toolbar (console chrome) ------------------------------------- */}
      <div className="browser-toolbar">
        <button
          type="button"
          className="browser-tool browser-back"
          data-browser-back
          disabled={mode === 'index' || count === 0}
          aria-disabled={mode === 'index' || count === 0}
          title="Back to the ledger (Backspace)"
          onClick={backToLedger}
        >
          <BackGlyph />
          <span className="browser-back-label">Ledger</span>
        </button>
        {/* Where the atlas is — the breadcrumb's live end. */}
        <span className="browser-where engraved" data-browser-where title={where}>
          {where}
        </span>
        {/* The ring readout: ledger count, or the plate's roman position. */}
        <span className="browser-readout well" data-browser-readout aria-hidden="true">
          {mode === 'plate' && count > 0 ? plateReadout(index, count) : platesLabel(count)}
        </span>
        <div className="browser-controls" role="group" aria-label="Plate paging">
          <button
            type="button"
            className="browser-tool"
            data-browser-prev
            aria-label="Previous plate"
            title="Previous plate — wraps (←)"
            disabled={!paging}
            onClick={() => page(-1)}
          >
            <PrevGlyph />
          </button>
          <button
            type="button"
            className="browser-tool"
            data-browser-next
            aria-label="Next plate"
            title="Next plate — wraps (→)"
            disabled={!paging}
            onClick={() => page(1)}
          >
            <NextGlyph />
          </button>
        </div>
      </div>

      {/* -- the parchment sheet (the archive's reading side) --------------- */}
      <div className="browser-scroll parchment-surface">
        {view.placeholder && count > 0 && (
          <div className="browser-awaiting" data-browser-awaiting role="note">
            <p className="browser-awaiting-title">{AWAITING_TITLE}</p>
            <p className="browser-awaiting-body">{AWAITING_BODY}</p>
          </div>
        )}

        {count === 0 ? (
          <div className="browser-empty" data-browser-empty role="status">
            <span className="browser-empty-glyph" aria-hidden="true">
              <BrowserIcon size={30} />
            </span>
            <p className="browser-empty-title">{EMPTY_TITLE}</p>
            <p className="browser-empty-body">{EMPTY_BODY}</p>
          </div>
        ) : mode === 'index' ? (
          <ul className="browser-index" data-browser-index aria-label="Atlas ledger of exhibits">
            {plates.map((entry, at) => (
              <li key={entry.id}>
                <button
                  type="button"
                  ref={(el) => {
                    cardRefs.current[at] = el
                  }}
                  className="browser-card"
                  data-browser-card
                  data-plate-id={entry.id}
                  aria-label={`Plate ${romanNumeral(at + 1)} — ${entry.name}. Open plate.`}
                  onClick={() => openPlate(at)}
                >
                  <span className="browser-card-plate">
                    {screenshotSrc(entry.screenshotPath, shots) ? (
                      <img
                        className="browser-card-image"
                        src={screenshotSrc(entry.screenshotPath, shots)}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <UndevelopedPlate compact />
                    )}
                    <span className="browser-card-number">
                      PLATE {romanNumeral(at + 1)}
                    </span>
                  </span>
                  <span className="browser-card-name engraved--parchment">{entry.name}</span>
                  <span className="browser-card-desc">{entry.description}</span>
                  {entry.tech.length > 0 && (
                    <span className="browser-card-tech">
                      {entry.tech.map((tag) => (
                        <span key={tag} className="browser-chip engraved--parchment">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          plate && (
            <PlatePage
              plate={plate}
              index={index}
              count={count}
              sheet={sheet}
              shots={shots}
              pageRef={pageRef}
            />
          )
        )}
      </div>

      {/* Ring state for assistive tech (the readout itself is decorative). */}
      <span className="browser-sr" role="status">
        {mode === 'plate' && plate
          ? `Plate ${romanNumeral(index + 1)} of ${romanNumeral(count)}: ${plate.name}`
          : `Atlas ledger, ${platesLabel(count)}`}
      </span>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * The plate page — one exhibit, presented large.
 * ------------------------------------------------------------------------ */

function PlatePage({
  plate,
  index,
  count,
  sheet,
  shots,
  pageRef,
}: {
  readonly plate: AtlasPlate
  readonly index: number
  readonly count: number
  readonly sheet: CatalogSheet
  readonly shots: Readonly<Record<string, string>>
  readonly pageRef: React.RefObject<HTMLElement | null>
}) {
  const accession = exhibitAccession(sheet, plate.id) ?? UNFILED_ACCESSION
  const src = screenshotSrc(plate.screenshotPath, shots)

  return (
    <article
      ref={pageRef}
      className="browser-page"
      data-browser-page
      data-plate-id={plate.id}
      tabIndex={-1}
      aria-label={`Plate ${romanNumeral(index + 1)} of ${romanNumeral(count)} — ${plate.name}`}
    >
      {/* The keyed leaf: the settle animation rides the turn (a remounted
          inner), while the ARTICLE stays mounted — focus on the reading seat
          survives paging, so arrows stay live turn after turn. */}
      <div key={plate.id} className="browser-page-turn">
      <div className="browser-page-head">
        <p className="browser-page-number engraved--parchment">
          Plate {romanNumeral(index + 1)}
        </p>
        <h2 className="browser-page-name" data-browser-plate-name>
          {plate.name}
        </h2>
        <span className="browser-accession well" data-browser-accession>
          {accession}
        </span>
      </div>

      <div className="browser-page-body">
        <figure className="browser-figure">
          {src ? (
            <img
              className="browser-figure-image"
              data-browser-screenshot
              src={src}
              alt={`${plate.name} — exhibit plate`}
              draggable={false}
            />
          ) : (
            <UndevelopedPlate />
          )}
          <figcaption className="browser-figure-caption">
            <span className="browser-figure-accession">{accession}</span>
            <span className="browser-figure-sep" aria-hidden="true">
              ·
            </span>
            <span className="browser-figure-name">{plate.name}</span>
          </figcaption>
        </figure>

        <div className="browser-notes">
          <p className="browser-desc" data-browser-desc>
            {plate.description}
          </p>

          {plate.story.length > 0 && (
            <section className="browser-story" aria-labelledby="browser-story-legend">
              <h3 className="browser-legend engraved--parchment" id="browser-story-legend">
                Field Notes
              </h3>
              <p className="browser-story-body" data-browser-story>
                {plate.story}
              </p>
            </section>
          )}

          {plate.tech.length > 0 && (
            <section className="browser-apparatus" aria-labelledby="browser-apparatus-legend">
              <h3 className="browser-legend engraved--parchment" id="browser-apparatus-legend">
                Apparatus
              </h3>
              <p className="browser-chips">
                {plate.tech.map((tag) => (
                  <span key={tag} className="browser-chip engraved--parchment" data-browser-chip>
                    {tag}
                  </span>
                ))}
              </p>
            </section>
          )}

          <section className="browser-actions" aria-label="External channels">
            <span className="browser-action-slot">
              {plate.liveUrl.length > 0 ? (
                <a
                  className="browser-action browser-action--primary"
                  data-browser-live
                  href={plate.liveUrl}
                  target={EXTERNAL_LINK_TARGET}
                  rel={EXTERNAL_LINK_REL}
                >
                  Open live site
                </a>
              ) : (
                <button
                  type="button"
                  className="browser-action browser-action--primary"
                  data-browser-live
                  disabled
                  aria-disabled="true"
                  title={NO_LIVE_REASON}
                >
                  Open live site
                </button>
              )}
              <span className="browser-action-note" data-browser-live-note>
                {plate.liveUrl.length > 0 ? linkHost(plate.liveUrl) : NO_LIVE_REASON}
              </span>
            </span>

            <span className="browser-action-slot">
              {plate.repoUrl.length > 0 ? (
                <a
                  className="browser-action browser-action--secondary"
                  data-browser-repo
                  href={plate.repoUrl}
                  target={EXTERNAL_LINK_TARGET}
                  rel={EXTERNAL_LINK_REL}
                >
                  Repository
                </a>
              ) : (
                <button
                  type="button"
                  className="browser-action browser-action--secondary"
                  data-browser-repo
                  disabled
                  aria-disabled="true"
                  title={NO_REPO_REASON}
                >
                  Repository
                </button>
              )}
              <span className="browser-action-note" data-browser-repo-note>
                {plate.repoUrl.length > 0 ? linkHost(plate.repoUrl) : NO_REPO_REASON}
              </span>
            </span>
          </section>
        </div>
      </div>
      </div>
    </article>
  )
}

/* --------------------------------------------------------------------------
 * The undeveloped plate — the atlas's authored placeholder frame.
 * ------------------------------------------------------------------------ */

function UndevelopedPlate({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className="browser-undeveloped" data-browser-undeveloped>
      <span className="browser-undeveloped-glyph" aria-hidden="true">
        <BrowserIcon size={compact ? 18 : 26} />
      </span>
      <p className="browser-undeveloped-title">{UNDEVELOPED_TITLE}</p>
      {!compact && <p className="browser-undeveloped-hint">{UNDEVELOPED_HINT}</p>}
    </div>
  )
}

/* --------------------------------------------------------------------------
 * Toolbar chrome glyphs — same drawing discipline as the fleet (1.5px
 * stroke, currentColor, 24 grid). Drawn, never unicode stand-ins.
 * ------------------------------------------------------------------------ */

const TOOL_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function ToolSvg({ children }: { readonly children: React.ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  )
}

function BackGlyph() {
  return (
    <ToolSvg>
      <g {...TOOL_STROKE}>
        <line x1="10" y1="5.5" x2="4.5" y2="11" />
        <line x1="4.5" y1="11" x2="10" y2="16.5" />
        <line x1="4.8" y1="11" x2="19.5" y2="11" />
      </g>
    </ToolSvg>
  )
}

function PrevGlyph() {
  return (
    <ToolSvg>
      <g {...TOOL_STROKE}>
        <line x1="14.5" y1="6" x2="8.5" y2="12" />
        <line x1="8.5" y1="12" x2="14.5" y2="18" />
      </g>
    </ToolSvg>
  )
}

function NextGlyph() {
  return (
    <ToolSvg>
      <g {...TOOL_STROKE}>
        <line x1="9.5" y1="6" x2="15.5" y2="12" />
        <line x1="15.5" y1="12" x2="9.5" y2="18" />
      </g>
    </ToolSvg>
  )
}
