import type { AppManifest } from '../platform/app-registry'
import { explorerApp } from './explorer'
import { notepadApp } from './notepad'
import { viewerApp } from './image-viewer'
import { aboutApp } from './about'
import { browserApp } from './browser'
import { terminalApp } from './terminal'
import { cursorApp } from './cursor'
import { paintApp } from './paint'
import { chartPlateApp } from './chart-plate'
import { specimenSurveyApp } from './specimen-survey'
import { vivariumApp } from './vivarium'
import { relayApp } from './relay'
import { fieldNotesApp } from './field-notes'
import { reliquaryApp } from './reliquary'
import { typeCabinetApp } from './type-cabinet'
import { archiveBackupApp } from './archive-backup'
import { vitalsApp } from './vitals'
import { settingsApp } from './settings'

/**
 * App-layer aggregation point (IM-3). EVERY SHIPPED app registers here,
 * exactly once, at startup — src/main.tsx calls `registerApps(apps)` before
 * first render.
 *
 * ADDING AN APP = create src/apps/<id>/ exporting an `AppManifest`, then add
 * ONE line to this array. Never edit src/platform/** to add an app.
 * (See docs/APP-CONTRACT.md — explorer/ is the fleet's reference implementation
 * of the full contract: reserved id, lazy chunk, file-instance windows,
 * platform-menu reuse; notepad/ and image-viewer/ are the second and third;
 * settings/ the fourth — singleton console, no file routing; about/ the fifth
 * — singleton nameplate, the seeded desktop reference's target; browser/ the
 * sixth — singleton field atlas over the content pack's project plates.)
 *
 * TH-2 · DEMO DE-REGISTRATION: the IM-3 contract demo (src/apps/demo/) is NOT
 * in the shipped fleet. It served its purpose (the reference example lives on
 * verbatim in docs/APP-CONTRACT.md) and its fixture survives for tests ONLY:
 * unit specs import { demoApp } from '../apps/demo' directly, and e2e
 * registers it at runtime through the registry's public `registerApp` seam
 * (page-context dynamic import — see tests/e2e/e2e-helpers.ts). Nothing under
 * src/apps/demo/ is reachable from the entry graph, so the production build
 * emits no demo chunk at all.
 *
 * ORDER IS LOAD-BEARING: registration order is the launcher's listing order
 * AND the tiebreak for capability routing — the explorer's "who opens this
 * kind?" one-liner takes the FIRST manifest declaring the kind in
 * `acceptedFileTypes`. The notepad (the text owner) leads so the launcher's
 * first item stays stable; the viewer's `image` claim has no rival. The
 * settings console and the about nameplate declare no file types — their
 * positions are free; the nameplate rides behind the explorer and the
 * console stays last so the launcher's opening run (notepad first) and
 * closing run (console last) stay untouched.
 *
 * FEDERATED FLEET (session 1): terminal/ is the first app built by a
 * federated session against the contract — not a reserved id, registered the
 * standard way. It declares no file types (it is a shell OVER the archive,
 * not a specimen handler), so its position is free by the same law; it rides
 * immediately before the console to keep the closing run intact.
 *
 * FEDERATED FLEET (session 2): paint/ joins it the same way — the Plate
 * Painter. It DECLARES acceptedFileTypes: ['image'] as intent, but the
 * declaration is routing-inert (the viewer registered first and owns the
 * image route); opening plates into the painter happens through its own
 * picker or an explicit file launch. It rides between the terminal and the
 * console — the opening run (notepad) and the closing run (console) stay put.
 *
 * FEDERATED FLEET (batch 2 — ten apps, ten isolated sessions): cursor/
 * (the brass calculating machine), chart-plate/ (the chart engraver),
 * specimen-survey/ (the excavation dig — the fleet's first multi-instance
 * app), vivarium/ (the hold tank), relay/ (the correspondence wire),
 * field-notes/ (the reading room), reliquary/ (the vitrine case),
 * type-cabinet/ (the type specimen book), archive-backup/ (the vault), and
 * vitals/ (the console's own instrument panel). All ten declare NO file
 * types — routing is untouched (notepad owns text, the viewer owns image,
 * the explorer owns folder), so every new position is free by the same law.
 * The pinned order keeps the two load-bearing ends — notepad opens the
 * launcher, settings closes it — and runs studio → reading → closing:
 * the cursor rides directly behind the terminal (the console utility run),
 * the chart engraver and the survey dig flank the painter's studio, the
 * tank follows the studio, the four reading-room/display pieces (relay,
 * field-notes, reliquary, type-cabinet) ride between the atlas and the
 * nameplate, and the vault + vitals panel join the nameplate in the closing
 * run directly ahead of the console (the console stays LAST — the settings
 * floor pins it as the launcher's final item).
 */
export const apps: readonly AppManifest[] = [
  notepadApp,
  viewerApp,
  explorerApp,
  browserApp,
  terminalApp,
  cursorApp,
  paintApp,
  chartPlateApp,
  specimenSurveyApp,
  vivariumApp,
  relayApp,
  fieldNotesApp,
  reliquaryApp,
  typeCabinetApp,
  aboutApp,
  archiveBackupApp,
  vitalsApp,
  settingsApp,
]
