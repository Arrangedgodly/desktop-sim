/**
 * Chart model (batch 2, brief 9 — CHART PLATE) — the pure, React-free,
 * DOM-free math behind the archive's engraver for numbers: the editor's row
 * set with its caps (STORAGE HONESTY — the accessioned SVG rides the IndexedDB
 * envelope, so the dataset is bounded), strict value parsing, the classic
 * 1/2/5 nice-number tick algorithm, the series→scale→geometry layout, an
 * element-tree SVG builder (ONE geometry source feeding BOTH the in-app React
 * preview and the serialized standalone plate — they cannot drift), the
 * SVG→data-URI encoder (CSP-clean under img-src data:), the defensive
 * appState session reader, and `saveChartPlate` — the accession orchestrator
 * with injected ports (the painter's `savePlate` pattern) so the whole save
 * path, including its EXACTLY-ONE filing cue, is unit-testable without a DOM.
 * This module never touches a store, the DOM, or timers.
 *
 * Import discipline (docs/APP-CONTRACT.md — notepad/paint precedent): node
 * TYPES ride the app-registry contract (`FSNodeRef`); the only structural
 * assumption is the catalog tree shape `{rootId, nodes}`. The REAL pure op
 * (`createNode`) is driven by `saveChartPlate` — the sanctioned lib/fs
 * surface every app uses.
 */

import { createNode, FSError } from '../../lib/fs'
import type { FSState } from '../../lib/fs'

/* --------------------------------------------------------------------------
 * Kinds · grounds · caps
 * ------------------------------------------------------------------------ */

export type ChartKind = 'bar' | 'line'
export type ChartGround = 'parchment' | 'plate'

export const CHART_KINDS: readonly ChartKind[] = ['bar', 'line']
export const CHART_GROUNDS: readonly ChartGround[] = ['parchment', 'plate']

export const DEFAULT_CHART_KIND: ChartKind = 'bar'
export const DEFAULT_CHART_GROUND: ChartGround = 'parchment'

/**
 * The editor's row cap (brief: "≤24 rows — storage honesty for the
 * accessioned SVG"). The engraved ledger stops adding past this line.
 */
export const MAX_ROWS = 24

/** Label length cap — engraved caps read at a glance; longer input truncates. */
export const MAX_LABEL_CHARS = 18

/**
 * The ONE plate size. The accessioned SVG's data URI rides the FS envelope,
 * so the plate is a fixed modest sheet; the in-app preview renders the same
 * geometry scaled by CSS.
 */
export const PLATE_SVG_WIDTH = 640
export const PLATE_SVG_HEIGHT = 400

/** Debounce for the session mirror onto the window record (the fleet's delay). */
export const CHART_MIRROR_DELAY_MS = 400

/** Readout shown before the first plate is cut. */
export const UNFILED_ACCESSION = 'UNFILED'

/** Default offered name on the save flow. */
export const UNTITLED_PLATE_LABEL = 'Chart plate'

/** One data row: an engraved label and its measured value. */
export interface DataRow {
  readonly label: string
  readonly value: number
}

/* --------------------------------------------------------------------------
 * Editor row ops (pure, cap-enforced)
 * ------------------------------------------------------------------------ */

/** Append one row; PAST THE CAP the set returns unchanged (the law holds). */
export function addRow(
  rows: readonly DataRow[],
  row: DataRow = { label: '', value: 0 },
): readonly DataRow[] {
  if (rows.length >= MAX_ROWS) return rows
  return [...rows, sanitizeRow(row)]
}

/** Patch one row by index; out-of-range indices are no-ops. */
export function updateRow(
  rows: readonly DataRow[],
  index: number,
  patch: Partial<DataRow>,
): readonly DataRow[] {
  if (index < 0 || index >= rows.length) return rows
  return rows.map((row, i) => (i === index ? sanitizeRow({ ...row, ...patch }) : row))
}

/** Remove one row by index; out-of-range indices are no-ops. */
export function removeRow(rows: readonly DataRow[], index: number): readonly DataRow[] {
  if (index < 0 || index >= rows.length) return rows
  return rows.filter((_, i) => i !== index)
}

/** Clamp one row to the caps: label length, finite value. */
function sanitizeRow(row: DataRow): DataRow {
  return { label: clampLabel(row.label), value: Number.isFinite(row.value) ? row.value : 0 }
}

