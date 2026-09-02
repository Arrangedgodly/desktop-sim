/**
 * Synth engine (UI-6) — the ONE `playCue(name)` boundary. Everything the
 * console ever sounds goes through here; no other module touches WebAudio.
 *
 * LAWS (committed in plan.md UI-6):
 * - MUTE: `soundsEnabled === false` (the default, AP-4's persisted switch)
 *   makes playCue a no-op BEFORE anything else — no context, no graph, no
 *   stat. Enabling never retro-plays; cues are point events.
 * - LAZY: the AudioContext is created on the FIRST enabled cue, never at
 *   load, and only when the page has sticky user activation
 *   (`navigator.userActivation.hasBeenActive`). Constructing one earlier
 *   would leave it suspended with a console warning — the one autoplay
 *   hostility this module refuses. Cues that arrive without a gesture
 *   (e.g. the boot chime on a reload with sounds armed) are dropped
 *   silently; the next gestured cue builds the context.
 * - ONE shared context for the session, through one master gain (−12 dB).
 * - Reduced motion is a DIFFERENT SENSE: audio never consults it.
 *
 * Storm discipline: a per-cue cooldown (~80 ms) so gesture storms cannot
 * machine-gun one cue, and a hard cap of 2 concurrent cues.
 *
 * Cost when muted: one boolean check per seam event (see wiring.ts) — the
 * subscriptions are the only always-on expense and they are store listeners.
 *
 * Test/e2e seam: `configureAudioEngine({ createContext })` injects a fake
 * context (same class of seam as the e2e store probes — no test-only state
 * ships in the production path beyond these functions, which tree-shake out
 * of the bundle unused); `audioStats()` is the observable counter surface
 * (boot-timeline precedent) that e2e reads through a page-context dynamic
 * import.
 */

import { CUES, cueSpanMs, type CueName } from './palette'
import { useSettingsStore } from '../../platform/stores/settings-store'

/** Master bus gain — ≈ −12 dB; step gains (≤0.3) sit under it. */
const MASTER_GAIN = 0.25
/** Same-cue cooldown so a burst of one gesture class reads as one sound. */
const CUE_COOLDOWN_MS = 80
/** Max cues sounding at once — the console is polite under storms. */
const MAX_CONCURRENT_CUES = 2
/** Envelope attack (ms) — quick, but never a click-step. */
const ATTACK_MS = 4
/** Exponential ramps never reach 0; this is the audible-silence floor. */
const GAIN_FLOOR = 0.0001

/** Observability surface for unit + e2e (counts survive until reset). */
export interface AudioStats {
  readonly contextsCreated: number
  readonly cuesPlayed: number
  readonly cuesDropped: number
  readonly lastCue: CueName | null
}

let context: AudioContext | null = null
let master: GainNode | null = null
let createContext: () => AudioContext = () => new AudioContext()
const lastCueAt = new Map<CueName, number>()
/** End timestamps (ms) of cues still within their span — the voice bus. */
let runningVoices: number[] = []
let stats: AudioStats = { contextsCreated: 0, cuesPlayed: 0, cuesDropped: 0, lastCue: null }

/** Sticky user activation — has the page EVER seen a user gesture? */
function hasStickyActivation(): boolean {
  const activation = (globalThis as { navigator?: { userActivation?: { hasBeenActive?: boolean } } })
    .navigator?.userActivation
  // Unknown API → assume no gesture: the warning-free choice is silence.
  return activation?.hasBeenActive === true
}

function noteDrop(): void {
  stats = { ...stats, cuesDropped: stats.cuesDropped + 1 }
}

/** The shared context, built on first armed use. Null = stay silent. */
function ensureContext(): { context: AudioContext; master: GainNode } | null {
  if (context && context.state !== 'closed' && master) return { context, master }
  if (!hasStickyActivation()) return null
  try {
    context = createContext()
    master = context.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(context.destination)
    stats = { ...stats, contextsCreated: stats.contextsCreated + 1 }
    // Polite unlock: under sticky activation this is already running; if a
    // host still hands us a suspended context, ask once and let it fail quiet.
    if (context.state === 'suspended') void context.resume()?.catch(() => {})
    return { context, master }
  } catch {
    context = null
    master = null
    return null
  }
}

/** Schedule one cue's steps against the shared master. Never throws up. */
function renderCue(ctx: AudioContext, out: GainNode, name: CueName): void {
  const base = ctx.currentTime
  for (const step of CUES[name].steps) {
    const osc = ctx.createOscillator()
    osc.type = step.shape
    const start = base + (step.at ?? 0) / 1000
    const dur = step.d / 1000
    osc.frequency.setValueAtTime(step.f, start)
    if (step.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(step.f2, start + dur)
    const env = ctx.createGain()
    // Gentle envelope: fast attack, exponential decay to the step's end.
    env.gain.setValueAtTime(GAIN_FLOOR, start)
    env.gain.exponentialRampToValueAtTime(step.g, start + ATTACK_MS / 1000)
    env.gain.exponentialRampToValueAtTime(GAIN_FLOOR, start + dur)
    osc.connect(env)
    env.connect(out)
    osc.start(start)
    osc.stop(start + dur + 0.005)
  }
}

/**
 * Play one console cue. The single boundary every seam calls. Respects the
 * mute law, the per-cue cooldown, and the concurrency cap; drops are counted,
 * never thrown.
 */
export function playCue(name: CueName): void {
  // MUTE LAW first: muted means no-op, no context, no stats noise.
  if (!useSettingsStore.getState().soundsEnabled) return

  const now = Date.now()
  const last = lastCueAt.get(name)
  if (last !== undefined && now - last < CUE_COOLDOWN_MS) {
    noteDrop()
    return
  }
  runningVoices = runningVoices.filter((end) => end > now)
  if (runningVoices.length >= MAX_CONCURRENT_CUES) {
    noteDrop()
    return
  }
  const audio = ensureContext()
  if (!audio) {
    noteDrop() // no gesture yet (or the host refused) — silence, not a warning
    return
  }
  lastCueAt.set(name, now)
  runningVoices = [...runningVoices, now + cueSpanMs(CUES[name])]
  stats = { ...stats, cuesPlayed: stats.cuesPlayed + 1, lastCue: name }
  try {
    renderCue(audio.context, audio.master, name)
  } catch {
    // A broken host graph must never crash the gesture that made a sound.
  }
}

/**
 * Close and forget the shared context (the wiring layer calls this when the
 * operator mutes the console): muted = no live audio graph at all. Safe to
 * call repeatedly and when nothing was ever built.
 */
export function shutdownAudio(): void {
  if (context) {
    try {
      void context.close()?.catch(() => {})
    } catch {
      // already closed / hostile host — nothing to release
    }
  }
  context = null
  master = null
  runningVoices = []
}

/** Snapshot of the observable counters (unit tests + e2e read this). */
export function audioStats(): Readonly<AudioStats> {
  return stats
}

/**
 * Embedder/test seam: inject the AudioContext factory (tests pass a fake;
 * production keeps `new AudioContext()`). Byte-tiny and unused in the app
 * graph, so it tree-shakes out of the bundle.
 */
export function configureAudioEngine(options: { createContext?: () => AudioContext }): void {
  if (typeof options.createContext === 'function') createContext = options.createContext
}

/** Full reset for tests: drops the context, cooldowns, voice bus, and stats. */
export function resetAudioEngineForTests(): void {
  shutdownAudio()
  lastCueAt.clear()
  stats = { contextsCreated: 0, cuesPlayed: 0, cuesDropped: 0, lastCue: null }
}
