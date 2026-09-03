/**
 * Type Cabinet data (batch 2) — the PURE specimen corpus of the OS's own type
 * specimen book. Three drawers, one per shipped role: the label face (Chakra
 * Petch), the content face (Lora), the mono face (B612 Mono). Everything the
 * cabinet renders is authored HERE — faces, weights, waterfall stops, the
 * tracking bands, pangrams, and the role annotations that cite DESIGN.md's
 * laws in plain words. The surface is a presentational shell over this module;
 * there is no store, no FS, no persistence (a specimen book is reference
 * material — nothing to file).
 *
 * THE NO-DRIFT LAW (the brief's acceptance 1): every family/weight this module
 * names must be a face src/styles/fonts.css actually ships, and every
 * @font-face family in that sheet must have a drawer here. The colocated test
 * parses the CSS and pins both directions — the cabinet never shows a weight
 * the hold did not load, and a face added to the hold without a drawer fails
 * the build.
 *
 * Weight law, made parseable: fonts.css declares static faces as single
 * weights (`400`) and the variable Lora file as a RANGE (`400 700`). Both
 * shapes are real shipped weights — the test reads the range honestly rather
 * than freezing a mirror list that could drift.
 */

/** Which drawer a face occupies — also the face's world role. */
export type FaceId = 'label' | 'content' | 'mono'

/** The type custom property that claims this role (tokens.css — single site). */
export type FaceCssVar = '--font-label' | '--font-content' | '--font-mono'

/** One size stop in a drawer's waterfall. Law stops carry their citation. */
export interface WaterfallStop {
  /** Specimen size in px. 11 is the world's floor — nothing rides smaller. */
  readonly px: number
  /** True where the world actually sets this face at this size. */
  readonly law?: boolean
  /** The annotation printed beside a stop (plain words; law stops cite). */
  readonly note?: string
}

/** One weight the face ships, with its job in the world. */
export interface WeightStep {
  readonly weight: number
  readonly note: string
}

/** One band of the world's tracked-legend tracking range (DESIGN.md, Label). */
export interface TrackingBand {
  /** Tracking in em — the law's band is 0.08–0.12 inclusive. */
  readonly em: number
  /** The band's name in the tokens (`--track-legend-narrow` &c). */
  readonly name: string
  /** What rides this band across the OS. */
  readonly use: string
}

/** The digit specimen: the face's own figures, with the measuring law's word. */
export interface DigitSpecimen {
  /** The row of figures set in the FACE ITSELF (proportional or tabular). */
  readonly row: string
  /** True when this face is barred from readouts (the label face's digits). */
  readonly barred: boolean
  /** The law in plain words — why this row may or may not count. */
  readonly note: string
}

/** One drawer of the cabinet: a face, fully annotated. */
export interface FaceSpecimen {
  readonly id: FaceId
  /** Drawer position, 1-based (the toolbar readout prints it). */
  readonly drawer: number
  /** CSS family — MUST equal a `font-family` in src/styles/fonts.css. */
  readonly family: string
  /** The role's type token — MUST be the token that names `family`. */
  readonly cssVar: FaceCssVar
  /** 'THE LABEL FACE' &c — the drawer's title. */
  readonly roleTitle: string
  /** The brief's own line: speaks for the console / reads the archive / counts. */
  readonly roleLine: string
  /** The role card's band legend. */
  readonly roleBand: string
  /** The role annotation: DESIGN.md's laws in plain words, archive prose. */
  readonly roleNote: string
  /** The specific named laws cited, one ruled line each. */
  readonly lawCitations: readonly string[]
  /** The weight the waterfall sets (the face's working weight). */
  readonly primaryWeight: number
  /** The weight the sheet's display heading sets. */
  readonly displayWeight: number
  readonly weights: readonly WeightStep[]
  readonly waterfall: readonly WaterfallStop[]
  /** The sentence the waterfall sets at every stop (a pangram). */
  readonly waterfallSample: string
  /** The word the weight row sets. */
  readonly weightSample: string
  /** The phrase the tracking rows set. */
  readonly trackingSample: string
  /** Which of the world's bands this face actually rides (em values). */
  readonly ridesTracking: readonly number[]
  /** What the tracking section says about this face's spacing. */
  readonly trackingNote: string
  /** The alphabet row, set in the face. */
  readonly alphabet: string
  readonly pangrams: readonly string[]
  /** Null when the face has no digit story worth a drawer. */
  readonly digits: DigitSpecimen | null
}

