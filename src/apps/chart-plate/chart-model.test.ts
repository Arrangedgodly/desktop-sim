import { describe, expect, it } from 'vitest'
import {
  CHART_GROUNDS,
  CHART_KINDS,
  HATCH_ID,
  MAX_LABEL_CHARS,
  MAX_ROWS,
  PLATE_SVG_HEIGHT,
  PLATE_SVG_WIDTH,
  SVG_DATA_URI_PREFIX,
  UNFILED_ACCESSION,
  addRow,
  buildPlateLayout,
  clampLabel,
  niceStep,
  niceTicks,
  parseChartValue,
  plateSvgSource,
  readChartSession,
  removeRow,
  svgDataUri,
  updateRow,
  valueDomain,
  xmlEscape,
  type ChartGround,
  type ChartKind,
  type DataRow,
  type PlatePalette,
} from './chart-model'

/**
 * Chart Plate · the PURE model (batch 2, brief 9, acceptance 1 + 2): the
 * nice-number engine, the honest domains, the layout geometry, the editor
 * caps, the strict value grammar, the SVG serialization (escaping + carrier),
 * and the hostile-payload session reader. DOM-free by construction — this
 * file runs in the node environment.
 */

/** Sentinel palette: placement is asserted by NAME, so no color literals. */
const PALETTE: PlatePalette = {
  ground: 'GROUND-INK',
  ink: 'RULE-INK',
  dim: 'DIM-INK',
  rule: 'GRID-INK',
  accent: 'DATA-INK',
}

const rowsOf = (...values: readonly number[]): DataRow[] =>
  values.map((value, i) => ({ label: `R${i + 1}`, value }))

/* ------------------------- the nice-number engine -------------------------- */

describe('chart model · nice numbers (the 1/2/5 ladder)', () => {
  it('snaps raw steps onto the 1/2/5 ladder of their decade', () => {
    expect(niceStep(0.75)).toBe(1)
    expect(niceStep(1.9)).toBe(2)
    expect(niceStep(3.3)).toBe(5)
    expect(niceStep(7.1)).toBe(10)
    expect(niceStep(21.9)).toBe(20)
    expect(niceStep(0.0032)).toBe(0.005)
    expect(niceStep(50)).toBe(50)
  })

  it('graduates clean ranges on clean steps', () => {
    expect(niceTicks(0, 3).map((t) => t.label)).toEqual(['0', '1', '2', '3'])
    expect(niceTicks(-10, 10).map((t) => t.label)).toEqual(['-10', '-5', '0', '5', '10'])
  })

  it('graduates UGLY ranges with the data always inside the ruled range', () => {
    // 3.7…91.3: step 20, ruled 0…100 — the 91.3 datum sits INSIDE the plate
    // (the outer bounds round to step multiples; Heckbert's classic).
    const ugly = niceTicks(3.7, 91.3)
    expect(ugly.map((t) => t.label)).toEqual(['0', '20', '40', '60', '80', '100'])
    expect(ugly[0]!.value).toBeLessThanOrEqual(3.7)
    expect(ugly[ugly.length - 1]!.value).toBeGreaterThanOrEqual(91.3)

    // A property sweep: for a spread of hostile ranges, first ≤ min, last ≥ max.
    for (const [min, max] of [
      [0.13, 0.17],
      [-3.3, 3.3],
      [999.5, 1000.5],
      [-0.9, 0.1],
      [12, 12.02],
      [-12345.6, 8901.2],
    ] as const) {
      const ticks = niceTicks(min, max)
      expect(ticks.length, `${min}..${max}`).toBeGreaterThanOrEqual(2)
      expect(ticks[0]!.value).toBeLessThanOrEqual(min)
      expect(ticks[ticks.length - 1]!.value).toBeGreaterThanOrEqual(max)
      // …and consecutive ticks are evenly stepped with clean labels.
      const step = ticks[1]!.value - ticks[0]!.value
      for (let i = 2; i < ticks.length; i += 1) {
        expect(ticks[i]!.value - ticks[i - 1]!.value).toBeCloseTo(step, 9)
      }
    }
  })

  it('keeps decimal numerals honest (no float noise, fixed columns)', () => {
    expect(niceTicks(0.13, 0.17).map((t) => t.label)).toEqual(['0.13', '0.14', '0.15', '0.16', '0.17'])
    expect(niceTicks(0, 0.75).map((t) => t.label)).toEqual(['0.0', '0.2', '0.4', '0.6', '0.8'])
  })

  it('degenerates a zero span to a single tick (the caller widens it)', () => {
    expect(niceTicks(4, 4)).toEqual([{ value: 4, label: '4' }])
    expect(niceTicks(5, 3)).toEqual([]) // inverted range: nothing to rule
  })
})

