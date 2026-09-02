/**
 * Audio module (UI-6) — WebAudio-synthesized console cues. Committed
 * disposition (plan.md research table): SYNTHESIS ONLY — no samples, no
 * fetched audio assets, zero added network bytes beyond this code. Ships
 * muted (AP-4's persisted `soundsEnabled` switch, default false).
 *
 * Module map:
 *   palette.ts  the cue vocabulary — pure data, palette-law tested
 *   engine.ts   the ONE playCue(name) boundary — lazy AudioContext,
 *               mute law, per-cue cooldown, 2-cue concurrency cap
 *   wiring.ts   attachAudioCues — the subscribe layer over the platform's
 *               existing seams (stores, menu bus, boot milestones); edits
 *               no behavior anywhere
 *
 * LAYERING: the second `src/lib/**` family (after lib/storage) that imports
 * from `src/platform` — the wiring is defined by the store seams it serves,
 * and the dependency stays one-directional (platform never imports audio).
 */

export {
  CUES,
  cueSpanMs,
  MAX_CUE_MS,
  MAX_STEP_GAIN,
  type Cue,
  type CueName,
  type ToneShape,
  type ToneStep,
} from './palette'
export {
  audioStats,
  configureAudioEngine,
  playCue,
  resetAudioEngineForTests,
  shutdownAudio,
  type AudioStats,
} from './engine'
export { attachAudioCues } from './wiring'
