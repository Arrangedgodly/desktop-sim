/**
 * Chart Plate surface (batch 2, brief 9) — the archive's ENGRAVER FOR NUMBERS,
 * mounted lazy in its own chunk. The design brief's duality, engraving side:
 * console-chrome toolbars outside (identity + studio), the PARCHMENT BENCH
 * inside — the data ledger on the left, the plate being cut on the right.
 *
 *   ┌ identity row (console chrome) ──────────────────────────────────────┐
 *   │ CHART PLATE (or the save NAME FIELD)   ROWS 03/24  [PLT-0000] SAVE  │
 *   ├ studio row (console chrome) ───────────────────────────────────────┤
 *   │ CUT: BAR · LINE      GROUND: PARCHMENT · PLATE                      │
 *   └ content (the parchment bench) ──────────────────────────────────────┘
 *   │ DATA LEDGER (rows: label · value · remove · add) │ THE PLATE (SVG)  │
 *
 * - The plate is ONE fixed 640×400 SVG (STORAGE HONESTY — the accessioned
 *   data URI rides the IndexedDB envelope), rendered INLINE from the model's
 *   element tree so it uses the document's real faces (B612 numerals); the
 *   SAME tree serializes standalone at save. They cannot drift.
 * - Grounds are the world's two: parchment (printed survey sheet) and plate
 *   (dark engraved plate, FLAT amber ink — printed, never lit; no glow ever
 *   rides the SVG).
 * - Save = the painter's first-save pattern: the name is offered INLINE,
 *   Enter cuts and files a REAL image specimen via createNode (SVG → data
 *   URI, CSP-clean under img-src data:); an FSError refusal shakes in-world;
 *   each save is a NEW accession (the engraver is a machine, not a document).
 * - The editor session (rows · kind · ground · last name) mirrors onto the
 *   window record's opaque appState, debounced, validated on read — a reload
 *   restores the bench. Close is unguarded BY DESIGN: cut plates are the
 *   durable artifacts; the bench is a workspace (recorded in the log).
 * - Keyboard: Ctrl/Cmd+S cuts; Enter walks the ledger's rhythm (label →
 *   value → next row); typing keys are always the field's.
 */

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { playCue } from '../../lib/audio'
import { useFSStore, useWMStore } from '../../platform/stores'
import type { AppSurfaceProps } from '../../platform/app-registry'
import {
  CHART_GROUNDS,
  CHART_KINDS,
  CHART_MIRROR_DELAY_MS,
  DEFAULT_CHART_GROUND,
  DEFAULT_CHART_KIND,
  GROUND_TOKENS,
  MAX_ROWS,
  PLATE_SVG_HEIGHT,
  PLATE_SVG_WIDTH,
  UNFILED_ACCESSION,
  UNTITLED_PLATE_LABEL,
  buildPlateLayout,
  clampLabel,
  parseChartValue,
  plateElements,
  readChartSession,
  saveChartPlate,
  xmlEscape,
  type ChartGround,
  type ChartKind,
  type DataRow,
  type PlateElement,
  type PlatePalette,
} from './chart-model'
import './chart-plate.css'

/** How long a rejected name shakes (the fleet's law: 320ms animation). */
const NAME_REJECT_ATTR_MS = 400

/**
 * Resolved-token fallbacks (the model's palette must carry literal strings
 * into the standalone SVG): each is its token's own committed value, used
 * only when getComputedStyle resolves nothing (the painter's customFallback
 * precedent — the app CSS itself carries zero raw hex).
 */
const TOKEN_FALLBACKS: Readonly<Record<string, string>> = {
  '--parchment': '#ece2c9',
  '--parchment-ink': '#33291c',
  '--parchment-ink-dim': '#65573f',
  '--chrome-sunken': '#171209',
  '--chrome-edge-hi': '#514433',
  '--phosphor': '#ffb340',
  '--phosphor-dim': '#b97e24',
}

/** Resolve one design token to its concrete value (ALL ink from tokens). */
function tokenValue(name: string): string {
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return resolved !== '' ? resolved : (TOKEN_FALLBACKS[name] ?? '')
}

/** One ledger line as the operator types it — the parse happens per render. */
interface EditorRow {
  readonly label: string
  readonly valueText: string
}

const editorRow = (row: DataRow): EditorRow => ({ label: row.label, valueText: String(row.value) })

const BLANK_ROW: EditorRow = { label: '', valueText: '' }

