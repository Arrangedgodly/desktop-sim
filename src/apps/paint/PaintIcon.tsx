/**
 * Paint module glyph — the launcher/window identity mark: a SPECIMEN PLATE
 * under the studio's beam, drawn in the archive's pictographic vocabulary
 * (same discipline as the fleet's glyphs: 1.5px stroke on a 24 grid,
 * currentColor, no fills, no emoji). It reads as the studio this module is —
 * a matted plate with one confident ink stroke crossing it:
 *
 *   plate frame    — the matted specimen plate (the module's whole face)
 *   inner window   — the plate's inner window, where the work lives
 *   the stroke     — one drawn ink mark crossing the plate
 *   corner tick    — the rack-handle bracket (the plate is a held thing)
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function PaintIcon({ size = 16 }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* the matted specimen plate */}
        <rect x="3.5" y="4.5" width="17" height="15" />
        {/* the plate's inner window */}
        <rect x="6" y="7" width="12" height="10" />
        {/* one drawn ink stroke crossing the work */}
        <path d="M8 14.5 C10 9.5, 13.5 13, 16.5 9" />
        {/* the rack-handle corner tick (southeast — the grasp) */}
        <path d="M16.5 19.5 l1.5 0 M20.5 15.5 l0 1.5" />
      </g>
    </svg>
  )
}
