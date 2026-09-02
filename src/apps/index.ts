import type { AppManifest } from '../platform/app-registry'
import { demoApp } from './demo'
import { explorerApp } from './explorer'

/**
 * App-layer aggregation point (IM-3). EVERY app registers here, exactly once,
 * at startup — src/main.tsx calls `registerApps(apps)` before first render.
 *
 * ADDING AN APP = create src/apps/<id>/ exporting an `AppManifest`, then add
 * ONE line to this array. Never edit src/platform/** to add an app.
 * (See docs/APP-CONTRACT.md — explorer/ is the first reference implementation
 * of the full contract: reserved id, lazy chunk, file-instance windows,
 * platform-menu reuse.)
 */
export const apps: readonly AppManifest[] = [demoApp, explorerApp]
