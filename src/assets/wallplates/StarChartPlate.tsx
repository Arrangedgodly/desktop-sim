/**
 * STAR CHART plate (UI-4) — the default wallpaper: "Hold Sky, Plate XLVII".
 *
 * A survey chart of the vessel's sky, printed amber-on-lacquer: a curved
 * barrel graticule (hour lines bowing outward, declination arcs bowing away
 * from the equator — a projection, not a tile), a dense star river along the
 * dashed ecliptic with sparser fields either side (the plate's density
 * gradient), six invented constellation figures anchored OFF and ON that
 * river, and the chart furniture that makes it a measurement document:
 * hour/declination numerals on the edges, a projection-origin cross, a
 * magnitude key, an epoch block, corner registration marks.
 *
 * The star river is a FIXED seeded sampling (plate-math.ts) computed once at
 * module load — identical on every mount, no runtime randomness. All ink is
 * flat plate ink from tokens; the amber never glows.
 */

import { PlateSvg } from './PlateSvg'
import { distanceFromLine, seededRandom } from './plate-math'

/* -- the star river: fixed sampling, denser along the ecliptic ------------- */

interface Star {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly o: number
  readonly bright: boolean
}

/** The ecliptic axis the river follows (lower-left → upper-right). */
const RIVER_FROM = { x: 200, y: 780 }
const RIVER_TO = { x: 1400, y: 120 }

function buildStars(): readonly Star[] {
  const rand = seededRandom(47) // plate 47 — the field number, naturally
  const stars: Star[] = []
  let attempts = 0
  while (stars.length < 112 && attempts < 6000) {
    attempts += 1
    const x = 56 + rand() * 1488
    const y = 56 + rand() * 788
    const d = distanceFromLine({ x, y }, RIVER_FROM, RIVER_TO)
    const pRiver = 0.26 + 0.74 * Math.exp(-((d / 185) ** 2))
    if (rand() > pRiver) continue // rejected: off-river samples pass rarely
    const draw = rand()
    const r = 0.9 + draw * draw * 3.1 // small stars dominate; few blaze
    stars.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      r: Math.round(r * 100) / 100,
      o: Math.round((0.22 + Math.min(0.66, r * 0.26)) * 100) / 100,
      bright: r >= 3.0,
    })
  }
  return stars
}

const STARS = buildStars()

/* -- the graticule: a barrel projection ------------------------------------ */

/** Hour lines: 11 curves bowing outward from the equator. */
const HOUR_XS = Array.from({ length: 11 }, (_, k) => 130 + k * 134)
const HOUR_MAJORS = new Set([2, 5, 8]) // the three central hours read heavier

function hourPath(x: number): string {
  const bow = (x - 800) * 0.07
  return `M ${x + bow} 40 Q ${x} 450 ${x + bow} 860`
}

/** Declination arcs, bowing away from the equator; the equator rules straight. */
const DEC_YS = [90, 210, 330, 450, 570, 690, 810] as const
const DEC_LABELS = ['+60', '+40', '+20', '0', '−20', '−40', '−60'] as const
const DEC_MAJORS = new Set([1, 3, 5])

function decPath(y: number): string {
  if (y === 450) return 'M 40 450 L 1560 450'
  const ctrl = y < 450 ? y - (450 - y) * 0.12 : y + (y - 450) * 0.12
  return `M 40 ${y} Q 800 ${ctrl} 1560 ${y}`
}

/* -- constellation figures (invented sky, surveyed shapes) ------------------ */

interface Figure {
  readonly name: string
  readonly labelAt: readonly [number, number]
  readonly vertices: readonly (readonly [number, number])[]
  readonly close: boolean
}

