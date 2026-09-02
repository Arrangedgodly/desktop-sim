/**
 * Explorer manifest (AP-1) — the FIRST app on the reserved-id fleet: it
 * registers `explorer` (app-ids.ts), the id the desktop's double-click
 * routing has targeted since IM-5. Until now that route soft-failed by
 * design; with this registration, double-clicking a drawer on the hold opens
 * the drawer module HERE.
 *
 * Instance rule: MULTI-instance with a file launch — the registry derives
 * `instanceId = file:<folderId>`, so there is ONE WINDOW PER DRAWER and
 * opening an already-open drawer focuses its window (wm-store dedupe; nothing
 * in this app manages it — see docs/APP-CONTRACT.md "Instance rules").
 *
 * `acceptedFileTypes: ['folder']` is the capability declaration other
 * surfaces consult when routing a drawer open; inside its own windows the
 * explorer navigates drawers internally instead (never opens itself).
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (TH-2 budget).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import { EXPLORER_APP_ID, type AppManifest } from '../../platform/app-registry'
import { ExplorerIcon } from './ExplorerIcon'

const ExplorerSurface = retryableLazy(() => import('./ExplorerSurface'))

export const explorerApp: AppManifest = {
  id: EXPLORER_APP_ID,
  name: 'Catalog Explorer',
  icon: ExplorerIcon,
  mount: ExplorerSurface,
  // singleton omitted → false: one window per drawer (file-instance dedupe)
  acceptedFileTypes: ['folder'],
  defaultGeometry: { w: 680, h: 460 },
}
