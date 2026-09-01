import type { AppManifest } from '../platform/app-registry'
import { demoApp } from './demo'

/**
 * App-layer aggregation point (IM-3). EVERY app registers here, exactly once,
 * at startup — src/main.tsx calls `registerApps(apps)` before first render.
 *
 * ADDING AN APP = create src/apps/<id>/ exporting an `AppManifest`, then add
 * ONE line to this array. Never edit src/platform/** to add an app.
 * (See docs/APP-CONTRACT.md.)
 */
export const apps: readonly AppManifest[] = [demoApp]
