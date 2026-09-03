import { describe, expect, it } from 'vitest'
import { SPECIMENS, specimenById, toneTokenOf } from './reliquary-specimens'
import { facetedCrystal, spiralShell, bractCluster } from './reliquary-geometry'

/**
 * Reliquary specimens (batch 2, worker 8) — the catalog's own laws: exactly
 * three authored specimens, unique ids and accessions, non-empty label copy,
 * tone tokens from the amber family only, and geometry bindings that build.
 */

describe('reliquary · the case catalog', () => {
  it('holds exactly three specimens with unique ids and accessions', () => {
    expect(SPECIMENS).toHaveLength(3)
    expect(new Set(SPECIMENS.map((s) => s.id)).size).toBe(3)
    expect(new Set(SPECIMENS.map((s) => s.accession)).size).toBe(3)
    for (const specimen of SPECIMENS) {
      expect(specimen.name.length).toBeGreaterThan(0)
      expect(specimen.note.length).toBeGreaterThan(20) // a real field note, not a stub
      expect(specimen.accession).toMatch(/^RQ-\d{4}$/)
    }
  })

  it('binds each specimen to a DISTINCT generator (three bodies, not three labels)', () => {
    const geometries = [facetedCrystal(), spiralShell(), bractCluster()]
    SPECIMENS.forEach((specimen, index) => {
      const built = specimen.build()
      expect(built.positions.length).toBe(geometries[index]!.positions.length)
    })
    expect(new Set(SPECIMENS.map((s) => s.build().positions.length)).size).toBe(3)
  })

  it('lights only in the amber family — brightness distinguishes, never hue', () => {
    for (const specimen of SPECIMENS) {
      expect(['phosphor', 'phosphor-bright', 'phosphor-dim']).toContain(specimen.tone)
      expect(toneTokenOf(specimen.tone)).toMatch(/^--phosphor/)
    }
    // and the three tones are not all the same level
    expect(new Set(SPECIMENS.map((s) => s.tone)).size).toBe(3)
  })

  it('looks specimens up defensively (foreign ids → null, never a throw)', () => {
    expect(specimenById(SPECIMENS[0]!.id)?.name).toBe(SPECIMENS[0]!.name)
    expect(specimenById('no-such-specimen')).toBeNull()
    expect(specimenById('')).toBeNull()
  })
})
