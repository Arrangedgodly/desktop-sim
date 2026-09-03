/**
 * Vitals module glyph (federated batch 2) — the launcher/window identity
 * mark: an INSTRUMENT WELL CARRYING A TRACE, drawn in the archive's
 * pictographic vocabulary (same discipline as the fleet's glyphs: 1.5px
 * stroke on a 24 grid, currentColor, no fills, no emoji). It reads as the
 * self-monitoring panel this module is — a recessed display with the
 * machine's pulse running across it:
 *
 *   well frame   — the recessed display (readouts live in wells)
 *   baseline     — the ruled axis the trace rides on
 *   pulse trace  — the live signal: level, one dip, recovery, level
 *   spike tick   — the long-task marker flagging the dip
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function VitalsIcon({ size = 16 }: AppIconProps) {
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
        {/* the recessed display well — the module's whole face */}
        <rect x="4" y="4.5" width="16" height="15" />
        {/* the ruled axis the trace rides on */}
        <line x1="6.5" y1="15.5" x2="17.5" y2="15.5" />
        {/* the machine's pulse: level, dip, recovery, level */}
        <path d="M6.5 12.5 h2.5 l1.5 -4 2 7 1.5 -3 h3" />
        {/* the spike tick — a marked event on the trace */}
        <line x1="10.5" y1="7" x2="10.5" y2="8.5" />
      </g>
    </svg>
  )
}
