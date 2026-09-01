/**
 * Desktop open routing (IM-5) — THE dispatch point for "the visitor opened
 * this catalog node from the desktop". Double-click and Enter both land here
 * (DesktopSurface); the ROUTING TABLE is this module, resolved by
 * {@link resolveOpenRoute}:
 *
 *   folder    → `explorer`      (AP-1) with a file launch context (the drawer)
 *   text      → `notepad`       (AP-2) with a file launch context (specimen)
 *   image     → `image-viewer`  (AP-3) with a file launch context (the plate)
 *   app-link  → the linked manifest id (`node.appId`)
 *
 * The ids are the RESERVED platform constants (app-registry/app-ids.ts) —
 * shared by name with the apps lane, so AP-1/AP-2/AP-3 registering those ids
 * lights each route up with zero further edits here. Until then `openApp`
 * fails SOFT on an unregistered id (warn + `null`, never a throw): routing is
 * wired once, now, and the fleet arrives into place.
 */

import {
  EXPLORER_APP_ID,
  IMAGE_VIEWER_APP_ID,
  NOTEPAD_APP_ID,
  openApp,
  type FileLaunch,
} from '../app-registry'
import type { AppId } from '../stores/wm-store'
import type { FSNode, FSNodeKind } from '../../lib/fs'

/**
 * Kind → the platform module that owns opening it. `app-link` is excluded: it
 * carries its own target (`node.appId`). Frozen — a route may never drift at
 * runtime.
 */
export const OPEN_ROUTES: Readonly<Record<Exclude<FSNodeKind, 'app-link'>, AppId>> = Object.freeze({
  folder: EXPLORER_APP_ID,
  text: NOTEPAD_APP_ID,
  image: IMAGE_VIEWER_APP_ID,
})

/** Where a node opens: the target app id plus the file launch context it rides. */
export interface OpenRoute {
  readonly appId: AppId
  readonly launch: FileLaunch
}

/** Resolve a node's open target WITHOUT opening it (pure — the routing table). */
export function resolveOpenRoute(node: FSNode): OpenRoute {
  const launch: FileLaunch = { source: 'file', file: node }
  return {
    appId: node.kind === 'app-link' ? node.appId : OPEN_ROUTES[node.kind],
    launch,
  }
}

/**
 * Open a catalog node from the desktop. Registered target → a window through
 * the registry; unregistered target → openApp's soft fail (warn, no window,
 * never a throw). See module comment.
 */
export function openSpecimen(node: FSNode): void {
  const { appId, launch } = resolveOpenRoute(node)
  openApp(appId, launch)
}