/** The derived model rows the plate charts (unparseable entries chart as 0). */
function deriveRows(rows: readonly EditorRow[]): readonly DataRow[] {
  return rows.map((row) => ({
    label: row.label,
    value: parseChartValue(row.valueText) ?? 0,
  }))
}

export default function ChartPlateSurface({ windowId }: AppSurfaceProps) {
  /* ------------------------------ the bench -------------------------------- */

  const restoredRef = useRef<{ done: boolean; session: ReturnType<typeof readChartSession> }>({
    done: false,
    session: null,
  })
  if (!restoredRef.current.done) {
    // Read the window's opaque appState ONCE (it crossed the persistence
    // boundary — readChartSession validates it defensively).
    restoredRef.current = {
      done: true,
      session: readChartSession(useWMStore.getState().windows[windowId]?.appState),
    }
  }
  const session = restoredRef.current.session

  const [rows, setRows] = useState<readonly EditorRow[]>(
    () => session?.rows.map(editorRow) ?? [],
  )
  const [kind, setKind] = useState<ChartKind>(() => session?.kind ?? DEFAULT_CHART_KIND)
  const [ground, setGround] = useState<ChartGround>(() => session?.ground ?? DEFAULT_CHART_GROUND)
  const [lastName, setLastName] = useState(() => session?.lastName ?? '')
  const [lastAccession, setLastAccession] = useState<string>(UNFILED_ACCESSION)
  const [accessionFlare, setAccessionFlare] = useState(false)

  /* --------------------------- save-flow chrome ----------------------------- */

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameRejected, setNameRejected] = useState(false)

  /* ------------------------------ refs -------------------------------------- */

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const addRowRef = useRef<HTMLButtonElement | null>(null)
  const labelRefs = useRef<Map<number, HTMLInputElement>>(new Map())

  /* ------------------------- resolved plate inks ----------------------------- */

  const palettesRef = useRef<Record<ChartGround, PlatePalette>>({
    parchment: resolvePalette('parchment'),
    plate: resolvePalette('plate'),
  })

  /* ------------------------------ derived ------------------------------------ */

  const dataRows = deriveRows(rows)
  const hasData = dataRows.some((row) => row.label.trim().length > 0 || row.value !== 0)
  const layout = buildPlateLayout(hasData ? dataRows : [], kind)
  const tree = plateElements(layout, palettesRef.current[ground], kind)
  const atCap = rows.length >= MAX_ROWS

  /* ------------------------------ mount -------------------------------------- */

  // Seat the operator at the bench: the first label field, else Add row.
  // (once per mount — the bench restores from appState, not re-reads)
  useEffect(() => {
    const first = labelRefs.current.get(0)
    if (first) first.focus()
    else addRowRef.current?.focus()
  }, [])

  /* --------------------------- ledger rhythm --------------------------------- */

  const setLabel = (index: number, label: string): void => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, label: clampLabel(label) } : row)),
    )
  }

  const setValueText = (index: number, valueText: string): void => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, valueText } : row)))
  }

  // Strike and grow work on the EDITOR rows directly — a round-trip through
  // the parsed model would normalize a half-typed value ("3." → "3"); the
  // model's own bounded ops (addRow/removeRow, unit-tested) are the same law
  // in DataRow space, and the CAP is re-enforced here identically.
  const dropRow = (index: number): void => {
    setRows((current) =>
      index < 0 || index >= current.length ? current : current.filter((_, i) => i !== index),
    )
  }

  const growLedger = (): void => {
    setRows((current) => (current.length >= MAX_ROWS ? current : [...current, BLANK_ROW]))
  }

  /** Enter on a label seats the value; Enter on a value seats the next label. */
  const handleRowKeys = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    index: number,
    field: 'label' | 'value',
  ): void => {
    if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    if (field === 'label') {
      const value = event.currentTarget.parentElement?.querySelector<HTMLInputElement>(
        '[data-chart-value-input]',
      )
      value?.focus()
      value?.select()
      return
    }
    const next = labelRefs.current.get(index + 1)
    if (next) {
      next.focus()
      next.select()
    } else {
      growLedger()
      window.setTimeout(() => {
        const fresh = labelRefs.current.get(rows.length)
        fresh?.focus()
      }, 0)
    }
  }

  /* ------------------------------ save --------------------------------------- */

  const save = (): void => {
    if (editingName || !hasData) return
    setNameDraft(lastName.trim() !== '' ? lastName : UNTITLED_PLATE_LABEL)
    setNameRejected(false)
    setEditingName(true)
  }

  useEffect(() => {
    if (editingName) {
      const input = nameInputRef.current
      if (input) {
        input.focus()
        input.select()
        input.scrollLeft = 0
      }
    }
  }, [editingName])

  const rejectNameEdit = (): void => {
    setNameRejected(true)
    window.setTimeout(() => setNameRejected(false), NAME_REJECT_ATTR_MS)
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }

  const commitName = (): boolean => {
    const name = nameDraft.trim()
    if (name.length === 0) return false
    const result = saveChartPlate(
      {
        fs: useFSStore.getState().fs,
        rows: dataRows,
        kind,
        ground,
        palette: palettesRef.current[ground],
        name,
      },
      {
        commit: (next) => useFSStore.getState().commit(next),
        cue: () => playCue('drop-on-folder'), // the filing cue, exactly once
      },
    )
    if (result.status === 'refused') return false // in-world refusal: shake
    setLastName(name)
    setLastAccession(result.accession)
    setAccessionFlare(true) // the stamp press — the module's ONE authored moment
    window.setTimeout(() => setAccessionFlare(false), 700)
    return true
  }

  /* --------------------------- session mirror --------------------------------- */

  // The bench rides the window record (opaque appState, debounced) so a
  // reload restores the same rows. The FS commit is NOT this app's
  // persistence — cut plates are.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      useWMStore.getState().setWindowAppState(windowId, {
        rows: deriveRows(rows),
        kind,
        ground,
        lastName,
      })
    }, CHART_MIRROR_DELAY_MS)
    return () => window.clearTimeout(timer)
    // rows/kind/ground/lastName re-arm the debounce after each edit
  }, [windowId, rows, kind, ground, lastName])

  /* ------------------------------ keyboard ------------------------------------- */

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
      event.preventDefault() // never the browser's save dialog
      save()
    }
  }

  /* ------------------------------ render --------------------------------------- */

  return (
    <div className="chart-plate" data-chart-surface onKeyDown={handleKeyDown}>
      <div className="chart-plate-toolbar">
        {editingName ? (
          <input
            ref={nameInputRef}
            className="chart-plate-name-field"
            data-chart-name-input
            data-rename-rejected={nameRejected || undefined}
            value={nameDraft}
            aria-label="Name this plate"
            spellCheck={false}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation() // the field's keys are the field's
              if (event.key === 'Enter') {
                event.preventDefault()
                if (!commitName()) rejectNameEdit()
                else setEditingName(false)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setEditingName(false)
              }
            }}
            onBlur={() => {
              if (nameDraft.trim().length === 0) return // leave open, nothing filed
              if (!commitName()) rejectNameEdit()
              else setEditingName(false)
            }}
          />
        ) : (
          <span className="chart-plate-title engraved">Chart Plate</span>
        )}
        {/* The ledger census — digits ride B612 in a recessed well. */}
        <span className="chart-plate-readout well" data-chart-rows-readout>
          ROWS {String(rows.length).padStart(2, '0')}/{MAX_ROWS}
        </span>
        <span className="chart-plate-spacer" />
        {/* The last-cut accession — flares once when a plate is filed. */}
        <span
          className="chart-plate-readout chart-plate-accession well"
          data-chart-accession
          data-flare={accessionFlare || undefined}
        >
          {lastAccession}
        </span>
        <button
          type="button"
          className="chart-plate-save"
          data-chart-save
          disabled={!hasData}
          title="Cut and file this plate into the catalog"
          onClick={save}
        >
          Save
        </button>
      </div>

      <div className="chart-plate-toolbar chart-plate-toolbar--studio">
        <div className="chart-plate-group" role="group" aria-label="Cut">
          <span className="chart-plate-group-legend">Cut</span>
          {CHART_KINDS.map((entry) => (
            <button
              key={entry}
              type="button"
              className="chart-plate-toggle"
              data-chart-kind-toggle={entry}
              data-active={kind === entry || undefined}
              aria-pressed={kind === entry}
              title={entry === 'bar' ? 'Hatched bars anchored at zero' : 'Ruled line through each measurement'}
              onClick={() => setKind(entry)}
            >
              {entry}
            </button>
          ))}
        </div>
        <div className="chart-plate-group" role="group" aria-label="Ground">
          <span className="chart-plate-group-legend">Ground</span>
          {CHART_GROUNDS.map((entry) => (
            <button
              key={entry}
              type="button"
              className="chart-plate-toggle"
              data-chart-ground-toggle={entry}
              data-active={ground === entry || undefined}
              aria-pressed={ground === entry}
              title={entry === 'parchment' ? 'The printed survey sheet' : 'The dark engraved plate'}
              onClick={() => setGround(entry)}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-plate-content parchment-surface">
        <section className="chart-plate-ledger" aria-label="Data ledger">
          <p className="chart-plate-ledger-head engraved engraved--parchment">Data ledger</p>
          <div className="chart-plate-rows">
            {rows.map((row, index) => {
              const provisional = parseChartValue(row.valueText) === null
              return (
                <div className="chart-plate-row" data-chart-row key={index}>
                  <input
                    className="chart-plate-field chart-plate-field--label"
                    data-chart-label-input
                    ref={(node) => {
                      if (node) labelRefs.current.set(index, node)
                      else labelRefs.current.delete(index)
                    }}
                    value={row.label}
                    aria-label={`Row ${index + 1} label`}
                    placeholder="—"
                    spellCheck={false}
                    onChange={(event) => setLabel(index, event.target.value)}
                    onKeyDown={(event) => handleRowKeys(event, index, 'label')}
                  />
                  <input
                    className="chart-plate-field chart-plate-field--value"
                    data-chart-value-input
                    data-provisional={provisional || undefined}
                    value={row.valueText}
                    aria-label={`Row ${index + 1} value`}
                    inputMode="decimal"
                    placeholder="0"
                    spellCheck={false}
                    onChange={(event) => setValueText(index, event.target.value)}
                    onKeyDown={(event) => handleRowKeys(event, index, 'value')}
                  />
                  <button
                    type="button"
                    className="chart-plate-remove"
                    data-chart-remove
                    aria-label={`Remove row ${index + 1}`}
                    title="Strike this line"
                    onClick={() => dropRow(index)}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
          <button
            ref={addRowRef}
            type="button"
            className="chart-plate-add"
            data-chart-add
            disabled={atCap}
            title={atCap ? `The ledger holds ${MAX_ROWS} lines` : 'Add a ledger line'}
            onClick={growLedger}
          >
            Add line
          </button>
          <p className="chart-plate-ledger-note">
            {atCap
              ? `Ledger full — ${MAX_ROWS} lines.`
              : 'Unmeasured entries chart as zero; the plate files what the ledger says.'}
          </p>
        </section>

        <section className="chart-plate-bench" aria-label="The plate">
          <div className="chart-plate-platewrap">
            <div
              className="chart-plate-plate"
              data-chart-plate
              data-ground={ground}
              data-empty={layout.empty || undefined}
              role="img"
              aria-label={
                layout.empty
                  ? 'Empty plate — no data rules it yet'
                  : `Chart plate, ${kind} cut on ${ground} ground, ${rows.length} measurements`
              }
            >
              <PlateNode node={tree} />
              {layout.empty && <p className="chart-plate-empty">No data rules this plate</p>}
            </div>
            <p className="chart-plate-plate-note">
              PLATE {PLATE_SVG_WIDTH} × {PLATE_SVG_HEIGHT} — the archive files what leaves this bench
            </p>
          </div>
        </section>
      </div>
      {/* Accession state for assistive tech (the flare itself is decorative). */}
      <span className="chart-plate-sr" role="status">
        {lastAccession === UNFILED_ACCESSION
          ? 'No plate cut this session'
          : `Plate filed under accession ${xmlEscape(lastAccession)}`}
      </span>
    </div>
  )
}

/** Resolve one ground's palette from the live tokens (fallbacks documented). */
function resolvePalette(ground: ChartGround): PlatePalette {
  const tokens = GROUND_TOKENS[ground]
  return {
    ground: tokenValue(tokens.ground),
    ink: tokenValue(tokens.ink),
    dim: tokenValue(tokens.dim),
    rule: tokenValue(tokens.rule),
    accent: tokenValue(tokens.accent),
  }
}

/**
 * The inline plate: the model's element tree mapped to React elements — the
 * SAME tree the serializer writes, so the preview and the accessioned
 * artifact cannot drift. Attributes are the React-camelCase forms of the
 * closed vocabulary plateElements emits.
 */
function PlateNode({ node }: { readonly node: PlateElement }): ReactNode {
  const children = node.children?.map((child, index) => (
    <PlateNode key={index} node={child} />
  ))
  // React escapes text content itself — the raw string rides the DOM; only
  // the standalone serializer applies xmlEscape by hand. The attrs are the
  // React-camelCase forms of the model's closed vocabulary.
  const props = { ...node.attrs } as SVGProps<SVGElement>
  return createElement(node.tag, props, node.text !== undefined ? node.text : children)
}
