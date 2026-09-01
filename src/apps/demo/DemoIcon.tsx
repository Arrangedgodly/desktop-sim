import type { AppIconProps } from '../../platform/app-registry'

/**
 * Demo app glyph (IM-3 reference example). Render-only: takes `size`, touches
 * no stores. A bracketed specimen plate mark in placeholder chrome colors.
 */
export function DemoIcon({ size = 16 }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" />
      <path d="M4.5 11.5 L6.5 4.5 L9.5 4.5 L11.5 11.5" fill="none" stroke="currentColor" />
      <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeDasharray="1 2" />
    </svg>
  )
}
