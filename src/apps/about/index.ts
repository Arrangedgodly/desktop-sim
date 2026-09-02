/**
 * About manifest (AP-5) — the SCIENCE OFFICER'S NAMEPLATE MANIFEST, fifth app
 * on the reserved-id fleet: registers `about` (app-ids.ts), reserved since
 * IM-5. Registering lights the seeded desktop reference (`nameplate` app-link
 * → appId `about`) AND the explorer's hold listing — the routing tables have
 * pointed here since IM-5; this module arrives into place.
 *
 * Nothing routes FILES into it (no acceptedFileTypes — the manifest is
 * opened, never "opened onto"), so the launcher entry is the only additional
 * surface this registration adds.
 *
 * Instance rule: SINGLETON — at most ONE manifest window ever; every later
 * open (desktop double-click, launcher, explorer) raises + focuses the
 * existing one via the registry's `singleton` instance key
 * (docs/APP-CONTRACT.md instance rules).
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * NOTE (registration ORDER): irrelevant to routing (no file types declared);
 * rides BEHIND the explorer and BEFORE the settings console — the launcher's
 * first item stays the notepad and its last stays the console (both e2e
 * floors ride those positions — see src/apps/index.ts).
 */

import { lazy } from 'react'
import { ABOUT_APP_ID, type AppManifest } from '../../platform/app-registry'
import { AboutIcon } from './AboutIcon'

const AboutSurface = lazy(() => import('./AboutSurface'))

export const aboutApp: AppManifest = {
  id: ABOUT_APP_ID,
  name: 'Nameplate Manifest',
  icon: AboutIcon,
  mount: AboutSurface,
  singleton: true, // ONE manifest ever: re-open raises + focuses it
  defaultGeometry: { w: 560, h: 640 },
}
