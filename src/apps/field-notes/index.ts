/**
 * Field Notes manifest (batch 2, brief 6) — the archive's READING ROOM: open
 * any text specimen and read it TYPESET. A safe markdown subset (headings,
 * emphasis, lists, quotes, rules, external links) renders as parchment
 * documents; the notepad stays the editor, this module is the reader.
 *
 * Registration facts for the integrator:
 * - id `field-notes` (kebab-case, non-reserved — the standard federated path,
 *   one line in src/apps/index.ts).
 * - SINGLETON: one reading-room window ever; re-open raises + focuses it.
 * - NO `acceptedFileTypes` — deliberately undeclared. The brief's law: the
 *   NOTEPAD owns the text double-click route; this module's specimen choice
 *   happens through its own in-app catalog (the painter's picker pattern).
 *   (A file launch, if one is ever forced through openApp by hand, is still
 *   honored by the surface — but no routing table ever sends one here.)
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes)
 * rides the eager bundle; the surface ships as its own chunk (TH-2 budget).
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { FieldNotesIcon } from './FieldNotesIcon'

const FieldNotesSurface = retryableLazy(() => import('./FieldNotesSurface'))

export const fieldNotesApp: AppManifest = {
  id: 'field-notes',
  name: 'Field Notes',
  icon: FieldNotesIcon,
  mount: FieldNotesSurface,
  singleton: true,
  defaultGeometry: { w: 780, h: 560 },
  // A hand-routed file launch still titles honestly (the surface selects the
  // specimen at mount); launcher opens carry the module's own name.
  titleForLaunch: (launch) => (launch.source === 'file' ? launch.file.name : undefined),
}
