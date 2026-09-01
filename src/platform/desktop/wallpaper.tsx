/**
 * Wallpaper layer (UI-3) — the archive plate under the specimen field.
 * Resolves the settings store's `wallpaper` id through the plate registry
 * (wallpaper-registry.ts) and renders the plate. `pointer-events: none` is
 * deliberate: bare-plate clicks belong to the DESKTOP STAGE (selection
 * clearing), never the wallpaper.
 */

import { useSettingsStore } from '../stores/settings-store'
import { wallpaperPlateFor } from './wallpaper-registry'

export function WallpaperLayer() {
  const wallpaper = useSettingsStore((s) => s.wallpaper)
  const plate = wallpaperPlateFor(wallpaper)
  const Plate = plate.Component
  return (
    <div className="wallpaper-layer" data-wallpaper={plate.id} aria-hidden="true">
      <Plate />
    </div>
  )
}