/* ------------------------- the world's tracking bands ----------------------- */

/**
 * The three stops of the engraved-legend tracking band (DESIGN.md, The
 * Engraved Legend Law; tokens `--track-legend-narrow/-wide`). Every drawer
 * prints all three with its own rides-marks — the bands belong to the world,
 * and each face states honestly which it uses.
 */
export const WORLD_TRACKING_BANDS: readonly TrackingBand[] = Object.freeze([
  {
    em: 0.08,
    name: 'NARROW',
    use: 'wrapping and secondary legends; mono readouts',
  },
  {
    em: 0.1,
    name: 'CENTER',
    use: 'primary legends — title bars, controls, catalog names',
  },
  {
    em: 0.12,
    name: 'WIDE',
    use: 'awaiting and provisional shouts',
  },
])

/* -------------------------------- the drawers -------------------------------- */

/** A 3-tuple, not an open array: the cabinet's drawers are exactly three. */
export const TYPE_CABINET_FACES: readonly [FaceSpecimen, FaceSpecimen, FaceSpecimen] =
  Object.freeze([
  {
    id: 'label',
    drawer: 1,
    family: 'Chakra Petch',
    cssVar: '--font-label',
    roleTitle: 'The Label Face',
    roleLine: 'This face speaks for the console.',
    roleBand: 'Role on the console',
    roleNote:
      'Chakra Petch cuts every legend on the machine — title bars, menu rows, control plates, catalog names, breadcrumbs. It speaks only in 600-weight uppercase tracked between 0.08 and 0.12 em, and the cut is engraved into the plate, never embossed on it. It never sets a sentence: when words run to prose, the serif drawer takes over.',
    lawCitations: [
      'The Engraved Legend Law — labels are engraved, never embossed: uppercase, weight 600, tracked inside the 0.08–0.12 em band, 11 px floor, 14 px off-ramp.',
      'The Measuring Law — this face\u2019s digits are proportional, so they never set a readout; every number rides the mono drawer.',
      'The Serif Reads Law bars it from prose.',
    ],
    primaryWeight: 600,
    displayWeight: 600,
    weights: [
      { weight: 400, note: 'the quiet register — secondary furniture rarely rides it' },
      { weight: 600, note: 'the law\u2019s one label weight' },
    ],
    waterfall: [
      { px: 11, law: true, note: 'the floor — nothing rides smaller' },
      { px: 12, law: true, note: 'primary legends' },
      { px: 14, law: true, note: 'the off-ramp — arm\u2019s-length selection lists' },
      { px: 18 },
      { px: 24 },
      { px: 34, note: 'specimen display — the console never engraves this large' },
    ],
    waterfallSample: 'SPHINX OF BLACK QUARTZ, JUDGE MY VOW',
    weightSample: 'SPEAKS',
    trackingSample: 'TRACKED CAPS',
    ridesTracking: [0.08, 0.1, 0.12],
    trackingNote:
      'All three bands — this is the face the tracking law was written for. Narrow carries wrapping and secondary legends, center carries primary legends, wide carries awaiting shouts.',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz',
    pangrams: ['PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS'],
    digits: {
      row: '0123456789',
      barred: true,
      note: 'Proportional digits — barred from every readout. The columns will not stand in line, so the mono drawer counts instead. This row prints on parchment, deliberately outside any well.',
    },
  },
  {
    id: 'content',
    drawer: 2,
    family: 'Lora',
    cssVar: '--font-content',
    roleTitle: 'The Content Face',
    roleLine: 'This face reads the archive.',
    roleBand: 'Role in the archive',
    roleNote:
      'Lora carries everything meant to be read at length — ledger notes, field notes, exhibit descriptions, the notepad\u2019s sheets. It runs a warm serif at generous leading over a measure of 60–78 characters on parchment, and it is never tracked: the reading face runs at natural spacing, its italics kept for marginal notes in dim ink.',
    lawCitations: [
      'The Serif Reads Law — prose on parchment is Lora, never the label face and never mono.',
      'Reading measure 60–78 characters; leading 1.7–1.8 (the Hierarchy law\u2019s body).',
      'Marginal notes ride Lora italic in dim parchment ink.',
    ],
    primaryWeight: 400,
    displayWeight: 600,
    weights: [
      { weight: 400, note: 'body — all reading' },
      { weight: 600, note: 'exhibit names and the officer\u2019s nameplate' },
      { weight: 700, note: 'the display ramp\u2019s top — spent sparingly' },
    ],
    waterfall: [
      { px: 13, law: true, note: 'marginal notes — italic, dim ink' },
      { px: 15, law: true, note: 'the body of every sheet' },
      { px: 18 },
      { px: 22.4, law: true, note: 'display — exhibit page names' },
      { px: 28, law: true, note: 'display — the nameplate engraving' },
    ],
    waterfallSample: 'The quick brown fox jumps over the lazy dog.',
    weightSample: 'Reads',
    trackingSample: 'reads at natural spacing',
    ridesTracking: [],
    trackingNote:
      'No band — the reading face runs at natural spacing. The rows above show what tracking would do to a serif; the world never does it.',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz',
    pangrams: [
      'Amazingly few discotheques provide jukeboxes.',
      'How vexingly quick daft zebras jump!',
    ],
    digits: null,
  },
  {
    id: 'mono',
    drawer: 3,
    family: 'B612 Mono',
    cssVar: '--font-mono',
    roleTitle: 'The Mono Face',
    roleLine: 'This face counts.',
    roleBand: 'Role at the wells',
    roleNote:
      'B612 Mono typesets every digit the machine produces — timecodes, accession codes, scale readouts, POST lines, the window controls\u2019 own glyphs. It is a cockpit face, tabular by construction, so columns of figures stand in line without help. Inside a phosphor well it glows amber; on parchment it prints in ink.',
    lawCitations: [
      'The Measuring Law — every digit, code, and readout rides B612 Mono, tabular by construction.',
      'Readouts snap between states — instrument numerals never tween.',
      'The well supplies its ground on the console; the mono face is the well\u2019s voice.',
    ],
    primaryWeight: 400,
    displayWeight: 700,
    weights: [
      { weight: 400, note: 'every readout' },
      { weight: 700, note: 'banner lines — the one weight hierarchy the wells allow' },
    ],
    waterfall: [
      { px: 11, law: true, note: 'tight plates — readouts at the legend floor' },
      { px: 13, law: true, note: 'POST lines and the timecode well' },
      { px: 15 },
      { px: 18 },
      { px: 24 },
      { px: 34, note: 'specimen display — no console prints this large' },
    ],
    waterfallSample: 'PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS',
    weightSample: 'COUNTS',
    trackingSample: 'TIMECODE 00:12:47',
    ridesTracking: [0.08],
    trackingNote:
      'The narrow band only — readouts track 0.08 em, the timecode well\u2019s spacing. Center and wide belong to the label drawer.',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz',
    pangrams: ['THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG'],
    digits: {
      row: '0123456789 9876543210',
      barred: false,
      note: 'Tabular by construction — the figures stand in line without alignment help. Every code and count in the OS rides this row, seated in a well when the console reads it.',
    },
  },
])

/* ------------------------------ tiny pure helpers ---------------------------- */

/**
 * Step to the next drawer with WRAP (a cabinet is a ring: stepping past the
 * last drawer opens the first, and back past the first opens the last).
 * Count 0 stays at 0 — an empty cabinet has no drawer to open.
 */
export function nextDrawer(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return (((current + delta) % count) + count) % count
}

/** The toolbar readout: `01 / 03` — B612, tabular, in a well. */
export function drawerReadout(index: number, count: number): string {
  return `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`
}
