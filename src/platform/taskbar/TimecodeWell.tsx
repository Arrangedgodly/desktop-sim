import { useTimecode } from './timecode'

/**
 * The rail's live timecode readout (IM-4c) — B612 Mono digits inside the
 * recessed display well (the UI-1 `.well` primitive supplies the ground, the
 * amber, the bloom and the tabular numerals; this file adds only the metric).
 * Ticks come from the ONE shared clock (`timecode.ts`) — never a local timer.
 */
export function TimecodeWell() {
  const timecode = useTimecode()
  return (
    <div className="well tb-timecode" data-timecode role="timer" aria-label="Hold timecode">
      <span className="tb-timecode-digits">{timecode}</span>
      <div className="scanlines" aria-hidden="true" />
    </div>
  )
}
