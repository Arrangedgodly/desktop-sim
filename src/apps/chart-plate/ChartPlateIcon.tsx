/**
 * Chart Plate module glyph (batch 2, brief 9) — the launcher/window identity
 * mark: an ENGRAVED CHART PLATE, drawn in the archive's pictographic
 * vocabulary (same discipline as the fleet's glyphs: 1.5px stroke on a 24
 * grid, currentColor, no fills, no emoji). It reads as the plate this module
 * cuts — ruled axes, two hatched bars, the surveyor's numbers:
 *
 *   plate frame  — the matted plate itself
 *   ruled axes   — the L of the value scale
 *   hatched bars — engraved data ink (hatching, never solid fill)
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function ChartPlateIcon({ size = 16 }: AppIconProps) {
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
        {/* the plate frame */}
        <rect x="3.5" y="3.5" width="17" height="17" />
        {/* the ruled axes — the L of the value scale */}
        <line x1="7" y1="6" x2="7" y2="17.5" />
        <line x1="7" y1="17.5" x2="18.5" y2="17.5" />
        {/* two engraved bars — hatched data ink */}
        <rect x="9" y="10" width="3" height="7.5" />
        <line x1="9" y1="17.5" x2="12" y2="10" />
        <rect x="13.5" y="7" width="3" height="10.5" />
        <line x1="13.5" y1="17.5" x2="16.5" y2="7" />
      </g>
    </svg>
  )
}
