/**
 * Settings manifest (AP-4) — the CONSOLE SETTINGS, fourth app on the
 * reserved-id fleet: registers `settings` (app-ids.ts), reserved since IM-5.
 * Nothing routes FILES into it (no acceptedFileTypes — the console is opened,
 * never "opened onto"), so this registration lights only the launcher entry:
 * the taskbar's module drawer lists it the moment it lands.
 *
 * Instance rule: SINGLETON — at most ONE console window ever; every later
 * open (launcher, re-open) raises + focuses the existing one via the
 * registry's `singleton` instance key (docs/APP-CONTRACT.md instance rules).
 * The reset path inside the surface exploits that deliberately: after the
 * reseed closes every window, the console RELIGHTS ITSELF through `openApp`
 * (settings-model.ts) — one window again, never a second.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * NOTE (registration ORDER): irrelevant to routing (no file types declared);
 * appended behind the fleet so the launcher's first item stays the notepad
 * (the taskbar keyboard e2e rides its position — see src/apps/index.ts).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import { SETTINGS_APP_ID, type AppManifest } from '../../platform/app-registry'
import { SettingsIcon } from './SettingsIcon'

const SettingsSurface = retryableLazy(() => import('./SettingsSurface'))

export const settingsApp: AppManifest = {
  id: SETTINGS_APP_ID,
  name: 'Console Settings',
  icon: SettingsIcon,
  mount: SettingsSurface,
  singleton: true, // ONE console ever: re-open raises + focuses it
  defaultGeometry: { w: 560, h: 620 },
}
