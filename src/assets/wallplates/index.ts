/**
 * The archive-plate set (UI-4) — four AUTHORED vector wallpapers for the
 * Survey Archive, per the design brief's own vocabulary: "wallpapers are
 * archive plates: star charts, anatomical plates of fictional specimens,
 * phytographic prints — amber-on-dark and parchment tones."
 *
 * Every plate is ONE static inline-SVG React component (no raster assets,
 * no image generation, no filters, no animation): it renders once per mount
 * and never touches a store, listener, or timer. This module only ASSEMBLES
 * the set — the platform's wallpaper registry (src/platform/desktop/
 * wallpaper-registry.ts) imports this list and registers it, so ids, names,
 * kind chips and swatches stay owned here while the seam stays owned there.
 *
 *   star-chart  (default) amber-on-dark chart — graticule, star river, figures
 *   anatomy     ink-on-parchment dissection sheet of a fictional specimen
 *   phytograph  amber-on-dark botanical contact print — flat silhouettes
 *   survey      amber-on-dark measuring sheet — grid, arc, triangulation
 *
 * The settings store's DEFAULT_WALLPAPER ('star-chart') is pinned to this
 * set's default by a lockstep unit test (single source per lane, asserted
 * never to drift).
 */

import type { ComponentType } from 'react'
import { AnatomicalPlate, AnatomySwatch } from './AnatomicalPlate'
import { PhytographPlate, PhytographSwatch } from './PhytographPlate'
import { StarChartPlate, StarChartSwatch } from './StarChartPlate'
import { SurveyPlate, SurveySwatch } from './SurveyPlate'

/** One authored archive plate, as Settings (AP-4) consumes it. */
export interface WallplateArt {
  /** Stable persisted id (settings store `wallpaper`). */
  readonly id: string
  /** In-world plate legend — the Settings list entry. */
  readonly name: string
  /** Kind chip label — the archive class the plate belongs to. */
  readonly kind: string
  /** The plate itself: fills the wallpaper layer, slices to the viewport. */
  readonly Component: ComponentType
  /** 40px preview rendering for the Settings list. */
  readonly Swatch: ComponentType
}

/** The default plate's stable id — matches settings-store DEFAULT_WALLPAPER. */
export const DEFAULT_WALLPLATE_ID = 'star-chart'

/** The full plate set, in Settings-list order (default first). */
export const WALLPLATE_ART: readonly WallplateArt[] = [
  {
    id: 'star-chart',
    name: 'Hold Sky, Plate XLVII',
    kind: 'star chart',
    Component: StarChartPlate,
    Swatch: StarChartSwatch,
  },
  {
    id: 'anatomy',
    name: 'Ventral Dissection, Glyphosoma',
    kind: 'anatomical plate',
    Component: AnatomicalPlate,
    Swatch: AnatomySwatch,
  },
  {
    id: 'phytograph',
    name: 'Phytographic Contact Sheet',
    kind: 'phytograph',
    Component: PhytographPlate,
    Swatch: PhytographSwatch,
  },
  {
    id: 'survey',
    name: 'Graticule Survey, Sheet 47',
    kind: 'survey',
    Component: SurveyPlate,
    Swatch: SurveySwatch,
  },
]

export { StarChartPlate, StarChartSwatch } from './StarChartPlate'
export { AnatomicalPlate, AnatomySwatch } from './AnatomicalPlate'
export { PhytographPlate, PhytographSwatch } from './PhytographPlate'
export { SurveyPlate, SurveySwatch } from './SurveyPlate'
