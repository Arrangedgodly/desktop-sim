/**
 * Paint manifest (federated session 2, docs/FEDERATED-SESSIONS.md) — the
 * PLATE PAINTER: the second app built by a federated session against the
 * platform contract, NOT one of the platform's six reserved ids — the
 * standard registration path (`src/apps/index.ts`, one line), the terminal's
 * precedent.
 *
 * `acceptedFileTypes: ['image']` is ROUTING-INERT by design: the Plate
 * Viewer registers ahead of this app, so the desktop's image double-click
 * keeps its platform route (the viewer owns it) — the declaration documents
 * that this studio works ON plates. Opening a plate INTO the painter happens
 * through the studio's own picker or an explicit openApp file launch.
 *
 * Instance rule: MULTI-instance — the registry derives
 * `instanceId = file:<nodeId>` for file launches, so there is ONE PAINTER
 * WINDOW PER PLATE (opening the same plate again focuses its painter; the
 * viewer keeps its own separate windows on the same node — dedupe is
 * appId-scoped). A launcher open (no file) is a fresh UNTITLED plate each
 * time, the notepad's draft shape: the plate is accessioned into the hold on
 * its first save.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes)
 * rides the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * NOTE (registration ORDER): inserted immediately BEFORE the settings console
 * — the launcher's first item stays the notepad (e2e-pinned floor) and its
 * last stays the console; the painter joins the closing run ahead of it,
 * after the terminal.
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { PaintIcon } from './PaintIcon'
import { vetoCloseFor } from './paint-model'

const PaintSurface = retryableLazy(() => import('./PaintSurface'))

export const paintApp: AppManifest = {
  id: 'paint',
  name: 'Plate Painter',
  icon: PaintIcon,
  mount: PaintSurface,
  // singleton omitted → false: one painter window per plate (file-instance dedupe)
  acceptedFileTypes: ['image'], // routing-inert — the viewer owns the double-click route
  // 1000×600: at the cascade origin (y=64) the whole window — strip
  // included — clears the 44px drawer rail on a 720-tall viewport (a
  // 720-tall window puts its guard strip under the rail; found in e2e).
  // The plate displays aspect-fit regardless, crisp via its dpr backing.
  defaultGeometry: { w: 1000, h: 600 },
  // HU-2 title-follow: a file-opened window is titled by its plate from the
  // very first paint (the surface keeps following live renames after).
  titleForLaunch: (launch) => (launch.source === 'file' ? launch.file.name : undefined),
  // HU-2 close-request veto: un-filed plate work may not be closed out from
  // under the operator — the surface's registered guard flares the lamp +
  // interposes the strip and closes the window itself when answered. Clean
  // (or surface not mounted) → false → the platform closes immediately.
  onCloseRequest: ({ windowId }) => vetoCloseFor(windowId),
}
