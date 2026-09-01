import { useEffect } from 'react'
import { useAppRegistryStore } from '../app-registry'
import { useWMStore } from '../stores/wm-store'
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

  useEffect(() => {
    markBootOnce(TASKBAR_READY)
  }, [])

  return (
    <footer className="tb-rail" data-taskbar aria-label="Drawer rail">
      <ModuleLauncher />
      <div className="tb-leds" data-window-leds role="group" aria-label="Open modules">
        {leds.map((led) => (
          <WindowLedButton key={led.id} led={led} />
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
function WindowLedButton({ led }: { readonly led: WindowLed }) {
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
