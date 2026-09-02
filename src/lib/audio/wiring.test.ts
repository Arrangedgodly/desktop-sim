import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAudioCues } from './wiring'
import { audioStats, configureAudioEngine, resetAudioEngineForTests } from './engine'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { useWMStore } from '../../platform/stores/wm-store'
import type { WindowRecord } from '../../platform/stores/wm-store'
import { SEED_INITIAL_FS_STATE, useFSStore } from '../../platform/stores/fs-store'
import { moveNode, renameNode, setIconPosition } from '../fs'
import { markBootMilestone, resetBootTimeline } from '../perf/boot-timeline'
import { emitMenuEvent } from '../../platform/menus/menu-events'

/** UI-6 wiring tests — the subscribe layer fires the RIGHT cues off the REAL
 * seams (store actions, the menu bus, the boot milestone seam) without any
 * gesture-code edits. Every cue rides the engine's real path (fake context
 * injected, real settings store), with fake timers so cue spans and cooldowns
 * advance deterministically between actions. */

const initialSettings = useSettingsStore.getState()
const initialWM = useWMStore.getState()

let contextsCreated: number

function fakeContext(): AudioContext {
  return {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => ({
      type: '',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    })),
  } as unknown as AudioContext
}

/** Let every cue span (≤300 ms) + cooldown (80 ms) clear between actions. */
function settle(): void {
  vi.advanceTimersByTime(400)
}

let detach: () => void

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } })
  contextsCreated = 0
  configureAudioEngine({
    createContext: () => {
      contextsCreated++
      return fakeContext()
    },
  })
  resetAudioEngineForTests()
  resetBootTimeline()
  useSettingsStore.setState(initialSettings, true)
  useWMStore.setState(initialWM, true)
  useFSStore.setState({ fs: SEED_INITIAL_FS_STATE })
  detach = attachAudioCues()
})

