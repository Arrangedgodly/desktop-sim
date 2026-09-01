/**
 * Boot-timing seam (TH-1) — the one and only place boot milestones get
 * recorded. UI-2 fills this timeline (first-paint, interactive, POST-phase
 * ends…); e2e and the TH perf pass read `window.__BOOT_TIMELINE` afterwards to
 * assert "first load ≤2s to desktop" without any UI of its own.
 *
 * Deliberately dumb: a plain array of { name, t } with t = performance.now()
 * at call time, append-only, ordered by call. No aggregation, no formatting,
 * no swallowing of names — semantics (what "interactive" means, deduping,
 * return-visit shortening) belong to UI-2, not to the seam.
 *
 * The array lives on `window` when the host has one (in a real browser
 * window === globalThis, so this IS window.__BOOT_TIMELINE), else on
 * globalThis (node tests); it is created lazily on first mark, and every
 * access is defensive so a timing seam can never take a boot down.
 */

/** One boot milestone: what happened, and performance.now() when it did. */
export interface BootMilestone {
  readonly name: string
  readonly t: number
  readonly order: number
}

declare global {
  interface Window {
    /** Filled by markBootMilestone (UI-2); read by e2e / perf verification. */
    __BOOT_TIMELINE?: BootMilestone[]
  }
}

type TimelineHost = { __BOOT_TIMELINE?: BootMilestone[] }

/** window when present, else globalThis — one array per host either way. */
function timelineHost(): TimelineHost {
  const windowed = globalThis as { window?: TimelineHost }
  return windowed.window ?? (globalThis as TimelineHost)
}

function timelineArray(): BootMilestone[] {
  const host = timelineHost()
  if (!Array.isArray(host.__BOOT_TIMELINE)) host.__BOOT_TIMELINE = []
  return host.__BOOT_TIMELINE
}

/**
 * Record a milestone ("first-paint", "interactive", …). Returns the stored
 * entry, or null when the clock is unavailable (a broken performance.now must
 * not crash the boot it is measuring).
 */
export function markBootMilestone(name: string): BootMilestone | null {
  try {
    const now = globalThis.performance.now()
    const timeline = timelineArray()
    const milestone: BootMilestone = { name, t: now, order: timeline.length }
    timeline.push(milestone)
    return milestone
  } catch {
    return null
  }
}

/** Snapshot of the timeline so far (defensive copy — callers cannot mutate). */
export function readBootTimeline(): readonly BootMilestone[] {
  const timeline = timelineHost().__BOOT_TIMELINE
  return Array.isArray(timeline) ? [...timeline] : []
}

/** Clear the timeline (test/e2e reset between scenarios). */
export function resetBootTimeline(): void {
  timelineHost().__BOOT_TIMELINE = []
}
