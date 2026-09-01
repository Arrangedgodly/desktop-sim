import { useSyncExternalStore } from 'react'

/**
 * The hold's ONE clock (IM-4c). Every timecode consumer in the OS — the rail's
 * readout today, whatever wants a clock tomorrow — subscribes here; the module
 * owns a SINGLE 1s interval that starts with the first subscriber and stops
 * with the last. One timer for the whole console, never one per component.
 *
 * Visibility law: a hidden document PAUSES the clock — the interval is torn
 * down on `visibilitychange` (hidden) and rebuilt (plus one immediate notify,
 * so consumers wake to a fresh reading) on return. An idle hold tells no time.
 *
 * React seam: `useTimecode` rides `useSyncExternalStore`; the snapshot is a
 * PRIMITIVE string, so equal seconds compare stable and re-renders happen only
 * when a notification actually rolls the readout over.
 */

/** HH:MM:SS, 24-hour, zero-padded — the readout rides B612 Mono (.well enforces). */
export function formatTimecode(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

const TICK_MS = 1000

const listeners = new Set<() => void>()
let intervalId: ReturnType<typeof setInterval> | null = null

function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

function notify(): void {
  for (const listener of listeners) listener()
}

/** Start the shared interval (no-op when already live or the hold is hidden). */
function startTimer(): void {
  if (intervalId !== null || documentHidden()) return
  intervalId = setInterval(notify, TICK_MS)
}

/** Stop the shared interval (no-op when already stopped). */
function stopTimer(): void {
  if (intervalId === null) return
  clearInterval(intervalId)
  intervalId = null
}

function onVisibilityChange(): void {
  if (documentHidden()) {
    stopTimer()
  } else {
    startTimer()
    notify() // wake every consumer straight to a fresh reading
  }
}

/**
 * Subscribe to the shared clock (the `useSyncExternalStore` seam, usable
 * directly). The FIRST subscriber starts the interval + the visibility hook;
 * the LAST unsubscribe stops both.
 */
export function subscribeTimecode(listener: () => void): () => void {
  if (listeners.size === 0 && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  listeners.add(listener)
  startTimer()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopTimer()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  }
}

/** Current reading — computed from the wall clock at call time (cheap, pure). */
export function getTimecode(): string {
  return formatTimecode(new Date())
}

/** The rail readout hook — every consumer shares the ONE interval above. */
export function useTimecode(): string {
  return useSyncExternalStore(subscribeTimecode, getTimecode, getTimecode)
}