/* ------------------------------ the domains --------------------------------- */

describe('chart model · honest domains', () => {
  it('anchors BARS at zero (an honest bar lengthens from nothing)', () => {
    expect(valueDomain(rowsOf(3.7, 91.3), 'bar')).toEqual({ min: 0, max: 91.3 })
    expect(valueDomain(rowsOf(-5, -1), 'bar')).toEqual({ min: -5, max: 0 })
  })

  it('lets LINES tighten to the data', () => {
    expect(valueDomain(rowsOf(1000, 1010), 'line')).toEqual({ min: 1000, max: 1010 })
  })

  it('widens a degenerate span by ±1 so the plate still rules', () => {
    expect(valueDomain(rowsOf(7), 'bar')).toEqual({ min: 0, max: 7 })
    expect(valueDomain(rowsOf(7), 'line')).toEqual({ min: 6, max: 8 })
    expect(valueDomain(rowsOf(0), 'line')).toEqual({ min: -1, max: 1 })
  })
})

/* ------------------------------ the layout ---------------------------------- */

describe('chart model · plate layout geometry', () => {
  it('charts ZERO rows as the honest empty state', () => {
    const layout = buildPlateLayout([], 'bar')
    expect(layout.empty).toBe(true)
    expect(layout.bars).toHaveLength(0)
    expect(layout.linePoints).toHaveLength(0)
    expect(layout.yTicks).toHaveLength(0)
  })

  it('charts a SINGLE DATUM as one full-height bar (widened domain)', () => {
    const layout = buildPlateLayout([{ label: 'Solo', value: 4 }], 'bar')
    expect(layout.empty).toBe(false)
    expect(layout.bars).toHaveLength(1)
    expect(layout.yTicks.map((t) => t.label)).toEqual(['0', '1', '2', '3', '4'])
    const bar = layout.bars[0]!
    expect(bar.y).toBe(layout.plot.y) // the top of the plot
    expect(bar.h).toBe(layout.plot.h) // the full height
    expect(bar.negative).toBe(false)
  })

  it('charts NEGATIVE VALUES with a dashed zero baseline between the bars', () => {
    const layout = buildPlateLayout(
      [
        { label: 'Debt', value: -4 },
        { label: 'Gain', value: 6 },
      ],
      'bar',
    )
    expect(layout.yTicks.map((t) => t.label)).toEqual(['-4', '-2', '0', '2', '4', '6'])
    // The zero rule sits strictly inside the plot, not on the bottom axis.
    expect(layout.zeroY).toBeGreaterThan(layout.plot.y)
    expect(layout.zeroY).toBeLessThan(layout.plot.y + layout.plot.h)
    const [debt, gain] = layout.bars
    expect(debt!.negative).toBe(true)
    expect(debt!.y).toBe(layout.zeroY) // hangs BELOW the zero rule
    expect(debt!.y + debt!.h).toBeCloseTo(layout.plot.y + layout.plot.h, 1)
    expect(gain!.negative).toBe(false)
    expect(gain!.y + gain!.h).toBeCloseTo(layout.zeroY, 1)
  })

  it('keeps every mark INSIDE the plot box, with monotonic ticks', () => {
    const rows = rowsOf(3.7, 91.3, -12, 0, 44.44)
    for (const kind of CHART_KINDS) {
      const layout = buildPlateLayout(rows, kind)
      const { plot } = layout
      // Y ticks descend as values rise.
      for (let i = 1; i < layout.yTicks.length; i += 1) {
        expect(layout.yTicks[i]!.y).toBeLessThan(layout.yTicks[i - 1]!.y)
      }
      // Every datum's y lies within the plot.
      const marks = kind === 'bar' ? layout.bars.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })) : layout.linePoints.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }))
      for (const mark of marks) {
        expect(mark.x).toBeGreaterThanOrEqual(plot.x - 0.01)
        expect(mark.x + mark.w).toBeLessThanOrEqual(plot.x + plot.w + 0.01)
        expect(mark.y).toBeGreaterThanOrEqual(plot.y - 0.01)
        expect(mark.y + mark.h).toBeLessThanOrEqual(plot.y + plot.h + 0.01)
      }
    }
  })

  it('seats line points at band centers and cuts no bars', () => {
    const rows = rowsOf(1, 2, 3)
    const layout = buildPlateLayout(rows, 'line')
    expect(layout.bars).toHaveLength(0)
    expect(layout.linePoints).toHaveLength(3)
    const band = layout.plot.w / 3
    expect(layout.linePoints[0]!.x).toBeCloseTo(layout.plot.x + band * 0.5, 1)
    expect(layout.linePoints[2]!.x).toBeCloseTo(layout.plot.x + layout.plot.w - band * 0.5, 1)
  })

  it('is DETERMINISTIC — the same series cuts the same plate twice', () => {
    const rows = rowsOf(-3, 0, 5.5, 2)
    expect(buildPlateLayout(rows, 'bar')).toEqual(buildPlateLayout(rows, 'bar'))
    expect(buildPlateLayout(rows, 'line')).toEqual(buildPlateLayout(rows, 'line'))
  })

  it('thins x labels when bands grow narrow, and clamps long labels', () => {
    const many: DataRow[] = Array.from({ length: MAX_ROWS }, (_, i) => ({
      label: `LINE-${i + 1}-OF-TWENTY-FOUR`,
      value: i,
    }))
    const layout = buildPlateLayout(many, 'bar')
    // 24 bands over the plot: every OTHER label shows.
    expect(layout.xBands[0]!.shown).toBe(true)
    expect(layout.xBands[1]!.shown).toBe(false)
    expect(layout.xBands[2]!.shown).toBe(true)
    // …and no label exceeds the cap (the ellipsis is the 18th character).
    for (const band of layout.xBands) {
      expect(band.label.length).toBeLessThanOrEqual(MAX_LABEL_CHARS)
    }
    expect(layout.xBands[0]!.label.endsWith('…')).toBe(true)

    const few = buildPlateLayout(rowsOf(1, 2), 'bar')
    expect(few.xBands.every((band) => band.shown)).toBe(true)
  })

  it('pins the plate sheet (storage honesty — the accessioned artifact)', () => {
    expect(PLATE_SVG_WIDTH).toBe(640)
    expect(PLATE_SVG_HEIGHT).toBe(400)
    expect(MAX_ROWS).toBe(24)
    expect(UNFILED_ACCESSION).toBe('UNFILED')
  })
})

