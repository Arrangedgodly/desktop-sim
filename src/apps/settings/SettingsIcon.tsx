/**
 * Settings module glyph (AP-4) — the launcher/window identity mark: the
 * SWITCH-GEAR itself, drawn in the archive's pictographic vocabulary (same
 * discipline as the fleet's marks: 1.5px stroke on a 24 grid, currentColor,
 * no fills, no emoji). The design brief's law for this module is "Settings
 * uses hardware toggle switches" — so the mark IS one, thrown:
 *
 *   the body  — the switch's raised housing
 *   the lamp  — the phosphor state lamp seated at the body's left end
 *   the bat   — the brass lever, stood proud of the body at the right
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function SettingsIcon({ size = 16 }: AppIconProps) {
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
        {/* the housing */}
        <rect x="3.5" y="10" width="17" height="6.5" />
        {/* the phosphor state lamp, seated in the left end */}
        <circle cx="6.75" cy="13.25" r="1" />
        {/* the lever, thrown: stem standing proud of the body, bat on top */}
        <path d="M15.75 13 V6.75" />
        <rect x="13.9" y="3.5" width="3.7" height="3.5" />
      </g>
    </svg>
  )
}
