/**
 * ANATOMICAL PLATE (UI-4) — "Ventral Dissection, Glyphosoma": a dissection
 * sheet of a fictional radial specimen, printed ink-on-parchment.
 *
 * Composition: the main transverse section anchors the lower left; a dorsal
 * profile and a magnified dermal ossicle carry the upper band; a B612 letter
 * column on the right reads features off the figures through leader lines,
 * keyed at the foot of the sheet — the classic anatomical-plate layout, so
 * density lives INSIDE the hatched chambers and stippled organs while the
 * parchment between figures stays open. All drawing is exact geometry
 * (circles, sectors, spokes, béziers) — a diagram, never a picture. The one
 * color beyond ink is the oxide-red INJECTED circulatory system, the real
 * convention anatomical plates use for vessels.
 */

import { PlateSvg } from './PlateSvg'
import { deg, polar } from './plate-math'

/* -- fig. 1 geometry: transverse section at C, radius R -------------------- */

const C = { x: 500, y: 560 }
const R = 190
const CAVITY_R = 58
const GONAD_R = 17
const GONAD_ORBIT = 112

/** Septum angles (degrees, y-down): five partitions from the cavity to the rim. */
const SEPTA = [-90, -18, 54, 126, 198] as const
/** Gonad angles sit between septa. */
const GONADS = [-54, 18, 90, 162, 234] as const

/** The two chambers rendered with hatch fill (a — start, b — end, degrees). */
const HATCHED: readonly (readonly [number, number])[] = [
  [-90, -18],
  [54, 126],
]

function sector(r0: number, r1: number, a0: number, a1: number): string {
  const p0 = polar(C, r0, deg(a0))
  const p1 = polar(C, r1, deg(a0))
  const p2 = polar(C, r1, deg(a1))
  const p3 = polar(C, r0, deg(a1))
  return [
    `M ${p0.x} ${p0.y}`,
    `L ${p1.x} ${p1.y}`,
    `A ${r1} ${r1} 0 0 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${r0} ${r0} 0 0 0 ${p0.x} ${p0.y}`,
    'Z',
  ].join(' ')
}

/** Oxide vessel: trunk up the −18° septum, arc along the rim, three branches. */
const VESSEL_TRUNK_TO = polar(C, R, deg(-18))
const VESSEL_RIM_TO = polar(C, R, deg(34))
const VESSEL_B1 = { from: polar(C, 70, deg(-18)), to: polar(C, GONAD_ORBIT, deg(-54)) }
const VESSEL_B2 = { from: polar(C, 120, deg(-18)), to: polar(C, 152, deg(22)) }
const VESSEL_B3 = { from: C, to: polar(C, GONAD_ORBIT, deg(18)) }
const VESSEL_HEAD_AT = polar(C, 104, deg(-18))

/* -- label column: letters, leaders, keyed meanings ------------------------- */

interface Leader {
  readonly letter: string
  readonly y: number
  readonly to: readonly [number, number]
}

const LEADERS: readonly Leader[] = [
  { letter: 'a', y: 306, to: [1140, 191] }, // tentacular crown (fig. 2)
  { letter: 'b', y: 366, to: [1368, 186] }, // dermal ossicle (fig. 3)
  { letter: 'c', y: 426, to: [656, 451] }, // theca, rim (fig. 1)
  { letter: 'd', y: 486, to: [643, 514] }, // septum, on the line itself
  { letter: 'e', y: 546, to: [566, 548] }, // central cavity, right edge
  { letter: 'f', y: 606, to: [623, 591] }, // gonadal chamber
  { letter: 'g', y: 666, to: [664, 655] }, // injected vessel, rim arc
  { letter: 'h', y: 726, to: [502, 748] }, // theca, sectional
]

const LABEL_X = 1356
const KEY_LINES = [
  'a — tentacular crown',
  'b — dermal ossicle',
  'c h — theca, rim + sectional',
  'd e — coelomic septa',
  'f — gonadal chambers',
  'g — vessels, injected',
] as const

/** Scale-bar ticks under fig. 1 (seven 40-unit intervals). */
const SCALE_TICKS = Array.from({ length: 8 }, (_, i) => 360 + i * 40)

