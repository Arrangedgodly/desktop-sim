/**
 * Terminal manifest (federated session 1, docs/FEDERATED-SESSIONS.md) — the
 * CATALOG TERMINAL: the first app built by a federated session against the
 * platform contract, NOT one of the platform's six reserved ids — this is the
 * standard registration path (`src/apps/index.ts`, one line).
 *
 * Nothing routes FILES into it (no `acceptedFileTypes` — the terminal is
 * opened, never "opened onto"; its `open` command routes OUT to the owning
 * modules instead).
 *
 * Instance rule: SINGLETON — one shell ever; every later open (launcher,
 * taskbar) raises + focuses the existing window via the registry's singleton
 * instance key (docs/APP-CONTRACT.md "Instance rules"). The shell's own
 * session (cwd + command history) rides the window record's opaque appState,
 * so the ONE window is also the SAME session across reloads.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * NOTE (registration ORDER): inserted immediately BEFORE the settings console
 * — the launcher's first item stays the notepad (e2e-pinned floor) and its
 * last stays the console; the terminal joins the closing run ahead of it.
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { TerminalIcon } from './TerminalIcon'

const TerminalSurface = retryableLazy(() => import('./TerminalSurface'))

export const terminalApp: AppManifest = {
  id: 'terminal',
  name: 'Catalog Terminal',
  icon: TerminalIcon,
  mount: TerminalSurface,
  singleton: true, // ONE shell ever: re-open raises + focuses it
  defaultGeometry: { w: 640, h: 420 },
}
