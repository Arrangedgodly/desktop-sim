/**
 * Retryable lazy mounts (HU-1) — the manifest `mount` helper that makes the
 * MODULE FAULT card's "Reload module" honest for lazy app chunks.
 *
 * WHY THIS EXISTS — TWO layers of caching defeat a naive retry:
 *  1. React `lazy()` caches a REJECTED load forever (`_status: Rejected`
 *     re-throws on every later mount). `retryableLazy(load)` keeps one stable
 *     component identity while the reset seam mints a FRESH `lazy()` behind
 *     it.
 *  2. The BROWSER's module map caches a failed dynamic import for the page's
 *     lifetime: re-importing the same URL re-fails without touching the
 *     network, even after the connection returns. The only in-page recovery
 *     is importing the module under a DIFFERENT key — a cache-busting query
 *     (`url?hold-retry=N`). The boundary extracts the module URL from the
 *     failure (browsers name it in the TypeError) and hands it to
 *     {@link resetLazyMount}; engines that do not name it (older Safari) get
 *     the plain reset, and the card's reload advice covers the rest.
 *
 * Law (docs/APP-CONTRACT.md): apps declare `mount: retryableLazy(() =>
 * import('./Surface'))` exactly where they used to write `lazy(...)`. Plain
 * eager components need nothing — {@link resetLazyMount} is a no-op for them
 * and the boundary's reload is a plain remount.
 */

import { lazy } from 'react'
import type { ComponentType } from 'react'
import type { AppSurfaceProps } from './contract'

/** The loader shape every app surface module satisfies (`export default`). */
export type AppSurfaceLoader = () => Promise<{ default: ComponentType<AppSurfaceProps> }>

/** Reset seam carried on the stable wrapper component (internal contract). */
interface RetryableMountSeam {
  readonly __retryableLazyReset?: (url?: string) => void
}

/**
 * A `lazy()`-equivalent mount whose failed loads can be re-attempted. Renders
 * exactly like the app's previous `lazy(load)` (same Suspense semantics, same
 * single component identity) until a fault resets it — see
 * {@link resetLazyMount}, called by the app error boundary's Reload module.
 */
export function retryableLazy(
  load: AppSurfaceLoader,
): ComponentType<AppSurfaceProps> & RetryableMountSeam {
  let Current = lazy(load)
  let busts = 0
  function RetryableMount(props: AppSurfaceProps) {
    return <Current {...props} />
  }
  RetryableMount.__retryableLazyReset = (url?: string) => {
    if (url === undefined) {
      Current = lazy(load) // fresh payload memo → the next mount re-imports
      return
    }
    // Cache-busted re-import: a NEW module-map key, so the browser actually
    // re-fetches the chunk the failed transfer poisoned. Each reset bumps the
    // query so repeated reloads keep getting fresh keys.
    busts += 1
    const busted = `${url}${url.includes('?') ? '&' : '?'}hold-retry=${busts}`
    Current = lazy(() => import(/* @vite-ignore */ busted))
  }
  return RetryableMount
}

/**
 * Re-arm a {@link retryableLazy} mount after a failed load. `url` (same-origin
 * module URL extracted from the failure) switches the retry to the
 * cache-busted re-import; without it the reset re-runs the app's own loader.
 * `false` for eager components (nothing to re-fetch — a plain remount is
 * already the whole fix) and for foreign lazy components.
 */
export function resetLazyMount(
  mount: ComponentType<AppSurfaceProps> | object,
  url?: string,
): boolean {
  const seam = mount as RetryableMountSeam
  if (typeof seam.__retryableLazyReset === 'function') {
    seam.__retryableLazyReset(url)
    return true
  }
  return false
}
