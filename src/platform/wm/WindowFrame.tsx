import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useWMStore, type WindowId, type WindowRecord } from '../stores'
import { isTextEntryTarget } from '../keyboard'
import { clampGeometryToViewport, maximizedGeometry, type ViewportSize } from './geometry'
import { useWindowGestures } from './interactions/use-window-gestures'
import { WindowResizeHandles } from './interactions/ResizeHandles'
import './wm.css'

export interface WindowFrameProps {
  readonly id: WindowId
  readonly viewport: ViewportSize
  /**
   * Content resolver — the IM-3 app-registry seam. Receives the live window
   * record, returns the node to mount in the content slot. Omit → placeholder
   * label naming the appId.
   */
  readonly renderContent?: (win: WindowRecord) => ReactNode
  /**
   * Close-request policy — the HU-2 app-registry seam (`appCloseGuardFor`).
   * Consulted before ANY platform-initiated close (title-bar ✕, unclaimed
   * Esc): returning `true` vetoes and the owning app takes the rest of the
   * flow. Omit → always close (the default contract).
   */
  readonly closeGuard?: (win: WindowRecord) => boolean
}

/**
 * One instrument-module window (IM-4a shell + IM-4b gestures): title bar +
 * status LED, minimize/maximize/close in console vocabulary, content slot,
 * click-anywhere focus/raise. ARIA dialog pattern with `aria-labelledby` on
 * the title; focus moves into the window when it becomes the focused one,
 * and an app content seat (the notepad's sheet, the viewer's stage) pulls it
 * deeper on mount. DD-1's keyboard map: Esc closes once unclaimed (see
 * handleKeyDown); F6 / Alt+Esc ride platform/keyboard.
 * Drag (title bar) and corner-bracket resize (se/e/s) ride the
 * committed RQ-3 pointer pattern via `useWindowGestures` — transient styles
 * during the gesture, ONE geometry commit at pointerup. Maximimized modules
 * are fixed furniture: no drag, no resize handles.
 */
export function WindowFrame({
  id,
  viewport,
  renderContent,
  closeGuard,
}: WindowFrameProps) {
  // Own-record selector (store layer rule 1): the record reference changes only
  // when THIS window is patched (title/flags/one geometry commit per gesture) —
  // never when other windows update. The `windows` map itself is never selected.
  const record = useWMStore((s) => s.windows[id])
  const focused = useWMStore((s) => s.focusedId === id)
  const rootRef = useRef<HTMLElement | null>(null)
  const gestures = useWindowGestures({ id, frameRef: rootRef, viewport })

  // Move DOM focus to the window when it becomes the focused one — unless focus
  // already sits inside it (an app input must never be stolen by a re-render).
  useEffect(() => {
    if (!focused) return
    const el = rootRef.current
    if (el && el !== document.activeElement && !el.contains(document.activeElement)) {
      el.focus()
    }
  }, [focused])

  const content = useMemo(
    () => (record && renderContent ? renderContent(record) : undefined),
    [record, renderContent],
  )

  if (!record) return null

  // Renderer derives bounds: maximized windows take viewport bounds from the
  // flag (store keeps normal geometry untouched); everything is clamped on-screen.
  const base = record.maximized ? maximizedGeometry(viewport) : record.geometry
  const geometry = clampGeometryToViewport(base, viewport)

  const style: CSSProperties = {
    left: geometry.x,
    top: geometry.y,
    width: geometry.w,
    height: geometry.h,
    zIndex: record.z,
  }

  // Handlers use getState() per the store layer rules — never store hooks.
  const activate = () => useWMStore.getState().focusWindow(id)
  const minimize = () => useWMStore.getState().minimizeWindow(id)
  const toggleMaximize = () => useWMStore.getState().toggleMaximize(id)
  // HU-2 close-request seam: every PLATFORM-initiated close (✕, unclaimed Esc)
  // asks the app first via the injected policy — `true` vetoes and the app owns
  // the rest (the notepad flares its lamp + interposes the guard strip and
  // closes itself when the operator answers). No policy / no veto → close now.
  const requestClose = () => {
    if (closeGuard && record && closeGuard(record)) return
    useWMStore.getState().closeWindow(id)
  }

  // DD-1 Esc-close: an UNCLAIMED Escape inside this window closes it. Claimed
  // means any of — a modifier chord (Alt+Esc is the OS window walk), an inner
  // handler that already preventDefaulted (the viewer's pan bounce, the
  // notepad's dirty guard which fully owns plain Esc before it gets here), a
  // text entry target (fields own their Escape). The close itself rides the
  // HU-2 seam above, so an app with a close guard is honored on this path too.
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.defaultPrevented) return
    if (isTextEntryTarget(event.target)) return
    event.preventDefault()
    requestClose()
  }

  const titleId = `wm-title-${id}`

  return (
    <section
      ref={rootRef}
      role="dialog"
      aria-modal={false}
      aria-labelledby={titleId}
      tabIndex={-1}
      className="wm-window"
      data-window-id={id}
      data-app-id={record.appId}
      data-focused={focused}
      data-minimized={record.minimized}
      data-maximized={record.maximized}
      onPointerDown={activate}
      onKeyDown={handleKeyDown}
      style={style}
    >
      <div className="wm-titlebar" {...gestures.titleBar}>
        {/* Status LED — lit = focused; lamp treatment in wm.css (UI-1). */}
        <span className="wm-led" data-lit={focused} aria-hidden="true" />
        <h2 className="wm-title" id={titleId} title={record.title}>
          {record.title}
        </h2>
        <div className="wm-controls">
          <button
            type="button"
            className="wm-control"
            aria-label="Minimize"
            title="Minimize — stow module"
            onClick={minimize}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            className="wm-control"
            aria-label={record.maximized ? 'Restore' : 'Maximize'}
            title={record.maximized ? 'Restore module' : 'Maximize — expand module'}
            onClick={toggleMaximize}
          >
            <span aria-hidden="true">▢</span>
          </button>
          <button
            type="button"
            className="wm-control wm-control-close"
            aria-label="Close"
            title="Close — release module"
            onClick={requestClose}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
      <div className="wm-content parchment-surface" data-wm-content>
        {content ?? <PlaceholderContent appId={record.appId} />}
      </div>
      {!record.maximized && <WindowResizeHandles handleProps={gestures.resizeHandle} />}
    </section>
  )
}

/** Default content while apps await the IM-3 registry — names the owning app. */
function PlaceholderContent({ appId }: { appId: string }) {
  return (
    <div className="wm-content-placeholder">
      <p className="wm-content-placeholder-appid">{appId}</p>
      <p>Module slot — content mounts via the IM-3 app registry.</p>
    </div>
  )
}
