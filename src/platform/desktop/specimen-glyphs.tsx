/**
 * Specimen kind glyphs (UI-3) — the archive's pictographic vocabulary.
 *
 * Authored minimal vector marks, one consistent stroke (1.5px on a 24-unit
 * grid), drawn with `currentColor` so the icon card's state (rest / selected /
 * focus) recolors the whole glyph from one place. NO emoji, no unicode
 * stand-ins — the craft floor's icon rule, and the brief's own vocabulary:
 *
 *   folder   → a DRAWER: cabinet front, face seam, brass pull
 *   text     → a SPECIMEN SHEET: sheet with a folded corner, ruled lines
 *   image    → a PLATE: matted frame, inner window, specimen mark
 *   app-link → a MODULE: rack unit, vent slots, status lamp
 *
 * Render-only: no stores, no side effects; `aria-hidden` at the use site.
 * The kind→glyph table lives in specimen-kinds (this file ships components
 * only, per the react-refresh lint contract).
 */

export interface SpecimenGlyphProps {
  /** Rendered side in CSS px (the card supplies its scale). */
  readonly size?: number
}

/** One glyph's shared drawing discipline. */
const GLYPH_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function GlyphSvg({
  size = 40,
  children,
}: SpecimenGlyphProps & { readonly children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  )
}

/** folder — the drawer: cabinet front, face seam dividing the label slot, brass pull. */
export function DrawerGlyph(props: SpecimenGlyphProps) {
  return (
    <GlyphSvg {...props}>
      <g {...GLYPH_STROKE}>
        <rect x="4" y="5" width="16" height="14" />
        <line x1="4" y1="10" x2="20" y2="10" />
        <line x1="8.5" y1="7.5" x2="15.5" y2="7.5" />
        <rect x="9.5" y="13.5" width="5" height="2.5" />
      </g>
    </GlyphSvg>
  )
}

/** text — the specimen sheet: cut corner, fold, three ruled lines. */
export function SheetGlyph(props: SpecimenGlyphProps) {
  return (
    <GlyphSvg {...props}>
      <g {...GLYPH_STROKE}>
        <path d="M6 3.5h8.5L19 8v12.5H6z" />
        <path d="M14.5 3.5V8H19" />
        <line x1="8.75" y1="11.5" x2="16" y2="11.5" />
        <line x1="8.75" y1="14.5" x2="16" y2="14.5" />
        <line x1="8.75" y1="17.5" x2="13" y2="17.5" />
      </g>
    </GlyphSvg>
  )
}

/** image — the plate: matted frame, inner window, specimen mark + baseline. */
export function PlateGlyph(props: SpecimenGlyphProps) {
  return (
    <GlyphSvg {...props}>
      <g {...GLYPH_STROKE}>
        <rect x="3.5" y="4.5" width="17" height="15" />
        <rect x="6.5" y="7" width="11" height="10" />
        <circle cx="12" cy="11.25" r="1.75" />
        <line x1="9.5" y1="14.75" x2="14.5" y2="14.75" />
      </g>
    </GlyphSvg>
  )
}

/** app-link — the module: rack unit, vent slots, lit lamp. */
export function ModuleGlyph(props: SpecimenGlyphProps) {
  return (
    <GlyphSvg {...props}>
      <g {...GLYPH_STROKE}>
        <rect x="4.5" y="5" width="15" height="14" />
        <line x1="7.5" y1="8.5" x2="13" y2="8.5" />
        <line x1="7.5" y1="11.5" x2="13" y2="11.5" />
        <line x1="7.5" y1="14.5" x2="10.5" y2="14.5" />
      </g>
      <circle cx="15.75" cy="14.5" r="1.25" fill="currentColor" />
    </GlyphSvg>
  )
}
