import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppRegistryStore } from '../app-registry'
import { useWMStore } from '../stores/wm-store'
import { isTextEntryTarget } from '../keyboard'
import { OS_NAME, OS_VERSION } from '../boot/os'
import { TASKBAR_READY, markBootOnce } from '../boot/boot-milestones'
import { buildWindowLeds, ledAriaLabel, ledTitle, type WindowLed } from './leds'
import { ModuleLauncher } from './ModuleLauncher'
import { TimecodeWell } from './TimecodeWell'
import './taskbar.css'

/**
 * Taskbar — the drawer rail at the bottom of the hold (IM-4c). From the left:
 * the brass module-drawer pull (launcher), the open-window LED channel, then
 * the HOLD/OS legend with its version chip and the timecode well.
 *
 * LED click law (dispatch): focused → minimize (toggle); anything else →
 * restore (raise + focus + un-minimize — one store action covers minimized
 * and merely-backgrounded alike).
 *
 * Keyboard map (DD-1; docs/KEYBOARD.md): the rail is ONE toolbar stop —
 * roving tabindex across the pull + the LEDs (the pull is the stop until an
 * arrow lands on an LED). ArrowLeft/ArrowRight walk it, Home/End jump the
 * ends, Enter/Space activate natively (an LED's Enter restores/stows its
 * window). The open module drawer owns its own keys (its arrows are vertical
 * and its Tab walks its rows) — this handler stands down for its targets.
 *
 * Store slices: `windows` + `zOrder` + `focusedId` are the wm-store's own
 * documented IM-4c seam ("list `windows`, minimized included") — the rail is
 * THE list consumer, so it reads the map where WindowFrame reads one record.
 * The map's reference changes only on open/close/flag/one-commit-per-gesture
 * (never mid-gesture — RQ-2), so the rail never re-renders at pointer rate.
 *
 * World law: brass ONLY on the pull (hardware touchpoint); phosphor ONLY in
 * the timecode well and the LED lamps' own recessed wells; no transitions —
 * the rail is furniture, not motion (reduced-motion-safe by construction).
 */
export function TaskbarRail() {
  const windows = useWMStore((s) => s.windows)
  const zOrder = useWMStore((s) => s.zOrder)
  const focusedId = useWMStore((s) => s.focusedId)
  const apps = useAppRegistryStore((s) => s.apps)
  const leds = buildWindowLeds(windows, zOrder, focusedId, apps)
  const railRef = useRef<HTMLElement>(null)
  /** The rail's roving tab stop: an LED id, or null = the pull. */
  const [rovingId, setRovingId] = useState<string | null>(null)

  useEffect(() => {
    markBootOnce(TASKBAR_READY)
  }, [])

  // A closed window takes its LED (and any roving stop on it) with it — the
  // pull becomes the rail's stop again.
  const rovingLed = leds.find((led) => led.id === rovingId) ?? null

  const handleRailKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (isTextEntryTarget(event.target)) return
    const target = event.target as Element
    if (target.closest('[data-launcher-menu]') !== null) return // the drawer owns its keys
    const items = Array.from(
      railRef.current?.querySelectorAll<HTMLElement>('.tb-pull, .tb-led') ?? [],
    )
    if (items.length === 0) return
    const at = items.findIndex((el) => el === document.activeElement)
    if (at < 0) return // focus is not on a rail control (e.g. the footer itself)
    let next: number
    if (event.key === 'ArrowRight') next = (at + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (at - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return
    event.preventDefault()
    setRovingId(items[next]!.getAttribute('data-window-led')) // absent attr = the pull
    items[next]!.focus()
  }

  return (
    <footer
      className="tb-rail"
      data-taskbar
      role="toolbar"
      aria-label="Drawer rail"
      ref={railRef}
      onKeyDown={handleRailKeyDown}
    >
      <ModuleLauncher tabbable={rovingLed === null} />
      <div className="tb-leds" data-window-leds role="group" aria-label="Open modules">
        {leds.map((led) => (
          <WindowLedButton key={led.id} led={led} tabbable={led.id === rovingId} />
        ))}
      </div>
      <div className="tb-plate">
        <span className="engraved tb-os">{OS_NAME}</span>
        <span className="tb-version" data-os-version title={`${OS_NAME} console version`}>
          {OS_VERSION}
        </span>
      </div>
      <TimecodeWell />
    </footer>
  )
}

/**
 * One open-window indicator: a lamp in its own recessed well plus the module
 * label. Lamp states — lit (focused, phosphor), dim (minimized, aged amber),
 * dark (open, unfocused); an unregistered app dims the whole indicator and
 * swaps the label for IM-3's MODULE UNAVAILABLE vocabulary.
 */
function WindowLedButton({
  led,
  tabbable,
}: {
  readonly led: WindowLed
  readonly tabbable: boolean
}) {
  // Handlers use getState() per the store layer rules — never store hooks.
  const activate = (): void => {
    const wm = useWMStore.getState()
    if (led.focused) wm.minimizeWindow(led.id)
    else wm.restoreWindow(led.id) // raise + focus + un-minimize
  }

  return (
    <button
      type="button"
      className="tb-led"
      data-window-led={led.id}
      data-app-id={led.appId}
      data-focused={led.focused}
      data-minimized={led.minimized}
      data-module-unavailable={led.unavailable}
      aria-label={ledAriaLabel(led)}
      title={ledTitle(led)}
      tabIndex={tabbable ? 0 : -1}
      onClick={activate}
    >
      <span
        className="tb-led-lamp"
        data-lit={led.focused}
        data-dim={led.minimized}
        aria-hidden="true"
      />
      <span className="tb-led-name">{led.label}</span>
    </button>
  )
}
