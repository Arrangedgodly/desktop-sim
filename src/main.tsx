import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { apps } from './apps'
import './styles/global.css' // UI-1: tokens + fonts + console primitives (single mount)
import { listApps, registerApps } from './platform/app-registry'
import { BootSequence } from './platform/boot'
// Leaf imports (not barrels) so the entry graph stays minimal: the timing seam
// and the two persistence entry points, nothing else.
import { markBootMilestone } from './lib/perf/boot-timeline'
import { bootPersistence } from './lib/storage/persistence'
import { readBootFlag } from './lib/storage/boot-flag'
// UI-6: cue subscriptions over the platform seams — a few hundred bytes,
// eager (a separate lazy chunk would cost a request for less code than the
// request overhead). When muted every event is one returned boolean check.
import { attachAudioCues } from './lib/audio'
// UI-7: the phone viewport gate — read at boot BEFORE any desktop side
// effect, so a phone never boots persistence, wires audio, or mounts the
// desktop graph at all (see src/platform/notice/gate.ts for the law).
import { createViewportGate, NoticeCard } from './platform/notice'
// HU-1: the OS-level boundary — a fault in the shell itself (either session)
// shows the in-world CONSOLE FAULT plate, never a white screen. Wrapping both
// sessions is deliberate: "never a white screen" is a promise about the page,
// not about the desktop side only.
import { ConsoleFaultBoundary } from './platform/console-fault'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html is missing the #root mount point')
}
// The narrowed mount point closures can hold (the guard above already ran).
const mountPoint: HTMLElement = rootElement

// Startup app registration (IM-3 contract): apps self-describe under
// src/apps/<id>/ and aggregate in src/apps/index.ts — adding an app never
// edits platform code. The length guard keeps HMR re-runs quiet (registerApps
// would warn-and-reject duplicates, but there is nothing to re-register).
// TH-2: the shipped fleet is the six reserved apps; the IM-3 demo fixture is
// de-registered (tests register it through the public seam — see
// src/apps/index.ts). (Module registration is inert on the phone path too:
// no timers, listeners, or audio exist until a surface actually mounts.)
if (listApps().length === 0) {
  registerApps(apps)
}

/* --------------------------------------------------------------------------
 * UI-7 session mount — exactly one tree owns #root at any moment.
 *
 * The desktop session is created by mountDesktop() and torn down by
 * unmountSession(); the notice session is the same shape with none of the
 * machinery. The gate below decides which to boot and swaps cleanly BOTH
 * ways across the 1024px floor: a full root.unmount() runs every effect
 * teardown the desktop graph owns (the shared timecode interval, observers,
 * menu bus), so nothing keeps ticking beneath the notice — and a swap back
 * boots the desktop fresh (a return visit: the boot flag already wrote, so
 * POST short-circuits).
 * ------------------------------------------------------------------------ */

let sessionRoot: Root | null = null
let detachAudio: (() => void) | null = null

function unmountSession(): void {
  sessionRoot?.unmount() // every timer/listener/observer the tree owned dies here
  sessionRoot = null
  detachAudio?.() // retire the UI-6 cue subscriptions (idempotent, re-attachable)
  detachAudio = null
}

function mountDesktop(): void {
  // UI-2 boot orchestration: the POST screen types while persistence loads;
  // stores hydrate BEFORE the desktop renders (BootSequence gates on the boot
  // promise). The boot flag — written inside bootPersistence AFTER a successful
  // hydrate — is read here purely to pace the animation: absent → full POST,
  // present → return-visit short-circuit (a hint, never proof; see
  // src/lib/storage/boot-flag.ts).
  markBootMilestone('boot-start')
  const firstVisit = readBootFlag() === null
  const boot = bootPersistence()

  // UI-6 console cues: attached for the session, before the desktop renders,
  // so the boot chime seam exists by the time 'desktop-ready' lands. Muted by
  // default — the engine builds no AudioContext until an armed, gestured cue.
  detachAudio = attachAudioCues()

  sessionRoot = createRoot(mountPoint)
  sessionRoot.render(
    <StrictMode>
      <ConsoleFaultBoundary session="desktop">
        <BootSequence boot={boot} firstVisit={firstVisit} />
      </ConsoleFaultBoundary>
    </StrictMode>,
  )

  // First React tree committed (the POST screen). Kept from the HE-1 skeleton:
  // 'app-mounted' means React owns the document; the UI-2 phases around it are
  // 'boot-start' (above) and 'post-complete' / 'desktop-ready' (BootSequence).
  markBootMilestone('app-mounted')
}

function mountNotice(): void {
  // The whole phone session: one static card, no persistence, no audio wiring,
  // no stores to hydrate — the honest degradation, never a broken layout.
  sessionRoot = createRoot(mountPoint)
  sessionRoot.render(
    <StrictMode>
      <ConsoleFaultBoundary session="handheld">
        <NoticeCard />
      </ConsoleFaultBoundary>
    </StrictMode>,
  )
}

const gate = createViewportGate()
if (gate.isPhone()) {
  mountNotice()
} else {
  mountDesktop()
}

// The ONE matchMedia listener for the page's lifetime. Resize churn inside
// either side of the 1024px floor fires nothing (the engine only emits when
// the query's verdict flips); a flip is the only moment of work — unmount
// one session, mount the other.
gate.subscribe((phone) => {
  unmountSession()
  if (phone) {
    mountNotice()
  } else {
    mountDesktop()
  }
})
