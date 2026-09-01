/**
 * Boot platform (UI-2) — POST power-on self test + persistence wiring.
 *
 * The composition root (src/main.tsx) starts `bootPersistence()` and renders
 * <BootSequence>; everything else here is the machine behind it:
 *
 *   BootSequence.tsx   orchestrator: probe → POST (4 modes) → hydrated desktop
 *   post-machine.ts    the timing machine (typing / hold / skip / complete)
 *   post-lines.ts      real subsystem readings → the amber POST lines
 *   boot-milestones.ts TH-1 timeline marks with UI-2's append-once semantics
 *   os.ts              HOLD/OS name + version (POST banner source)
 *
 * PostController and the timing constants are exported for tests; the app
 * graph only ever imports BootSequence.
 */

export { BootSequence, type BootSequenceProps } from './BootSequence'
export {
  FULL_POST_TIMING,
  PostController,
  RESUME_POST_TIMING,
  STATIC_POST_TIMING,
  postSequenceDurationMs,
  POST_PROBE_SNAPSHOT,
  type PostLine,
  type PostListener,
  type PostControllerOptions,
  type PostPhase,
  type PostSnapshot,
  type PostTiming,
} from './post-machine'
export { buildPostLines, buildResumeLine, type PostSubsystemReport } from './post-lines'
export { BOOT_START, DESKTOP_READY, markBootOnce, POST_COMPLETE } from './boot-milestones'
export { OS_NAME, OS_VERSION } from './os'