const FIGURES: readonly Figure[] = [
  {
    name: 'CORVUS FERREUS',
    labelAt: [386, 344],
    vertices: [
      [300, 180],
      [368, 214],
      [442, 196],
      [472, 258],
      [398, 302],
      [322, 282],
    ],
    close: true,
  },
  {
    name: 'NAVICULA',
    labelAt: [930, 240],
    vertices: [
      [860, 124],
      [930, 152],
      [1000, 134],
      [970, 192],
      [880, 198],
    ],
    close: true,
  },
  {
    name: 'CRUX MENSURAE',
    labelAt: [1362, 478],
    vertices: [
      [1362, 292],
      [1362, 428],
      [1294, 376],
      [1436, 376],
    ],
    close: false,
  },
  {
    name: 'OCULUS LONGUS',
    labelAt: [1252, 778],
    vertices: [
      [1180, 648],
      [1268, 612],
      [1330, 656],
      [1310, 716],
      [1220, 704],
      [1462, 552],
    ],
    close: false,
  },
  {
    name: 'LUCERNA',
    labelAt: [572, 748],
    vertices: [
      [520, 664],
      [560, 612],
      [620, 634],
      [610, 692],
      [548, 702],
    ],
    close: true,
  },
  {
    name: 'SERPENS CAUDA',
    labelAt: [806, 588],
    vertices: [
      [722, 422],
      [790, 392],
      [860, 412],
      [902, 470],
      [850, 522],
      [770, 500],
      [724, 452],
    ],
    close: true,
  },
  {
    name: 'LIBELLA',
    labelAt: [1088, 498],
    vertices: [
      [1042, 428],
      [1088, 372],
      [1136, 424],
      [1088, 458],
    ],
    close: true,
  },
]

/** The magnitude key: five printed discs, bright → faint. */
const MAG_KEY = [3.2, 2.5, 1.9, 1.4, 1.0] as const

/* -- the plate --------------------------------------------------------------- */

