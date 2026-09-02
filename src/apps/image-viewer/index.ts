/**
 * Viewer manifest (AP-3) — the PLATE VIEWER, third app on the reserved-id
 * fleet: registers `image-viewer` (app-ids.ts), the id the desktop's
 * double-click routing has targeted since IM-5 (`image → image-viewer`).
 * Until now that route soft-failed by design; with this registration,
 * double-clicking a plate on the hold (or inside a drawer — the explorer
 * consults `acceptedFileTypes`, first declaring registration wins) opens it
 * HERE. The last reserved FILE route is now lit.
 *
 * Instance rule: MULTI-instance with a file launch — the registry derives
 * `instanceId = file:<nodeId>`, so there is ONE WINDOW PER PLATE and opening
 * an already-open plate focuses its window (wm-store dedupe; this app
 * manages none of it — docs/APP-CONTRACT.md "Instance rules"). A launcher
 * open (no file) is a fresh EMPTY STAGE each time: the viewer only ever
 * READS plates, so there is no untitled-draft flow — the stage carries an
 * in-world "no plate mounted" notice until an operator opens one.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes)
 * rides the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * NOTE (registration ORDER): no tiebreak guards this registration — the demo
 * module declares only `text`, so nothing else claims `image` — but the
 * notepad must stay FIRST in src/apps/index.ts (the taskbar launcher's
 * focused-first-item e2e rides its position; the notepad's own comment
 * carries the why).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import { IMAGE_VIEWER_APP_ID, type AppManifest } from '../../platform/app-registry'
import { ViewerIcon } from './ViewerIcon'

const ViewerSurface = retryableLazy(() => import('./ViewerSurface'))

export const viewerApp: AppManifest = {
  id: IMAGE_VIEWER_APP_ID,
  name: 'Plate Viewer',
  icon: ViewerIcon,
  mount: ViewerSurface,
  // singleton omitted → false: one window per plate (file-instance dedupe)
  acceptedFileTypes: ['image'],
  defaultGeometry: { w: 640, h: 520 },
}