afterEach(() => {
  detach()
  resetAudioEngineForTests()
  useSettingsStore.setState(initialSettings, true)
  useWMStore.setState(initialWM, true)
  useFSStore.setState({ fs: SEED_INITIAL_FS_STATE })
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('UI-6 wiring · the seams fire cues', () => {
  it('arming the switch sounds the toggle; muting is silence + shutdown', () => {
    useSettingsStore.getState().setSoundsEnabled(true)
    expect(audioStats().lastCue).toBe('toggle')
    expect(contextsCreated).toBe(1)

    settle()
    useSettingsStore.getState().setSoundsEnabled(false)
    settle()
    // No cue for muting (silence IS the feedback) and no further context.
    expect(audioStats().cuesPlayed).toBe(1)
    expect(contextsCreated).toBe(1)
  })

  it('window open / close / minimize through the REAL wm-store actions', () => {
    useSettingsStore.getState().setSoundsEnabled(true)
    settle()

    const id = useWMStore.getState().openWindow({ appId: 'demo' })
    expect(audioStats().lastCue).toBe('window-open')

    settle()
    useWMStore.getState().minimizeWindow(id)
    expect(audioStats().lastCue).toBe('minimize')

    settle()
    useWMStore.getState().closeWindow(id)
    expect(audioStats().lastCue).toBe('window-close')
    expect(audioStats().cuesPlayed).toBe(4) // toggle + the three window cues
    expect(contextsCreated).toBe(1) // one shared context the whole way
  })

  it('focus/raise/restore carry no cue — the console is not a slot machine', () => {
    useSettingsStore.getState().setSoundsEnabled(true)
    settle()
    const id = useWMStore.getState().openWindow({ appId: 'demo' })
    settle()
    const before = audioStats().cuesPlayed

    useWMStore.getState().focusWindow(id)
    useWMStore.getState().raiseWindow(id)
    useWMStore.getState().restoreWindow(id)
    useWMStore.getState().toggleMaximize(id)
    expect(audioStats().cuesPlayed).toBe(before)
  })

  it('bulk WM reseats (hydrate / reset rehydrate) stay silent', () => {
    useSettingsStore.getState().setSoundsEnabled(true)
    settle()
    const one = useWMStore.getState().openWindow({ appId: 'demo' })
    useWMStore.getState().openWindow({ appId: 'demo' })
    settle()
    const before = audioStats().cuesPlayed

    const records: readonly WindowRecord[] = Object.values(useWMStore.getState().windows)
    useWMStore.getState().hydrate({ windows: records }) // bulk replace
    expect(audioStats().cuesPlayed).toBe(before)

    // And a reset-shaped reseat: everything gone in one stroke, then one
    // console relight — only the relight is an operator action.
    useWMStore.getState().hydrate({ windows: [] })
    expect(audioStats().cuesPlayed).toBe(before)
    void one
  })

  it('drop-on-folder fires on IM-5\'s atomic moveNode commit — and only that shape', () => {
    useSettingsStore.getState().setSoundsEnabled(true)
    settle()

    const fs = useFSStore.getState().fs
    // The exact IM-5 commit: one node filed INTO a drawer.
    useFSStore.getState().commit(moveNode(fs, 'charter', 'projects'))
    expect(audioStats().lastCue).toBe('drop-on-folder')

    settle()
    // Renames and repositions are not filings.
    useFSStore.getState().commit(renameNode(useFSStore.getState().fs, 'charter', 'charter-ii'))
    expect(audioStats().lastCue).toBe('drop-on-folder') // unchanged
    useFSStore.getState().commit(setIconPosition(useFSStore.getState().fs, 'charter', { x: 3, y: 1 }))
    expect(audioStats().lastCue).toBe('drop-on-folder')

    settle()
    // A reseed's root-ward reseat (charter returns to the desktop) is NOT a filing.
    useFSStore.getState().init(SEED_INITIAL_FS_STATE)
    expect(audioStats().lastCue).toBe('drop-on-folder')
    expect(audioStats().cuesPlayed).toBe(2) // toggle + the one filing
  })

  it('menu bus events sound the tick and the tock', () => {
    useSettingsStore.getState().setSoundsEnabled(true)
    settle()

    emitMenuEvent('open')
    expect(audioStats().lastCue).toBe('menu-open')

    settle()
    emitMenuEvent('select')
    expect(audioStats().lastCue).toBe('menu-select')
  })

  it('the boot milestone seam sounds the chime at desktop-ready only', () => {
    useSettingsStore.getState().setSoundsEnabled(true)
    settle()

    markBootMilestone('taskbar-ready')
    expect(audioStats().cuesPlayed).toBe(1) // just the arming toggle

    markBootMilestone('desktop-ready')
    expect(audioStats().lastCue).toBe('boot-complete')
    expect(audioStats().cuesPlayed).toBe(2)
  })
})

describe('UI-6 wiring · mute law at the seam level', () => {
  it('muted by default: full seam activity, ZERO contexts and ZERO cues', () => {
    const id = useWMStore.getState().openWindow({ appId: 'demo' })
    useWMStore.getState().minimizeWindow(id)
    useWMStore.getState().closeWindow(id)
    emitMenuEvent('open')
    emitMenuEvent('select')
    useFSStore.getState().commit(moveNode(useFSStore.getState().fs, 'charter', 'projects'))
    markBootMilestone('desktop-ready')

    expect(contextsCreated).toBe(0)
    expect(audioStats().cuesPlayed).toBe(0)
    expect(audioStats().contextsCreated).toBe(0)
  })
})

describe('UI-6 wiring · attach discipline', () => {
  it('attach is idempotent — one detach retires the whole set', () => {
    const secondDetach = attachAudioCues()
    useSettingsStore.getState().setSoundsEnabled(true)
    expect(audioStats().cuesPlayed).toBe(1) // exactly one toggle, not two

    settle()
    detach()
    secondDetach() // the no-op from the guarded re-attach
    useWMStore.getState().openWindow({ appId: 'demo' })
    useFSStore.getState().commit(moveNode(useFSStore.getState().fs, 'charter', 'projects'))
    expect(audioStats().cuesPlayed).toBe(1) // nothing fires detached
  })

  it('re-attaching after a detach wires the seams again', () => {
    detach()
    useSettingsStore.getState().setSoundsEnabled(true)
    expect(audioStats().cuesPlayed).toBe(0)

    detach = attachAudioCues()
    settle()
    useWMStore.getState().openWindow({ appId: 'demo' })
    expect(audioStats().lastCue).toBe('window-open')
  })
})
