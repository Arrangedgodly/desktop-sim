/**
 * Window manager shell (IM-4a) — window rendering + mounting host over the
 * IM-2 `useWMStore` registry.
 *
 * Layer rules honored from src/platform/stores/index.ts:
 * - each WindowFrame selects its OWN record (`s => s.windows[id]`) and the
 *   focused flag; the host selects `s => s.zOrder` only — the `windows` map is
 *   never selected by any component;
 * - all event handlers go through `useWMStore.getState()` / store actions.
 *
 * Seams left open for the neighbors:
 * - IM-3 apps: `WindowHostProps.contentFor(record) => ReactNode` (omit = placeholder).
 * - IM-4b drag/resize: title bar is the drag surface (`touch-action: none` set);
 *   commit once per gesture via `commitWindowGeometry`, clamp with
 *   `clampGeometryToViewport` (src/platform/wm/geometry.ts).
 * - IM-4c taskbar: list `windows` (minimized included), restore via
 *   `restoreWindow(id)`; minimized frames stay mounted and hidden.
 */
export { WindowFrame } from './WindowFrame'
export type { WindowFrameProps } from './WindowFrame'
export { WindowHost } from './WindowHost'
export type { WindowHostProps } from './WindowHost'
export type { ViewportSize } from './geometry'
