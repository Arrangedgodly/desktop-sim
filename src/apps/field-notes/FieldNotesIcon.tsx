/**
 * Field Notes module glyph — the reading room's identity mark: an OPEN FOLIO
 * (two ruled pages across a spine), drawn in the archive's pictographic
 * vocabulary (the fleet's discipline: 1.5px stroke on a 24 grid,
 * currentColor, no fills, no emoji). It reads as the module's own subject —
 * a specimen sheet laid open for reading:
 *
 *   page curves — the folio's two leaves opening from the spine
 *   spine        — the sewn center the pages turn on
 *   reading rules — the typeset lines being read, both pages
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function FieldNotesIcon({ size = 16 }: AppIconProps) {
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
        {/* the folio: two pages opening from the spine */}
        <path d="M12 6.2 C10.2 4.9 7.4 4.7 4.8 5.6 V17.6 C7.4 16.7 10.2 16.9 12 18.2 C13.8 16.9 16.6 16.7 19.2 17.6 V5.6 C16.6 4.7 13.8 4.9 12 6.2 Z" />
        {/* the spine the pages turn on */}
        <line x1="12" y1="6.2" x2="12" y2="18.2" />
        {/* the reading rules — the typeset lines on each page */}
        <line x1="7" y1="9.2" x2="10" y2="9.2" />
        <line x1="7" y1="12.2" x2="10" y2="12.2" />
        <line x1="14" y1="9.2" x2="17" y2="9.2" />
        <line x1="14" y1="12.2" x2="17.2" y2="12.2" />
      </g>
    </svg>
  )
}
