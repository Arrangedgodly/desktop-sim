/**
 * PHYTOGRAPH (UI-4) — "Phytographic Contact Sheet": a botanical contact
 * print, amber-on-dark. The specimen was LAID ON THE PLATE and exposed — so
 * everything is a flat silhouette: one large frond sweeping lower-left to
 * upper-right (the anchor), a seed-pod stem counter-posed in the upper
 * right, two detached leaflets and a burr settling into the open lower
 * right. The exposure ghost under every fourth leaflet (same shape, turned
 * a few degrees, dimmer) is the double-exposure honesty of the process, not
 * decoration. Herbarium tags in B612 + Chakra ride brass pins — label
 * frames are the brief's sanctioned brass touchpoint.
 *
 * Leaflet placement is exact parametric geometry on a fixed rachis curve
 * (plate-math.ts), computed once at module load.
 */

import { PlateSvg } from './PlateSvg'
import { lerp, quadPoint, quadTangent, seededRandom } from './plate-math'

/* -- the frond: paired leaflets along a fixed rachis ------------------------- */

const RACHIS = {
  p0: { x: 140, y: 860 },
  p1: { x: 330, y: 330 },
  p2: { x: 1080, y: 150 },
}

interface Leaflet {
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
  readonly angle: number
  readonly ghost: boolean
}

function buildLeaflets(): readonly Leaflet[] {
  const rand = seededRandom(114) // PHY-0114, the frond's own tag number
  const leaflets: Leaflet[] = []
  const pairs = 15
  for (let k = 0; k < pairs; k++) {
    const t = 0.06 + (k / (pairs - 1)) * 0.88
    const base = quadPoint(RACHIS.p0, RACHIS.p1, RACHIS.p2, t)
    const tangent = quadTangent(RACHIS.p0, RACHIS.p1, RACHIS.p2, t)
    const jitter = 0.9 + rand() * 0.2
    const len = lerp(196, 44, t) * jitter
    for (const side of [1, -1]) {
      const angle = tangent + side * 1.02 // ≈58° off the rachis, swept back
      const cx = base.x + Math.cos(angle) * (len / 2)
      const cy = base.y + Math.sin(angle) * (len / 2)
      leaflets.push({
        cx: Math.round(cx * 10) / 10,
        cy: Math.round(cy * 10) / 10,
        rx: Math.round((len / 2) * 100) / 100,
        ry: Math.round(len * 0.077 * 100) / 100,
        angle: Math.round((angle * 180) / Math.PI * 10) / 10,
        ghost: k % 4 === 0,
      })
    }
  }
  return leaflets
}

const LEAFLETS = buildLeaflets()

/* -- the pod stem: four siliques hanging off a fixed curve ------------------- */

const POD_STEM = {
  p0: { x: 1560, y: 60 },
  p1: { x: 1452, y: 116 },
  p2: { x: 1420, y: 300 },
}
const POD_TS = [0.22, 0.42, 0.62, 0.8] as const

interface Pod {
  readonly x: number
  readonly y: number
  readonly angle: number
}

function buildPods(): readonly Pod[] {
  return POD_TS.map((t) => {
    const p = quadPoint(POD_STEM.p0, POD_STEM.p1, POD_STEM.p2, t)
    return {
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      angle: Math.round(((quadTangent(POD_STEM.p0, POD_STEM.p1, POD_STEM.p2, t) * 180) / Math.PI + 90) * 10) / 10,
    }
  })
}

const PODS = buildPods()

/** Spore drift off the frond tip, fading as it goes. */
const SPORES = [
  { x: 1130, y: 160, r: 2.4, o: 0.58 },
  { x: 1190, y: 140, r: 2.0, o: 0.5 },
  { x: 1250, y: 124, r: 1.7, o: 0.42 },
  { x: 1310, y: 110, r: 1.4, o: 0.35 },
  { x: 1368, y: 96, r: 1.1, o: 0.28 },
] as const

/* -- the plate --------------------------------------------------------------- */

