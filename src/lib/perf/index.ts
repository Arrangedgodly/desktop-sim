/**
 * TH-1 instrumentation kit — the seams other tasks measure through:
 * - fps/gesture: drag-fps probe (IM-4b, IM-5 acceptance "rAF check during
 *   scripted drag"); measureFps counts rAF intervals, simulatePointerGesture
 *   drives the pointer sequence.
 * - boot-timeline: window.__BOOT_TIMELINE seam UI-2 fills (first-paint,
 *   interactive) and e2e asserts against.
 * - dist-budgets: the accounting behind `npm run perf` (TH-2 gate).
 */
export { computeFps, measureFps } from './fps'
export type { FrameScheduler, FrameTick, FpsSample } from './fps'
export { createPointerEvent, simulatePointerGesture } from './gesture'
export type { GestureOptions, PointerEventType, PointerPoint, PointerSequence } from './gesture'
export { markBootMilestone, readBootTimeline, resetBootTimeline } from './boot-timeline'
export type { BootMilestone } from './boot-timeline'
export { classifyDistFile, DIST_BUDGETS, evaluateDistBudgets } from './dist-budgets'
export type {
  BudgetName,
  BudgetRow,
  DistBudgetReport,
  DistBudgets,
  DistFile,
  DistFileKind,
} from './dist-budgets'
