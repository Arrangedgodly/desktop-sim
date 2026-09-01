import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { apps } from './apps'
import { appContentFor, listApps, openApp, registerApps } from './platform/app-registry'
import { useWMStore } from './platform/stores'
import { WindowHost } from './platform/wm'

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
