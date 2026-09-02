/**
 * Notepad manifest (AP-2) — the SPECIMEN EDITOR, second app on the reserved-id
 * fleet: registers `notepad` (app-ids.ts), the id the desktop's double-click
 * routing has targeted since IM-5 (`text → notepad`). Until now that route
 * soft-failed by design; with this registration, double-clicking a text
 * specimen on the hold (or inside a drawer — the explorer consults
 * `acceptedFileTypes`, first declaring registration wins) opens it HERE.
 *
 * Instance rule: MULTI-instance with a file launch — the registry derives
 * `instanceId = file:<nodeId>`, so there is ONE WINDOW PER SPECIMEN and
 * opening an already-open specimen focuses its window (wm-store dedupe; this
 * app manages none of it — docs/APP-CONTRACT.md "Instance rules"). A launcher
 * open (no file) is a fresh UNTITLED draft each time: the specimen is
 * accessioned into the hold on its first save (see NotepadSurface).
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * NOTE (registration ORDER is load-bearing): this manifest must register
 * BEFORE the demo module — the demo also declares `acceptedFileTypes:
 * ['text']` as contract-demo filler, and the explorer's routing one-liner
 * takes the FIRST declaring app. The real text owner precedes the placeholder
 * claim in src/apps/index.ts.
 */

import { lazy } from 'react'
import { NOTEPAD_APP_ID, type AppManifest } from '../../platform/app-registry'
import { NotepadIcon } from './NotepadIcon'

const NotepadSurface = lazy(() => import('./NotepadSurface'))

export const notepadApp: AppManifest = {
  id: NOTEPAD_APP_ID,
  name: 'Specimen Notepad',
  icon: NotepadIcon,
  mount: NotepadSurface,
  // singleton omitted → false: one window per specimen (file-instance dedupe)
  acceptedFileTypes: ['text'],
  defaultGeometry: { w: 600, h: 480 },
}
