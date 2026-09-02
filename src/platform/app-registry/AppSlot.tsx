import { Suspense } from 'react'
import type { ReactNode } from 'react'
import type { AppLaunchContext, AppMountComponent } from './contract'
import { useAppRegistryStore } from './registry'
import { AppBoundary } from './AppBoundary'
import { renderFault } from './fault-seam'
import './app-registry.css'

/**
 * One window's content slot (IM-3; HU-1 adds the fault boundary). Subscribes
 * field-narrow to `s => s.apps[appId]`, so registration changes swap the
 * content even though the window record (and WindowFrame's content memo) is
 * reference-stable: registered → app surface; unregistered → graceful notice.
 *
 * Everything the registry resolves for a window mounts INSIDE an
 * {@link AppBoundary} — a render throw or a lazy-chunk load failure in any app
 * isolates to this one window as the MODULE FAULT card. The dev fault seam
 * (`renderFault`, null in every production session) substitutes faulting
 * content for tests/e2e — see fault-seam.ts.
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
    <AppBoundary appId={appId} moduleName={manifest.name} mount={Mount}>
      <AppSlotContent
        fault={renderFault(appId)}
        Mount={Mount}
        name={manifest.name}
        windowId={windowId}
        launch={launch}
      />
    </AppBoundary>
  )
}

/** The boundary's child: the injected dev fault, else the app inside Suspense. */
function AppSlotContent({
  fault,
  Mount,
  name,
  windowId,
  launch,
}: {
  readonly fault: ReactNode
  readonly Mount: AppMountComponent
  readonly name: string
  readonly windowId: string
  readonly launch: AppLaunchContext
}) {
  if (fault !== null) return <>{fault}</>
  return (
    <Suspense fallback={<AppLoading name={name} />}>
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
