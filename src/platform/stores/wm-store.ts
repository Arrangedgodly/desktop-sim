import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { AppLaunchContext } from '../app-registry/contract'

/**
 * WM store — open-window registry, focus + z-order, geometry (IM-2, RQ-2 committed).
 *
 * Layer rules (docs/ultron/research/rq2-rq3-frontend-arch.md, "For IM-2"):
 * - Selectors are field-narrow: a window component selects its own record fields
 *   (`s => s.windows[id]?.geometry.x`), never the `windows` map; z-order consumers
 *   select `s => s.zOrder`; focus consumers select `s => s.focusedId`.
 * - Event handlers (IM-4a/IM-4b) use `useWMStore.getState()` / actions, never hooks.
 * - Drag geometry is two-phase: pointermove applies `style.transform` on a ref with
 *   NO store writes (or, only if a live observer like the phosphor trail needs it,
 *   writes to the `dragging` slice alone); pointerup makes exactly ONE atomic
 *   commit via `commitWindowGeometry`. Never write geometry at pointermove rate.
 * - Persistence seam (MF-2): subscribe via `useWMStore.subscribe(selector, listener)`
 *   (available through `subscribeWithSelector`) and debounce — never useEffect polling.
 */

export type WindowId = string
export type AppId = string
export type InstanceId = string

export interface WindowGeometry {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** One entry in the open-windows registry. */
export interface WindowRecord {
  readonly id: WindowId
  /** Which app owns this window (IM-3 manifest id). */
  readonly appId: AppId
  /** App-instance key; equal appId+instanceId dedupes to one window (singleton apps). */
  readonly instanceId: InstanceId
  /**
   * Normal-state geometry. When `maximized` is true the renderer derives viewport
   * bounds from the flag; `geometry` is preserved untouched for un-maximize.
   */
  readonly geometry: WindowGeometry
  /** Numeric stacking value; kept in lockstep with position in `zOrder`. */
  readonly z: number
  readonly minimized: boolean
  readonly maximized: boolean
  readonly title: string
  /**
   * Launch context captured at open (IM-3 `openApp`): why/how this window was
   * opened. Consumed by the app surface via `appContentFor`; riding on the
   * record means it survives MF-2 persistence. Absent for platform-level
   * windows opened directly through the store. Updated ONLY through the
   * `rebindWindow` seam (HU-2) — open-time capture is otherwise immutable.
   */
  readonly launch?: AppLaunchContext
  /**
   * Opaque per-window app state (HU-2 launch-rebind seam). The platform never
   * reads it; an app may persist a small structured-clone-safe payload on its
   * own window record (the notepad stores its untitled draft body here so a
   * reload restores the SAME draft instead of a blank sheet). Apps MUST
   * defensively validate on read — it crosses the persistence trust boundary
   * (validate.ts carries it verbatim).
   */
  readonly appState?: unknown
  readonly openedAt: number
}

/**
 * Transient drag slice (RQ-2 two-phase pattern). Optional live position published
 * ONLY when a non-window observer (e.g. the IM-5 phosphor trail) needs it; window
 * components must never select this. Cleared atomically by `commitWindowGeometry`.
 */
export interface DraggingState {
  readonly id: WindowId
  readonly x: number
  readonly y: number
}

export interface OpenWindowInput {
  readonly appId: AppId
  /** Omit for multi-instance apps; pass a stable key for singleton apps (IM-3). */
  readonly instanceId?: InstanceId
  readonly title?: string
  /** IM-3 launch context — stored verbatim on the window record. */
  readonly launch?: AppLaunchContext
  readonly geometry?: WindowGeometry
}

interface RaisedSlice {
  readonly windows: Readonly<Record<WindowId, WindowRecord>>
  readonly zOrder: readonly WindowId[]
  readonly zCounter: number
}

/**
 * Persisted-session snapshot (MF-2 hydration input). `windows` is in bottom → top
 * stacking order (the persisted zOrder); the map, `zOrder`, `zCounter` and focus
 * are reconstructed from it. Records are restored VERBATIM (geometry, z, minimized,
 * `launch` context per IM-3) — not re-opened through `openWindow` — so a restored
 * session is byte-identical to the saved one. Windows whose app is no longer
 * registered still restore; AppSlot renders its MODULE UNAVAILABLE notice.
 */
export interface WMSessionSnapshot {
  readonly windows: readonly WindowRecord[]
}

export interface WMState {
  readonly windows: Readonly<Record<WindowId, WindowRecord>>
  /** Bottom → top stacking order. */
  readonly zOrder: readonly WindowId[]
  readonly focusedId: WindowId | null
  /** Monotonic z source; lives in state so a persisted WM snapshot restores sanely. */
  readonly zCounter: number
  readonly dragging: DraggingState | null

  /**
   * Replace the whole session from a persisted snapshot (MF-2 loader) — one atomic
   * set, mirroring the fs-store `init` seam. Rebuilds `zOrder`/`zCounter`/focus from
   * the array order and clears any live drag.
   */
  hydrate: (session: WMSessionSnapshot) => void

