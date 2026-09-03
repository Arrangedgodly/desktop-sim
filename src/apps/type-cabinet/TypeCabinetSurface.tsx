/**
 * Type Cabinet surface (batch 2) — the OS's own specimen book, mounted lazy in
 * its own chunk. Singleton window (the manifest's `singleton: true`; every
 * re-open raises the one window — this component manages none of that). There
 * is no store, no FS, no persistence seam to ride: the cabinet is reference
 * material, authored once in the pure data module and rendered verbatim.
 *
 * Anatomy — the brief's duality, a type cabinet drawn open:
 *
 *   ┌ toolbar (console chrome) ─────────────────────────────────────────┐
 *   │ [ CHAKRA PETCH ][ LORA ][ B612 MONO ]  (engraved drawer tabs)     │
 *   │                                        [ 01 / 03 ]  (B612 well)  │
 *   └────────────────────────────────────────────────────────────────────┘
 *   ┌ the parchment sheet (the drawer pulled out, reading side) ────────┐
 *   │  Chakra Petch                    ← the face, set in itself        │
 *   │  THE LABEL FACE — THIS FACE SPEAKS FOR THE CONSOLE                │
 *   │  ┌ role card: the laws in plain words ───────────────────────┐    │
 *   │  WATERFALL  11 PX · spec line · the floor — nothing smaller   │    │
 *   │  WEIGHTS    400 / 600 at work · TRACKING  the three bands     │    │
 *   │  GLYPHS     the alphabet · PANGRAMS · DIGITS (mono's well)    │    │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * - TABS ARE DRAWERS (the atlas's tab discipline): a `role="tablist"` of
 *   engraved chrome plates, roving tabindex, ArrowLeft/ArrowRight WRAP the
 *   ring (a cabinet is a ring, like the atlas's plates), Home/End jump. Each
 *   tab front carries a small brass pull — the one hardware touchpoint.
 * - The sheet is the reading side: parchment, Lora annotations, every number
 *   on the sheet (sizes, weights, tracking values) riding B612 Mono per the
 *   Measuring Law. The specimen lines themselves ride the face on show —
 *   that is the entire product.
 * - HONEST WEIGHTS: every size, weight, and band renders from the data module
 *   only, and the colocated test pins that module against src/styles/fonts.css
 *   — the cabinet can never show a face or weight the hold did not load.
 * - The label face's digit row prints on PARCHMENT, deliberately outside any
 *   well — proportional digits are barred from readouts (the Measuring Law,
 *   demonstrated). The mono face's digit row sits in a real phosphor well.
 * - ONE authored moment: the drawer's sheet SETTLES onto the parchment when
 *   the drawer turns (opacity+translate, exponential ease-out from a visible
 *   default; the global reduced-motion floor collapses it to the settled
 *   state). Everything else holds still.
 */

import { useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  TYPE_CABINET_FACES,
  WORLD_TRACKING_BANDS,
  drawerReadout,
  nextDrawer,
  type FaceSpecimen,
} from './type-cabinet-data'
import './type-cabinet.css'

/** The mounted surface: the specimen book, exactly as the fleet mounts it. */
export default function TypeCabinetSurface() {
  return <TypeCabinet />
}

/**
 * The cabinet document — presentational, proven in tests against the real
 * data module (no seams to mock; everything it renders is authored data).
 */
