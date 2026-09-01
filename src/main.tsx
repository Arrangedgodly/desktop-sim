import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { apps } from './apps'
import './styles/global.css' // UI-1: tokens + fonts + console primitives (single mount)
import { listApps, registerApps } from './platform/app-registry'
import { BootSequence } from './platform/boot'
// Leaf imports (not barrels) so the entry graph stays minimal: the timing seam
// and the two persistence entry points, nothing else.
import { markBootMilestone } from './lib/perf/boot-timeline'
import { bootPersistence } from './lib/storage/persistence'
import { readBootFlag } from './lib/storage/boot-flag'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html is missing the #root mount point')
}

// Startup app registration (IM-3 contract): apps self-describe under
// src/apps/<id>/ and aggregate in src/apps/index.ts — adding an app never
// edits platform code. The length guard keeps HMR re-runs quiet (registerApps
// would warn-and-reject duplicates, but there is nothing to re-register).
// The demo module stays registered (IM-4c launcher / e2e use it); it no
// longer auto-opens now that the real boot sequence owns the first viewport.
if (listApps().length === 0) {
  registerApps(apps)
}

// UI-2 boot orchestration: the POST screen types while persistence loads;
// stores hydrate BEFORE the desktop renders (BootSequence gates on the boot
// promise). The boot flag — written inside bootPersistence AFTER a successful
// hydrate — is read here purely to pace the animation: absent → full POST,
// present → return-visit short-circuit (a hint, never proof; see
// src/lib/storage/boot-flag.ts).
markBootMilestone('boot-start')
const firstVisit = readBootFlag() === null
const boot = bootPersistence()

createRoot(rootElement).render(
  <StrictMode>
    <BootSequence boot={boot} firstVisit={firstVisit} />
  </StrictMode>,
)

// First React tree committed (the POST screen). Kept from the HE-1 skeleton:
// 'app-mounted' means React owns the document; the UI-2 phases around it are
// 'boot-start' (above) and 'post-complete' / 'desktop-ready' (BootSequence).
markBootMilestone('app-mounted')
