/**
 * App plugin contract + registry (IM-3) — the platform's public app API.
 * docs/APP-CONTRACT.md is the federated-sessions guide; the types in
 * ./contract.ts are the source of truth.
 *
 * Public surface (stable; future app sessions depend on it):
 * - types/values:  AppManifest, AppLaunchContext (+ Launcher/File variants),
 *   AppSurfaceProps, AppIconProps/Component, AppMountComponent, AppGeometryHints,
 *   FSNodeRef, FSNodeKind, APP_ID_PATTERN, LAUNCHER_LAUNCH
 * - registry API:  registerApp / registerApps / unregisterApp / getApp /
 *   listApps / openApp / useAppRegistryStore (reactive)
 * - WM wiring:     appContentFor → `<WindowHost contentFor={appContentFor} />`
 * - reserved ids:  EXPLORER/NOTEPAD/IMAGE_VIEWER/SETTINGS/ABOUT/BROWSER_APP_ID
 *   (+ RESERVED_APP_IDS) — the platform fleet's routing ids (app-ids.ts)
 *
 * Rules (normative, enforced by tests):
 * - apps live in src/apps/<id>/ and are aggregated by src/apps/index.ts;
 *   adding an app NEVER edits src/platform/**.
 * - app windows open ONLY via openApp (title/geometry/instanceId/launch = registry's job).
 * - openApp fails soft on unknown ids (null + console.warn, never a throw).
 * - unregister removes the launcher entry; open windows stay and render the
 *   "module unavailable" notice until closed.
 * - launch context travels ON the WM window record → survives MF-2 persistence.
 */
export {
  APP_ID_PATTERN,
  LAUNCHER_LAUNCH,
  type AppGeometryHints,
  type AppIconComponent,
  type AppIconProps,
  type AppLaunchContext,
  type AppManifest,
  type AppMountComponent,
  type AppSurfaceProps,
  type FileLaunch,
  type FSNodeKind,
  type FSNodeRef,
  type LauncherLaunch,
} from './contract'

export {
  fileInstanceKey,
  getApp,
  listApps,
  openApp,
  registerApp,
  registerApps,
  resetAppRegistry,
  SINGLETON_INSTANCE_KEY,
  unregisterApp,
  useAppRegistryStore,
  type AppRegistryState,
} from './registry'

// HU-1: retryable lazy mounts — the manifest `mount` helper whose failed chunk
// loads the MODULE FAULT card's "Reload module" can honestly re-attempt.
export { retryableLazy, type AppSurfaceLoader } from './lazy-mount'

export {
  ABOUT_APP_ID,
  BROWSER_APP_ID,
  EXPLORER_APP_ID,
  IMAGE_VIEWER_APP_ID,
  NOTEPAD_APP_ID,
  RESERVED_APP_IDS,
  SETTINGS_APP_ID,
} from './app-ids'
export { appContentFor } from './content'
