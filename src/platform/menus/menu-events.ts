/**
 * Menu event bus (UI-6) — a minimal pub-sub so out-of-module observers (the
 * audio cue wiring) can hear menu life WITHOUT forking menu behavior: the
 * provider and shell each emit ONE line at their existing decision points,
 * and zero listeners means zero cost. UI-5 deliberately shipped no event
 * surface (nothing needed one); this is that seam, kept as small as the bus
 * itself.
 *
 * Events:
 * - 'open'   MenuProvider.openMenu — any surface opening/replacing the menu
 * - 'select' MenuShell row activation — a row the operator actually threw
 *            (including entering a guarded step and its commit row)
 *
 * Listener errors are swallowed (the same discipline as boot-timeline): an
 * observer must never be able to break a menu.
 */

export type ConsoleMenuEvent = 'open' | 'select'

export type MenuEventListener = (event: ConsoleMenuEvent) => void

const listeners = new Set<MenuEventListener>()

/** Emit to every listener; a throwing observer is dropped for THIS event only. */
export function emitMenuEvent(event: ConsoleMenuEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // an observer must never break the menu
    }
  }
}

/** Subscribe; returns the unsubscribe function. */
export function onMenuEvent(listener: MenuEventListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
