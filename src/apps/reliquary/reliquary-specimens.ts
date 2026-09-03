/**
 * Reliquary specimens (batch 2, worker 8) — the case's catalog: three
 * authored entries, each binding an id to its geometry generator, its
 * resting orientation in the vitrine, its amber brightness (brightness
 * levels distinguish specimens inside the well — never hues; the world's
 * monochrome-amber law), and its parchment label copy. Accession codes ride
 * the RQ- series (display labels on the case cards — the specimens are
 * procedural and are NOT catalog FS nodes; nothing here touches the hold).
 *
 * The prose is in-world fiction about the fictional survey mission (the
 * product's truth law: no real-world claims, no real species, no real
 * places).
 */

import { bractCluster, facetedCrystal, spiralShell, type Geometry } from './reliquary-geometry'

/** The amber family members a specimen may be lit in (well law: brightness, not hue). */
export type PhosphorTone = 'phosphor' | 'phosphor-bright' | 'phosphor-dim'

/** The CSS custom-property each tone reads (resolved at runtime, like the painter's palette). */
const TONE_TOKEN: Readonly<Record<PhosphorTone, string>> = {
  phosphor: '--phosphor',
  'phosphor-bright': '--phosphor-bright',
  'phosphor-dim': '--phosphor-dim',
}

export interface SpecimenDef {
  /** Stable id — picker selectors and tests ride it. */
  readonly id: 'vent-prism' | 'gyre-shell' | 'bract-cluster'
  /** The engraved name on the case's label card. */
  readonly name: string
  /** The B612 accession readout on the label card. */
  readonly accession: string
  /** The Lora field note on the label card (in-world, one breath long). */
  readonly note: string
  /** Resting yaw of the specimen's post (radians). */
  readonly baseYaw: number
  /** Resting pitch — tips the specimen toward the viewing glass. */
  readonly basePitch: number
  /** The well's lit brightness for this specimen. */
  readonly tone: PhosphorTone
  /** Builds the mesh (memoized by the surface per window session). */
  readonly build: () => Geometry
}

export const SPECIMENS: readonly SpecimenDef[] = [
  {
    id: 'vent-prism',
    name: 'Vent Prism',
    accession: 'RQ-0001',
    note: 'Cut by a hydrothermal chimney over a slow century of mineral night; the facets remember which way the hot water ran.',
    baseYaw: 0.4,
    basePitch: 0.12,
    tone: 'phosphor-bright',
    build: () => facetedCrystal(),
  },
  {
    id: 'gyre-shell',
    name: 'Gyre Shell',
    accession: 'RQ-0002',
    note: 'Coiled off a drifting snail-like architect of the open gyre, each whorl scaled by the same quiet ratio the whole shell obeyed.',
    baseYaw: 0.55,
    basePitch: 1.02,
    tone: 'phosphor',
    build: () => spiralShell(),
  },
  {
    id: 'bract-cluster',
    name: 'Bract Cluster',
    accession: 'RQ-0003',
    note: 'A seed head split from a wind-borne pastoral strain — six bracts answered one clock, then held the pose for the catalog.',
    baseYaw: 0.25,
    basePitch: 0.18,
    tone: 'phosphor-dim',
    build: () => bractCluster(),
  },
]

/** Look one specimen up by id (null for foreign ids — defensive on read). */
export function specimenById(id: string): SpecimenDef | null {
  return SPECIMENS.find((specimen) => specimen.id === id) ?? null
}

/** Resolve a tone token name (the surface reads the computed value). */
export function toneTokenOf(tone: PhosphorTone): string {
  return TONE_TOKEN[tone]
}
