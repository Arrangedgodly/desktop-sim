/**
 * Reliquary module glyph (batch 2, worker 8) — the launcher/window identity
 * mark: a DISPLAY CASE holding a faceted specimen, drawn in the archive's
 * pictographic vocabulary (1.5px stroke on a 24 grid, currentColor, no
 * fills, no emoji). It reads as the vitrine this module mounts — case frame,
 * a crystal's crown + girdle facets inside, and the plinth it stands on:
 *
 *   case frame   — the glass vitrine (open at the top face, like the case)
 *   facet crown  — the specimen's upper pyramid of cut faces
 *   girdle       — the crystal's belt, the widest row of facets
 *   plinth       — the museum base the case stands on
 */

import type { AppIconProps } from '../../platform/app-registry'

export function ReliquaryIcon({ size = 16 }: AppIconProps) {
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
        {/* the glass case: front frame, open top face */}
        <path d="M5 8.5 V19 H19 V8.5" />
        <path d="M5 8.5 L7.5 5.5 H16.5 L19 8.5" />
        {/* the specimen: crown facets above the girdle, pavilion below */}
        <path d="M10 16.5 L12 17.8 L14 16.5 L13 13.2 H11 Z" />
        <path d="M11 13.2 L9.2 11.8 L12 8.8 L14.8 11.8 L13 13.2" />
        {/* the plinth */}
        <line x1="3.5" y1="19" x2="20.5" y2="19" />
      </g>
    </svg>
  )
}
