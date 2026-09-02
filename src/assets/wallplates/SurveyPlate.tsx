/**
 * GRATICULE SURVEY (UI-4) — "Graticule Survey, Sheet 47": a pure measuring
 * surface. The fine grid is legitimate here (the craft floor exempts maps
 * and measuring tools) but the plate is COMPOSED, not tiled: a plane-table
 * arc with degree ticks anchors the lower left, a triangulation network with
 * station symbols anchors the upper right, and a chained baseline (chain
 * ticks every interval) runs between them across open grid. Registration
 * crosses sit only on the 400-unit intersections, eastings/northings label
 * the majors, and the sheet block carries the projection + datum. Two
 * anchors and a measured diagonal — density where the instruments are,
 * quiet grid everywhere else.
 *
 * All tick/chain geometry is computed once at module load (plate-math.ts).
 */

import { PlateSvg } from './PlateSvg'
import { chainTicks, deg, polar } from './plate-math'

/* -- the grid: minors every 40, majors every 200 ----------------------------- */

const MINOR_XS = Array.from({ length: 39 }, (_, i) => 40 + i * 40) // 40…1560
const MINOR_YS = Array.from({ length: 22 }, (_, i) => 40 + i * 40) // 40…880
const MAJOR_XS = [200, 400, 600, 800, 1000, 1200, 1400] as const
const MAJOR_YS = [200, 400, 600, 800] as const

/** Registration crosses live only on 400-unit intersections — sparse, as print furniture. */
const CROSS_AT = [400, 800, 1200] as const
const CROSS_Y = [200, 400, 600] as const

const EASTINGS = ['04', '08', '12', '16', '20', '24', '28'] as const
const NORTHINGS = ['80', '60', '40', '20'] as const

/* -- the plane-table arc: center A, ticks every 5° --------------------------- */

const A = { x: 330, y: 780 }
const ARC_R = 310
const ARC_RADIALS = [170, 140, 110, 80, 50, 20, -10, -40, -70] as const

function buildArcTicks(): readonly { readonly a: readonly [number, number]; readonly b: readonly [number, number] }[] {
  const ticks: { a: [number, number]; b: [number, number] }[] = []
  for (let angle = -85; angle <= 175; angle += 5) {
    const major = ((angle % 15) + 15) % 15 === 0
    const from = polar(A, ARC_R, deg(angle))
    const to = polar(A, ARC_R - (major ? 14 : 8), deg(angle))
    ticks.push({
      a: [Math.round(from.x * 10) / 10, Math.round(from.y * 10) / 10],
      b: [Math.round(to.x * 10) / 10, Math.round(to.y * 10) / 10],
    })
  }
  return ticks
}

const ARC_TICKS = buildArcTicks()

/* -- the triangulation network ------------------------------------------------ */

interface Station {
  readonly id: string
  readonly x: number
  readonly y: number
}

const STATIONS: readonly Station[] = [
  { id: 'ST-04', x: 980, y: 222 },
  { id: 'ST-05', x: 1180, y: 300 },
  { id: 'ST-06', x: 1332, y: 182 },
  { id: 'ST-07', x: 1258, y: 472 },
  { id: 'ST-08', x: 1466, y: 392 },
]

/** Edges as 0-based station-index pairs; [0,1] — the 04–05 baseline — draws doubled. */
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 2],
  [1, 3],
  [2, 4],
  [3, 4],
  [1, 4],
]

/** The measured baseline: arc center A → ST-04, chained every 56 units. */
const BASELINE_TO = STATIONS[0]!
const BASELINE_TICKS = chainTicks(A, BASELINE_TO, 56, 5)
const BASELINE_ANGLE =
  Math.round((Math.atan2(BASELINE_TO.y - A.y, BASELINE_TO.x - A.x) * 180) / Math.PI * 10) / 10

/** A surveyor's station: triangle + center dot. */
function StationMark({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <g>
      <path
        d={`M ${x} ${y - 8} L ${x + 7.5} ${y + 5.5} L ${x - 7.5} ${y + 5.5} Z`}
        fill="none"
        stroke="var(--phosphor-bright)"
        strokeOpacity="0.85"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x} cy={y} r="1.8" fill="var(--phosphor-bright)" fillOpacity="0.9" />
    </g>
  )
}