export function StarChartPlate() {
  return (
    <PlateSvg>
      <defs>
        <radialGradient id="star-bed" cx="50%" cy="38%" r="85%">
          <stop offset="0%" stopColor="var(--phosphor-bright)" stopOpacity="0.05" />
          <stop offset="52%" stopColor="var(--chrome-ground)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--chrome-sunken)" stopOpacity="0.55" />
        </radialGradient>
      </defs>

      {/* the lacquer ground, sinking toward the edges */}
      <rect x="0" y="0" width="1600" height="900" fill="var(--chrome-ground)" />
      <rect x="0" y="0" width="1600" height="900" fill="url(#star-bed)" />

      {/* graticule: declination arcs + hour curves (hairlines hold 1px) */}
      <g fill="none" stroke="var(--phosphor-dim)" vectorEffect="non-scaling-stroke">
        {DEC_YS.map((y, i) => (
          <path
            key={`dec-${y}`}
            d={decPath(y)}
            strokeWidth={DEC_MAJORS.has(i) ? 1 : 0.75}
            strokeOpacity={DEC_MAJORS.has(i) ? 0.3 : 0.16}
          />
        ))}
        {HOUR_XS.map((x, k) => (
          <path
            key={`hour-${x}`}
            d={hourPath(x)}
            strokeWidth={HOUR_MAJORS.has(k) ? 1 : 0.75}
            strokeOpacity={HOUR_MAJORS.has(k) ? 0.26 : 0.14}
          />
        ))}
        {/* the ecliptic: the surveyed axis the star river follows */}
        <path
          d="M 60 770 C 460 650 1000 300 1540 175"
          stroke="var(--phosphor)"
          strokeWidth={1}
          strokeOpacity={0.34}
          strokeDasharray="12 8"
        />
      </g>

      {/* edge numerals: hours along the top, declination along the left */}
      <g
        fontFamily="var(--font-mono)"
        fontSize="10"
        fill="var(--engraved-ink)"
        fillOpacity="0.55"
        textAnchor="middle"
      >
        {HOUR_XS.map((x, k) => (
          <text key={`hlab-${x}`} x={x + (x - 800) * 0.07} y="62">
            {String((14 + k * 2) % 24).padStart(2, '0')}
          </text>
        ))}
        {DEC_YS.map((y, i) => (
          <text key={`dlab-${y}`} x="52" y={y + 3}>
            {DEC_LABELS[i]}
          </text>
        ))}
        <text x="1500" y="440" textAnchor="end">
          EQ.
        </text>
      </g>

      {/* the star river and the sparse fields either side */}
      <g>
        {STARS.map((s, i) => (
          <circle
            key={`star-${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.bright ? 'var(--phosphor-bright)' : 'var(--parchment)'}
            fillOpacity={s.o}
          />
        ))}
      </g>

      {/* constellation figures: surveyed lines over the river's own stars */}
      <g>
        {FIGURES.map((f) => (
          <g key={f.name}>
            <path
              d={`${f.vertices
                .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`)
                .join(' ')}${f.close ? ' Z' : ''}`}
              fill="none"
              stroke="var(--phosphor-dim)"
              strokeOpacity={0.62}
              strokeWidth={1.25}
              strokeLinejoin="round"
            />
            {f.vertices.map(([x, y], i) => (
              <circle
                key={`${f.name}-${i}`}
                cx={x}
                cy={y}
                r={i === 0 ? 3.6 : 2.3}
                fill={i === 0 ? 'var(--phosphor-bright)' : 'var(--parchment)'}
                fillOpacity={i === 0 ? 0.92 : 0.82}
              />
            ))}
            <text
              x={f.labelAt[0]}
              y={f.labelAt[1]}
              fontFamily="var(--font-label)"
              fontWeight={600}
              fontSize="15"
              letterSpacing="2.5"
              fill="var(--engraved-ink)"
              fillOpacity="0.85"
              textAnchor="middle"
            >
              {f.name}
            </text>
          </g>
        ))}
      </g>

      {/* projection origin: the chart's center cross */}
      <g stroke="var(--parchment)" strokeOpacity="0.38" vectorEffect="non-scaling-stroke">
        <line x1="786" y1="450" x2="814" y2="450" strokeWidth={1} />
        <line x1="800" y1="436" x2="800" y2="464" strokeWidth={1} />
        <circle cx="800" cy="450" r="7" fill="none" strokeWidth={0.75} />
      </g>

      {/* magnitude key, lower right (clear of the taskbar rail) */}
      <g fontFamily="var(--font-mono)" fontSize="10.5" fill="var(--engraved-ink)">
        <text x="1204" y="812" fillOpacity="0.6">
          MAG
        </text>
        {MAG_KEY.map((r, i) => (
          <circle
            key={`mag-${i}`}
            cx={1252 + i * 33}
            cy="808"
            r={r}
            fill="var(--parchment)"
            fillOpacity={0.85 - i * 0.14}
          />
        ))}
      </g>

      {/* epoch block, lower left (right of the −60 declination label) */}
      <g fontFamily="var(--font-mono)" fontSize="13" fill="var(--engraved-ink)" fillOpacity="0.75">
        <text x="88" y="776">
          EPOCH J-2297.4 · FIELD 47
        </text>
        <text x="88" y="798">
          SECTOR III · HOLD SKY, NORTHERN
        </text>
        <text x="88" y="820">
          AMBER INK ON LACQUER GROUND
        </text>
      </g>

      {/* plate border + corner registration */}
      <g fill="none" vectorEffect="non-scaling-stroke">
        <rect
          x="26"
          y="26"
          width="1548"
          height="848"
          stroke="var(--phosphor-dim)"
          strokeOpacity={0.5}
          strokeWidth={1.5}
        />
        <rect
          x="36"
          y="36"
          width="1528"
          height="828"
          stroke="var(--phosphor-dim)"
          strokeOpacity={0.22}
          strokeWidth={0.75}
        />
        <g stroke="var(--parchment)" strokeOpacity={0.45} strokeWidth={1}>
          <path d="M 26 58 L 26 26 L 58 26" />
          <path d="M 1542 26 L 1574 26 L 1574 58" />
          <path d="M 26 842 L 26 874 L 58 874" />
          <path d="M 1542 874 L 1574 874 L 1574 842" />
        </g>
      </g>
    </PlateSvg>
  )
}

/** 40px Settings swatch — the chart's identity: dark ground, one figure, the river. */
export function StarChartSwatch() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width="40" height="40" fill="var(--chrome-ground)" />
      <g fill="none" stroke="var(--phosphor-dim)" strokeOpacity="0.4" strokeWidth="0.5">
        <path d="M 0 12 Q 20 17 40 12" />
        <path d="M 12 0 Q 17 20 12 40" />
      </g>
      <circle cx="12" cy="26" r="1.7" fill="var(--parchment)" fillOpacity="0.85" />
      <circle cx="21" cy="21" r="1.1" fill="var(--parchment)" fillOpacity="0.55" />
      <circle cx="30" cy="15" r="0.9" fill="var(--parchment)" fillOpacity="0.45" />
      <circle cx="26" cy="28" r="0.8" fill="var(--parchment)" fillOpacity="0.4" />
      <path
        d="M 9 31 L 17 27 L 24 30 L 22 35 L 13 35 Z"
        fill="none"
        stroke="var(--phosphor-dim)"
        strokeOpacity="0.85"
        strokeWidth="0.8"
      />
      <circle cx="9" cy="31" r="1.4" fill="var(--phosphor-bright)" fillOpacity="0.9" />
    </svg>
  )
}
