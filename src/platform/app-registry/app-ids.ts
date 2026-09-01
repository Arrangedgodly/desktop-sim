/**
 * Reserved app ids (IM-5) — the platform's own module fleet, by name.
 *
 * The desktop's open routing (`src/platform/desktop/open-specimen.ts`) maps
 * catalog kinds onto these ids; the apps themselves register later (AP-1…AP-6)
 * under the SAME ids through their manifests. Until an id is registered,
 * `openApp` fails SOFT on it (warn + `null`, never a throw) — so the routing
 * is wired exactly once, here, and lights up module by module as the fleet
 * ships. Federated/third-party sessions must not ship under a reserved id:
 * the registry's first-registration-wins rule would make that collision
 * silent, so the reservation travels as this named-constant module plus its
 * one line in docs/APP-CONTRACT.md.
 */

/** File explorer (AP-1) — owns `folder` opens from the desktop. */
export const EXPLORER_APP_ID = 'explorer'

/** Notepad (AP-2) — owns `text` specimen opens. */
export const NOTEPAD_APP_ID = 'notepad'

/** Image viewer (AP-3) — owns `image` plate opens. */
export const IMAGE_VIEWER_APP_ID = 'image-viewer'

/** Settings (AP-4) — hardware toggles, wallpaper, reset. */
export const SETTINGS_APP_ID = 'settings'

/** About nameplate (AP-5) — the seeded nameplate app-link targets this. */
export const ABOUT_APP_ID = 'about'

/** Project Browser (AP-6) — curated catalog-card pages. */
export const BROWSER_APP_ID = 'browser'

/** Every id reserved for the platform's own fleet. */
export const RESERVED_APP_IDS: readonly string[] = Object.freeze([
  EXPLORER_APP_ID,
  NOTEPAD_APP_ID,
  IMAGE_VIEWER_APP_ID,
  SETTINGS_APP_ID,
  ABOUT_APP_ID,
  BROWSER_APP_ID,
])
