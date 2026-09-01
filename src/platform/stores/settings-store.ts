import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

/**
 * Settings store (IM-2) — low-frequency desktop preferences. Sounds ship muted
 * (town-hall decision); reduced-motion-follow defaults to on so the OS
 * `prefers-reduced-motion` preference is honored out of the box (UI-1/DD-2).
 *
 * Persistence seam (MF-2): subscribe via `useSettingsStore.subscribe(selector, listener)`
 * and write the persisted envelope on a debounce — never useEffect polling.
 */

/** Default wallpaper plate id — UI-4 authors the plates and owns the final id list; align there. */
export const DEFAULT_WALLPAPER = 'star-chart'

export interface SettingsState {
  /** Wallpaper plate id (UI-4's archive plates). */
  readonly wallpaper: string
  /** UI-6's WebAudio console bleeps — muted by default. */
  readonly soundsEnabled: boolean
  /** When true, the desktop follows the OS `prefers-reduced-motion` preference. */
  readonly reducedMotionFollow: boolean
  setWallpaper: (wallpaper: string) => void
  setSoundsEnabled: (enabled: boolean) => void
  setReducedMotionFollow: (follow: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set) => ({
    wallpaper: DEFAULT_WALLPAPER,
    soundsEnabled: false,
    reducedMotionFollow: true,
    setWallpaper: (wallpaper) => set({ wallpaper }),
    setSoundsEnabled: (enabled) => set({ soundsEnabled: enabled }),
    setReducedMotionFollow: (follow) => set({ reducedMotionFollow: follow }),
  })),
)
