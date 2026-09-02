import type { ComponentType, LazyExoticComponent } from 'react'
import type { FSNode, FSNodeKind } from '../../lib/fs'

/**
 * THE APP PLUGIN CONTRACT (IM-3) — source of truth for every type an app author
 * touches. docs/APP-CONTRACT.md explains these shapes; THIS FILE decides. If the
 * doc and this file disagree, this file wins and the doc gets fixed.
 *
 * Dependency direction is fixed and acyclic:
 *   contract.ts ──(type-only)──▶ lib/fs domain model (MF-1)  +  react types
 *   registry.ts / content.tsx  ──▶ contract.ts + wm-store (runtime)
 *   wm-store ──(type-only)──▶ contract.ts (AppLaunchContext rides on WindowRecord)
 *
 * This module is the platform's PUBLIC API for federated build sessions
 * (Terminal, Paint, DAW, …): apps are added under src/apps/<id>/ and registered
 * at startup — zero edits to src/platform/**.
 */

/** FS node kinds — the real MF-1 domain union (`src/lib/fs/types.ts`). */
export type { FSNodeKind }

/**
 * Reference to the filesystem node an app was opened against: a full MF-1
 * catalog node (discriminated on `kind`; carries `accession`, `accessionedAt`,
 * and the kind-specific `content` / `src` / `appId`). Apps import THIS type —
 * never `FSNode` from lib/fs — so the contract stays the single import site
 * if the domain model ever evolves.
 */
export type FSNodeRef = FSNode

/** Props every app icon receives. Icons are render-only — no store access. */
export interface AppIconProps {
  /** Square side in CSS pixels; default treatment belongs to the launcher (IM-4c). */
  readonly size?: number
}

/** An app's glyph. Any React component accepting {@link AppIconProps}. */
export type AppIconComponent = ComponentType<AppIconProps>

/**
 * Why this window exists — captured by `openApp` at open time and stored on the
 * WM window record (so it survives persistence, MF-2). Discriminate on `source`.
 */
export type AppLaunchContext = LauncherLaunch | FileLaunch

/** Opened from a launcher/taskbar/desktop with no specific target. */
export interface LauncherLaunch {
  readonly source: 'launcher'
}

/** Opened against a filesystem node (double-click a file, "open with", …). */
export interface FileLaunch {
  readonly source: 'file'
  readonly file: FSNodeRef
}

/** Shared frozen default for launcher opens (`Object.freeze`d; never mutate). */
export const LAUNCHER_LAUNCH: AppLaunchContext = Object.freeze({ source: 'launcher' })

/** Props the platform hands to every mounted app surface. */
export interface AppSurfaceProps {
  /**
   * Owning window id (the wm-store's `WindowId`). Apps control their own window
   * through `useWMStore` (`closeWindow(windowId)` etc.) — imported directly,
   * the platform does not wrap the store per app.
   */
  readonly windowId: string
  /** Immutable launch context; see {@link AppLaunchContext}. */
  readonly launch: AppLaunchContext
}

/**
 * A platform-initiated close (HU-2): the title-bar ✕ and the WM's unclaimed
 * Esc both ask the app before they close. The `windowId` names the instance
 * (multi-instance apps must answer per window, not per manifest).
 */
export interface AppCloseRequest {
  readonly windowId: string
  /** The window's launch context at ask time (rebound records answer with the rebound context). */
  readonly launch: AppLaunchContext
}

/**
 * An app's close veto. Return `true` to VETO this close — the app then owns the
 * rest of the flow (typically an in-window guard strip that ends in the app
 * calling `closeWindow(windowId)` itself). Return `false` (or omit the manifest
 * field entirely) and the platform closes immediately. Default = close.
 *
 * The manifest is static, but dirty state lives in mounted surfaces: the
 * notepad's pattern is a tiny per-window guard registry its surface registers
 * into on mount (`registerCloseGuard`, notepad-model.ts) and the manifest's
 * `onCloseRequest` consults — absent guard (surface not mounted yet) answers
 * `false`, which is also the safe default.
 */
export type AppCloseRequestHandler = (request: AppCloseRequest) => boolean

/**
 * The app's window content. Either an eagerly imported component or a
 * `lazy(() => import(...))` — the platform mounts it inside a Suspense boundary
 * (lazy is the recommended pattern; TH-2 budget depends on per-app chunks).
 */
export type AppMountComponent =
  ComponentType<AppSurfaceProps> | LazyExoticComponent<ComponentType<AppSurfaceProps>>

/**
 * Default window size hints. `w`/`h` are required; omit `x`/`y` to accept the
 * platform's cascade placement for the origin. Hints are hints — the user's
 * geometry manipulations always win afterwards.
 */
export interface AppGeometryHints {
  readonly w: number
  readonly h: number
  readonly x?: number
  readonly y?: number
}

/** Manifest id grammar: lowercase kebab-case, leading letter. Ids are stable identities — never rename a shipped id. */
export const APP_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * One app's entire declaration. Everything the platform needs to list, launch,
 * route files to, and mount an app — and nothing else. All fields are immutable
 * after registration.
 */
export interface AppManifest {
  /** Stable unique id (`APP_ID_PATTERN`). Stored in window records; kebab-case. */
  readonly id: string
  /** Human label — default window title and launcher caption. */
  readonly name: string
  /** Launcher/taskbar glyph. */
  readonly icon: AppIconComponent
  /** Window content component (lazy-capable). */
  readonly mount: AppMountComponent
  /**
   * `true` → at most ONE window ever; re-open raises + focuses the existing one.
   * Default `false` (multi-instance): one window per open, one per file when
   * launched with `{ source: 'file' }` (reopening the same file focuses it).
   */
  readonly singleton?: boolean
  /**
   * FS node kinds this app can open. NOTE (IM-5): the DESKTOP's double-click
   * routing targets the reserved platform ids (app-ids.ts: folder→explorer,
   * text→notepad, image→image-viewer, app-link→its own appId) rather than
   * consulting manifests — `acceptedFileTypes` is the capability declaration
   * the explorer (AP-1) and launcher file-opens consult:
   * `listApps().find(app => app.acceptedFileTypes?.includes(node.kind))`.
   */
  readonly acceptedFileTypes?: readonly FSNodeKind[]
  /** Suggested first-window size (see {@link AppGeometryHints}). */
  readonly defaultGeometry?: AppGeometryHints
  /**
   * Derive the window's OPENING title from the launch context (HU-2): a
   * document app titles by its file's name (`launch.file.name`). Return
   * `undefined` (or omit the field) → the manifest's `name`. The opening
   * title rides the open commit itself — no later retitling — so the title
   * bar is correct before a lazy surface even mounts; live renames are the
   * app's business afterwards (`setWindowTitle`).
   */
  readonly titleForLaunch?: (launch: AppLaunchContext) => string | undefined
  /**
   * Close-request veto (HU-2). The platform consults this BEFORE closing a
   * window through its own chrome (title-bar ✕, unclaimed Esc): `true` vetoes
   * and the app owns the rest of the close flow, `false`/absent closes now.
   * See {@link AppCloseRequestHandler} for the per-window-state pattern.
   */
  readonly onCloseRequest?: AppCloseRequestHandler
}
