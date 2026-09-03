/**
 * Type Cabinet module glyph (batch 2) — the launcher/window identity mark: the
 * TYPE CABINET itself, drawn in the archive's pictographic vocabulary (same
 * discipline as the fleet's marks: 1.5px stroke on a 24 grid, currentColor, no
 * fills, no emoji). It reads as the cabinet this module is — a case of type
 * drawers with a standing sort lifted from the top tray:
 *
 *   the case    — the cabinet body, two face seams cutting three drawers
 *   the pulls   — a short brass pull slot centered on each drawer front
 *   the sort    — a cast letter 'A' lifted clear of the top tray, the one
 *                 glyph a type cabinet exists to hold
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function TypeCabinetIcon({ size = 16 }: AppIconProps) {
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
        {/* the standing sort — a cast 'A' lifted clear of the top tray */}
        <path d="M9.75 4.5 L12 1.75 L14.25 4.5" />
        <line x1="10.65" y1="3.55" x2="13.35" y2="3.55" />
        {/* the cabinet body */}
        <rect x="4.5" y="5.5" width="15" height="16" />
        {/* the face seams — three drawers */}
        <line x1="4.5" y1="10.75" x2="19.5" y2="10.75" />
        <line x1="4.5" y1="16" x2="19.5" y2="16" />
        {/* the pull slot on each drawer front */}
        <line x1="10.75" y1="8.1" x2="13.25" y2="8.1" />
        <line x1="10.75" y1="13.35" x2="13.25" y2="13.35" />
        <line x1="10.75" y1="18.6" x2="13.25" y2="18.6" />
      </g>
    </svg>
  )
}
