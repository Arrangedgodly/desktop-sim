/**
 * Taskbar — the drawer rail at the bottom of the hold (IM-4c).
 *
 * Module map:
 *   TaskbarRail.tsx     the rail: launcher pull + open-window LED channel +
 *                       HOLD/OS legend + version chip + timecode well
 *   ModuleLauncher.tsx  the drawer pull + registry-driven module menu
 *   TimecodeWell.tsx    the B612 Mono readout in its recessed well
 *   timecode.ts         the hold's ONE shared clock (single interval, hidden
 *                       pause) — all timecode consumers subscribe here
 *   leds.ts             pure open-window LED derivation (labels, instance
 *                       suffixes, focused/minimized/unavailable states)
 */

export { TaskbarRail } from './TaskbarRail'
export { ModuleLauncher } from './ModuleLauncher'
export { TimecodeWell } from './TimecodeWell'
export { formatTimecode, getTimecode, subscribeTimecode, useTimecode } from './timecode'
export {
  buildWindowLeds,
  ledAriaLabel,
  ledTitle,
  MODULE_UNAVAILABLE_LABEL,
  type AppsSlice,
  type WindowLed,
  type WindowsSlice,
} from './leds'
