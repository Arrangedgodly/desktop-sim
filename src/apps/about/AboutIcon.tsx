/**
 * About module glyph (AP-5) — the launcher/window identity mark: the BRASS
 * NAMEPLATE itself, drawn in the archive's pictographic vocabulary (same
 * discipline as the fleet's marks: 1.5px stroke on a 24 grid, currentColor,
 * no fills, no emoji). It reads as the commissioning plate this module is —
 * a mounted plate, two setting screws standing proud at the rails, and the
 * engraved lines of name and commission:
 *
 *   the plate   — the brass commissioning plate, hung on the console
 *   the screws  — the setting screws at the left and right rails
 *   the name    — the longer engraved line, the officer's name
 *   the charge  — the shorter engraved line beneath, rank or charge
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function AboutIcon({ size = 16 }: AppIconProps) {
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
        {/* the commissioning plate */}
        <rect x="3.5" y="6.5" width="17" height="11" />
        {/* the setting screws, standing proud at the rails */}
        <circle cx="6.6" cy="12" r="1" />
        <circle cx="17.4" cy="12" r="1" />
        {/* the engraved name — the longer line */}
        <line x1="9.5" y1="10.8" x2="16" y2="10.8" />
        {/* the engraved charge beneath it */}
        <line x1="9.5" y1="13.6" x2="13.5" y2="13.6" />
      </g>
    </svg>
  )
}
