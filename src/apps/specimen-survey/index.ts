/**
 * Specimen Survey manifest (batch 2, brief 5) — the archive's dig game:
 * a grid of survey plots over a field of buried specimens; reveal clear
 * plots, read the chisel numerals, pin plots for review, find every
 * specimen without disturbing one. The classic survey game, wearing the
 * world.
 *
 * Instance rule: MULTI-INSTANCE (singleton omitted) — every launcher open is
 * a fresh dig in its own window; no file launches (no acceptedFileTypes:
 * the dig is session material, not a catalog specimen — it rides the window
 * record's appState instead).
 *
 * No close guard BY DESIGN: the dig is mirrored to the window record
 * (validated, re-anchored) on every move, so closing or reloading a window
 * mid-dig is lossless — the restored window resumes the SAME dig. A guard
 * would ask a question the archive has already answered.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes)
 * rides the eager bundle; the surface ships as its own chunk (TH-2 budget).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { SpecimenSurveyIcon } from './SpecimenSurveyIcon'

const SpecimenSurveySurface = retryableLazy(() => import('./SpecimenSurveySurface'))

export const specimenSurveyApp: AppManifest = {
  id: 'specimen-survey',
  name: 'Specimen Survey',
  icon: SpecimenSurveyIcon,
  mount: SpecimenSurveySurface,
  // singleton omitted → false: one dig per launcher open
  // 520×560: EXCAVATION (16×16) fits at ~28px plots beside the rail;
  // smaller fields center in the same well. Taller than wide by design —
  // the readout rail rides above the pit.
  defaultGeometry: { w: 520, h: 560 },
}
