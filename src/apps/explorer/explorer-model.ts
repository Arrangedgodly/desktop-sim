/**
 * Explorer model (AP-1) — the pure, React-free math behind the drawer module:
 * launch-context → starting drawer, breadcrumb crumbs, the deleted-drawer
 * fallback, the label timestamp, child open routing, and the per-session view
 * memory. Everything here is testable without a DOM.
 *
 * Import discipline (docs/APP-CONTRACT.md — this app is the fleet's reference
 * implementation): TYPES ride the app-registry contract (`FSNodeRef`,
 * `AppLaunchContext`, `AppManifest`); the only structural assumption is the
 * catalog tree shape `{ rootId, nodes }`, which the FS store's state satisfies
 * by construction. No store access in this module.
 */

import type { AppLaunchContext, AppManifest, FSNodeRef } from '../../platform/app-registry'

/**
 * The catalog tree shape this module reads — structurally the FS domain state
 * (`FSTree`/`FSState`), typed through the contract's node so the app never
 * names a lib/fs type directly.
 */
export interface CatalogTree {
  readonly rootId: string
  readonly nodes: Readonly<Record<string, FSNodeRef>>
}

/** Manifest subset {@link childOpenTarget} consults (listApps() satisfies it). */
export type RoutingApp = Pick<AppManifest, 'id' | 'acceptedFileTypes'>

/* --------------------------------------------------------------------------
 * View memory (per-session only — deliberately NOT persisted)
 * ------------------------------------------------------------------------ */

/** The two drawer view densities. Ledger = the row/column listing. */
export type ExplorerView = 'grid' | 'list'

/** Last operator choice, shared by every explorer window in THIS session. */
let latestView: ExplorerView = 'grid'

/** The view a fresh explorer window opens in (the session's last choice). */
export function sessionView(): ExplorerView {
  return latestView
}

/** Record a view switch; new windows in this session inherit it. */
export function setSessionView(view: ExplorerView): void {
  latestView = view
}

/* --------------------------------------------------------------------------
 * Drawer resolution
 * ------------------------------------------------------------------------ */

/**
 * Where this window first opens: the launch context's folder when it still
 * exists in the live tree, else the hold's root (a launcher open, a file that
 * is not a drawer, or a drawer deleted since the window record was captured).
 */
export function initialDrawerId(launch: AppLaunchContext, tree: CatalogTree): string {
  if (launch.source === 'file') {
    const node = tree.nodes[launch.file.id]
    if (node && node.kind === 'folder') return node.id
  }
  return tree.rootId
}

/**
 * The drawer this window actually shows. Navigation state may name a drawer
 * that has since been decommissioned elsewhere (another window's delete): the
 * honest fallback is the hold itself — the archive root always exists. (The
 * deeper recovery UX — closing windows whose target died — is HU-2's scope.)
 */
export function resolveDrawer(tree: CatalogTree, folderId: string): string {
  const node = tree.nodes[folderId]
  return node && node.kind === 'folder' ? node.id : tree.rootId
}

/** One breadcrumb step: a drawer id + the legend carved on its crumb. */
export interface DrawerCrumb {
  readonly id: string
  readonly name: string
}

/**
 * The drawer path root → current (inclusive), each step a navigable crumb.
 * The chain is walked from the LIVE tree, so a deleted ancestor simply ends
 * the walk at the nearest survivor (the root at worst).
 */
export function drawerCrumbs(tree: CatalogTree, folderId: string): DrawerCrumb[] {
  const crumbs: DrawerCrumb[] = []
  let current = tree.nodes[resolveDrawer(tree, folderId)]
  while (current) {
    crumbs.unshift({ id: current.id, name: current.name })
    current = current.parentId === null ? undefined : tree.nodes[current.parentId]
  }
  return crumbs
}

/* --------------------------------------------------------------------------
 * Ledger stamp
 * ------------------------------------------------------------------------ */

/**
 * The label timestamp printed in the ledger's last column: mission-clock
 * `YYYY-MM-DD HH:MM`, UTC (the catalog's accessionedAt is an instant, and the
 * mission keeps one clock). Digits ride the mono face at the use site.
 */
export function formatLabelStamp(epochMs: number): string {
  const date = new Date(epochMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  )
}

/* --------------------------------------------------------------------------
 * Child open routing (the explorer side of the app-registry contract)
 * ------------------------------------------------------------------------ */

/**
 * Which module owns opening a child of the current drawer:
 * - drawers → `null` — the explorer navigates INSIDE this window (recursion);
 * - module references → their own `appId`;
 * - specimens/plates → the FIRST registered manifest declaring the kind in
 *   `acceptedFileTypes` (docs/APP-CONTRACT.md's routing one-liner — until the
 *   owning app registers, no module can open it and this returns `null`).
 *
 * The DESKTOP's routing (open-specimen.ts) targets the reserved ids directly
 * and soft-fails loudly on unregistered ones; in-drawer routing consults the
 * live registry instead, because the drawer is where "owning app" is decided
 * by declaration, not by platform reservation.
 */
export function childOpenTarget(node: FSNodeRef, apps: readonly RoutingApp[]): string | null {
  if (node.kind === 'folder') return null // navigate inside, never a new window
  if (node.kind === 'app-link') return node.appId
  return apps.find((app) => app.acceptedFileTypes?.includes(node.kind))?.id ?? null
}
