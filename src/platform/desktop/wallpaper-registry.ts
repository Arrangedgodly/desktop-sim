/**
 * Wallpaper plate registry (UI-3 seam, UI-4 plate set) — how Settings'
 * `wallpaper` id becomes art.
 *
 * Plates are REGISTERED, not hard-wired: the authored archive-plate set
 * lives in src/assets/wallplates/ and this module registers it at import
 * time, so the desktop layer, Settings, and persistence all speak the same
 * ids with zero desktop edits — and every consumer of the registry (app,
 * tests, stories) sees the complete set. Resolution is total: an unknown or
 * absent id falls back to the DEFAULT plate ('star-chart'), and even an
 * empty registry resolves to the bare hold ground — never a blank layer.
 */

import type { ComponentType } from 'react'
import { DEFAULT_WALLPLATE_ID, WALLPLATE_ART } from '../../assets/wallplates'

/** One archive plate, as registered. */
export interface WallpaperPlate {
  /** Stable persisted id (settings store `wallpaper`). */
  readonly id: string
  /** In-world plate legend — the Settings list entry. */
  readonly name: string
  /** Kind chip label — the archive class the plate belongs to. */
  readonly kind: string
  /** Renders the plate art; it fills its layer (slices to the viewport). */
  readonly Component: ComponentType
  /** 40px Settings preview rendering. */
  readonly Swatch: ComponentType
}

/** The default plate's stable id — the settings store's DEFAULT_WALLPAPER. */
export const DEFAULT_WALLPAPER_PLATE_ID = DEFAULT_WALLPLATE_ID

const plates = new Map<string, WallpaperPlate>()

/** Register a plate. First registration wins; re-registering is a no-op. */
export function registerWallpaperPlate(plate: WallpaperPlate): void {
  if (plates.has(plate.id)) return
  plates.set(plate.id, plate)
}

// The authored set (UI-4), in Settings-list order — star-chart first so the
// default resolves before anything else registers.
for (const plate of WALLPLATE_ART) registerWallpaperPlate(plate)

/** Registry snapshot in registration order (Settings list). */
export function listWallpaperPlates(): readonly WallpaperPlate[] {
  return [...plates.values()]
}

/** The last-resort ground: the hold itself, for a registry that is somehow empty. */
const BareGroundPlate: WallpaperPlate = {
  id: 'ground',
  name: 'Bare hold ground',
  kind: 'ground',
  Component: () => null, // the stage's chrome-ground shows through the layer
  Swatch: () => null,
}

/**
 * Resolve a settings id to a plate. Total: exact id → the default plate →
 * the first registered plate → the bare ground. Never throws, never blanks.
 */
export function wallpaperPlateFor(id: string): WallpaperPlate {
  return (
    plates.get(id) ??
    plates.get(DEFAULT_WALLPAPER_PLATE_ID) ??
    listWallpaperPlates()[0] ??
    BareGroundPlate
  )
}
