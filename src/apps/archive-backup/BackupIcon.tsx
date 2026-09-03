/**
 * Archive Backup module glyph (batch-2 brief 10) — the launcher/window
 * identity mark, drawn in the archive's pictographic vocabulary (same
 * discipline as the fleet: 1.5px stroke on a 24 grid, currentColor, no
 * fills, no emoji). It reads as the vault transfer case this module works:
 * the specimen case with its ruled lid seam, and the arrow carrying the
 * whole archive down into it — export and import are the one gesture:
 *
 *   case frame  — the transfer case (the whole living archive fits)
 *   lid seam    — the vault door's rule, engraved across the top
 *   arrow       — the archive passing through the door, both directions
 *
 * Render-only: no stores, no side effects (the contract's icon law).
 */

import type { AppIconProps } from '../../platform/app-registry'

export function BackupIcon({ size = 16 }: AppIconProps) {
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
        {/* the transfer case */}
        <rect x="4" y="3.5" width="16" height="17" />
        {/* the vault door's ruled seam */}
        <line x1="4" y1="8.5" x2="20" y2="8.5" />
        {/* the archive passing through the door */}
        <line x1="12" y1="10.5" x2="12" y2="16.5" />
        <path d="M9.5 14 L12 16.5 L14.5 14" />
      </g>
    </svg>
  )
}
