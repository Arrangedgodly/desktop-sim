import { openApp, type AppSurfaceProps } from '../../platform/app-registry'
import { useWMStore } from '../../platform/stores'
import './demo.css'

/**
 * Demo app surface (IM-3 reference example). Default export so the manifest can
 * `lazy()`-load it — its own chunk. Receives AppSurfaceProps and nothing else:
 * window control goes through the wm-store, app state lives in app-owned stores.
 */
export default function DemoSurface({ windowId, launch }: AppSurfaceProps) {
  const close = () => useWMStore.getState().closeWindow(windowId)
  const openAnother = () => openApp('demo') // multi-instance: a new window per click
  const fileName = launch.source === 'file' ? launch.file.name : '—'

  return (
    <div className="demo-surface">
      <p className="demo-tag">IM-3 CONTRACT DEMO</p>
      <div className="demo-well well">
        {/* CRT raster — UI-1 scanline primitive; decorative, hidden from AT */}
        <div className="scanlines" aria-hidden="true" />
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
      </div>
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