/** Trim to the label cap (on the word is luxury; on the character is law). */
export function clampLabel(label: string): string {
  return label.length <= MAX_LABEL_CHARS ? label : `${label.slice(0, MAX_LABEL_CHARS - 1)}…`
}

/**
 * Strict decimal grammar: optional sign, digits with at most one decimal
 * point. Rejects empty, whitespace, exponents, hex, NaN/Infinity shapes —
 * the engraver cuts what can be read back.
 */
const VALUE_GRAMMAR = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

export function parseChartValue(text: string): number | null {
  const trimmed = text.trim()
  if (!VALUE_GRAMMAR.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/* --------------------------------------------------------------------------
 * Nice-number ticks (the classic 1/2/5 algorithm)
 * ------------------------------------------------------------------------ */

/** Normalize a raw step onto the 1/2/5 ladder of its decade. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const exponent = Math.floor(Math.log10(raw))
  const fraction = raw / 10 ** exponent
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  return nice * 10 ** exponent
}

/** Smallest decimal count (0–6) that represents the step exactly. */
function stepDecimals(step: number): number {
  for (let d = 0; d <= 6; d += 1) {
    if (Number(`${step.toFixed(d)}`) === step) return d
  }
  return 6
}

/** One axis graduation: the value and its B612 numeral. */
export interface ChartTick {
  readonly value: number
  readonly label: string
}

/** A hard ceiling on iterations — hostile domains can never loop the engraver. */
const MAX_TICKS = 64

/**
 * Graduations for [min, max] at ~`targetTicks` stops: step = niceStep of the
 * span, then the OUTER bounds round to step multiples (floor below min, ceil
 * above max — the data is always inside the ruled range; Heckbert's classic).
 * Degenerate span (min === max) is the caller's to widen (see valueDomain);
 * here it degenerates to a single centered tick.
 */
export function niceTicks(min: number, max: number, targetTicks = 5): readonly ChartTick[] {
  if (!(max >= min)) return []
  const span = max - min
  if (span === 0) return [{ value: min, label: formatValue(min, 0) }]
  const step = niceStep(span / Math.max(2, targetTicks - 1))
  const decimals = stepDecimals(step)
  const first = Math.floor(Number((min / step).toFixed(6)) + 1e-9) * step
  const last = Math.ceil(Number((max / step).toFixed(6)) - 1e-9) * step
  const count = Math.min(Math.round((last - first) / step), MAX_TICKS - 1)
  const ticks: ChartTick[] = []
  for (let i = 0; i <= count; i += 1) {
    const value = Number((first + i * step).toFixed(decimals))
    ticks.push({ value, label: formatValue(value, decimals) })
  }
  return ticks
}

/** Fixed-decimal numeral, trailing zeros kept (mono columns align on them). */
function formatValue(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

/* --------------------------------------------------------------------------
 * The domain (honest-chart law)
 * ------------------------------------------------------------------------ */

/**
 * The value domain the plate charts. BARS ANCHOR AT ZERO (an honest bar
 * lengthens from nothing); lines may tighten to the data. A degenerate span
 * (single datum, or all-equal values) widens by ±1 so the plate still rules.
 */
export function valueDomain(
  rows: readonly DataRow[],
  kind: ChartKind,
): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const row of rows) {
    min = Math.min(min, row.value)
    max = Math.max(max, row.value)
  }
  if (kind === 'bar') {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }
  if (min === max) {
    min -= 1
    max += 1
  }
  return { min, max }
}

/* --------------------------------------------------------------------------
 * The plate layout (series → scales → geometry)
 * ------------------------------------------------------------------------ */

export interface PlotBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface YTickMark extends ChartTick {
  readonly y: number
}

export interface XBand {
  readonly index: number
  readonly label: string
  readonly x: number
  readonly shown: boolean
}

export interface BarMark {
  readonly index: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly negative: boolean
}

export interface PlateLayout {
  readonly empty: boolean
  readonly width: number
  readonly height: number
  readonly plot: PlotBox
  readonly yTicks: readonly YTickMark[]
  readonly xBands: readonly XBand[]
  readonly bars: readonly BarMark[]
  readonly linePoints: readonly { x: number; y: number }[]
  /** The y of value 0 — the bar baseline (dashed rule when it is not the axis). */
  readonly zeroY: number
}

/** The hatch pattern's id — one plate per document, one id. */
export const HATCH_ID = 'chart-plate-hatch'

/** Round to 2 decimals — every coordinate the plate shows is a clean number. */
const r2 = (n: number): number => Math.round(n * 100) / 100

/** Below this slot width (px per band) x labels thin to every kth band. */
const LABEL_SLOT_FLOOR = 30

export function buildPlateLayout(
  rows: readonly DataRow[],
  kind: ChartKind,
  width: number = PLATE_SVG_WIDTH,
  height: number = PLATE_SVG_HEIGHT,
): PlateLayout {
  const plot: PlotBox = {
    x: 56,
    y: 18,
    w: Math.max(0, width - 56 - 18),
    h: Math.max(0, height - 18 - 46),
  }
  const empty = rows.length === 0
  if (empty || plot.w === 0 || plot.h === 0) {
    return {
      empty: true,
      width,
      height,
      plot,
      yTicks: [],
      xBands: [],
      bars: [],
      linePoints: [],
      zeroY: r2(plot.y + plot.h),
    }
  }

  const domain = valueDomain(rows, kind)
  const ticks = niceTicks(domain.min, domain.max, 5)
  const tickMin = ticks[0]!.value
  const tickMax = ticks[ticks.length - 1]!.value
  const tickSpan = tickMax - tickMin
  const yFor = (value: number): number =>
    r2(plot.y + plot.h * (1 - (value - tickMin) / tickSpan))

  const yTicks: YTickMark[] = ticks.map((tick) => ({ ...tick, y: yFor(tick.value) }))
  const zeroY = tickMin <= 0 && 0 <= tickMax ? yFor(0) : plot.y + plot.h

  const bandW = plot.w / rows.length
  const thinning = Math.max(1, Math.ceil(LABEL_SLOT_FLOOR / bandW))
  const xBands: XBand[] = rows.map((row, index) => ({
    index,
    label: clampLabel(row.label.trim()),
    x: r2(plot.x + bandW * (index + 0.5)),
    shown: index % thinning === 0,
  }))

  const bars: BarMark[] =
    kind === 'bar'
      ? rows.map((row, index) => {
          const w = r2(Math.min(bandW * 0.62, 48))
          const x = r2(plot.x + bandW * (index + 0.5) - w / 2)
          const yValue = yFor(row.value)
          const top = Math.min(yValue, zeroY)
          let h = Math.abs(zeroY - yValue)
          if (row.value !== 0 && h < 1) h = 1 // a nonzero truth leaves a visible mark
          return { index, x, y: r2(top), w, h: r2(h), negative: row.value < 0 }
        })
      : []

  const linePoints =
    kind === 'line'
      ? rows.map((row, index) => ({ x: xBands[index]!.x, y: yFor(row.value) }))
      : []

  return { empty: false, width, height, plot, yTicks, xBands, bars, linePoints, zeroY }
}

/* --------------------------------------------------------------------------
 * The plate element tree — ONE geometry source, two renderers
 * ------------------------------------------------------------------------ */

/**
 * A primitive SVG element as plain data. Both consumers map this tree: the
 * React preview (attributes are React-camelCase from this closed vocabulary)
 * and `plateSvgSource` (which kebab-cases them for the serialized plate).
 */
export interface PlateElement {
  readonly tag: 'svg' | 'defs' | 'pattern' | 'rect' | 'line' | 'polyline' | 'circle' | 'text'
  readonly attrs: Readonly<Record<string, string | number>>
  readonly text?: string
  readonly children?: readonly PlateElement[]
}

/**
 * The plate's resolved inks — literal color STRINGS, resolved from tokens by
 * the surface at mount (ALL ink originates in tokens; the app's CSS carries
 * zero raw hex). Two world grounds:
 * - parchment: the printed survey sheet — ink on paper, no glow;
 * - plate: the dark engraved plate — FLAT amber plate ink (the wallpaper
 *   plates' vocabulary: printed, never lit; NO glow ever rides the SVG).
 */
export interface PlatePalette {
  readonly ground: string
  readonly ink: string
  readonly dim: string
  readonly rule: string
  readonly accent: string
}

export const GROUND_TOKENS: Readonly<Record<ChartGround, PlatePalette>> = {
  parchment: {
    ground: '--parchment',
    ink: '--parchment-ink',
    dim: '--parchment-ink-dim',
    rule: '--parchment-ink-dim',
    accent: '--parchment-ink',
  },
  plate: {
    ground: '--chrome-sunken',
    ink: '--phosphor',
    dim: '--phosphor-dim',
    rule: '--chrome-edge-hi',
    accent: '--phosphor',
  },
}

const MONO_STACK = "'B612 Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
const LABEL_STACK = "'Chakra Petch', ui-sans-serif, system-ui, sans-serif"

/** The whole engraved plate as one element tree (root `<svg>`). */
export function plateElements(
  layout: PlateLayout,
  palette: PlatePalette,
  kind: ChartKind,
): PlateElement {
  const children: PlateElement[] = [
    {
      tag: 'defs',
      attrs: {},
      children: [
        {
          tag: 'pattern',
          attrs: {
            id: HATCH_ID,
            width: 5,
            height: 5,
            patternUnits: 'userSpaceOnUse',
            patternTransform: 'rotate(45)',
          },
          children: [
            {
              tag: 'line',
              attrs: { x1: 0, y1: 0, x2: 0, y2: 5, stroke: palette.accent, strokeWidth: 1 },
            },
          ],
        },
      ],
    },
    // The ground — the whole sheet, printed flat.
    {
      tag: 'rect',
      attrs: { x: 0, y: 0, width: layout.width, height: layout.height, fill: palette.ground },
    },
  ]

  if (layout.empty) {
    // The un-cut plate: ruled axes waiting for data (dashed = provisional).
    children.push(
      {
        tag: 'line',
        attrs: {
          x1: layout.plot.x,
          y1: layout.plot.y,
          x2: layout.plot.x,
          y2: layout.plot.y + layout.plot.h,
          stroke: palette.rule,
          strokeWidth: 1,
          strokeDasharray: '3 3',
        },
      },
      {
        tag: 'line',
        attrs: {
          x1: layout.plot.x,
          y1: layout.plot.y + layout.plot.h,
          x2: layout.plot.x + layout.plot.w,
          y2: layout.plot.y + layout.plot.h,
          stroke: palette.rule,
          strokeWidth: 1,
          strokeDasharray: '3 3',
        },
      },
    )
    return { tag: 'svg', attrs: svgRootAttrs(layout), children }
  }

  const { plot } = layout
  // The ruled axes: left rule + bottom rule.
  children.push(
    {
      tag: 'line',
      attrs: { x1: plot.x, y1: plot.y, x2: plot.x, y2: r2(plot.y + plot.h), stroke: palette.ink, strokeWidth: 1.5 },
    },
    {
      tag: 'line',
      attrs: {
        x1: plot.x,
        y1: r2(plot.y + plot.h),
        x2: r2(plot.x + plot.w),
        y2: r2(plot.y + plot.h),
        stroke: palette.ink,
        strokeWidth: 1.5,
      },
    },
  )

  // Graduations: tick rule + B612 numeral, plus the faint grid rule across.
  for (const tick of layout.yTicks) {
    const isEdge = tick.y <= plot.y + 0.5 || tick.y >= plot.y + plot.h - 0.5
    children.push({
      tag: 'line',
      attrs: {
        x1: plot.x - 6,
        y1: tick.y,
        x2: plot.x,
        y2: tick.y,
        stroke: palette.ink,
        strokeWidth: 1,
      },
    })
    if (!isEdge) {
      children.push({
        tag: 'line',
        attrs: {
          x1: plot.x,
          y1: tick.y,
          x2: r2(plot.x + plot.w),
          y2: tick.y,
          stroke: palette.rule,
          strokeWidth: 1,
          strokeOpacity: 0.45,
        },
      })
    }
    children.push({
      tag: 'text',
      attrs: {
        x: plot.x - 10,
        y: tick.y,
        textAnchor: 'end',
        dominantBaseline: 'middle',
        fontFamily: MONO_STACK,
        fontSize: 11,
        fill: palette.dim,
      },
      text: tick.label,
    })
  }

  // The zero baseline — a heavier rule when it is not the bottom axis.
  if (layout.zeroY < plot.y + plot.h - 0.5) {
    children.push({
      tag: 'line',
      attrs: {
        x1: plot.x,
        y1: layout.zeroY,
        x2: r2(plot.x + plot.w),
        y2: layout.zeroY,
        stroke: palette.ink,
        strokeWidth: 1,
        strokeDasharray: '4 3',
      },
    })
  }

  // The series.
  if (kind === 'bar') {
    for (const bar of layout.bars) {
      children.push({
        tag: 'rect',
        attrs: {
          x: bar.x,
          y: bar.y,
          width: bar.w,
          height: bar.h,
          fill: `url(#${HATCH_ID})`,
          stroke: palette.ink,
          strokeWidth: 1,
        },
      })
    }
  } else if (layout.linePoints.length > 0) {
    children.push({
      tag: 'polyline',
      attrs: {
        points: layout.linePoints.map((p) => `${p.x},${p.y}`).join(' '),
        fill: 'none',
        stroke: palette.ink,
        strokeWidth: 2,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      },
    })
    for (const point of layout.linePoints) {
      children.push({
        tag: 'circle',
        attrs: { cx: point.x, cy: point.y, r: 2.5, fill: palette.accent },
      })
    }
  }

  // X labels: engraved caps under their bands (thinned to stay readable).
  for (const band of layout.xBands) {
    if (!band.shown || band.label.length === 0) continue
    children.push({
      tag: 'text',
      attrs: {
        x: band.x,
        y: r2(plot.y + plot.h + 20),
        textAnchor: 'middle',
        fontFamily: LABEL_STACK,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.08,
        fill: palette.dim,
      },
      text: band.label.toUpperCase(),
    })
  }

  return { tag: 'svg', attrs: svgRootAttrs(layout), children }
}

function svgRootAttrs(layout: PlateLayout): Record<string, string | number> {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    width: layout.width,
    height: layout.height,
  }
}

