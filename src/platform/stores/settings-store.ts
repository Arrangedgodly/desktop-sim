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

/**
 * Default wallpaper plate id — the star-chart plate from UI-4's authored set
 * (src/assets/wallplates/). Kept as a literal so this store stays a leaf
 * (node-side tests import it without the React plate graph); the wallplates
 * test asserts it stays lockstep with the registry's DEFAULT_WALLPAPER_PLATE_ID.
 */
export const DEFAULT_WALLPAPER = 'star-chart'

export interface SettingsState {
  /** Wallpaper plate id (UI-4's archive plates). */
  readonly wallpaper: string
  /** UI-6's WebAudio console bleeps — muted by default. */
  readonly soundsEnabled: boolean
  /** When true, the desktop follows the OS `prefers-reduced-motion` preference. */
  readonly reducedMotionFollow: boolean
  /** UI-3 docent hints dismissed — once true they never show again (persisted). */
  readonly docentDismissed: boolean
  /**
   * HU-1 session flag (NOT persisted — deliberately outside PersistedSettings):
   * the storage-recovery notice's one-time "View vault readout" link sets it;
   * the Settings console consumes it on mount and scrolls its vault readout
   * into view. Session-scoped by construction: a reload clears it.
   */
  readonly vaultFocusPending: boolean
  setWallpaper: (wallpaper: string) => void
  setSoundsEnabled: (enabled: boolean) => void
  setReducedMotionFollow: (follow: boolean) => void
  /** One-way: the docent is seen once. No un-dismiss action exists by design. */
  dismissDocent: () => void
  /** HU-1: request the Settings console open onto its vault readout. */
  requestVaultFocus: () => void
  /** HU-1: Settings-console mount consumption — returns + clears the flag. */
  consumeVaultFocus: () => boolean
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    wallpaper: DEFAULT_WALLPAPER,
    soundsEnabled: false,
    reducedMotionFollow: true,
    docentDismissed: false,
    vaultFocusPending: false,
    setWallpaper: (wallpaper) => set({ wallpaper }),
    setSoundsEnabled: (enabled) => set({ soundsEnabled: enabled }),
    setReducedMotionFollow: (follow) => set({ reducedMotionFollow: follow }),
    dismissDocent: () => set({ docentDismissed: true }),
    requestVaultFocus: () => set({ vaultFocusPending: true }),
    consumeVaultFocus: () => {
      const pending = get().vaultFocusPending
      if (pending) set({ vaultFocusPending: false })
      return pending
    },
  })),
)
