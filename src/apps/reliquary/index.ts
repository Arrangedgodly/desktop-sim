/**
 * Reliquary manifest (batch 2, worker 8) — the 3D CASE: three procedurally-
 * authored specimens (a faceted crystal, a spiral shell, a bract cluster),
 * each orbitable in a glass case under authored amber light, with engraved
 * label cards. WebGL with ZERO dependencies — the mat4 kit and geometry
 * generators are the portfolio proof (reliquary-math / reliquary-geometry);
 * when the tube cannot light, the case shows the honest degrade: an
 * engraved catalog plate of the same specimen, arrow-key rotated.
 *
 * Instance rule: SINGLETON — one reliquary on the hold; a second open raises
 * the case (the registry's dedupe, nothing managed here).
 *
 * The mount is LAZY: this module (manifest + icon) rides the eager bundle;
 * the surface ships as its own chunk (TH-2 budget).
 *
 * No acceptedFileTypes: the specimens are procedural (nothing opens from the
 * catalog) and no persistence is claimed — camera and selection are
 * session-only (the brief sanctions this explicitly).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { ReliquaryIcon } from './ReliquaryIcon'

const ReliquarySurface = retryableLazy(() => import('./ReliquarySurface'))

export const reliquaryApp: AppManifest = {
  id: 'reliquary',
  name: 'Reliquary',
  icon: ReliquaryIcon,
  mount: ReliquarySurface,
  singleton: true,
  // The vitrine wants room to breathe: case + side catalog, comfortable on
  // the 1024-wide floor without crowding the drawer rail at default cascade.
  defaultGeometry: { w: 860, h: 580 },
}