export function PhytographPlate() {
  return (
    <PlateSvg>
      <defs>
        <radialGradient id="ph-bed" cx="34%" cy="72%" r="90%">
          <stop offset="0%" stopColor="var(--phosphor-bright)" stopOpacity="0.045" />
          <stop offset="55%" stopColor="var(--chrome-ground)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--chrome-sunken)" stopOpacity="0.5" />
        </radialGradient>
      </defs>

      {/* the dark ground, lifting faintly under the specimen */}
      <rect x="0" y="0" width="1600" height="900" fill="var(--chrome-ground)" />
      <rect x="0" y="0" width="1600" height="900" fill="url(#ph-bed)" />

      {/* the frond: exposure ghosts beneath, silhouettes above, rachis over */}
      <g>
        {LEAFLETS.filter((l) => l.ghost).map((l, i) => (
          <ellipse
            key={`ghost-${i}`}
            cx={l.cx}
            cy={l.cy}
            rx={l.rx * 1.05}
            ry={l.ry}
            transform={`rotate(${l.angle + 7} ${l.cx} ${l.cy})`}
            fill="var(--phosphor-dim)"
            fillOpacity="0.18"
          />
        ))}
        {LEAFLETS.map((l, i) => (
          <ellipse
            key={`leaf-${i}`}
            cx={l.cx}
            cy={l.cy}
            rx={l.rx}
            ry={l.ry}
            transform={`rotate(${l.angle} ${l.cx} ${l.cy})`}
            fill="var(--phosphor-dim)"
            fillOpacity="0.44"
          />
        ))}
        <path
          d={`M ${RACHIS.p0.x} ${RACHIS.p0.y} Q ${RACHIS.p1.x} ${RACHIS.p1.y} ${RACHIS.p2.x} ${RACHIS.p2.y}`}
          fill="none"
          stroke="var(--phosphor-dim)"
          strokeOpacity="0.8"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <line
          x1={RACHIS.p2.x}
          y1={RACHIS.p2.y}
          x2="1180"
          y2="130"
          stroke="var(--phosphor-dim)"
          strokeOpacity="0.6"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </g>

      {/* the pod stem: siliques as ribbed silhouettes */}
      <g>
        <path
          d={`M ${POD_STEM.p0.x} ${POD_STEM.p0.y} Q ${POD_STEM.p1.x} ${POD_STEM.p1.y} ${POD_STEM.p2.x} ${POD_STEM.p2.y}`}
          fill="none"
          stroke="var(--phosphor-dim)"
          strokeOpacity="0.6"
          strokeWidth="1.75"
        />
        {PODS.map((p) => (
          <g key={`pod-${p.x}`} transform={`translate(${p.x} ${p.y}) rotate(${p.angle})`}>
            <line x1="0" y1="-40" x2="0" y2="-27" stroke="var(--phosphor-dim)" strokeOpacity="0.6" strokeWidth="1.25" />
            <ellipse cx="0" cy="0" rx="15" ry="27" fill="var(--phosphor)" fillOpacity="0.26" stroke="var(--phosphor-dim)" strokeOpacity="0.5" strokeWidth="1" />
            <line x1="-6" y1="-20" x2="-6" y2="20" stroke="var(--phosphor-dim)" strokeOpacity="0.3" strokeWidth="0.9" />
            <line x1="0" y1="-23" x2="0" y2="23" stroke="var(--phosphor-dim)" strokeOpacity="0.3" strokeWidth="0.9" />
            <line x1="6" y1="-20" x2="6" y2="20" stroke="var(--phosphor-dim)" strokeOpacity="0.3" strokeWidth="0.9" />
          </g>
        ))}
      </g>

      {/* detached specimens settling into the open lower right */}
      <g>
        <ellipse
          cx="1180"
          cy="700"
          rx="60"
          ry="9.5"
          transform="rotate(-28 1180 700)"
          fill="var(--phosphor-dim)"
          fillOpacity="0.36"
        />
        <ellipse
          cx="1292"
          cy="792"
          rx="42"
          ry="7"
          transform="rotate(12 1292 792)"
          fill="var(--phosphor-dim)"
          fillOpacity="0.28"
        />
        <g stroke="var(--phosphor-dim)" strokeOpacity="0.4" strokeWidth="1">
          <circle cx="1348" cy="634" r="5" fill="var(--phosphor-dim)" fillOpacity="0.4" stroke="none" />
          <line x1="1348" y1="625" x2="1348" y2="617" />
          <line x1="1355" y1="629" x2="1361" y2="623" />
          <line x1="1357" y1="638" x2="1364" y2="641" />
          <line x1="1351" y1="644" x2="1353" y2="652" />
          <line x1="1341" y1="629" x2="1335" y2="623" />
          <line x1="1341" y1="639" x2="1334" y2="643" />
        </g>
      </g>

      {/* spore drift off the frond tip */}
      {SPORES.map((s) => (
        <circle key={`spore-${s.x}`} cx={s.x} cy={s.y} r={s.r} fill="var(--parchment)" fillOpacity={s.o} />
      ))}

      {/* herbarium tag 1, pinned beside the frond base */}
      <g transform="translate(300 690) rotate(-4)">
        <rect x="-84" y="-27" width="168" height="54" fill="var(--parchment)" stroke="var(--brass-lo)" strokeWidth="1" />
        <circle cx="-72" cy="-15" r="2.5" fill="none" stroke="var(--brass-lo)" strokeWidth="1" />
        <text x="-62" y="-10" fontFamily="var(--font-mono)" fontSize="14" fill="var(--parchment-ink)">
          PHY-0114
        </text>
        <text x="-72" y="8" fontFamily="var(--font-label)" fontSize="10" letterSpacing="1.5" fill="var(--parchment-ink-dim)">
          MATRICARIA
        </text>
        <text x="-72" y="20" fontFamily="var(--font-label)" fontSize="10" letterSpacing="1.5" fill="var(--parchment-ink-dim)">
          CAUDA-SURVEY
        </text>
      </g>

      {/* herbarium tag 2, pinned under the pods */}
      <g transform="translate(1372 392) rotate(3)">
        <rect x="-75" y="-24" width="150" height="48" fill="var(--parchment)" stroke="var(--brass-lo)" strokeWidth="1" />
        <circle cx="-63" cy="-12" r="2.5" fill="none" stroke="var(--brass-lo)" strokeWidth="1" />
        <text x="-54" y="-7" fontFamily="var(--font-mono)" fontSize="14" fill="var(--parchment-ink)">
          PHY-0117
        </text>
        <text x="-63" y="12" fontFamily="var(--font-label)" fontSize="10" letterSpacing="1.5" fill="var(--parchment-ink-dim)">
          SILIQUE, DWARF
        </text>
      </g>

      {/* corner registration + the exposure annotation */}
      <g stroke="var(--parchment)" strokeOpacity="0.3" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke">
        <path d="M 26 50 L 26 26 L 50 26" />
        <path d="M 1550 26 L 1574 26 L 1574 50" />
        <path d="M 26 850 L 26 874 L 50 874" />
        <path d="M 1550 874 L 1574 874 L 1574 850" />
      </g>
      <text
        x="800"
        y="864"
        fontFamily="var(--font-mono)"
        fontSize="12"
        fill="var(--engraved-ink)"
        fillOpacity="0.6"
        textAnchor="middle"
      >
        PHYTOGRAPHIC CONTACT PLATE · EXPOSURE 3 OF 4 · HOLD ARCHIVE
      </text>
    </PlateSvg>
  )
}

/** 40px Settings swatch — the print's identity: dark ground, amber frond. */
export function PhytographSwatch() {
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
      <path d="M 6 36 Q 12 14 32 6" fill="none" stroke="var(--phosphor-dim)" strokeOpacity="0.8" strokeWidth="1.2" />
      {[
        { x: 8, y: 30, l: 9, a: -60 },
        { x: 10, y: 24, l: 10, a: -115 },
        { x: 13, y: 19, l: 9, a: -62 },
        { x: 16, y: 15, l: 8, a: -118 },
        { x: 20, y: 12, l: 7, a: -66 },
      ].map((e, i) => (
        <ellipse
          key={i}
          cx={e.x}
          cy={e.y}
          rx={e.l}
          ry={e.l * 0.17}
          transform={`rotate(${e.a} ${e.x} ${e.y})`}
          fill="var(--phosphor-dim)"
          fillOpacity="0.46"
        />
      ))}
      <circle cx="33" cy="30" r="2.2" fill="var(--phosphor-dim)" fillOpacity="0.4" />
    </svg>
  )
}
