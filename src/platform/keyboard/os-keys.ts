/**
 * OS keyboard map (DD-1) — the document-level half of the console's keyboard
 * story. docs/KEYBOARD.md is the user-facing map; this module implements the
 * two chords that belong to the OS rather than to any surface:
 *
 *   F6 / Shift+F6  — cycle the focus zones desktop → taskbar → window
 *                     (Shift walks the ring backwards; a zone with nothing to
 *                     focus — no open window — is skipped, not a dead stop)
 *   Alt+Esc / Alt+Shift+Esc — walk the window stack: focus the next window
 *                     DOWN the z-order (Alt+Shift+Esc: up). Focusing raises
 *                     and restores, so a stowed window the walk lands on is
 *                     brought back.
 *
 * Two laws govern these chords (the map's input-field law, docs/KEYBOARD.md):
 *   1. TYPING KEYS ARE THE FIELD'S — arrows, Enter, Esc inside an input,
 *      textarea, or contentEditable never trigger OS behavior (the frame's
 *      Esc-close and the desktop's arrows carry that guard themselves). The
 *      OS chords here are NON-TYPING keys (F6, Alt+Esc) — global by design,
 *      they fire from anywhere, a sheet included, like a real OS's global
 *      shortcuts.
 *   2. MENUS OWN THEIR KEYS — while focus sits inside an open menu (the UI-5
 *      shell or the taskbar module drawer), the OS chords stand down; menus
 *      are Esc-closed surfaces with their own traversal.
 *
 * Esc-CLOSE is deliberately NOT here: it lives on the window frame
 * (WindowFrame) so an app's own Escape handling (the notepad's dirty guard)
 * can claim the key first by stopping propagation — apps keep precedence.
 *
 * One focus-decency rule rides along: when the LAST window closes and its
 * unmount took focus with it (activeElement falls to <body>), focus is
 * re-seated on the hold's ground — the keyboard operator is never stranded
 * on the document body.
 */

import { useWMStore } from '../stores/wm-store'

/** The law-1 guard: true when the target is a text-entry element. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  )
}

/** The law-2 guard: true while focus sits inside an open menu surface. */
export function isInsideMenu(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[data-menu-root], [data-launcher-menu]') !== null
  )
}

/** The three F6 zones, in cycle order. */
export type FocusZone = 'desktop' | 'taskbar' | 'window'

const ZONE_CYCLE: readonly FocusZone[] = ['desktop', 'taskbar', 'window']

/**
 * Which zone an element belongs to. Anything outside the taskbar and the
 * window host — the stage, the ground, the document body — is the desktop
 * zone (where the cycle starts).
 */
export function resolveFocusZone(element: Element | null): FocusZone {
  if (!element) return 'desktop'
  if (element.closest('[data-taskbar]')) return 'taskbar'
  if (element.closest('[data-wm-host]')) return 'window'
  return 'desktop'
}

/** The desktop zone's seat: the tabbable icon, else the (focusable) field. */
function desktopZoneTarget(): HTMLElement | null {
  const field = document.querySelector<HTMLElement>('[data-icon-field]')
  if (!field) return null
  const tabbableIcon = field.querySelector<HTMLElement>('[data-specimen-id][tabindex="0"]')
  return tabbableIcon ?? field
}

/** The taskbar zone's seat: the rail's roving tab stop (pull, else an LED). */
function taskbarZoneTarget(): HTMLElement | null {
  const rail = document.querySelector<HTMLElement>('[data-taskbar]')
  if (!rail) return null
  const stop = rail.querySelector<HTMLElement>('.tb-pull[tabindex="0"], .tb-led[tabindex="0"]')
  return stop ?? rail.querySelector<HTMLElement>('.tb-pull')
}

/** The window zone's seat: the focused window's frame (topmost fallback). */
function windowZoneTarget(): HTMLElement | null {
  const focused = document.querySelector<HTMLElement>('.wm-window[data-focused="true"]')
  if (focused) return focused
  const windows = document.querySelectorAll<HTMLElement>('.wm-window:not([data-minimized="true"])')
  return windows.length > 0 ? windows[windows.length - 1]! : null // host renders top-most last
}

function zoneTarget(zone: FocusZone): HTMLElement | null {
  switch (zone) {
    case 'desktop':
      return desktopZoneTarget()
    case 'taskbar':
      return taskbarZoneTarget()
    case 'window':
      return windowZoneTarget()
  }
}

/** F6 (Shift reverses): walk the zone ring to the next zone that has a seat. */
function cycleZones(event: KeyboardEvent): void {
  const active = document.activeElement
  if (isInsideMenu(active)) return // law 2 — menus own their keys
  // Law 1 deliberately does NOT apply: F6 is a non-typing global chord; it
  // fires from a sheet too (the OS pane-cycling convention).
  const current = resolveFocusZone(active instanceof Element ? active : null)
  const step = event.shiftKey ? -1 : 1
  const at = ZONE_CYCLE.indexOf(current)
  for (let hop = 1; hop <= ZONE_CYCLE.length; hop++) {
    const zone = ZONE_CYCLE[(at + step * hop + ZONE_CYCLE.length * hop) % ZONE_CYCLE.length]!
    const target = zoneTarget(zone)
    if (target && target !== active) {
      event.preventDefault() // ours — the browser's own pane cycling stands down
      target.focus()
      return
    }
  }
}

/** Alt+Esc (Shift reverses): walk the window stack, focus (raise/restore). */
function cycleWindows(event: KeyboardEvent): void {
  if (isInsideMenu(event.target)) return // law 2 — menus own their keys
  // Law 1 deliberately does NOT apply: Alt+Esc is a non-typing global chord
  // (surfaces with their own Escape handling ignore modifier chords — see the
  // notepad's guard — so the walk is the only thing this key does).
  const wm = useWMStore.getState()
  const ids = wm.zOrder
  if (ids.length < 2) return // one window (or none): the walk has nowhere to go
  const current = wm.focusedId ?? ids[ids.length - 1]!
  const at = ids.indexOf(current)
  if (at < 0) return
  // Down the stack wraps through the bottom back to the top; Shift walks up.
  const step = event.shiftKey ? 1 : -1
  const next = ids[(at + step + ids.length) % ids.length]!
  event.preventDefault()
  wm.focusWindow(next) // raise + focus + restore-if-stowed
}

/**
 * Attach the OS keyboard map for this desktop session (DesktopStage mounts
 * it; the phone notice session never does). Returns the detach function.
 */
export function attachOSKeyboard(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey) return // chords with ctrl/meta are not ours
    if (event.key === 'F6') {
      cycleZones(event)
      return
    }
    if (event.key === 'Escape' && event.altKey) {
      cycleWindows(event)
    }
  }
  document.addEventListener('keydown', onKeyDown)

  // Focus decency: the last window's close must not strand focus on <body>.
  const unsubscribeFocus = useWMStore.subscribe(
    (s) => s.focusedId,
    (focused, previous) => {
      if (previous === null || focused !== null) return
      queueMicrotask(() => {
        if (document.activeElement === document.body) {
          document.querySelector<HTMLElement>('[data-icon-field]')?.focus()
        }
      })
    },
  )

  return () => {
    document.removeEventListener('keydown', onKeyDown)
    unsubscribeFocus()
  }
}
