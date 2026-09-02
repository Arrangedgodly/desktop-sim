/**
 * Fault-injection seam (HU-1) — the ONE production-carried touchpoint of the
 * dev/test fault hooks, deliberately shaped so nothing fault-shaped is ACTIVE
 * in a production bundle:
 *
 * - `renderFault(appId)` answers `null` forever unless a DEV-ONLY renderer was
 *   installed (fault-injection.ts, below). AppSlot consults it once per
 *   render; the call is the seam's whole shipped cost.
 * - The dev bootstrap below is gated on `import.meta.env.DEV` AND the
 *   `?injectFaults` query param. In a production build Vite replaces DEV with
 *   `false`, rollup dead-code-eliminates the dynamic import, and the
 *   fault-injection chunk is not emitted at all (proven by a dist grep in the
 *   HU-1 validation — see docs/TESTING.md "Fault injection").
 *
 * Docs: docs/TESTING.md — the e2e/unit driving conventions.
 */

import type { ReactNode } from 'react'

/** What AppSlot mounts instead of the real app while a fault is armed. */
export type FaultRenderer = (appId: string) => ReactNode

/** The installed renderer — null-productive until the dev hooks install one. */
let faultRenderer: FaultRenderer | null = null

/** Dev-only (fault-injection.ts): install the armed-fault renderer. */
export function setFaultRenderer(renderer: FaultRenderer | null): void {
  faultRenderer = renderer
}

/** AppSlot's consult: `null` in every production session, by construction. */
export function renderFault(appId: string): ReactNode | null {
  return faultRenderer !== null ? faultRenderer(appId) : null
}

/* --------------------------------------------------------------------------
 * Dev bootstrap — `?injectFaults` on a dev server loads the hooks module and
 * exposes it on `window.__holdFaults` for e2e. Eliminated from prod builds.
 * ------------------------------------------------------------------------ */

if (import.meta.env.DEV && typeof window !== 'undefined') {
  if (new URLSearchParams(window.location.search).has('injectFaults')) {
    void import('./fault-injection').then(
      (hooks) => hooks.installFaultHooks(),
      (error: unknown) => {
        console.warn('[fault-injection] hooks failed to install', error)
      },
    )
  }
}
