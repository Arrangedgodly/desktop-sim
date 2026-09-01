/**
 * Wallpaper plate registry (UI-3) — how Settings' `wallpaper` id becomes art.
 *
 * Plates are REGISTERED, not hard-wired: UI-4 authors the plate set (star
 * chart, anatomical plate, phytograph, graticule) and registers each via
 * `registerWallpaperPlate` — the desktop layer, Settings, and persistence
 * all speak the same ids with zero desktop edits. This module ships exactly
 * one registered plate (the provisional graticule); an unregistered id
 * (today's settings default 'star-chart', until UI-4 lands) resolves to it —
 * never a blank ground.
 */

import type { ComponentType } from 'react'
import { ProvisionalGraticulePlate } from './provisional-plate'

/** One archive plate. `Component` renders the plate art; it fills its layer. */
export interface WallpaperPlate {
  /** Stable persisted id (settings store `wallpaper`). */
  readonly id: string
  /** In-world legend — UI-4's Settings list reads it. */
  readonly label: string
  readonly Component: ComponentType
}

/** The provisional plate's stable id (today's fallback for any unknown id). */
export const PROVISIONAL_PLATE_ID = 'provisional-graticule'

const plates = new Map<string, WallpaperPlate>()

/** Register a plate (UI-4). First registration wins; re-registering is a no-op. */
export function registerWallpaperPlate(plate: WallpaperPlate): void {
  if (plates.has(plate.id)) return
  plates.set(plate.id, plate)
}

/** Registry snapshot in registration order (Settings list). */
export function listWallpaperPlates(): readonly WallpaperPlate[] {
  return [...plates.values()]
}

/** Resolve a settings id to a plate; unknown/absent → the provisional plate. */
export function wallpaperPlateFor(id: string): WallpaperPlate {
  return plates.get(id) ?? provisionalPlate
}

const provisionalPlate: WallpaperPlate = {
  id: PROVISIONAL_PLATE_ID,
  label: 'Provisional graticule',
  Component: ProvisionalGraticulePlate,
}
registerWallpaperPlate(provisionalPlate)
