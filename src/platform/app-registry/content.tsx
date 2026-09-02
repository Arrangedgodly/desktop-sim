import type { ReactNode } from 'react'
import type { WindowRecord } from '../stores/wm-store'
import { LAUNCHER_LAUNCH } from './contract'
import { AppSlot } from './AppSlot'
import { getApp } from './registry'

/**
 * Registry → WindowHost wiring (IM-3). Pass this as `WindowHost`'s `contentFor`
 * prop at the composition root (src/main.tsx) — the WM layer stays app-agnostic.
 * Windows opened directly through the wm-store (no launch context) default to a
 * launcher open. Resolution itself is reactive to the registry (see AppSlot).
 */
export function appContentFor(win: WindowRecord): ReactNode {
  return <AppSlot appId={win.appId} windowId={win.id} launch={win.launch ?? LAUNCHER_LAUNCH} />
}

/**
 * Registry → WindowHost close policy (HU-2). Pass as `WindowHost`'s
 * `closeGuard` prop next to `appContentFor`. Consults the manifest's optional
 * `onCloseRequest`: `true` VETOES the platform close (the app owns the rest —
 * e.g. the notepad's dirty guard strip); `false`/absent/manifest-gone → the
 * platform closes immediately. Kept here, next to `appContentFor`, so the WM
 * layer never imports the registry (the composition root does).
 */
export function appCloseGuardFor(win: WindowRecord): boolean {
  const onCloseRequest = getApp(win.appId)?.onCloseRequest
  if (!onCloseRequest) return false
  return onCloseRequest({ windowId: win.id, launch: win.launch ?? LAUNCHER_LAUNCH })
}
