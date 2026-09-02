/**
 * Console cue palette (UI-6) — the in-world sound vocabulary, pure data.
 *
 * Committed disposition (plan.md research table, RQ-4 skipped): WebAudio
 * SYNTHESIS, no audio assets, zero fetched bytes. Every cue is short
 * square/triangle bleeps — CONSOLE HARDWARE, not music: a switch bat
 * clicking home, a drawer thunking into its rails, a chime settling.
 *
 * Palette law (asserted in palette.test.ts):
 * - every step `d` ≤ MAX_CUE_MS and every cue SPAN (latest at+d) ≤ 300 ms;
 * - every step gain ≤ MAX_STEP_GAIN (0.3) — modest by construction, before
 *   the −12 dB master in engine.ts;
 * - shapes are square/triangle only — the brief's hardware register.
 *
 * A step is one oscillator through the shared gentle envelope; `at` offsets
 * steps for double-ticks and chirps, `f2` glides the pitch across the step
 * (the minimize down-chirp, the boot chime's settle).
 */

/** Every cue the console knows. The wiring layer maps seams onto these. */
export type CueName =
  | 'window-open'
  | 'window-close'
  | 'minimize'
  | 'toggle'
  | 'menu-open'
  | 'menu-select'
  | 'drop-on-folder'
  | 'boot-complete'

/** Oscillator register — console hardware, never musical voices. */
export type ToneShape = 'square' | 'triangle'

/** One tone: frequency (with optional glide), duration, gain, start offset. */
export interface ToneStep {
  /** Start frequency in Hz. */
  readonly f: number
  /** Optional end frequency — the pitch glides across the step. */
  readonly f2?: number
  /** Duration in ms (the envelope closes at the step's end). */
  readonly d: number
  readonly shape: ToneShape
  /** Peak linear gain into the master bus (≤ MAX_STEP_GAIN). */
  readonly g: number
  /** Start offset from cue start in ms (default 0). */
  readonly at?: number
}

export interface Cue {
  readonly steps: readonly ToneStep[]
}

/** Palette ceiling for step gains (test-asserted; master is separate). */
export const MAX_STEP_GAIN = 0.3
/** Palette ceiling for cue spans — nothing outstays its gesture. */
export const MAX_CUE_MS = 300

export const CUES: Readonly<Record<CueName, Cue>> = {
  /** Module window seats itself: soft thunk, then a phosphor blip. */
  'window-open': {
    steps: [
      { f: 140, d: 42, shape: 'triangle', g: 0.22 },
      { f: 520, d: 46, shape: 'square', g: 0.16, at: 46 },
    ],
  },
  /** Window closes: a single low blip, lower than its open. */
  'window-close': { steps: [{ f: 280, d: 70, shape: 'square', g: 0.18 }] },
  /** LED stows to the rail: a square down-chirp. */
  minimize: { steps: [{ f: 660, f2: 420, d: 90, shape: 'square', g: 0.15 }] },
  /** Hardware switch throws: the bat clicks home. */
  toggle: { steps: [{ f: 900, d: 18, shape: 'square', g: 0.14 }] },
  /** Menu unfolds: a high tick. */
  'menu-open': { steps: [{ f: 1200, d: 15, shape: 'square', g: 0.12 }] },
  /** Row activates: the tock, lower and longer than the open tick. */
  'menu-select': { steps: [{ f: 760, d: 24, shape: 'square', g: 0.14 }] },
  /** Specimen filed into a drawer: tick… tick. */
  'drop-on-folder': {
    steps: [
      { f: 1000, d: 16, shape: 'square', g: 0.13 },
      { f: 1000, d: 16, shape: 'square', g: 0.13, at: 60 },
    ],
  },
  /** The archive is live: one low chime settling under itself (≤300 ms). */
  'boot-complete': { steps: [{ f: 262, f2: 236, d: 280, shape: 'triangle', g: 0.2 }] },
}

/** Latest offset+d over a cue's steps — how long it occupies the voice bus. */
export function cueSpanMs(cue: Cue): number {
  return cue.steps.reduce((max, step) => Math.max(max, (step.at ?? 0) + step.d), 0)
}
