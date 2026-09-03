/**
 * Relay module glyph — the launcher/window identity mark: SURVEY RELAY, the
 * hold's mail wire, drawn in the archive's pictographic vocabulary (same
 * discipline as the fleet's glyphs: 1.5px stroke on a 24 grid, currentColor,
 * no fills, no emoji). It reads as the module it is — an envelope waiting in
 * the intake tray, its arrival lamp lit at the corner:
 *
 *   envelope body — the letter itself, squared to the tray
 *   flap chevron  — the fold, one stroke
 *   arrival lamp  — the waiting dot (hardware: the world's one circle)
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function RelayIcon({ size = 16 }: AppIconProps) {
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
        {/* the envelope — the waiting letter */}
        <rect x="3.5" y="8" width="17" height="11" />
        {/* the fold's chevron */}
        <path d="M4.5 9.5 L12 15 L19.5 9.5" />
      </g>
      {/* the arrival lamp — a status LED seated above the tray (the only
          circle: hardware, drawn filled like the fleet's lamp dots) */}
      <circle cx="19.5" cy="4.5" r="1.75" fill="currentColor" stroke="none" />
    </svg>
  )
}
