import type { AppManifest } from '../platform/app-registry'
import { demoApp } from './demo'
import { explorerApp } from './explorer'
import { notepadApp } from './notepad'
import { viewerApp } from './image-viewer'
import { settingsApp } from './settings'

/**
 * App-layer aggregation point (IM-3). EVERY app registers here, exactly once,
 * at startup — src/main.tsx calls `registerApps(apps)` before first render.
 *
 * ADDING AN APP = create src/apps/<id>/ exporting an `AppManifest`, then add
 * ONE line to this array. Never edit src/platform/** to add an app.
 * (See docs/APP-CONTRACT.md — explorer/ is the fleet's reference implementation
 * of the full contract: reserved id, lazy chunk, file-instance windows,
 * platform-menu reuse; notepad/ and image-viewer/ are the second and third;
 * settings/ the fourth — singleton console, no file routing.)
 *
 * ORDER IS LOAD-BEARING: registration order is the launcher's listing order
 * AND the tiebreak for capability routing — the explorer's "who opens this
 * kind?" one-liner takes the FIRST manifest declaring the kind in
 * `acceptedFileTypes`. The notepad must therefore register BEFORE the demo
 * module (which also declares `text` as contract-demo filler), or in-drawer
 * text specimens would open the demo instead of their real owner. The
 * viewer's `image` claim has no rival (the demo declares only `text`); its
 * position behind the notepad keeps the launcher's first item stable. The
 * settings console declares no file types — its position is free; it rides
 * last so the launcher's opening run (notepad first) stays untouched.
 */
export const apps: readonly AppManifest[] = [
  notepadApp,
  viewerApp,
  demoApp,
  explorerApp,
  settingsApp,
]