export function TypeCabinet() {
  const uid = useId()
  const [index, setIndex] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const count = TYPE_CABINET_FACES.length
  const face = TYPE_CABINET_FACES[index] ?? TYPE_CABINET_FACES[0]

  const tabId = (id: string): string => `${uid}-tab-${id}`
  const panelId = `${uid}-panel`

  /** Open a drawer; keyboard opens also move focus to the new tab front. */
  const select = (at: number, focusTab: boolean): void => {
    setIndex(at)
    if (focusTab) tabRefs.current[at]?.focus()
  }

  /* --------------------------- the tabs' keyboard floor ------------------- */

  // Arrows WRAP the ring of drawers (the atlas's paging law); Home/End jump.
  // The handler rides the tablist, so a future editable control inside a tab
  // front could not be robbed — there is none today, the guard is discipline.
  const onTablistKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      select(nextDrawer(index, event.key === 'ArrowRight' ? 1 : -1, count), true)
    } else if (event.key === 'Home') {
      event.preventDefault()
      select(0, true)
    } else if (event.key === 'End') {
      event.preventDefault()
      select(count - 1, true)
    }
  }

  /* -------------------------------- render -------------------------------- */

  return (
    <div className="typecabinet" data-tc-surface>
      {/* -- toolbar (console chrome): the three drawer fronts ---------------- */}
      <div className="typecabinet-toolbar">
        <div
          className="typecabinet-tabs"
          role="tablist"
          aria-label="Specimen drawers"
          onKeyDown={onTablistKeyDown}
        >
          {TYPE_CABINET_FACES.map((entry, at) => {
            const selected = at === index
            return (
              <button
                key={entry.id}
                ref={(el) => {
                  tabRefs.current[at] = el
                }}
                type="button"
                className="typecabinet-tab"
                data-tc-tab={entry.id}
                role="tab"
                id={tabId(entry.id)}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(at, false)}
              >
                <span className="typecabinet-tab-name engraved">{entry.family}</span>
                <span className="typecabinet-tab-pull" aria-hidden="true" />
              </button>
            )
          })}
        </div>
        {/* The drawer position — a readout, so it rides B612 in a well. */}
        <span className="well typecabinet-readout" data-tc-readout aria-hidden="true">
          {drawerReadout(index, count)}
        </span>
      </div>

      {/* -- the sheet (the archive's reading side) — the panel is the scroll */}
      <div
        className="typecabinet-scroll parchment-surface"
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(face.id)}
        tabIndex={0}
        data-tc-panel
      >
        {/* The keyed leaf: the settle moment rides the drawer TURN (a remounted
            inner), while the panel stays mounted — scroll position and the
            reading seat survive turn after turn. */}
        <div key={face.id} className="typecabinet-sheet">
          <SpecimenSheet face={face} />
        </div>
      </div>

      {/* Ring state for assistive tech (the readout itself is decorative). */}
      <span className="typecabinet-sr" role="status">
        {`Drawer ${face.drawer} of ${count}: ${face.family}, ${face.roleTitle.toLowerCase()}`}
      </span>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * One drawer's specimen sheet — pure presentation of a FaceSpecimen.
 * Every specimen style (family, size, weight, tracking) comes from the data
 * module — nothing here invents a size or weight the hold did not ship.
 * ------------------------------------------------------------------------ */

/** The face's own voice, as an inline style source for specimen lines. */
const faceFont = (face: FaceSpecimen): React.CSSProperties => ({
  fontFamily: `var(${face.cssVar})`,
})