/* ------------------------------ the editor caps ------------------------------ */

describe('chart model · editor row ops and caps (acceptance 2)', () => {
  it('grows to the cap and HOLDS there', () => {
    let rows: readonly DataRow[] = []
    for (let i = 0; i < MAX_ROWS + 5; i += 1) rows = addRow(rows)
    expect(rows).toHaveLength(MAX_ROWS)
    expect(addRow(rows)).toBe(rows) // past the cap: the same set, unchanged
  })

  it('adds, patches, and strikes rows at valid indices only', () => {
    const rows = addRow([], { label: 'A', value: 1 })
    const grown = addRow(rows, { label: 'B', value: 2 })
    expect(grown.map((r) => r.label)).toEqual(['A', 'B'])
    expect(updateRow(grown, 1, { value: 9 })).toEqual([
      { label: 'A', value: 1 },
      { label: 'B', value: 9 },
    ])
    expect(removeRow(grown, 0).map((r) => r.label)).toEqual(['B'])
    // Out-of-range indices are no-ops, never throws.
    expect(updateRow(grown, 9, { value: 0 })).toBe(grown)
    expect(removeRow(grown, -1)).toBe(grown)
    expect(removeRow(grown, 99)).toBe(grown)
  })

  it('re-clamps every row that passes through the ops', () => {
    const rows = addRow([], { label: 'x'.repeat(40), value: Number.NaN })
    expect(rows[0]!.label.length).toBe(MAX_LABEL_CHARS)
    expect(rows[0]!.value).toBe(0) // a non-finite value is not chartable
    expect(clampLabel('y'.repeat(30))).toHaveLength(MAX_LABEL_CHARS)
  })
})

