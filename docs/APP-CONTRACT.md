# The HOLD/OS App Contract

**How an app plugs into the desktop-sim platform — for federated build sessions
(Terminal, Paint, DAW, …) and anyone adding the next module.**

You are writing an app. The platform (window chrome, focus, z-order, dragging,
taskbar, persistence, boot) is NOT yours to build and NOT yours to edit. This
document is the entire interface between your app and the platform.

## Source of truth

The **TypeScript types are the contract**. This doc explains them; the code
decides. If anything here disagrees with the code, the code wins and this doc
gets fixed.

| Concern | File (repo-relative) |
| --- | --- |
| All contract types (`AppManifest`, `AppLaunchContext`, …) | `src/platform/app-registry/contract.ts` |
| Registry API (`registerApp`, `openApp`, `getApp`, `listApps`, …) | `src/platform/app-registry/registry.ts` |
| WM wiring (`appContentFor`) | `src/platform/app-registry/AppSlot.tsx`, `content.tsx` |
| Public barrel (import everything from here) | `src/platform/app-registry/index.ts` |
| Window store your app may call into | `src/platform/stores/wm-store.ts` |
| FS domain model (nodes, pure ops, envelope — aliased by the contract) | `src/lib/fs/` |
| Living reference example app | `src/apps/demo/` |

Import platform API from `'../../platform/app-registry'` (path adjusted to your
depth). Never import from deeper platform internals except the stores you are
told you may use (below).

## The 30-second version

1. Create `src/apps/<your-id>/` exporting an `AppManifest`.
2. Add one line to the array in `src/apps/index.ts`.
3. Done. `npm run dev` — your app is registerable, launchable, and rendered in a
   real window with title bar, focus, z-order, minimize/maximize, and
   persistence handled by the platform.

Zero edits under `src/platform/**`. That is the point of this contract.

## AppManifest fields

`AppManifest` is your app's entire declaration (see `contract.ts` for the
canonical shape — all fields readonly):

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | `string` | yes | Stable unique identity, kebab-case (`APP_ID_PATTERN`: `^[a-z][a-z0-9-]*$`). Stored inside window records — **never rename a shipped id**. |
| `name` | `string` | yes | Human label; default window title and launcher caption. |
| `icon` | `AppIconComponent` | yes | React component taking `{ size?: number }`. Render-only; touches no stores. |
| `mount` | `AppMountComponent` | yes | Your window content. A component accepting `AppSurfaceProps`, **or** `lazy(() => import(...))` — the platform mounts it inside a `Suspense` boundary. Lazy is the recommended pattern. |
| `singleton` | `boolean` | no (default `false`) | `true` → at most ONE window ever; re-open raises + focuses the existing one. Omit for multi-instance. |
| `acceptedFileTypes` | `readonly FSNodeKind[]` | no | FS node kinds (`'folder' | 'text' | 'image' | 'app-link'`) your app can open. The desktop's double-click routing consults exactly this list. |
| `defaultGeometry` | `AppGeometryHints` | no | `{ w, h }` required, `{ x, y }` optional. Omitted origin → platform cascade placement. Hints apply to the first open only; the user's geometry always wins afterwards. |

## What your mounted component receives

`AppSurfaceProps` — the platform hands your surface exactly two props:

```ts
interface AppSurfaceProps {
  windowId: string   // the owning window (wm-store's WindowId)
  launch: AppLaunchContext // why this window exists — see below
}
```

Everything else your app needs comes from stores you import directly
(`useWMStore`, `useFSStore`, `useSettingsStore`, or your own zustand store).
Close/focus your own window with `useWMStore.getState().closeWindow(windowId)`.

## AppLaunchContext

Discriminated union — check `launch.source`:

```ts
type AppLaunchContext =
  | { source: 'launcher' }                     // opened from a launcher/taskbar
  | { source: 'file'; file: FSNodeRef }        // opened against an FS node
```

- Captured once by `openApp` and stored **on the window record** — so it travels
  with the window into persistence (a Notepad window restored after reload still
  knows which file it holds).
- `FSNodeRef` is the real FS domain node from MF-1 (`src/lib/fs/types.ts`), a
  union discriminated on `kind`. Every node carries `{ id, parentId, name, kind,
  accession, accessionedAt }`; the kind adds `content` (text), `src` (image),
  or `appId` (app-link). Treat it as immutable snapshot data — if the tree
  changed since open, re-read via `useFSStore`. **Always import `FSNodeRef`
  from the contract, never from `src/lib/fs` directly** — that is the one
  import site that keeps your app buildable if the domain model evolves.

