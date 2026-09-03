/**
 * Cursor manifest (batch 2, brief 4) — the BRASS CALCULATING MACHINE:
 * expression in at the well's input line, the answer printed to a parchment
 * ledger tape. Keyboard-first, instant, honest — a hand-written tokenizer +
 * recursive-descent parser + evaluator under it (cursor-model.ts), NO eval
 * of any kind (the hard rule, grep-tested).
 *
 * Nothing routes FILES into it (no `acceptedFileTypes` — the machine is
 * opened, never "opened onto").
 *
 * Instance rule: SINGLETON — one machine ever; every later open (launcher,
 * taskbar) raises + focuses the existing window via the registry's singleton
 * instance key. The machine's tape (capped at 50 lines) rides the window
 * record's opaque appState, so the ONE window keeps its SAME tape across
 * reloads — session-only persistence, the brief's sanctioned choice.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (the batch's budget).
 *
 * Registration is the INTEGRATOR's one line in src/apps/index.ts (this batch
 * runs ten-at-once; suggested launcher position: after the terminal).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { CursorIcon } from './CursorIcon'

const CursorSurface = retryableLazy(() => import('./CursorSurface'))

export const cursorApp: AppManifest = {
  id: 'cursor',
  name: 'Cursor',
  icon: CursorIcon,
  mount: CursorSurface,
  singleton: true, // ONE machine ever: re-open raises + focuses it
  defaultGeometry: { w: 400, h: 520 }, // a narrow adding machine, tape vertical
}
