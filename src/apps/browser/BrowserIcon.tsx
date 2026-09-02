/**
 * Browser module glyph (AP-6) — the launcher/window identity mark: the FIELD
 * ATLAS itself, drawn in the archive's pictographic vocabulary (same
 * discipline as the fleet's marks: 1.5px stroke on a 24 grid, currentColor,
 * no fills, no emoji). It reads as the plate-book this module is — an open
 * atlas page under a handheld LENS, the surveyor's reading glass:
 *
 *   the page    — the atlas leaf, two engraved lines of catalog copy
 *   the lens    — the handheld glass held over the page
 *   the handle  — the lens's grip, angled to the corner
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function BrowserIcon({ size = 16 }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* the atlas leaf — the plate-book page */}
        <rect x="3.5" y="4.5" width="12.5" height="15" />
        {/* engraved lines of catalog copy */}
        <line x1="6.5" y1="8.5" x2="13" y2="8.5" />
        <line x1="6.5" y1="12" x2="13" y2="12" />
        {/* the handheld lens held over the page */}
        <circle cx="15.5" cy="15" r="4" />
        {/* the lens's handle, angled to the corner */}
        <line x1="18.4" y1="17.9" x2="21" y2="20.5" />
      </g>
    </svg>
  )
}