## Instance rules (singleton vs multi-instance)

Enforced by `openApp` through the WM store's appId+instanceId dedupe — you do
nothing:

- **Singleton** (`singleton: true`): one window ever; every open raises and
  focuses it. Use for Settings/About-style apps.
- **Multi-instance, no file**: a new window per open.
- **Multi-instance + file**: one window **per file id** (`instanceId =
  file:<nodeId>`); opening the same file again focuses its existing window.

## Registry API

| Export | What it does |
| --- | --- |
| `registerApp(manifest): boolean` | Validate + store one manifest. `false` = rejected (duplicate id — first registration wins — or non-kebab id), with `console.warn`. |
| `registerApps(manifests): number` | Bulk registration; returns how many landed. Startup path. |
| `unregisterApp(id): boolean` | Remove the manifest. Launcher entries disappear; **open windows stay open** and render the "module unavailable" notice. |
| `getApp(id): AppManifest \| null` | Non-reactive lookup (handlers/tests). |
| `listApps(): readonly AppManifest[]` | Registration order. File routing one-liner: `listApps().find(a => a.acceptedFileTypes?.includes(node.kind))`. |
| `openApp(id, launch?): WindowId \| null` | **The only sanctioned way to open an app window.** Applies manifest title/geometry/instance rules, stores `launch` on the record. Fails soft on unknown id: `null` + `console.warn`, never a throw. |
| `useAppRegistryStore` | Reactive store (`s => s.apps[id]`, `s => s.order`) for launcher UI. |
| `appContentFor(win): ReactNode` | Pass as `<WindowHost contentFor={appContentFor} />` — already wired in `src/main.tsx`; you never touch this. |
| `LAUNCHER_LAUNCH`, `APP_ID_PATTERN`, `SINGLETON_INSTANCE_KEY`, `fileInstanceKey` | Shared constants. |

## Lifecycle rules

1. **Register at startup, exactly once.** Registration happens in
   `src/main.tsx` via `src/apps/index.ts` before first render. No production
   path registers at user-interaction time. (`unregisterApp` exists for tests
   and a future "uninstall" affordance.)
2. **Open only through `openApp`.** Never call
   `useWMStore.getState().openWindow` for an app window — title, geometry,
   instance dedupe and launch capture are the registry's job. (`openWindow`
   remains valid for platform-level windows.)
3. **Unregister is launcher-scoped.** It never closes windows and never throws;
   affected windows render the graceful notice until the user closes them.
4. **Your app's state is yours.** Keep it in React state or an app-owned
   zustand store. Know the platform semantics: minimize keeps your component
   MOUNTED (state survives); close destroys it; persistence (MF-2) saves the WM
   envelope and FS — if the user must not lose it, persist it or guard close
   (the Notepad dirty-guard pattern, AP-2).
5. **Errors in your surface should stay in your surface** — an app-level error
   boundary (HU-1) is on the platform roadmap, but write your component as if
   a crash must never take the OS down.

## Do / Don't

**Do**

- `lazy()` your surface so it ships as its own chunk (see the demo app; TH-2's
  bundle budget depends on this).
- Keep every file of your app inside `src/apps/<id>/` — component, icon, styles,
  tests. Own your CSS class names (prefix them, e.g. `.demo-*`).
- Import stores directly (`useWMStore`, `useFSStore`) when you need them.
- Accept `AppSurfaceProps` on your surface and use `launch` for file opens.
- Register in `src/apps/index.ts` and nowhere else.

**Don't**

- Don't edit anything under `src/platform/**` — if the contract can't express
  what you need, stop and report it back to the platform lane instead of
  forking the seam.
- Don't open app windows via `useWMStore.openWindow`.
- Don't import `FSNode` from `src/lib/fs` — use the contract's `FSNodeRef`
  re-export.
- Don't do store work inside your icon component (render-only).
- Don't register/unregister at runtime based on user interaction.
- Don't build your own persistence envelope for data MF-2 already covers (WM,
  FS, settings); an app-owned zustand store for genuinely app-local state is
  fine.
- Don't render `document`-level portals outside your window without an a11y
  plan (DD-1/DD-2 own the keyboard/ARIA audit).

