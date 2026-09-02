/**
 * Viewport gate (UI-7) — the honest degradation seam between the full HOLD/OS
 * desktop and the phone notice card. The brief's operating context fixes the
 * full-experience floor at ~1024px; below it the visitor gets "a styled notice
 * card with the author's links", never a broken layout.
 *
 * MECHANISM (decided per the task brief, documented here as law):
 * gate at BOOT + ONE matchMedia listener that swaps cleanly BOTH ways.
 *
 *   · main.tsx reads `gate.isPhone()` ONCE, before any desktop side effect
 *     (no persistence boot, no audio wiring, no POST) — on a phone the
 *     desktop app never mounts, so no JS timers, listeners, or audio graphs
 *     run beneath the notice. This is a mount gate, not CSS hiding.
 *   · The gate owns exactly ONE `matchMedia('(min-width: 1024px)')`
 *     registration for the page's lifetime. Resize churn costs nothing: the
 *     engine fires `change` ONLY when the query's verdict actually flips
 *     across the 1024px floor (crossing inside one side is invisible), and a
 *     flip is the only time work happens — unmount one tree, mount the other.
 *   · Swapping INTO the notice unmounts the desktop root (every effect
 *     teardown runs: the timecode interval, observers, menu bus); swapping
 *     BACK boots the desktop fresh (a return visit — the boot flag already
 *     wrote, so POST short-circuits, honest as ever).
 *
 * Degradation law: with no `matchMedia` at all (SSR, hostile engine) the gate
 * answers DESKTOP — the product IS the desktop; a wrong-side guess in a
 * matchMedia-less environment is not a visitor we can serve either way.
 */

/** The brief's full-experience floor: viewports at or above this get the desktop. */
export const FULL_EXPERIENCE_FLOOR_PX = 1024

/** The single media query the gate ever registers (desktop-positive). */
export const PHONE_GATE_QUERY = `(min-width: ${FULL_EXPERIENCE_FLOOR_PX}px)`

/**
 * The pure verdict — exported for the boundary tests (1023 / 1024 / 1025).
 * Widths are CSS pixels of the layout viewport (what matchMedia measures).
 */
export function isPhoneViewport(viewportWidth: number): boolean {
  return viewportWidth < FULL_EXPERIENCE_FLOOR_PX
}

/** What the gate needs from a window (the whole point is testability). */
interface MatchMediaSource {
  readonly matchMedia?: (query: string) => MediaQueryList | null
}

export type PhoneListener = (phone: boolean) => void

export interface ViewportGate {
  /** The live verdict (boot-time snapshot plus any flips since). */
  isPhone(): boolean
  /** Fired only when the verdict crosses the floor. Returns an unsubscribe. */
  subscribe(listener: PhoneListener): () => void
  /** Retire the gate: drops listeners and the engine registration. */
  dispose(): void
}

export function createViewportGate(win?: MatchMediaSource): ViewportGate {
  let query: MediaQueryList | null = null
  try {
    const source = win ?? (typeof window === 'undefined' ? undefined : window)
    query = source?.matchMedia?.(PHONE_GATE_QUERY) ?? null
  } catch {
    query = null // a hostile matchMedia reads as absent (desktop default)
  }

  const listeners = new Set<PhoneListener>()
  let phone = query === null ? false : !query.matches

  const onChange = (event: MediaQueryListEvent): void => {
    const next = !event.matches
    if (next === phone) return // same side of the floor — no work, ever
    phone = next
    for (const listener of listeners) listener(phone)
  }

  query?.addEventListener('change', onChange)

  return {
    isPhone: () => phone,
    subscribe(listener: PhoneListener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose(): void {
      listeners.clear()
      query?.removeEventListener('change', onChange)
      query = null
    },
  }
}
