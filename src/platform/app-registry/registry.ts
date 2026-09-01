import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { cascadedGeometry, useWMStore, type AppId, type WindowId } from '../stores/wm-store'
import {
  APP_ID_PATTERN,
  LAUNCHER_LAUNCH,
  type AppLaunchContext,
  type AppManifest,
} from './contract'

/**
 * App registry (IM-3) — the platform's app ledger. Apps self-declare via an
 * {@link AppManifest}; the registry lists them, launches them through the WM
 * store, and answers "what mounts in this window?".
 *
 * Lifecycle (normative — see docs/APP-CONTRACT.md):
 * - Registration happens ONCE at startup (composition root aggregates
 *   `src/apps/<id>/` manifests). No production path registers/unregisters at
 *   user-interaction time; `unregisterApp` exists for tests and a future
 *   "uninstall" affordance.
 * - Opening ALWAYS goes through {@link openApp} — never
 *   `useWMStore.getState().openWindow` for an app window (title, geometry,
 *   instanceId and launch context are the registry's job).
 * - Unregistering removes the manifest (launcher entries disappear) but leaves
 *   OPEN windows alone: they keep rendering and the content layer swaps in a
 *   graceful "module unavailable" notice (content.tsx).
 *
 * Store-layer rules honored (src/platform/stores/index.ts): field-narrow
 * selectors for reactive consumers (`s => s.apps[id]`, `s => s.order`),
 * `getState()` in handlers.
 */

/** Stable instanceId for singleton apps (wm-store dedupes appId+instanceId → one window). */
export const SINGLETON_INSTANCE_KEY = 'singleton'

/** Stable instanceId for a file-open launch: one window per file, reopen focuses it. */
export function fileInstanceKey(nodeId: string): string {
  return `file:${nodeId}`
}

export interface AppRegistryState {
  /** Manifests by id. */
  readonly apps: Readonly<Record<AppId, AppManifest>>
  /** Registration order — launchers iterate this, never `Object.keys(apps)`. */
  readonly order: readonly AppId[]
  /**
   * Validate + store a manifest. Rejects (warns, returns `false`, keeps the
   * FIRST registration) on a duplicate id or an id that fails `APP_ID_PATTERN`.
   */
  registerApp: (manifest: AppManifest) => boolean
  /** Bulk {@link registerApp} (startup path). Returns how many landed. */
  registerApps: (manifests: readonly AppManifest[]) => number
  /** Remove a manifest. Open windows stay open (content layer warns gracefully). */
  unregisterApp: (id: AppId) => boolean
  /** Test/bootstrap seam: drop everything. Windows are NOT touched. */
  resetAppRegistry: () => void
}

export const useAppRegistryStore = create<AppRegistryState>()(
  subscribeWithSelector((set, get) => ({
    apps: {},
    order: [],

    registerApp: (manifest) => {
      if (!APP_ID_PATTERN.test(manifest.id)) {
        console.warn(
          '[app-registry] register rejected: id "%s" is not kebab-case (APP_ID_PATTERN)',
          manifest.id,
        )
        return false
      }
      if (get().apps[manifest.id]) {
        console.warn(
          '[app-registry] register rejected: "%s" is already registered — first registration wins',
          manifest.id,
        )
        return false
      }
      set((s) => ({
        apps: { ...s.apps, [manifest.id]: manifest },
        order: [...s.order, manifest.id],
      }))
      return true
    },

    registerApps: (manifests) => {
      let registered = 0
      for (const manifest of manifests) {
        if (get().registerApp(manifest)) registered += 1
      }
      return registered
    },

    unregisterApp: (id) => {
      if (!get().apps[id]) {
        console.warn('[app-registry] unregister rejected: "%s" is not registered', id)
        return false
      }
      set((s) => ({
        apps: Object.fromEntries(Object.entries(s.apps).filter(([key]) => key !== id)),
        order: s.order.filter((it) => it !== id),
      }))
      return true
    },

    resetAppRegistry: () => set({ apps: {}, order: [] }),
  })),
)

/* --------------------------------------------------------------------------
 * Module-level API (the documented public surface; thin getState() wrappers
 * per the store layer rules — handlers and bootstrap never need the hook).
 * ------------------------------------------------------------------------ */

/** Register one manifest; `false` = rejected (duplicate/invalid id — warned above). */
export function registerApp(manifest: AppManifest): boolean {
  return useAppRegistryStore.getState().registerApp(manifest)
}

/** Bulk registration (startup path); returns how many landed. */
export function registerApps(manifests: readonly AppManifest[]): number {
  return useAppRegistryStore.getState().registerApps(manifests)
}

/** Remove a manifest; open windows stay open (content layer warns gracefully). */
export function unregisterApp(id: AppId): boolean {
  return useAppRegistryStore.getState().unregisterApp(id)
}

/** Test/bootstrap seam: drop everything. Windows are NOT touched. */
export function resetAppRegistry(): void {
  useAppRegistryStore.getState().resetAppRegistry()
}

/** Non-reactive lookup for handlers/tests; reactive consumers use `useAppRegistryStore`. */
export function getApp(id: AppId): AppManifest | null {
  return useAppRegistryStore.getState().apps[id] ?? null
}

/** Manifests in registration order. */
export function listApps(): readonly AppManifest[] {
  const { apps, order } = useAppRegistryStore.getState()
  return order.flatMap((id) => {
    const manifest = apps[id]
    return manifest ? [manifest] : []
  })
}

/**
 * Launch an app through the WM store — the ONLY sanctioned open path for app
 * windows. Applies the manifest (title, size hints, singleton/multi instance
 * rules) and stores the launch context on the window record. Fails SOFT on an
 * unregistered id: `console.warn` + `null`, no window, no throw.
 *
 * Instance rules:
 * - singleton → one window ever; re-open raises + focuses it.
 * - multi-instance, no file → a new window per call.
 * - multi-instance + file → one window per file id; same file re-opened focuses.
 */
export function openApp(appId: AppId, launch: AppLaunchContext = LAUNCHER_LAUNCH): WindowId | null {
  const manifest = getApp(appId)
  if (!manifest) {
    console.warn('[app-registry] open rejected: no app registered as "%s"', appId)
    return null
  }
  const instanceId = manifest.singleton
    ? SINGLETON_INSTANCE_KEY
    : launch.source === 'file'
      ? fileInstanceKey(launch.file.id)
      : undefined
  const wm = useWMStore.getState()
  const hints = manifest.defaultGeometry
  const cascade = cascadedGeometry(Object.keys(wm.windows).length)
  return wm.openWindow({
    appId,
    ...(instanceId !== undefined ? { instanceId } : {}),
    title: manifest.name,
    launch,
    // Size hints ride the platform cascade for the origin; no hints → pure cascade.
    ...(hints
      ? { geometry: { x: hints.x ?? cascade.x, y: hints.y ?? cascade.y, w: hints.w, h: hints.h } }
      : {}),
  })
}
