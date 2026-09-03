/**
 * Specimen Survey icon (batch 2, brief 5) — the module glyph: a surveyed
 * plot field with one plot PINNED for review (the brass pin) and one
 * specimen already turned up (the burst mark). Render-only, no stores, one
 * stroke weight, `currentColor` so the seat recolors the whole glyph — the
 * fleet's iconography discipline (DESIGN.md "Iconography vocabulary").
 */

import type { AppIconProps } from '../../platform/app-registry'

export function SpecimenSurveyIcon({ size = 16 }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {/* the survey frame */}
      <rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" />
      {/* plot divisions */}
      <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" />
      <line x1="1.5" y1="10.5" x2="14.5" y2="10.5" stroke="currentColor" />
      <line x1="6" y1="1.5" x2="6" y2="14.5" stroke="currentColor" />
      <line x1="10.5" y1="1.5" x2="10.5" y2="14.5" stroke="currentColor" />
      {/* a pin: the plot marked for review (a filled head on a stem) */}
      <circle cx="3.9" cy="3.7" r="1.3" fill="currentColor" />
      <line x1="3.9" y1="5" x2="3.9" y2="5.9" stroke="currentColor" />
      {/* the turned-up specimen: a burst mark in the lower-right plot */}
      <path
        d="M12.5 10.9 L12.5 14.1 M10.9 12.5 L14.1 12.5 M11.4 11.4 L13.6 13.6 M13.6 11.4 L11.4 13.6"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  )
}