/* ---- serialization (the standalone accessioned artifact) ----------------- */

/** camelCase → kebab-case for this module's closed attribute vocabulary. */
const KEBAB_OVERRIDES: Readonly<Record<string, string>> = {
  viewBox: 'viewBox', // SVG's own spelling
  dominantBaseline: 'dominant-baseline',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
  textAnchor: 'text-anchor',
  strokeWidth: 'stroke-width',
  strokeOpacity: 'stroke-opacity',
  strokeDasharray: 'stroke-dasharray',
  strokeLinejoin: 'stroke-linejoin',
  strokeLinecap: 'stroke-linecap',
  patternUnits: 'patternUnits',
  patternTransform: 'patternTransform',
}

function attrName(name: string): string {
  return KEBAB_OVERRIDES[name] ?? name
}

/** XML-escape text content and attribute values. */
export function xmlEscape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** The standalone plate as an SVG document string. */
export function plateSvgSource(
  layout: PlateLayout,
  palette: PlatePalette,
  kind: ChartKind,
): string {
  return serializeElement(plateElements(layout, palette, kind))
}

function serializeElement(element: PlateElement): string {
  const attrs = Object.entries(element.attrs ?? {})
    .map(([name, value]) => ` ${attrName(name)}="${xmlEscape(String(value))}"`)
    .join('')
  if (element.children === undefined || element.children.length === 0) {
    const body = element.text === undefined ? '' : xmlEscape(element.text)
    return body === ''
      ? `<${element.tag}${attrs}/>`
      : `<${element.tag}${attrs}>${body}</${element.tag}>`
  }
  const inner = element.children.map(serializeElement).join('')
  return `<${element.tag}${attrs}>${element.text === undefined ? '' : xmlEscape(element.text)}${inner}</${element.tag}>`
}

