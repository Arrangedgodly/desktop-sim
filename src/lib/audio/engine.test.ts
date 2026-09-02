import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  audioStats,
  configureAudioEngine,
  playCue,
  resetAudioEngineForTests,
  shutdownAudio,
} from './engine'
import { useSettingsStore } from '../../platform/stores/settings-store'

/** UI-6 engine unit tests — the mute law, the lazy-context law, the storm
 * discipline, and the envelope the synth actually schedules. The context is
 * a fake injected through configureAudioEngine (the test seam); the mute
 * check runs against the REAL settings store (no test-only gate). */

// Fake WebAudio graph: records every oscillator/gain the engine schedules.
interface FakeOsc {
  type: string
  frequency: {
    setValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

interface FakeGain {
  gain: {
    value: number
    setValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  connect: ReturnType<typeof vi.fn>
}

function makeFakeContext() {
  const oscillators: FakeOsc[] = []
  const gains: FakeGain[] = []
  const context = {
    currentTime: 10,
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const osc: FakeOsc = {
        type: '',
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      oscillators.push(osc)
      return osc
    }),
    createGain: vi.fn(() => {
      const gain: FakeGain = {
        gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }
      gains.push(gain)
      return gain
    }),
  }
  return {
    context: context as unknown as AudioContext,
    oscillators,
    gains,
  }
}

const initialSettings = useSettingsStore.getState()

let fake: ReturnType<typeof makeFakeContext>
let contextsCreated: number

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } })
  fake = makeFakeContext()
  contextsCreated = 0
  configureAudioEngine({
    createContext: () => {
      contextsCreated++
      return fake.context
    },
  })
  resetAudioEngineForTests()
  useSettingsStore.setState(initialSettings, true)
})

afterEach(() => {
  resetAudioEngineForTests()
  useSettingsStore.setState(initialSettings, true)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function arm(): void {
  useSettingsStore.getState().setSoundsEnabled(true)
}

describe('UI-6 engine · mute law', () => {
  it('muted (the default): playCue is a no-op and NO AudioContext is ever created', () => {
    playCue('window-open')
    playCue('menu-select')
    playCue('boot-complete')
    expect(contextsCreated).toBe(0)
    expect(fake.context.createOscillator).not.toHaveBeenCalled()
    expect(audioStats().cuesPlayed).toBe(0)
    expect(audioStats().lastCue).toBeNull()
  })

  it('arming does not retro-play — only the next cue sounds', () => {
    playCue('toggle') // muted: nothing
    arm() // no cue is owed for the past
    expect(audioStats().cuesPlayed).toBe(0)
    expect(contextsCreated).toBe(0)
  })
})

describe('UI-6 engine · lazy shared context', () => {
  it('creates the context on the FIRST enabled cue, exactly once per session', () => {
    arm()
    playCue('window-open')
    expect(contextsCreated).toBe(1)
    expect(audioStats().contextsCreated).toBe(1)

    vi.advanceTimersByTime(400) // let the first cue's span end (concurrency cap)
    playCue('window-close')
    vi.advanceTimersByTime(400)
    playCue('menu-open')
    expect(contextsCreated).toBe(1) // ONE shared context, reused
    expect(fake.context.createOscillator).toHaveBeenCalledTimes(4) // 2 + 1 + 1 steps
  })

  it('drops the cue silently (no context, no warning path) without sticky activation', () => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: false } })
    arm()
    playCue('toggle')
    expect(contextsCreated).toBe(0)
    expect(audioStats().cuesDropped).toBe(1)
    expect(audioStats().cuesPlayed).toBe(0)
  })

  it('treats an unknown userActivation API as no gesture — silence, not a warning', () => {
    vi.stubGlobal('navigator', {})
    arm()
    playCue('menu-open')
    expect(contextsCreated).toBe(0)
    expect(audioStats().cuesDropped).toBe(1)
  })

  it('shutdownAudio closes the live context; the next armed cue builds a fresh one', () => {
    arm()
    playCue('toggle')
    expect(contextsCreated).toBe(1)
    shutdownAudio()
    expect(fake.context.close).toHaveBeenCalledTimes(1)

    playCue('menu-open')
    expect(contextsCreated).toBe(2)
    expect(audioStats().contextsCreated).toBe(2)
  })
})

