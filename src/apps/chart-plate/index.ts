/**
 * Chart Plate manifest (batch 2, brief 9 — docs/ultron/sessions/batch2-briefs.md)
 * — the ARCHIVE'S ENGRAVER FOR NUMBERS: author a small dataset (label + value
 * rows), cut an engraved plate of it (bar or line, parchment or plate
 * ground, B612 numerals, ruled axes, nice-number ticks), and file the plate
 * into the catalog as a REAL image specimen (the painter's first-save
 * pattern — the chart becomes an archive object).
 *
 * Instance rule: SINGLETON — the engraver is ONE machine on the bench; every
 * open raises it. Each Save cuts a NEW accession (the machine never rebinds
 * onto its output; `rebindWindow` is multi-instance vocabulary).
 *
 * No `acceptedFileTypes`: the engraver authors plates, it does not open them
 * (the platform's Plate Viewer owns the image double-click route regardless).
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes)
 * rides the eager bundle; the surface ships as its own chunk (TH-2 budget).
 *
 * REGISTRATION (the integrator's one line): add `chartPlateApp` to the array
 * in src/apps/index.ts — suggested position: after `paint` (the studio run:
 * notepad, terminal, paint, chart-plate, …), before the explorer/atlas
 * reading run. This file is the ONLY thing the integrator touches.
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { ChartPlateIcon } from './ChartPlateIcon'

const ChartPlateSurface = retryableLazy(() => import('./ChartPlateSurface'))

export const chartPlateApp: AppManifest = {
  id: 'chart-plate',
  name: 'Chart Plate',
  icon: ChartPlateIcon,
  mount: ChartPlateSurface,
  singleton: true, // one engraver ever; re-open raises it
  // 780×560: the ledger + the plate side by side clear the 44px drawer rail
  // at the cascade origin on a 720-tall viewport.
  defaultGeometry: { w: 780, h: 560 },
}
