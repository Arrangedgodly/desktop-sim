/**
 * Desktop surface (UI-3) — the hold: wallpaper plate layer, pinned specimen
 * icon grid (selection + the open seam), docent first-visit hints, and the WM
 * host layered above. The boot orchestrator (UI-2) renders this once the
 * stores are hydrated.
 *
 * Module map:
 *   DesktopSurface.tsx   the stage + selection + first-interaction wiring
 *   wallpaper.tsx        plate registry + the layer + the provisional plate
 *   SpecimenIcon.tsx     one pinned specimen card (button)
 *   specimen-glyphs.tsx  the four authored kind glyphs + kind words
 *   DocentCallouts.tsx   first-visit leader-line hints
 *   grid.ts              slot math + fallback slot assignment (pure)
 *   open-specimen.ts     the double-click seam (IM-5 stub)
 */

export { DesktopSurface, type DesktopSurfaceProps } from './DesktopSurface'
export { WallpaperLayer } from './wallpaper'
export {
  PROVISIONAL_PLATE_ID,
  listWallpaperPlates,
  registerWallpaperPlate,
  wallpaperPlateFor,
  type WallpaperPlate,
} from './wallpaper-registry'
export { ProvisionalGraticulePlate } from './provisional-plate'
export { SpecimenIcon, type SpecimenIconProps } from './SpecimenIcon'
export { KIND_GLYPHS, KIND_WORDS } from './specimen-kinds'
export {
  DrawerGlyph,
  ModuleGlyph,
  PlateGlyph,
  SheetGlyph,
  type SpecimenGlyphProps,
} from './specimen-glyphs'
export { DocentCallouts, type DocentCalloutsProps } from './DocentCallouts'
export { DESKTOP_GRID, cellCenter, cellOrigin, resolveDesktopSlots, type GridMetrics } from './grid'
export { openSpecimen } from './open-specimen'
