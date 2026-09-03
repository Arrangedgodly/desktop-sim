/**
 * Cursor module glyph — the launcher/window identity mark: the hold's BRASS
 * CALCULATING MACHINE, drawn in the archive's pictographic vocabulary (same
 * discipline as the fleet's glyphs: 1.5px stroke on a 24 grid, currentColor,
 * no fills, no emoji). It reads as the machine this module is — a beveled
 * case, one amber readout line in its recessed well, the printed tape
 * feeding up out of the slot, and the equals key at the thumb:
 *
 *   case frame   — the machine's beveled body
 *   readout rule — the well's lit line (the result waiting)
 *   tape ticks   — the ledger tape printing up out of the slot
 *   equals mark  — the brass commit key
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function CursorIcon({ size = 16 }: AppIconProps) {
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
        {/* the machine's case — a beveled instrument body */}
        <rect x="4" y="3.5" width="16" height="17" />
        {/* the readout: one lit line in the case's recessed well */}
        <line x1="7.5" y1="7" x2="16.5" y2="7" />
        {/* the tape printing up out of the slot — newest line longest */}
        <line x1="7.5" y1="11.5" x2="13" y2="11.5" />
        <line x1="7.5" y1="14.5" x2="10.5" y2="14.5" />
        {/* the equals key — the brass commit at the thumb */}
        <line x1="14.5" y1="13" x2="17" y2="13" />
        <line x1="14.5" y1="15.75" x2="17" y2="15.75" />
        {/* the feed slot's seam */}
        <line x1="7.5" y1="17.5" x2="10.5" y2="17.5" />
      </g>
    </svg>
  )
}
