/**
 * Notepad module glyph (AP-2) — the launcher/window identity mark: a CATALOG
 * LABEL SHEET under accession, drawn in the archive's pictographic vocabulary
 * (same discipline as the desktop's kind glyphs and the explorer's drawer
 * module: 1.5px stroke on a 24 grid, currentColor, no fills, no emoji). It
 * reads as the parchment specimen label this module edits — sheet, header rule
 * for the engraved name, ruled entry lines for the body, corner tick for the
 * accession stamp:
 *
 *   sheet frame  — the parchment label card
 *   header rule  — the engraved name band
 *   entry rules  — the ledger body being written
 *   corner tick   — the accession stamp corner
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function NotepadIcon({ size = 16 }: AppIconProps) {
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
        {/* the parchment sheet */}
        <rect x="5" y="3.5" width="14" height="17" />
        {/* the engraved name band, ruled off from the body */}
        <line x1="8" y1="7.5" x2="16" y2="7.5" />
        {/* the ledger body: two ruled entry lines, the second one being written */}
        <line x1="8" y1="11.5" x2="16" y2="11.5" />
        <line x1="8" y1="15" x2="13" y2="15" />
        {/* the accession stamp corner tick */}
        <path d="M13.5 17.5 h3 v3" />
      </g>
    </svg>
  )
}
