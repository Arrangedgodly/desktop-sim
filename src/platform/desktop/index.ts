/**
 * Desktop surface (UI-3 + IM-5) — the hold: wallpaper plate layer, pinned
 * specimen icon grid (selection + open routing + drag/drop gestures), docent
 * first-visit hints, and the WM host layered above. The boot orchestrator
 * (UI-2) renders this once the stores are hydrated.
 *
 * Module map:
 *   DesktopSurface.tsx      the stage + selection + first-interaction wiring
 *   wallpaper.tsx           the wallpaper layer (settings id → plate registry)
 *   wallpaper-registry.ts   plate registration + resolution; UI-4's authored
 *                           plate set registers from src/assets/wallplates/
 *   SpecimenIcon.tsx        one pinned specimen card (button + drag surfaces)
 *   specimen-glyphs.tsx     the four authored kind glyphs + kind words
 *   DocentCallouts.tsx      first-visit leader-line hints
 *   grid.ts                 slot math + fallback assignment + drag snap (pure)
 *   open-specimen.ts        the double-click ROUTING TABLE (IM-5)
 *   drop-target.ts          pure drop-on-folder validation (IM-5)
 *   use-specimen-drag.ts    the icon drag gesture (RQ-3 pattern, IM-5)
 */

export { DesktopSurface, type DesktopSurfaceProps } from './DesktopSurface'
export { WallpaperLayer } from './wallpaper'
export {
  DEFAULT_WALLPAPER_PLATE_ID,
  listWallpaperPlates,
  registerWallpaperPlate,
  wallpaperPlateFor,
  type WallpaperPlate,
} from './wallpaper-registry'
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
export {
  DESKTOP_GRID,
  cellCenter,
  cellOrigin,
  clampIconOrigin,
  resolveDesktopSlots,
  slotForPoint,
  slotLimitsFor,
  type GridMetrics,
  type SlotLimits,
} from './grid'
export { OPEN_ROUTES, openSpecimen, resolveOpenRoute, type OpenRoute } from './open-specimen'
export {
  resolveDropTarget,
  type DropRejectReason,
  type DropResolution,
} from './drop-target'
export {
  specimenIdAtPoint,
  useSpecimenDrag,
  type SpecimenDrag,
  type SpecimenDragOptions,
} from './use-specimen-drag'