## Complete example app

This is the real demo app, verbatim (`src/apps/demo/`). It exercises every
manifest field, the lazy mount, the launch context, window self-control, and
multi-instance opening. Copy this folder as your starting point.

**`src/apps/demo/index.ts` — the manifest:**

```ts
import { lazy } from 'react'
import type { AppManifest } from '../../platform/app-registry'
import { DemoIcon } from './DemoIcon'

const DemoSurface = lazy(() => import('./DemoSurface'))

export const demoApp: AppManifest = {
  id: 'demo',
  name: 'Demo Module',
  icon: DemoIcon,
  mount: DemoSurface,
  // multi-instance (singleton omitted → false): one window per open/file
  acceptedFileTypes: ['text'],
  defaultGeometry: { w: 420, h: 340 },
}
```

**`src/apps/demo/DemoSurface.tsx` — the lazy surface (default export!):**

```tsx
import { openApp, type AppSurfaceProps } from '../../platform/app-registry'
import { useWMStore } from '../../platform/stores'
import './demo.css'

export default function DemoSurface({ windowId, launch }: AppSurfaceProps) {
  const close = () => useWMStore.getState().closeWindow(windowId)
  const openAnother = () => openApp('demo') // multi-instance: a new window per click
  const fileName = launch.source === 'file' ? launch.file.name : '—'

  return (
    <div className="demo-surface">
      <p className="demo-tag">IM-3 CONTRACT DEMO</p>
      <dl className="demo-readout">
        <div>
          <dt>launch.source</dt>
          <dd>
            <code>{launch.source}</code>
          </dd>
        </div>
        <div>
          <dt>launch.file</dt>
          <dd>
            <code>{fileName}</code>
          </dd>
        </div>
        <div>
          <dt>windowId</dt>
          <dd>
            <code>{windowId}</code>
          </dd>
        </div>
      </dl>
      <div className="demo-actions">
        <button type="button" onClick={openAnother}>
          Open another instance
        </button>
        <button type="button" className="demo-close" onClick={close}>
          Close window
        </button>
      </div>
    </div>
  )
}
```

**`src/apps/demo/DemoIcon.tsx` — the icon (render-only):**

```tsx
import type { AppIconProps } from '../../platform/app-registry'

export function DemoIcon({ size = 16 }: AppIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false"
      style={{ display: 'block' }}>
      <rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" />
      <path d="M4.5 11.5 L6.5 4.5 L9.5 4.5 L11.5 11.5" fill="none" stroke="currentColor" />
      <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeDasharray="1 2" />
    </svg>
  )
}
```

(`src/apps/demo/demo.css` holds app-scoped styles prefixed `.demo-*` — see the
file. If this example and the file ever disagree, the file wins.)

**`src/apps/index.ts` — the one registration line you add:**

```ts
import type { AppManifest } from '../platform/app-registry'
import { demoApp } from './demo'

export const apps: readonly AppManifest[] = [demoApp] // ← add yourApp here
```

## How to add your app (checklist)

1. `mkdir src/apps/<your-id>` (kebab-case, same as your manifest id).
2. Write `index.ts` (manifest), `<Name>Surface.tsx` (default-exported, lazy),
   `<Name>Icon.tsx`, `<name>.css`, plus `*.test.ts(x)` if you add logic.
3. Add your manifest to the array in `src/apps/index.ts`.
4. Validate from the repo root:

   ```sh
   npm run typecheck   # tsc --noEmit
   npm run lint        # eslint .
   npm test            # vitest run
   npm run build       # tsc --noEmit && vite build — your surface should
                       # appear as its own dist/assets/<Name>Surface-*.js chunk
   ```

5. `npm run dev` and open your app from the demo desktop; confirm singleton or
   multi-instance behavior matches your manifest.

## Platform behavior you get for free (and should rely on)

- Window chrome: title bar + status LED, minimize/maximize/close, click-to-focus
  and z-order raising, viewport-clamped geometry (IM-4a; drag/resize IM-4b).
- Minimize keeps your surface mounted (state survives); restore re-shows it.
- Lazy loading under a Suspense fallback (`Mounting <name>…`).
- Graceful absence: if your app is unregistered while windows are open, they
  render a "MODULE UNAVAILABLE" notice instead of crashing.
- Persistence (MF-2, in flight): window records — including the launch context —
  and the FS tree survive reload; plan your app state accordingly.
