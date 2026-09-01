import type { ReactNode } from 'react'
import type { WindowRecord } from '../stores/wm-store'
import { LAUNCHER_LAUNCH } from './contract'
import { AppSlot } from './AppSlot'

/**
 * Registry → WindowHost wiring (IM-3). Pass this as `WindowHost`'s `contentFor`
 * prop at the composition root (src/main.tsx) — the WM layer stays app-agnostic.
 * Windows opened directly through the wm-store (no launch context) default to a
 * launcher open. Resolution itself is reactive to the registry (see AppSlot).
 */
export function appContentFor(win: WindowRecord): ReactNode {
  return <AppSlot appId={win.appId} windowId={win.id} launch={win.launch ?? LAUNCHER_LAUNCH} />
}
