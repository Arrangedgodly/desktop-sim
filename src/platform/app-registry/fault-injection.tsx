/**
 * Fault-injection hooks (HU-1) — DEV/TEST ONLY.
 *
 * This module is reachable ONLY through `?injectFaults` on a dev server (the
 * bootstrap in fault-seam.tsx) or a direct unit-test import. It is never part
 * of a production bundle's import graph (verified by grepping dist/ for
 * `__holdFaults` / `fault-injection` after a build — the chunk is not emitted).
 *
 * WHAT IT DOES: installs a {@link FaultRenderer} on the seam and exposes
 * `window.__holdFaults` for Playwright:
 *
 *   window.__holdFaults.arm(appId, kind)    kind 'render' → the app's content
 *                                           throws during render; 'chunk' → a
 *                                           lazy load rejects with the
 *                                           browser's real network-shaped
 *                                           TypeError (the same boundary path
 *                                           a genuine failed transfer takes).
 *   window.__holdFaults.disarm(appId)       clears one armed fault.
 *   window.__holdFaults.clear()             clears all (test isolation).
 *
 * Both faults surface ONLY the platform's real machinery: the per-window
 * AppBoundary catches the throw and renders the MODULE FAULT card — there is
 * no fault-specific UI anywhere. Arm BEFORE opening the window (AppSlot
 * consults the seam at mount).
 */

/* eslint-disable react-refresh/only-export-components -- dev-only fault module:
   it mixes hook functions with throw-away components BY DESIGN and is never
   part of a production graph (fast-refresh ergonomics do not apply). */

import { lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { setFaultRenderer } from './fault-seam'

/** The two injectable fault shapes. */
export type InjectedFaultKind = 'render' | 'chunk'

const armed = new Map<string, InjectedFaultKind>()

/** Arm a fault for an app id (call before the window opens). */
export function armAppFault(appId: string, kind: InjectedFaultKind): void {
  armed.set(appId, kind)
}

/** Disarm one app's fault (e2e does this before pressing Reload module). */
export function disarmAppFault(appId: string): void {
  armed.delete(appId)
}

/** Clear every armed fault (test isolation). */
export function clearInjectedFaults(): void {
  armed.clear()
}

/** Test observability: the armed map, read-only. */
export function listArmedFaults(): ReadonlyMap<string, InjectedFaultKind> {
  return armed
}

/** Throws during render — the injected module fault. */
function InjectedRenderFault(): never {
  throw new Error('[fault-injection] injected module render fault')
}

/**
 * A lazy load that rejects with Chrome's real chunk-failure shape — exercising
 * the exact Suspense → lazy-rejection → boundary path a genuine network
 * failure takes (AppBoundary's network-vs-code classification keys on it).
 */
function InjectedChunkFault({ appId }: { readonly appId: string }) {
  // useState keeps ONE fresh lazy per mount: after the boundary's reload
  // (which disarms first in tests/e2e) a re-mount builds a new instance.
  const [Faulty] = useState(() =>
    lazy(() =>
      Promise.reject(
        new TypeError(
          `Failed to fetch dynamically imported module: "/src/apps/${appId}/Surface.tsx"`,
        ),
      ),
    ),
  )
  return (
    <Suspense fallback={null}>
      <Faulty />
    </Suspense>
  )
}

/** The seam renderer: the armed fault's replacement content, or null. */
function renderArmedFaults(appId: string): ReactNode {
  const kind = armed.get(appId)
  if (kind === 'render') return <InjectedRenderFault />
  if (kind === 'chunk') return <InjectedChunkFault appId={appId} />
  return null
}

/** e2e driving surface (`window.__holdFaults` while `?injectFaults` is on). */
export interface FaultHooks {
  readonly arm: (appId: string, kind: InjectedFaultKind) => void
  readonly disarm: (appId: string) => void
  readonly clear: () => void
}

declare global {
  interface Window {
    __holdFaults?: FaultHooks
  }
}

/** Install the renderer + window hooks (dev bootstrap / unit tests). Idempotent. */
export function installFaultHooks(): void {
  setFaultRenderer(renderArmedFaults)
  if (typeof window !== 'undefined') {
    window.__holdFaults = {
      arm: armAppFault,
      disarm: disarmAppFault,
      clear: clearInjectedFaults,
    }
  }
}

/** Unit-test seam: uninstall everything (restores the seam's null product). */
export function uninstallFaultHooks(): void {
  setFaultRenderer(null)
  clearInjectedFaults()
  if (typeof window !== 'undefined') {
    delete window.__holdFaults
  }
}