/* -- the plate --------------------------------------------------------------- */

export function SurveyPlate() {
  return (
    <PlateSvg>
      <defs>
        <radialGradient id="sv-bed" cx="50%" cy="45%" r="88%">
          <stop offset="0%" stopColor="var(--phosphor-bright)" stopOpacity="0.035" />
          <stop offset="55%" stopColor="var(--chrome-ground)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--chrome-sunken)" stopOpacity="0.5" />
        </radialGradient>
      </defs>

      {/* the ground */}
      <rect x="0" y="0" width="1600" height="900" fill="var(--chrome-ground)" />
      <rect x="0" y="0" width="1600" height="900" fill="url(#sv-bed)" />

      {/* the graticule: minors, then majors over them */}
      <g
        stroke="var(--phosphor-dim)"
        strokeOpacity="0.09"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      >
        {MINOR_XS.map((x) => (
          <line key={`mx-${x}`} x1={x} y1="0" x2={x} y2="900" />
        ))}
        {MINOR_YS.map((y) => (
          <line key={`my-${y}`} x1="0" y1={y} x2="1600" y2={y} />
        ))}
      </g>
      <g
        stroke="var(--phosphor-dim)"
        strokeOpacity="0.2"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      >
        {MAJOR_XS.map((x) => (
          <line key={`Mx-${x}`} x1={x} y1="0" x2={x} y2="900" />
        ))}
        {MAJOR_YS.map((y) => (
          <line key={`My-${y}`} x1="0" y1={y} x2="1600" y2={y} />
        ))}
      </g>

      {/* registration crosses on the 400-unit intersections */}
      <g stroke="var(--parchment)" strokeOpacity="0.4" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {CROSS_AT.flatMap((x) =>
          CROSS_Y.map((y) => (
            <g key={`cross-${x}-${y}`}>
              <line x1={x - 8} y1={y} x2={x + 8} y2={y} />
              <line x1={x} y1={y - 8} x2={x} y2={y + 8} />
            </g>
          )),
        )}
      </g>

      {/* eastings along the top, northings down the left */}
      <g
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--engraved-ink)"
        fillOpacity="0.55"
        textAnchor="middle"
      >
        {MAJOR_XS.map((x, i) => (
          <text key={`e-${x}`} x={x} y="64">
            {EASTINGS[i]}
          </text>
        ))}
        {MAJOR_YS.map((y, i) => (
          <text key={`n-${y}`} x="54" y={y - 8}>
            {NORTHINGS[i]}
          </text>
        ))}
      </g>

      {/* the plane-table arc: radials, ring, degree ticks, center station */}
      <g>
        {ARC_RADIALS.map((a) => {
          const from = polar(A, 46, deg(a))
          const to = polar(A, 298, deg(a))
          return (
            <line
              key={`rad-${a}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--phosphor-dim)"
              strokeOpacity="0.14"
              strokeWidth="0.75"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
        <circle
          cx={A.x}
          cy={A.y}
          r="210"
          fill="none"
          stroke="var(--phosphor-dim)"
          strokeOpacity="0.25"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={A.x}
          cy={A.y}
          r={ARC_R}
          fill="none"
          stroke="var(--phosphor)"
          strokeOpacity="0.5"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
        <g
          stroke="var(--phosphor)"
          strokeOpacity="0.55"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        >
          {ARC_TICKS.map((t, i) => (
            <line key={`tick-${i}`} x1={t.a[0]} y1={t.a[1]} x2={t.b[0]} y2={t.b[1]} />
          ))}
        </g>
        <g
          fontFamily="var(--font-mono)"
          fontSize="10"
          fill="var(--engraved-ink)"
          fillOpacity="0.6"
          textAnchor="middle"
        >
          <text x={A.x} y={A.y - ARC_R - 12}>0°</text>
          <text x={A.x + ARC_R + 14} y={A.y + 3}>90°</text>
        </g>
        <StationMark x={A.x} y={A.y} />
        <text
          x={A.x + 22}
          y={A.y + 28}
          fontFamily="var(--font-mono)"
          fontSize="11"
          fill="var(--engraved-ink)"
          fillOpacity="0.75"
        >
          ST-A
        </text>
      </g>

      {/* the chained baseline: A → ST-04, ticks every 56 units */}
      <g stroke="var(--parchment)" strokeOpacity="0.35" vectorEffect="non-scaling-stroke">
        <line x1={A.x} y1={A.y} x2={BASELINE_TO.x} y2={BASELINE_TO.y} strokeWidth="0.75" />
        <g strokeWidth="1">
          {BASELINE_TICKS.map((t, i) => (
            <line key={`chain-${i}`} x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y} />
          ))}
        </g>
      </g>
      <text
        x="655"
        y="501"
        transform={`rotate(${BASELINE_ANGLE} 655 501)`}
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--engraved-ink)"
        fillOpacity="0.65"
        textAnchor="middle"
      >
        L = 12 440
      </text>

      {/* the triangulation network: the 04–05 baseline draws doubled */}
      <g stroke="var(--phosphor)" vectorEffect="non-scaling-stroke">
        {EDGES.map(([i, j]) => {
          const s = STATIONS[i]!
          const t = STATIONS[j]!
          if (i === 0 && j === 1) return null // baseline draws doubled below
          return (
            <line
              key={`edge-${i}-${j}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              strokeOpacity="0.4"
              strokeWidth="0.75"
            />
          )
        })}
        <g strokeOpacity="0.55" strokeWidth="0.75">
          <line
            x1={STATIONS[0]!.x - 1.9}
            y1={STATIONS[0]!.y - 1.4}
            x2={STATIONS[1]!.x - 1.9}
            y2={STATIONS[1]!.y - 1.4}
          />
          <line
            x1={STATIONS[0]!.x + 1.9}
            y1={STATIONS[0]!.y + 1.4}
            x2={STATIONS[1]!.x + 1.9}
            y2={STATIONS[1]!.y + 1.4}
          />
        </g>
      </g>
      {STATIONS.map((s) => (
        <g key={s.id}>
          <StationMark x={s.x} y={s.y} />
          <text
            x={s.x + 10}
            y={s.y + 16}
            fontFamily="var(--font-mono)"
            fontSize="11"
            fill="var(--engraved-ink)"
            fillOpacity="0.75"
          >
            {s.id}
          </text>
        </g>
      ))}

      {/* sheet block + corner registration */}
      <g
        fontFamily="var(--font-mono)"
        fontSize="11.5"
        fill="var(--engraved-ink)"
        fillOpacity="0.7"
        textAnchor="end"
      >
        <text x="1544" y="806">SHEET 47 · GRATICULE SURVEY</text>
        <text x="1544" y="826">PROJECTION: HOLD CYLINDRICAL</text>
        <text x="1544" y="846">DATUM: ARCHIVE-0 · EPOCH J-2297.4</text>
      </g>
      <g stroke="var(--parchment)" strokeOpacity="0.35" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke">
        <path d="M 26 50 L 26 26 L 50 26" />
        <path d="M 1550 26 L 1574 26 L 1574 50" />
        <path d="M 26 850 L 26 874 L 50 874" />
        <path d="M 1550 874 L 1574 874 L 1574 850" />
      </g>
    </PlateSvg>
  )
}

/** 40px Settings swatch — the sheet's identity: grid, cross, a measured line. */
export function SurveySwatch() {
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
      <g stroke="var(--phosphor-dim)" strokeOpacity="0.35" strokeWidth="0.4">
        {[8, 16, 24, 32].map((x) => (
          <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="40" />
        ))}
        {[8, 16, 24, 32].map((y) => (
          <line key={`y-${y}`} x1="0" y1={y} x2="40" y2={y} />
        ))}
      </g>
      <g stroke="var(--parchment)" strokeOpacity="0.7" strokeWidth="0.8">
        <line x1="11" y1="16" x2="21" y2="16" />
        <line x1="16" y1="11" x2="16" y2="21" />
      </g>
      <line x1="8" y1="32" x2="33" y2="9" stroke="var(--phosphor)" strokeOpacity="0.6" strokeWidth="0.8" />
      <circle cx="8" cy="32" r="1.5" fill="var(--phosphor-bright)" fillOpacity="0.9" />
      <circle cx="33" cy="9" r="1.5" fill="var(--phosphor-bright)" fillOpacity="0.9" />
    </svg>
  )
}