/** The CSP-clean carrier: img-src data:, decoded by the catalog verbatim. */
export const SVG_DATA_URI_PREFIX = 'data:image/svg+xml,'

export function svgDataUri(svg: string): string {
  return `${SVG_DATA_URI_PREFIX}${encodeURIComponent(svg)}`
}

/* --------------------------------------------------------------------------
 * The session mirror (rides the WM window record's opaque appState)
 * ------------------------------------------------------------------------ */

/** The engraver's persisted window payload (structured-clone-safe by shape). */
export interface ChartSessionState {
  readonly rows: readonly DataRow[]
  readonly kind: ChartKind
  readonly ground: ChartGround
  readonly lastName: string
}

/**
 * Defensively read the session off an UNTRUSTED `appState` (it crossed the
 * persistence boundary; validate.ts carries it verbatim). `null` = absent,
 * malformed, or not the engraver's payload — callers boot the fresh bench.
 * Every cap is RE-ENFORCED here: a hostile payload can never smuggle past
 * the row cap, the label cap, or a non-finite value.
 */
export function readChartSession(appState: unknown): ChartSessionState | null {
  if (typeof appState !== 'object' || appState === null) return null
  const raw = appState as Record<string, unknown>
  if (!Array.isArray(raw['rows'])) return null
  const rows: DataRow[] = []
  for (const entry of raw['rows']) {
    if (rows.length >= MAX_ROWS) break // a lie about size stops at the cap
    if (typeof entry !== 'object' || entry === null) return null
    const row = entry as Record<string, unknown>
    if (typeof row['label'] !== 'string') return null
    if (typeof row['value'] !== 'number' || !Number.isFinite(row['value'])) return null
    rows.push({ label: clampLabel(row['label']), value: row['value'] })
  }
  const kind = raw['kind']
  const ground = raw['ground']
  const lastName = raw['lastName']
  if (typeof kind !== 'string' || !CHART_KINDS.includes(kind as ChartKind)) return null
  if (typeof ground !== 'string' || !CHART_GROUNDS.includes(ground as ChartGround)) return null
  if (lastName !== undefined && typeof lastName !== 'string') return null
  return { rows, kind: kind as ChartKind, ground: ground as ChartGround, lastName: lastName ?? '' }
}

