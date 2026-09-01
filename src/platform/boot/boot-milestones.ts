/**
 * Boot milestones (UI-2) — TH-1's seam, with the semantics the seam itself
 * deliberately refuses to own ("deduping … belong to UI-2"): React 19 Strict
 * Mode double-invokes effects in dev, and the e2e dev-server runs dev mode,
 * so milestone call sites inside effects must be append-once or the timeline
 * would carry duplicate names. `markBootOnce` is that guard — first call wins,
 * later calls are no-ops.
 *
 * Names (read by tests/e2e/boot.spec.ts and the TH perf pass):
 * - boot-start     orchestrator begins (marked from main.tsx, pre-render)
 * - app-mounted    first React tree committed (main.tsx, kept from HE-1)
 * - post-complete  the POST screen finished — naturally, skipped, or the
 *                  reduced-motion static variant. ABSENT on return visits
 *                  (the boot-flag short-circuit runs no POST at all).
 * - desktop-ready  the desktop surface first rendered (stores hydrated first)
 */

import {
  markBootMilestone,
  readBootTimeline,
  type BootMilestone,
} from '../../lib/perf/boot-timeline'

export const BOOT_START = 'boot-start'
export const POST_COMPLETE = 'post-complete'
export const DESKTOP_READY = 'desktop-ready'

/** Mark a milestone only if no milestone of that name exists yet. */
export function markBootOnce(name: string): BootMilestone | null {
  if (readBootTimeline().some((milestone) => milestone.name === name)) return null
  return markBootMilestone(name)
}
