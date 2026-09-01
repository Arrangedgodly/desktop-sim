/**
 * Core store layer (IM-2) — Zustand v5 per the committed RQ-2 decision
 * (docs/ultron/research/rq2-rq3-frontend-arch.md).
 *
 * Three independent stores:
 * - `useWMStore`      open-windows registry, focus/z-order, geometry, transient drag slice
 * - `useFSStore`      thin typed placeholder over the injected FS-state shape (real model: MF-1)
 * - `useSettingsStore` wallpaper / sounds (muted default) / reduced-motion-follow
 *
 * Layer rules (normative for every consumer):
 * 1. Selectors are field-narrow (`s => s.windows[id]?.geometry.x`), never whole maps.
 * 2. Event handlers use `getState()` / store actions, never hooks in hot paths.
 * 3. Dragging is two-phase (RQ-2): ref+transform during the gesture, NO store writes
 *    at pointermove rate (at most the transient `dragging` slice for live observers);
 *    exactly ONE atomic commit at pointerup (`commitWindowGeometry` / `useFSStore.commit`).
 * 4. Persistence seam (MF-2): each store is built with `subscribeWithSelector`, so
 *    MF-2 attaches its debounced persisted-envelope writer via
 *    `useXStore.subscribe(selector, listener)`. This layer exposes that subscription
 *    surface only — writing the envelope is MF-2's job.
 */

export {
  useWMStore,
  cascadedGeometry,
  type DraggingState,
  type OpenWindowInput,
  type WindowGeometry,
  type WindowId,
  type WindowRecord,
  type WMState,
  type AppId,
  type InstanceId,
} from './wm-store'

// The fs-store holds the MF-1 domain model (`src/lib/fs` — import the pure ops,
// the envelope/migration harness, and the seed from THERE; this barrel exposes
// only the store seam itself).
export { SEED_INITIAL_FS_STATE, useFSStore, type FSState, type FSStoreState } from './fs-store'

export { DEFAULT_WALLPAPER, useSettingsStore, type SettingsState } from './settings-store'