describe('UI-6 engine · storm discipline', () => {
  it('a per-cue cooldown drops a machine-gunned cue within ~80 ms', () => {
    arm()
    playCue('menu-select')
    playCue('menu-select')
    playCue('menu-select')
    expect(audioStats().cuesPlayed).toBe(1)
    expect(audioStats().cuesDropped).toBe(2)

    vi.advanceTimersByTime(80) // cooldown elapsed
    playCue('menu-select')
    expect(audioStats().cuesPlayed).toBe(2)
  })

  it('caps concurrency at 2 simultaneous cues, then recovers', () => {
    arm()
    playCue('window-open') // span 92 ms
    playCue('window-close') // span 70 ms
    playCue('toggle') // still inside both spans → over the cap
    expect(audioStats().cuesPlayed).toBe(2)
    expect(audioStats().cuesDropped).toBe(1)

    vi.advanceTimersByTime(400) // every span ended
    playCue('toggle')
    expect(audioStats().cuesPlayed).toBe(3)
  })
})

describe('UI-6 engine · synthesis (what actually gets scheduled)', () => {
  it('routes every voice through one master gain at −12 dB into the destination', () => {
    arm()
    playCue('toggle')
    const master = fake.gains[0]! // the first gain the engine creates is the master
    expect(master.gain.value).toBeCloseTo(0.25) // ≈ −12 dB
    expect(master.connect).toHaveBeenCalledWith(fake.context.destination)
    // Master + one envelope per step — never a per-cue master.
    expect(fake.context.createGain).toHaveBeenCalledTimes(2)
  })

  it('schedules each step with a gentle envelope: fast attack, decay to the end', () => {
    arm()
    playCue('window-close') // single step: 280 Hz square, 70 ms
    const osc = fake.oscillators[0]!
    const env = fake.gains[1]!
    const start = 10 // context.currentTime

    expect(osc.type).toBe('square')
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(280, start)
    expect(env.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, start)
    expect(env.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.18, start + 0.004)
    expect(env.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, start + 0.07)
    expect(osc.start).toHaveBeenCalledWith(start)
    expect(osc.stop).toHaveBeenCalledWith(start + 0.07 + 0.005) // 5 ms tail past the envelope
    expect(osc.connect).toHaveBeenCalledWith(env)
    expect(env.connect).toHaveBeenCalledWith(fake.gains[0])
  })

  it('offsets a double-tick\'s second step and glides a chirp in frequency', () => {
    arm()
    playCue('drop-on-folder') // two ticks, the second at +60 ms
    expect(fake.oscillators).toHaveLength(2)
    expect(fake.oscillators[1]!.start).toHaveBeenCalledWith(10 + 0.06)

    vi.advanceTimersByTime(400)
    playCue('minimize') // one gliding square: 660 → 420 Hz across 90 ms
    const chirp = fake.oscillators[2]!
    expect(chirp.frequency.setValueAtTime).toHaveBeenCalledWith(660, 10)
    expect(chirp.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(420, 10 + 0.09)
  })

  it('survives a hostile context: a throwing graph never crashes the cue caller', () => {
    arm()
    const hostile = makeFakeContext()
    const boom = {
      ...hostile.context,
      createOscillator: () => {
        throw new Error('no oscillators for you')
      },
    } as unknown as AudioContext
    configureAudioEngine({ createContext: () => boom })
    expect(() => playCue('menu-open')).not.toThrow()
    expect(audioStats().cuesPlayed).toBe(1) // the cue counted, the graph forgiven
  })
})

describe('UI-6 engine · stats surface', () => {
  it('counts played cues and names the last one', () => {
    arm()
    playCue('window-open')
    vi.advanceTimersByTime(400)
    playCue('menu-open')
    expect(audioStats().cuesPlayed).toBe(2)
    expect(audioStats().lastCue).toBe('menu-open')
  })
})
