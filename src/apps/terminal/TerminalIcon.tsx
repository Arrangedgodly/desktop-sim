/**
 * Terminal module glyph — the launcher/window identity mark: a PHOSPHOR WELL
 * readout under a beveled console brow, drawn in the archive's pictographic
 * vocabulary (same discipline as the fleet's glyphs: 1.5px stroke on a 24
 * grid, currentColor, no fills, no emoji). It reads as the amber shell this
 * module is — a recessed display with a command line waiting on it:
 *
 *   well frame    — the recessed display (the whole module is the well)
 *   prompt wedge  — the command line's “>” waiting in the well
 *   entry rule    — the line being typed
 *   signal ticks  — the console talking back (two response lines)
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function TerminalIcon({ size = 16 }: AppIconProps) {
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
        {/* the command line: prompt wedge + the entry being typed */}
        <path d="M7.5 9.5 l2 1.75 -2 1.75" />
        <line x1="11" y1="13" x2="15" y2="13" />
        {/* the console talking back */}
        <line x1="7.5" y1="16.5" x2="12.5" y2="16.5" />
      </g>
    </svg>
  )
}