/** Foxing: fixed age spots, placed clear of figures, leaders and captions. */
const FOXING = [
  { x: 170, y: 300, r: 5.5, o: 0.6 },
  { x: 214, y: 316, r: 2.6, o: 0.5 },
  { x: 96, y: 560, r: 4.2, o: 0.55 },
  { x: 246, y: 646, r: 3.4, o: 0.5 },
  { x: 152, y: 742, r: 5.8, o: 0.62 },
  { x: 660, y: 252, r: 3.8, o: 0.5 },
  { x: 742, y: 92, r: 4.6, o: 0.55 },
  { x: 428, y: 244, r: 2.8, o: 0.45 },
  { x: 1246, y: 122, r: 4.4, o: 0.5 },
  { x: 1488, y: 252, r: 3.6, o: 0.5 },
  { x: 1402, y: 722, r: 5.2, o: 0.6 },
  { x: 1244, y: 618, r: 3.2, o: 0.48 },
  { x: 700, y: 764, r: 4.4, o: 0.55 },
  { x: 1504, y: 566, r: 2.6, o: 0.45 },
] as const

/* -- the plate --------------------------------------------------------------- */

export function AnatomicalPlate() {
  return (
    <PlateSvg>
      <defs>
        <radialGradient id="an-tone" cx="42%" cy="40%" r="82%">
          <stop offset="0%" stopColor="var(--parchment-shade)" stopOpacity="0" />
          <stop offset="64%" stopColor="var(--parchment-shade)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--parchment-shade)" stopOpacity="0.8" />
        </radialGradient>
        <pattern id="an-hatch" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M 0 7 L 7 0" stroke="var(--parchment-ink)" strokeWidth="0.8" opacity="0.55" />
        </pattern>
        <pattern id="an-stipple" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.9" fill="var(--parchment-ink)" opacity="0.5" />
          <circle cx="6.5" cy="6.5" r="0.9" fill="var(--parchment-ink)" opacity="0.42" />
        </pattern>
      </defs>

      {/* the sheet */}
      <rect x="0" y="0" width="1600" height="900" fill="var(--parchment)" />
      <rect x="0" y="0" width="1600" height="900" fill="url(#an-tone)" />

      {/* fig. 1 — transverse section */}
      <g stroke="var(--parchment-ink)" fill="none">
        {HATCHED.map(([a0, a1]) => (
          <path key={`hatch-${a0}`} d={sector(CAVITY_R, R - 14, a0, a1)} fill="url(#an-hatch)" />
        ))}
        <circle cx={C.x} cy={C.y} r={R} strokeWidth="2.25" />
        <circle cx={C.x} cy={C.y} r={R - 14} strokeWidth="1" opacity="0.55" />
        {SEPTA.map((a) => {
          const from = polar(C, CAVITY_R, deg(a))
          const to = polar(C, R - 14, deg(a))
          return <line key={`sept-${a}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth="1.5" />
        })}
        <circle cx={C.x} cy={C.y} r={CAVITY_R} strokeWidth="1.5" />
        {GONADS.map((a, i) => {
          const at = polar(C, GONAD_ORBIT, deg(a))
          return (
            <circle
              key={`gonad-${a}`}
              cx={at.x}
              cy={at.y}
              r={GONAD_R}
              strokeWidth="1.25"
              fill={i === 1 ? 'url(#an-stipple)' : 'none'}
            />
          )
        })}
      </g>

      {/* the injected circulatory system — the plate's one oxide accent */}
      <g stroke="var(--oxide)" fill="none" opacity="0.85">
        <path
          d={`M ${C.x} ${C.y} L ${VESSEL_TRUNK_TO.x} ${VESSEL_TRUNK_TO.y}`}
          strokeWidth="2.5"
        />
        <path
          d={`M ${VESSEL_TRUNK_TO.x} ${VESSEL_TRUNK_TO.y} A ${R} ${R} 0 0 1 ${VESSEL_RIM_TO.x} ${VESSEL_RIM_TO.y}`}
          strokeWidth="2"
        />
        <path
          d={`M ${VESSEL_B1.from.x} ${VESSEL_B1.from.y} Q ${C.x + 60} ${C.y - 78} ${VESSEL_B1.to.x} ${VESSEL_B1.to.y}`}
          strokeWidth="1.4"
        />
        <path
          d={`M ${VESSEL_B2.from.x} ${VESSEL_B2.from.y} Q ${C.x + 128} ${C.y - 6} ${VESSEL_B2.to.x} ${VESSEL_B2.to.y}`}
          strokeWidth="1.4"
        />
        <path
          d={`M ${VESSEL_B3.from.x} ${VESSEL_B3.from.y} Q ${C.x + 52} ${C.y - 30} ${VESSEL_B3.to.x} ${VESSEL_B3.to.y}`}
          strokeWidth="1.4"
        />
        {/* flow arrowheads on the trunk */}
        <path
          d={`M ${VESSEL_HEAD_AT.x - 4} ${VESSEL_HEAD_AT.y - 6} L ${VESSEL_HEAD_AT.x + 5} ${VESSEL_HEAD_AT.y + 1} L ${VESSEL_HEAD_AT.x - 5} ${VESSEL_HEAD_AT.y + 5} Z`}
          fill="var(--oxide)"
          stroke="none"
        />
      </g>

      {/* fig. 2 — dorsal profile with sagittal dotted line + tentacular crown */}
      <g stroke="var(--parchment-ink)" fill="none">
        <path
          d="M 862 205 C 895 158 1005 148 1082 180 C 1124 197 1124 214 1082 231 C 1005 263 895 253 862 205 Z"
          strokeWidth="1.75"
        />
        <g strokeWidth="1" opacity="0.5">
          <line x1="900" y1="174" x2="900" y2="236" />
          <line x1="940" y1="168" x2="940" y2="242" />
          <line x1="980" y1="166" x2="980" y2="244" />
          <line x1="1020" y1="168" x2="1020" y2="242" />
          <line x1="1060" y1="172" x2="1060" y2="236" />
        </g>
        <line x1="852" y1="205" x2="1076" y2="205" strokeWidth="1" strokeDasharray="2 6" opacity="0.45" />
        <circle cx="1082" cy="205" r="8.5" strokeWidth="1.25" />
        <g strokeWidth="1" opacity="0.7">
          <path d="M 1090 198 q 26 -20 50 -14" />
          <path d="M 1092 205 q 30 2 54 -2" />
          <path d="M 1090 212 q 26 18 48 16" />
        </g>
      </g>

      {/* fig. 3 — magnified dermal ossicle with its vascular ringlet */}
      <g stroke="var(--parchment-ink)" fill="none">
        <circle cx="1330" cy="140" r="55" strokeWidth="1.5" />
        <circle cx="1330" cy="140" r="38" strokeWidth="0.75" opacity="0.5" />
        {Array.from({ length: 8 }, (_, k) => {
          const a = deg(22.5 + k * 45)
          const from = polar({ x: 1330, y: 140 }, 19, a)
          const to = polar({ x: 1330, y: 140 }, 50, a)
          return <line key={`spoke-${k}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth="1.25" />
        })}
        <circle cx="1322" cy="134" r="4.5" strokeWidth="1" />
        <circle cx="1338" cy="137" r="4.5" strokeWidth="1" />
        <circle cx="1326" cy="148" r="4.5" strokeWidth="1" />
        <circle cx="1340" cy="148" r="4.5" strokeWidth="1" />
        <circle cx="1330" cy="140" r="26" strokeWidth="1.25" strokeDasharray="4 4" stroke="var(--oxide)" />
      </g>

      {/* leader lines: letter column reading features off the figures */}
      <g>
        {LEADERS.map((l) => (
          <g key={l.letter}>
            <line
              x1={LABEL_X - 12}
              y1={l.y - 4}
              x2={l.to[0]}
              y2={l.to[1]}
              stroke="var(--parchment-ink)"
              strokeWidth="1"
              opacity="0.6"
            />
            <circle cx={l.to[0]} cy={l.to[1]} r="2" fill="var(--parchment-ink)" opacity="0.75" />
            <text
              x={LABEL_X}
              y={l.y}
              fontFamily="var(--font-mono)"
              fontSize="16"
              fill="var(--parchment-ink)"
            >
              {l.letter}.
            </text>
          </g>
        ))}
      </g>

      {/* scale bar under fig. 1 */}
      <g stroke="var(--parchment-ink)" opacity="0.8">
        <line x1="360" y1="770" x2="640" y2="770" strokeWidth="1.25" />
        {SCALE_TICKS.map((x) => (
          <line key={`tick-${x}`} x1={x} y1="764" x2={x} y2="776" strokeWidth="1" />
        ))}
      </g>
      <g fontFamily="var(--font-mono)" fontSize="11" fill="var(--parchment-ink-dim)">
        <text x="360" y="756">0</text>
        <text x="500" y="756" textAnchor="middle">10</text>
        <text x="640" y="756" textAnchor="end">20 MM</text>
      </g>

      {/* figure captions */}
      <g
        fontFamily="var(--font-content)"
        fontStyle="italic"
        fontSize="15.5"
        fill="var(--parchment-ink-dim)"
        textAnchor="middle"
      >
        <text x="500" y="806">Fig. 1. — Transverse section, natural size.</text>
        <text x="975" y="296">Fig. 2. — Dorsal aspect, ×0.6.</text>
        <text x="1330" y="222">Fig. 3. — Dermal ossicle, ×12.</text>
      </g>

      {/* title block — right of the seeded icon field (x ≥ 300), classic
          top-left placement kept but clear of the catalog's first columns */}
      <g>
        <text
          x="300"
          y="96"
          fontFamily="var(--font-label)"
          fontWeight={600}
          fontSize="30"
          letterSpacing="6"
          fill="var(--parchment-ink)"
        >
          PLATE IX
        </text>
        <text
          x="300"
          y="122"
          fontFamily="var(--font-label)"
          fontSize="15"
          letterSpacing="3"
          fill="var(--parchment-ink-dim)"
        >
          VENTRAL DISSECTION · SURVEY HOLD
        </text>
        <text
          x="300"
          y="158"
          fontFamily="var(--font-content)"
          fontStyle="italic"
          fontSize="22"
          fill="var(--parchment-ink)"
        >
          Glyphosoma vectensis n. sp.
        </text>
        <text
          x="300"
          y="182"
          fontFamily="var(--font-content)"
          fontSize="14"
          fill="var(--parchment-ink-dim)"
        >
          Fam. Tesselatae · cat. no. 8
        </text>
        <line x1="300" y1="200" x2="644" y2="200" stroke="var(--parchment-ink)" strokeWidth="1" opacity="0.4" />
      </g>

      {/* foxing: a fixed scatter of age spots on the sheet (authored, seeded
          placement — no filters, just marks the paper has earned) */}
      <g fill="var(--parchment-shade)">
        {FOXING.map((f, i) => (
          <circle key={`fox-${i}`} cx={f.x} cy={f.y} r={f.r} fillOpacity={f.o} />
        ))}
      </g>

      {/* key block, lower right (inside the inner rule) */}
      <g fontFamily="var(--font-mono)" fontSize="10.5" fill="var(--parchment-ink-dim)">
        {KEY_LINES.map((line, i) => (
          <text key={line} x="1544" y={772 + i * 15} textAnchor="end">
            {line}
          </text>
        ))}
      </g>

      {/* sheet border, double-ruled */}
      <g fill="none" stroke="var(--parchment-ink)">
        <rect x="30" y="30" width="1540" height="840" strokeWidth="2" opacity="0.75" />
        <rect x="40" y="40" width="1520" height="820" strokeWidth="0.75" opacity="0.45" />
      </g>
    </PlateSvg>
  )
}

/** 40px Settings swatch — the sheet's identity: parchment, section, injection. */
export function AnatomySwatch() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width="40" height="40" fill="var(--parchment)" />
      <g stroke="var(--parchment-ink)" fill="none">
        <circle cx="18" cy="21" r="11" strokeWidth="1.4" />
        <line x1="18" y1="10" x2="18" y2="32" strokeWidth="0.9" />
        <line x1="7.8" y1="17" x2="28.2" y2="17" strokeWidth="0.9" opacity="0.6" />
        <line x1="7.8" y1="25" x2="28.2" y2="25" strokeWidth="0.9" opacity="0.6" />
        <path d="M 18 21 L 27 13" strokeWidth="0.8" strokeDasharray="1.5 2" opacity="0.5" />
      </g>
      <path
        d="M 18 21 Q 23 26 29 24"
        fill="none"
        stroke="var(--oxide)"
        strokeWidth="1.6"
        opacity="0.85"
      />
      <line x1="30" y1="8" x2="34" y2="8" stroke="var(--parchment-ink)" strokeWidth="0.7" opacity="0.6" />
      <circle cx="34" cy="8" r="0.8" fill="var(--parchment-ink)" opacity="0.7" />
    </svg>
  )
}
