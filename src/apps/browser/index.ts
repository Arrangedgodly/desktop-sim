/**
 * Browser manifest (AP-6) — the archive's FIELD ATLAS, sixth and final app
 * on the reserved-id fleet: registers `browser` (app-ids.ts), reserved since
 * IM-5. Nothing routes FILES into it (no acceptedFileTypes — the atlas is
 * opened, never "opened onto"), so the launcher entry is the only additional
 * surface this registration adds.
 *
 * Instance rule: SINGLETON — at most ONE atlas window ever; every later open
 * (launcher, taskbar) raises + focuses the existing one via the registry's
 * `singleton` instance key (docs/APP-CONTRACT.md instance rules).
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * NOTE (registration ORDER): irrelevant to routing (no file types declared);
 * rides BEHIND the about nameplate and BEFORE the settings console — the
 * launcher's first item stays the notepad and its last stays the console
 * (both e2e floors ride those positions — see src/apps/index.ts).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import { BROWSER_APP_ID, type AppManifest } from '../../platform/app-registry'
import { BrowserIcon } from './BrowserIcon'

const BrowserSurface = retryableLazy(() => import('./BrowserSurface'))

export const browserApp: AppManifest = {
  id: BROWSER_APP_ID,
  name: 'Field Atlas',
  icon: BrowserIcon,
  mount: BrowserSurface,
  singleton: true, // ONE atlas ever: re-open raises + focuses it
  defaultGeometry: { w: 720, h: 560 },
}
