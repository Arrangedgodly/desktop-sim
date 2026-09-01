import { Suspense } from 'react'
import type { AppLaunchContext, AppMountComponent } from './contract'
import { useAppRegistryStore } from './registry'
import './app-registry.css'

/**
 * One window's content slot (IM-3). Subscribes field-narrow to
 * `s => s.apps[appId]`, so registration changes swap the content even though the
 * window record (and WindowFrame's content memo) is reference-stable:
 * registered → app surface; unregistered → graceful notice.
 */
export function AppSlot({
  appId,
  windowId,
  launch,
}: {
  readonly appId: string
  readonly windowId: string
  readonly launch: AppLaunchContext
}) {
  const manifest = useAppRegistryStore((s) => s.apps[appId])
  if (!manifest) return <UnregisteredAppNotice appId={appId} />
  const Mount: AppMountComponent = manifest.mount
  return (
    <Suspense fallback={<AppLoading name={manifest.name} />}>
      <Mount windowId={windowId} launch={launch} />
    </Suspense>
  )
}

/** Suspense fallback while a lazy app chunk loads. */
function AppLoading({ name }: { readonly name: string }) {
  return (
    <div className="app-loading" data-app-loading role="status">
      Mounting {name}…
    </div>
  )
}

/**
 * Rendered when a window's app is not in the registry (unregistered while open,
 * or a restored window with an unknown appId). The window stays usable and
 * closable — never a crash, never a forced close.
 */
function UnregisteredAppNotice({ appId }: { readonly appId: string }) {
  return (
    <div className="app-notice" data-app-unregistered>
      <p className="app-notice-head">MODULE UNAVAILABLE</p>
      <p>
        <code>{appId}</code> is not registered with the archive. Its launcher entry has been
        removed; this window can be closed.
      </p>
    </div>
  )
}