/* ------------------------------ the value grammar ---------------------------- */

describe('chart model · the strict decimal grammar', () => {
  it('accepts the decimal dialect the engraver cuts', () => {
    for (const [text, value] of [
      ['3', 3],
      ['-2.5', -2.5],
      ['+7', 7],
      ['.5', 0.5],
      ['3.', 3],
      [' 4.25 ', 4.25],
      ['0', 0],
      // '-0.0' parses to negative zero — the plate charts it as zero
      // (value !== 0 is false for -0, so it leaves no mark: honest).
      ['-0.0', -0],
    ] as const) {
      expect(parseChartValue(text), text).toBe(value)
    }
  })

  it('refuses everything else — no exponents, no hex, no words, no NaN', () => {
    for (const text of ['', ' ', 'abc', '1e3', '0x10', 'NaN', 'Infinity', '3,5', '--3', '1.2.3', '٣']) {
      expect(parseChartValue(text), JSON.stringify(text)).toBeNull()
    }
  })
})

/* ------------------------------ the serialization ---------------------------- */

describe('chart model · SVG serialization (acceptance 3, pre-store)', () => {
  it('emits a standalone svg document at the pinned sheet size', () => {
    const source = plateSvgSource(buildPlateLayout(rowsOf(1, 2), 'bar'), PALETTE, 'bar')
    expect(source.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(source.endsWith('</svg>')).toBe(true)
    expect(source).toContain('viewBox="0 0 640 400"')
    expect(source).toContain('width="640"')
    expect(source).toContain('height="400"')
    // Every ink landed where the palette says.
    expect(source).toContain('fill="GROUND-INK"')
    expect(source).toContain('stroke="RULE-INK"')
    expect(source).toContain('stroke="GRID-INK"')
  })

  it('cuts hatched BARS and a ruled LINE — the kinds differ in ink', () => {
    const bars = plateSvgSource(buildPlateLayout(rowsOf(1, 2), 'bar'), PALETTE, 'bar')
    expect(bars).toContain(`fill="url(#${HATCH_ID})"`)
    expect(bars).not.toContain('<polyline')

    const line = plateSvgSource(buildPlateLayout(rowsOf(1, 2), 'line'), PALETTE, 'line')
    expect(line).toContain('<polyline')
    expect(line).toContain('<circle')
    expect(line).not.toContain(`fill="url(#${HATCH_ID})"`)
  })

  it('sets B612 numerals on tick labels and the label face on x captions', () => {
    const source = plateSvgSource(
      buildPlateLayout([{ label: 'Alpha', value: 2 }], 'bar'),
      PALETTE,
      'bar',
    )
    expect(source).toContain('font-family="&apos;B612 Mono&apos;, ui-monospace')
    expect(source).toContain('font-family="&apos;Chakra Petch&apos;, ui-sans-serif')
    expect(source).toContain('>ALPHA</text>')
  })

  it('XML-escapes hostile labels — the artifact stays a document, not an exploit', () => {
    const hostile = '<script>&"\''
    const source = plateSvgSource(
      buildPlateLayout([{ label: hostile, value: 1 }], 'bar'),
      PALETTE,
      'bar',
    )
    expect(source).toContain('&lt;SCRIPT&gt;&amp;&quot;&apos;</text>')
    expect(source).not.toContain('<script')
    expect(source).not.toContain('&"')
    // The escaping primitive itself is pinned.
    expect(xmlEscape('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&apos;')
  })

  it('carries NO glow — flat plate ink only, printed never lit', () => {
    for (const ground of CHART_GROUNDS) {
      const source = plateSvgSource(
        buildPlateLayout(rowsOf(1, -2, 3), 'line'),
        PALETTE,
        'line',
      )
      expect(source, ground).not.toContain('text-shadow')
      expect(source, ground).not.toContain('filter')
      expect(source, ground).not.toContain('drop-shadow')
    }
  })

  it('encodes the CSP-clean data URI (img-src data:) and round-trips', () => {
    const source = plateSvgSource(buildPlateLayout(rowsOf(1, 2), 'bar'), PALETTE, 'bar')
    const uri = svgDataUri(source)
    expect(uri.startsWith(SVG_DATA_URI_PREFIX)).toBe(true)
    expect(decodeURIComponent(uri.slice(SVG_DATA_URI_PREFIX.length))).toBe(source)
  })

  it('charts the empty plate with PROVISIONAL dashed rules', () => {
    const source = plateSvgSource(buildPlateLayout([], 'bar'), PALETTE, 'bar')
    expect(source).toContain('stroke-dasharray="3 3"')
    expect(source).not.toContain(`fill="url(#${HATCH_ID})"`)
  })
})

/* ------------------------------ the session reader --------------------------- */

describe('chart model · appState session validation (hostile payloads)', () => {
  it('refuses non-payloads outright', () => {
    for (const hostile of [null, undefined, 42, 'rows', [], { rows: 'nope' }]) {
      expect(readChartSession(hostile)).toBeNull()
    }
  })

  it('round-trips a valid session', () => {
    const session = {
      rows: [
        { label: 'Alpha', value: 2 },
        { label: 'Beta', value: -3.5 },
      ],
      kind: 'line',
      ground: 'plate',
      lastName: 'Survey 44',
    }
    expect(readChartSession(session)).toEqual(session)
  })

  it('refuses corrupted shapes field by field', () => {
    expect(readChartSession({ rows: [{ label: 7, value: 1 }], kind: 'bar', ground: 'parchment' })).toBeNull()
    expect(readChartSession({ rows: [{ label: 'A', value: '1' }], kind: 'bar', ground: 'parchment' })).toBeNull()
    expect(readChartSession({ rows: [{ label: 'A', value: Number.NaN }], kind: 'bar', ground: 'parchment' })).toBeNull()
    expect(readChartSession({ rows: [], kind: 'pie', ground: 'parchment' })).toBeNull()
    expect(readChartSession({ rows: [], kind: 'bar', ground: 'neon' })).toBeNull()
    expect(readChartSession({ rows: [], kind: 'bar', ground: 'parchment', lastName: 42 })).toBeNull()
    // A missing lastName is legal (older sessions); anything non-string is not.
    expect(readChartSession({ rows: [], kind: 'bar', ground: 'parchment' })?.lastName).toBe('')
  })

  it('RE-ENFORCES the caps against a lying payload', () => {
    const lying = {
      rows: Array.from({ length: 100 }, (_, i) => ({ label: `L${i}`, value: i })),
      kind: 'bar' as ChartKind,
      ground: 'parchment' as ChartGround,
    }
    const session = readChartSession(lying)
    expect(session?.rows).toHaveLength(MAX_ROWS)
    const longLabel = {
      rows: [{ label: 'x'.repeat(60), value: 1 }],
      kind: 'bar' as ChartKind,
      ground: 'parchment' as ChartGround,
    }
    expect(readChartSession(longLabel)?.rows[0]!.label.length).toBe(MAX_LABEL_CHARS)
  })
})