/* --------------------------------------------------------------------------
 * saveChartPlate — the accession orchestrator (ports-injected)
 * ------------------------------------------------------------------------ */

/** The outside-world effects `saveChartPlate` needs, injected by the surface. */
export interface ChartSavePorts {
  /** The FS store's single atomic seam: `commit(nextFs)`. */
  readonly commit: (fs: FSState) => void
  /** The filing cue — the surface passes `() => playCue('drop-on-folder')`. */
  readonly cue: () => void
}

export type ChartSaveRefusal = 'no-data' | 'invalid-name' | 'collision'

export type ChartSaveResult =
  | { readonly status: 'saved'; readonly accession: string }
  | { readonly status: 'refused'; readonly reason: ChartSaveRefusal }

/**
 * Cut and file ONE plate: layout → element tree → standalone SVG → data URI
 * → `createNode(root, {kind: 'image', src})` (the painter's first-save
 * shape). The engraver is a machine, not a document: every save is a NEW
 * accession under the hold's root; the window never rebinds (singleton law).
 * Refusals (no data / empty name / label collision) commit NOTHING and cue
 * NOTHING; the surface renders the refusal in-world (the shake).
 */
export function saveChartPlate(
  args: {
    readonly fs: FSState
    readonly rows: readonly DataRow[]
    readonly kind: ChartKind
    readonly ground: ChartGround
    readonly palette: PlatePalette
    readonly name: string
    /** Injectable node id (test determinism); default crypto.randomUUID(). */
    readonly id?: string
    /** Injectable clock (test determinism); default Date.now(). */
    readonly now?: number
  },
  ports: ChartSavePorts,
): ChartSaveResult {
  const name = args.name.trim()
  if (name.length === 0) return { status: 'refused', reason: 'invalid-name' }
  const rows = args.rows.filter((row) => row.label.trim().length > 0 || row.value !== 0)
  if (rows.length === 0) return { status: 'refused', reason: 'no-data' }

  const layout = buildPlateLayout(rows, args.kind)
  const uri = svgDataUri(plateSvgSource(layout, args.palette, args.kind))
  let next: FSState
  try {
    next = createNode(args.fs, {
      id: args.id ?? crypto.randomUUID(),
      parentId: args.fs.rootId,
      name,
      kind: 'image',
      src: uri,
      ...(args.now === undefined ? {} : { now: args.now }),
    })
  } catch (error) {
    if (!(error instanceof FSError)) throw error
    return {
      status: 'refused',
      reason: error.code === 'name-collision' ? 'collision' : 'invalid-name',
    }
  }
  ports.commit(next)
  ports.cue() // the filing cue — exactly once per successful cut
  const created = next.nodes[args.id ?? ''] ?? findCreated(args.fs, next)
  return { status: 'saved', accession: created?.accession ?? '' }
}

/** The node a just-created accession landed under (diff of the maps). */
function findCreated(
  before: { readonly nodes: Readonly<Record<string, unknown>> },
  after: { readonly nodes: Readonly<Record<string, unknown>> },
): { readonly accession?: string } | null {
  for (const id of Object.keys(after.nodes)) {
    if (before.nodes[id]) continue
    return after.nodes[id] as { readonly accession?: string }
  }
  return null
}
