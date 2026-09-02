/**
 * Explorer module glyph (AP-1) — the launcher/window identity mark: a DRAWER
 * MODULE, drawn in the archive's pictographic vocabulary (the same discipline
 * as the desktop's kind glyphs: 1.5px stroke on a 24 grid, currentColor, no
 * fills, no emoji). It reads as one cabinet with its drawer PULLED OUT — the
 * design brief's "drawer module pulls out" as a single mark:
 *
 *   upper bay  — the closed cabinet front with its label slot
 *   lower front — the drawer pulled proud of the body, face seam, brass pull
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function ExplorerIcon({ size = 16 }: AppIconProps) {
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
        {/* the closed upper bay + its label slot */}
        <rect x="5" y="3.5" width="14" height="5.5" />
        <line x1="8" y1="6.25" x2="13" y2="6.25" />
        {/* the drawer front, pulled proud of the cabinet body */}
        <rect x="3" y="12" width="18" height="8.5" />
        <line x1="3" y1="15.25" x2="21" y2="15.25" />
        {/* the brass pull — same hardware slot as the desktop's drawer glyph */}
        <rect x="9.5" y="17.6" width="5" height="1.75" />
      </g>
    </svg>
  )
}