  /**
   * Register a window (or raise/focus/restore the existing one when appId+instanceId
   * match — singleton re-open never duplicates). Returns the window id.
   */
  openWindow: (input: OpenWindowInput) => WindowId
  closeWindow: (id: WindowId) => void
  /** Raise + focus; a minimized target is restored (a minimized window cannot hold focus). */
  focusWindow: (id: WindowId) => void
  /** Pure z-order raise (moves the window to top); touches no flags and no focus. */
  raiseWindow: (id: WindowId) => void
  minimizeWindow: (id: WindowId) => void
  /** Un-minimize + raise + focus. */
  restoreWindow: (id: WindowId) => void
  /** Flip `maximized`, preserving normal-state geometry; raises + focuses (interaction implies activation). */
  toggleMaximize: (id: WindowId) => void
  /** Mark a gesture as live; seeds the transient slice from current geometry. */
  beginDrag: (id: WindowId) => void
  /** Live-position publish for non-window observers only — NEVER touches `windows`. */
  updateDrag: (x: number, y: number) => void
  endDrag: () => void
  /**
   * The ONE atomic geometry commit per drag/resize gesture (pointerup / lostpointercapture).
   * Clears the transient `dragging` slice for that window in the same commit.
   */
  commitWindowGeometry: (id: WindowId, geometry: WindowGeometry) => void
  /**
   * Retitle a window (HU-2 rename-follow): document-bound apps keep the title
   * bar reading the LIVE specimen name — a rename in another window follows
   * into this one. No-op on unknown id or an unchanged title.
   */
  setWindowTitle: (id: WindowId, title: string) => void
  /**
   * Patch the window's opaque `appState` payload (HU-2 draft persistence).
   * Structured-clone-safe values only — it rides the record into MF-2.
   * No-op on unknown id or a reference-equal payload.
   */
  setWindowAppState: (id: WindowId, appState: unknown) => void
  /**
   * The launch-rebind seam (HU-2): rebind a window onto a new instance +
   * launch context in ONE atomic patch. The notepad uses it when an untitled
   * draft is accessioned — the window BECOMES the file window (`instanceId =
   * file:<nodeId>`), so same-file dedupe and reload restoration treat it as if
   * it had been opened from the specimen all along. `false` = no-op (unknown
   * id, or another window already holds the target instance — first holder
   * wins, warned).
   */
  rebindWindow: (id: WindowId, rebind: { instanceId: InstanceId; launch: AppLaunchContext }) => boolean
}

const DEFAULT_GEOMETRY: WindowGeometry = { x: 96, y: 64, w: 720, h: 480 }
const CASCADE_STEP = 32
const CASCADE_WRAP = 8

/**
 * Default cascade placement for the next window (96/64 origin, 32px step,
 * wrapping after 8). Pure function of the open-window count. Exported for
 * IM-3: `openApp` composes manifest size hints over this platform cascade.
 */
export function cascadedGeometry(openCount: number): WindowGeometry {
  const offset = (openCount % CASCADE_WRAP) * CASCADE_STEP
  return { ...DEFAULT_GEOMETRY, x: DEFAULT_GEOMETRY.x + offset, y: DEFAULT_GEOMETRY.y + offset }
}

/** Move `id` to the top of the stack and bump its z. No-op for unknown ids. */
function raiseSlice(slice: RaisedSlice, id: WindowId): RaisedSlice {
  const win = slice.windows[id]
  if (!win) return slice
  const nextZ = slice.zCounter + 1
  return {
    windows: { ...slice.windows, [id]: { ...win, z: nextZ } },
    zOrder: [...slice.zOrder.filter((it) => it !== id), id],
    zCounter: nextZ,
  }
}

/** Patch one window record immutably; assumes the id was just verified to exist. */
function withWindow(
  windows: Readonly<Record<WindowId, WindowRecord>>,
  id: WindowId,
  patch: Partial<WindowRecord>,
): Readonly<Record<WindowId, WindowRecord>> {
  return { ...windows, [id]: { ...windows[id]!, ...patch } }
}

/** Topmost non-minimized window in `zOrder` (optionally ignoring one id), or null. */
function topmostFocusable(
  windows: Readonly<Record<WindowId, WindowRecord>>,
  zOrder: readonly WindowId[],
  ignoreId?: WindowId,
): WindowId | null {
  for (let i = zOrder.length - 1; i >= 0; i--) {
    const id = zOrder[i]
    if (id === undefined || id === ignoreId) continue
    const win = windows[id]
    if (win && !win.minimized) return id
  }
  return null
}

export const useWMStore = create<WMState>()(
  subscribeWithSelector((set, get) => ({
    windows: {},
    zOrder: [],
    focusedId: null,
    zCounter: 0,
    dragging: null,

    hydrate: (session) => {
      const windows: Record<WindowId, WindowRecord> = {}
      for (const record of session.windows) windows[record.id] = record
      const zOrder = session.windows.map((record) => record.id)
      const zCounter = session.windows.reduce((max, record) => Math.max(max, record.z), 0)
      set({
        windows,
        zOrder,
        zCounter,
        focusedId: topmostFocusable(windows, zOrder),
        dragging: null,
      })
    },

    openWindow: (input) => {
      const state = get()
      if (input.instanceId !== undefined) {
        const existing = Object.values(state.windows).find(
          (w) => w.appId === input.appId && w.instanceId === input.instanceId,
        )
        if (existing) {
          get().focusWindow(existing.id) // raises + focuses + un-minimizes
          return existing.id
        }
      }
      const id = crypto.randomUUID()
      const nextZ = state.zCounter + 1
      const record: WindowRecord = {
        id,
        appId: input.appId,
        instanceId: input.instanceId ?? `auto:${id}`,
        geometry: input.geometry ?? cascadedGeometry(Object.keys(state.windows).length),
        z: nextZ,
        minimized: false,
        maximized: false,
        title: input.title ?? input.appId,
        launch: input.launch,
        openedAt: Date.now(),
      }
      set({
        windows: { ...state.windows, [id]: record },
        zOrder: [...state.zOrder, id],
        zCounter: nextZ,
        focusedId: id,
      })
      return id
    },

    closeWindow: (id) => {
      const { windows, zOrder, focusedId } = get()
      if (!windows[id]) return
      const nextWindows = Object.fromEntries(Object.entries(windows).filter(([key]) => key !== id))
      const nextZOrder = zOrder.filter((it) => it !== id)
      set({
        windows: nextWindows,
        zOrder: nextZOrder,
        focusedId: focusedId === id ? topmostFocusable(nextWindows, nextZOrder) : focusedId,
      })
    },

    focusWindow: (id) => {
      const state = get()
      if (!state.windows[id]) return
      const raised = raiseSlice(state, id)
      set({
        windows: withWindow(raised.windows, id, { minimized: false }),
        zOrder: raised.zOrder,
        zCounter: raised.zCounter,
        focusedId: id,
      })
    },

    raiseWindow: (id) => {
      const state = get()
      if (!state.windows[id]) return
      set(raiseSlice(state, id))
    },

    minimizeWindow: (id) => {
      const { windows, zOrder, focusedId } = get()
      const win = windows[id]
      if (!win || win.minimized) return
      const nextWindows = withWindow(windows, id, { minimized: true })
      set({
        windows: nextWindows,
        focusedId: focusedId === id ? topmostFocusable(nextWindows, zOrder, id) : focusedId,
      })
    },

    restoreWindow: (id) => {
      if (!get().windows[id]) return
      get().focusWindow(id) // raise + focus + un-minimize
    },

    toggleMaximize: (id) => {
      const state = get()
      const win = state.windows[id]
      if (!win) return
      const raised = raiseSlice(state, id)
      set({
        windows: withWindow(raised.windows, id, { maximized: !win.maximized }),
        zOrder: raised.zOrder,
        zCounter: raised.zCounter,
        focusedId: id,
      })
    },

    beginDrag: (id) => {
      const { windows } = get()
      const win = windows[id]
      if (!win) return
      set({ dragging: { id, x: win.geometry.x, y: win.geometry.y } })
    },

    updateDrag: (x, y) => {
      const { dragging } = get()
      if (!dragging) return
      // Deliberately touches ONLY the transient slice — `windows` keeps its reference.
      set({ dragging: { ...dragging, x, y } })
    },

    endDrag: () => {
      if (!get().dragging) return
      set({ dragging: null })
    },

    commitWindowGeometry: (id, geometry) => {
      const { windows, dragging } = get()
      const win = windows[id]
      if (!win) return
      set({
        windows: withWindow(windows, id, { geometry }),
        dragging: dragging?.id === id ? null : dragging,
      })
    },

    setWindowTitle: (id, title) => {
      const { windows } = get()
      const win = windows[id]
      if (!win || win.title === title) return
      set({ windows: withWindow(windows, id, { title }) })
    },

    setWindowAppState: (id, appState) => {
      const { windows } = get()
      const win = windows[id]
      if (!win || win.appState === appState) return
      set({ windows: withWindow(windows, id, { appState }) })
    },

    rebindWindow: (id, rebind) => {
      const { windows } = get()
      const win = windows[id]
      if (!win) return false
      const clash = Object.values(windows).find(
        (other) => other.id !== id && other.appId === win.appId && other.instanceId === rebind.instanceId,
      )
      if (clash) {
        console.warn(
          '[wm-store] rebind rejected: instance "%s" is already held by another window',
          rebind.instanceId,
        )
        return false
      }
      set({ windows: withWindow(windows, id, { instanceId: rebind.instanceId, launch: rebind.launch }) })
      return true
    },
  })),
)
