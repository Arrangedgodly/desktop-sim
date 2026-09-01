/**
 * Specimen kind tables (UI-3) — data, not components: the kind→glyph map and
 * the catalog's spoken words for each kind. Icons, notices, and any future
 * surface share ONE dispatch, so a new FS kind is added in exactly one place.
 *
 * (Lives apart from the glyph components so the component file stays
 * component-only — the react-refresh lint contract.)
 */

import type { ComponentType } from 'react'
import type { FSNodeKind } from '../../lib/fs'
import { DrawerGlyph, ModuleGlyph, PlateGlyph, SheetGlyph } from './specimen-glyphs'
import type { SpecimenGlyphProps } from './specimen-glyphs'

/** The drawn glyph per node kind. */
export const KIND_GLYPHS: Readonly<Record<FSNodeKind, ComponentType<SpecimenGlyphProps>>> = {
  folder: DrawerGlyph,
  text: SheetGlyph,
  image: PlateGlyph,
  'app-link': ModuleGlyph,
}

/** The catalog's spoken word for a kind — aria-labels and notices use it. */
export const KIND_WORDS: Readonly<Record<FSNodeKind, string>> = {
  folder: 'drawer',
  text: 'specimen',
  image: 'plate',
  'app-link': 'module',
}
