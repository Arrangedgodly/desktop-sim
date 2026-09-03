/**
 * Vivarium module glyph — the launcher/window identity mark: THE TANK, drawn
 * in the archive's pictographic vocabulary (same discipline as the fleet's
 * glyphs: 1.5px stroke on a 24 grid, currentColor, no fills, no emoji):
 *
 *   tank frame   — the specimen tank's glass and base
 *   waterline    — the water's resting level
 *   the minnow   — one small schooling form mid-tank
 *   the mote     — one drifting speck (the tank's dust)
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function VivariumIcon({ size = 16 }: AppIconProps) {
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
        {/* the tank's glass and base */}
        <path d="M4.5 5.5 H19.5 V18.5 H4.5 Z" />
        {/* the waterline */}
        <path d="M4.5 8.5 H19.5" />
        {/* one schooling minnow, nose up-right */}
        <path d="M9 14.5 L12.5 13.2 M12.5 13.2 L14.6 14.6 M12.5 13.2 L14.2 11.6" />
        {/* one drifting mote */}
        <path d="M15.8 16.4 h0.01" />
      </g>
    </svg>
  )
}
