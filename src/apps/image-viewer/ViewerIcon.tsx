/**
 * Viewer module glyph (AP-3) — the launcher/window identity mark: a PLATE ON
 * ITS DISPLAY EASEL, drawn in the archive's pictographic vocabulary (same
 * discipline as the desktop's kind glyphs and the fleet's app marks: 1.5px
 * stroke on a 24 grid, currentColor, no fills, no emoji). Where the desktop's
 * image kind glyph is the plate ITSELF (a filed specimen), this mark is the
 * VIEWING INSTRUMENT — the plate stood up on the archive's display easel:
 *
 *   the plate  — a matted frame with its inner window
 *   the easel  — three legs converging under it, crossbar, feet on the deck
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function ViewerIcon({ size = 16 }: AppIconProps) {
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
        {/* the plate: matted frame with its inner window */}
        <rect x="6" y="3.5" width="12" height="9.5" />
        <rect x="8.5" y="5.75" width="7" height="5.5" />
        {/* the easel: legs converging under the plate, crossbar, deck feet */}
        <path d="M8.25 20.5 L11 13 M15.75 20.5 L13 13 M12 13 V20.5" />
        <path d="M9.7 17.25 H14.3" />
      </g>
    </svg>
  )
}
