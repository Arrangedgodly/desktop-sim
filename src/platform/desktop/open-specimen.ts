/**
 * Desktop open routing (UI-3) — THE DOUBLE-CLICK SEAM, stubbed.
 *
 * This function is the ONE dispatch point for "the visitor opened this
 * catalog node from the desktop". IM-5 replaces its BODY, never its call
 * sites (DesktopSurface's double-click + Enter both land here):
 *
 *   - app-link → REAL today: dispatches through the app-registry
 *     (`openApp` — the only sanctioned window-open path per IM-3), carrying
 *     the IM-3 file-launch context so the app knows why it exists.
 *   - folder / text / image → console placeholder until IM-5:
 *     folder routes to the File explorer (AP-1), text/image route to their
 *     owning app via manifest `acceptedFileTypes`. Nothing owns them yet, so
 *     the stub logs honestly and touches nothing.
 */

import { openApp } from '../app-registry'
import type { FSNode } from '../../lib/fs'

/** Open a catalog node from the desktop. See module comment for the IM-5 seam. */
export function openSpecimen(node: FSNode): void {
  if (node.kind === 'app-link') {
    openApp(node.appId, { source: 'file', file: node })
    return
  }
  // IM-5 SEAM — real routing lands there:
  //   folder → openApp('explorer', { source: 'file', file: node })
  //   text/image → listApps().find(app => app.acceptedFileTypes?.includes(node.kind))
  console.info(
    '[desktop] open stub — %s %s (%s); interactions land with IM-5',
    node.accession,
    node.name,
    node.kind,
  )
}
