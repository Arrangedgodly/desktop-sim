/**
 * Wallplate chassis (UI-4) — the shared mount every archive plate paints on.
 *
 * A plate is ONE static inline-SVG document: wide 16:9 viewBox,
 * `preserveAspectRatio="xMidYMid slice"` so common desktop shapes crop
 * gracefully at the edges (full-bleed print), zero filters, zero animation,
 * zero hooks — a plate renders once per mount and never touches a listener,
 * a timer, or a store. Palette comes exclusively from tokens.css custom
 * properties (the wallplates test greps for stray hex); amber on the dark
 * plates is PLATE INK — printed, flat, never a lit well.
 */

export interface PlateSvgProps {
  readonly children: React.ReactNode
}

/** The plate canvas: fills the wallpaper layer, slices to the viewport. */
export function PlateSvg({ children }: PlateSvgProps) {
  return (
    <svg
      className="wallplate"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true" /* the wallpaper layer already carries aria-hidden */
      focusable="false"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      {children}
    </svg>
  )
}
