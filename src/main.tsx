import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useWMStore } from './platform/stores'
import { WindowHost } from './platform/wm'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html is missing the #root mount point')
}

// IM-4a scaffold demo: two windows so the WM shell is inspectable in dev/preview.
// The boot sequence (UI-2), desktop surface (UI-3) and real apps (IM-3 registry)
// replace this block; kept idempotent so HMR reloads don't stack duplicates.
{
  const wm = useWMStore.getState()
  if (Object.keys(wm.windows).length === 0) {
    wm.openWindow({ appId: 'scaffold', instanceId: 'demo-a', title: 'Scaffold module A' })
    wm.openWindow({ appId: 'scaffold', instanceId: 'demo-b', title: 'Scaffold module B' })
  }
}

createRoot(rootElement).render(
  <StrictMode>
    <WindowHost />
  </StrictMode>,
)