function SpecimenSheet({ face }: { readonly face: FaceSpecimen }) {
  return (
    <div className="typecabinet-sheet-inner">
      {/* -- the face, set in itself ------------------------------------------ */}
      <header className="typecabinet-head">
        <h2
          className="typecabinet-name"
          data-tc-name
          style={{ ...faceFont(face), fontWeight: face.displayWeight }}
        >
          {face.family}
        </h2>
        <p className="typecabinet-role engraved engraved--parchment" data-tc-role>
          {face.roleTitle} — {face.roleLine}
        </p>
      </header>

      {/* -- the role card: the laws in plain words ---------------------------- */}
      <div className="typecabinet-rolecard">
        <p className="typecabinet-roleband engraved engraved--parchment">{face.roleBand}</p>
        <p className="typecabinet-rolenote">{face.roleNote}</p>
        <ul className="typecabinet-laws">
          {face.lawCitations.map((law) => (
            <li key={law} className="typecabinet-law">
              {law}
            </li>
          ))}
        </ul>
      </div>

      {/* -- the waterfall ------------------------------------------------------ */}
      <section className="typecabinet-section">
        <h3 className="typecabinet-legend engraved engraved--parchment">Waterfall</h3>
        {face.waterfall.map((stop) => (
          <div key={stop.px} className="typecabinet-row" data-tc-size={stop.px}>
            <span className="typecabinet-size">{stop.px} PX</span>
            <span
              className="typecabinet-sample"
              style={{
                ...faceFont(face),
                fontSize: `${stop.px}px`,
                fontWeight: face.primaryWeight,
              }}
            >
              {face.waterfallSample}
            </span>
            {stop.note && <span className="typecabinet-note">{stop.note}</span>}
          </div>
        ))}
      </section>

      {/* -- the weights --------------------------------------------------------- */}
      <section className="typecabinet-section">
        <h3 className="typecabinet-legend engraved engraved--parchment">Weights</h3>
        {face.weights.map((step) => (
          <div key={step.weight} className="typecabinet-row" data-tc-weight={step.weight}>
            <span className="typecabinet-size">{step.weight}</span>
            <span
              className="typecabinet-sample typecabinet-sample--weight"
              style={{ ...faceFont(face), fontWeight: step.weight }}
            >
              {face.weightSample}
            </span>
            <span className="typecabinet-note">{step.note}</span>
          </div>
        ))}
      </section>

      {/* -- the tracking bands the world uses ------------------------------------ */}
      <section className="typecabinet-section">
        <h3 className="typecabinet-legend engraved engraved--parchment">
          Tracking — the bands the world uses
        </h3>
        {WORLD_TRACKING_BANDS.map((band) => {
          const rides = face.ridesTracking.includes(band.em)
          return (
            <div key={band.em} className="typecabinet-row" data-tc-track={band.em}>
              <span className="typecabinet-size">{band.em.toFixed(2)} EM</span>
              <span
                className="typecabinet-sample"
                style={{
                  ...faceFont(face),
                  fontSize: '16px',
                  fontWeight: face.primaryWeight,
                  letterSpacing: `${band.em}em`,
                }}
              >
                {face.trackingSample}
              </span>
              <span
                className={
                  rides ? 'typecabinet-rides engraved--parchment' : 'typecabinet-rides typecabinet-rides--off'
                }
              >
                {rides ? 'Rides' : 'Does not ride'}
              </span>
            </div>
          )
        })}
        <p className="typecabinet-note">{face.trackingNote}</p>
      </section>

      {/* -- the glyphs ------------------------------------------------------------ */}
      <section className="typecabinet-section">
        <h3 className="typecabinet-legend engraved engraved--parchment">Glyphs</h3>
        <p className="typecabinet-alphabet" style={faceFont(face)}>
          {face.alphabet}
        </p>
      </section>

      {/* -- the pangrams ------------------------------------------------------------ */}
      <section className="typecabinet-section">
        <h3 className="typecabinet-legend engraved engraved--parchment">Pangrams</h3>
        <ul className="typecabinet-pangrams">
          {face.pangrams.map((line) => (
            <li key={line} style={faceFont(face)}>
              {line}
            </li>
          ))}
        </ul>
      </section>

      {/* -- the digits (the measuring law, demonstrated) ----------------------------- */}
      {face.digits && (
        <section className="typecabinet-section">
          <h3 className="typecabinet-legend engraved engraved--parchment">Digits</h3>
          {/* Seating is the law made visible: the counting face's row rides a
              real phosphor well; the barred face's row prints on parchment,
              deliberately outside any well. */}
          <div
            className={face.digits.barred ? 'typecabinet-digits typecabinet-digits--barred' : 'typecabinet-digits well'}
            data-tc-digits
            style={faceFont(face)}
          >
            {face.digits.row}
          </div>
          <p className="typecabinet-note">{face.digits.note}</p>
        </section>
      )}
    </div>
  )
}
