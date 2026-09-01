import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { apps } from './apps'
import './styles/global.css' // UI-1: tokens + fonts + console primitives (single mount)
import { appContentFor, listApps, openApp, registerApps } from './platform/app-registry'
import { useWMStore } from './platform/stores'
import { WindowHost } from './platform/wm'
// Leaf import (not the lib/perf barrel) so the entry graph pulls in only the
// timing seam, never the fps/gesture probe modules.
import { markBootMilestone } from './lib/perf/boot-timeline'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html is missing the #root mount point')
}

// Startup app registration (IM-3 contract): apps self-describe under
// src/apps/<id>/ and aggregate in src/apps/index.ts — adding an app never
// edits platform code. The length guard keeps HMR re-runs quiet (registerApps
// would warn-and-reject duplicates, but there is nothing to re-register).
if (listApps().length === 0) {
  registerApps(apps)
}

// Temporary dev fixture (replaces the IM-4a scaffold windows; removed when the
// UI-2 boot sequence / UI-3 desktop land): prove the contract live —
// register → openApp → content resolved through the registry.
if (Object.keys(useWMStore.getState().windows).length === 0) {
  openApp('demo')
}

createRoot(rootElement).render(
  <StrictMode>
    <WindowHost contentFor={appContentFor} />
  </StrictMode>,
)

// Skeleton boot milestone (HE-1 e2e seam): one mark so `window.__BOOT_TIMELINE`
// exists after load. UI-2 replaces/expands this into the real timeline
// (first-paint, interactive, POST phases) and e2e grows the ≤2s boot gate.
markBootMilestone('app-mounted')
