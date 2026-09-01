import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { useWMStore, type WindowId, type WindowRecord } from '../stores'
import { clampGeometryToViewport, maximizedGeometry, type ViewportSize } from './geometry'
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
}

/**
 * One instrument-module window (IM-4a shell): title bar + status LED,
 * minimize/maximize/close in console vocabulary, content slot, click-anywhere
 * focus/raise. ARIA dialog pattern with `aria-labelledby` on the title;
 * basic programmatic focusability only — Daredevil's full keyboard map is DD-1.
 * Drag/resize arrive in IM-4b (hence `touch-action: none` on the title bar).
 */
export function WindowFrame({ id, viewport, renderContent }: WindowFrameProps) {
  // Own-record selector (store layer rule 1): the record reference changes only
  // when THIS window is patched (title/flags/one geometry commit per gesture) —
  // never when other windows update. The `windows` map itself is never selected.
  const record = useWMStore((s) => s.windows[id])
  const focused = useWMStore((s) => s.focusedId === id)
  const rootRef = useRef<HTMLElement | null>(null)

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
  const close = () => useWMStore.getState().closeWindow(id)

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
      style={style}
    >
      <header className="wm-titlebar">
        {/* Status LED placeholder — lit = focused; final lamp treatment is UI-1's. */}
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
            onClick={close}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </header>
      <div className="wm-content" data-wm-content>
        {content ?? <PlaceholderContent appId={record.appId} />}
      </div>
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
