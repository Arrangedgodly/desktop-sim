import { describe, expect, it } from 'vitest'
import { listChildren, pathOf, findNode, emptyFSState } from './ops'
import { SEED_EPOCH, seedEnvelope, seedFSState } from './seed'
import { CURRENT_SCHEMA_VERSION, validateEnvelope } from './schema'
import { parseAccession } from './accession'
import type { FSNode } from './types'

describe('seed · determinism', () => {
  it('produces the identical catalog on every call', () => {
    expect(seedFSState()).toEqual(seedFSState())
    expect(seedEnvelope()).toEqual(seedEnvelope())
  })

  it('stamps the fixed mission epoch', () => {
    expect(SEED_EPOCH).toBe(Date.UTC(2087, 2, 14, 9, 26))
    for (const node of Object.values(seedFSState().nodes)) {
      expect(node.accessionedAt).toBeGreaterThanOrEqual(SEED_EPOCH)
    }
  })
})

describe('seed · structure', () => {
  it('roots the catalog at the Hold', () => {
    const state = seedFSState()
    expect(state.rootId).toBe('root')
    expect(state.nodes['root']).toMatchObject({ name: 'Hold', kind: 'folder', parentId: null })
  })

  it('carries the three desktop drawers', () => {
    const names = listChildren(seedFSState(), 'root').map((node) => node.name)
    expect(names).toContain('Projects')
    expect(names).toContain('Field Notes')
    expect(names).toContain('Archive')
  })

  it('every node is reachable from the root and parents resolve', () => {
    const state = seedFSState()
    for (const node of Object.values(state.nodes)) {
      if (node.id === state.rootId) {
        expect(node.parentId).toBeNull()
      } else {
        expect(node.parentId).not.toBeNull()
        expect(state.nodes[node.parentId!]).toBeDefined()
        expect(pathOf(state, node.id)).toMatch(/^\/Hold(\/|$)/)
      }
    }
  })

  it('accession codes are unique across the whole catalog', () => {
    const codes = Object.values(seedFSState().nodes).map((node) => node.accession)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('all accessions parse (no malformed labels in the seed)', () => {
    for (const node of Object.values(seedFSState().nodes)) {
      expect(parseAccession(node.accession)).not.toBeNull()
    }
  })

  it('icon positions reference existing nodes only', () => {
    const state = seedFSState()
    for (const id of Object.keys(state.iconPositions)) {
      expect(state.nodes[id]).toBeDefined()
      expect(state.nodes[id]!.parentId).toBe('root') // desktop pins
    }
  })
})

describe('seed · placeholder marking (MF-3 contract)', () => {
  it('every text specimen carries a REPLACE marker', () => {
    const texts = Object.values(seedFSState().nodes).filter(
      (node) => node.kind === 'text',
    ) as Extract<FSNode, { kind: 'text' }>[]
    expect(texts.length).toBeGreaterThanOrEqual(4)
    for (const text of texts) {
      expect(text.content).toMatch(/REPLACE VIA CONTENT PACK/)
    }
  })

  it('image specimens are self-labeling placeholder plates (renderable data URIs)', () => {
    const images = Object.values(seedFSState().nodes).filter(
      (node) => node.kind === 'image',
    ) as Extract<FSNode, { kind: 'image' }>[]
    expect(images.length).toBeGreaterThanOrEqual(2)
    for (const image of images) {
      expect(image.src).toMatch(/^data:image\/svg\+xml/)
      expect(decodeURIComponent(image.src)).toContain('PLACEHOLDER PLATE')
    }
  })

  it('seeds one module reference (the About invitation)', () => {
    const link = findNode(seedFSState(), 'nameplate')
    expect(link).toMatchObject({ kind: 'app-link', appId: 'about', parentId: 'root' })
  })
})

describe('seed · envelope', () => {
  it('is a valid current-version envelope', () => {
    expect(seedEnvelope().version).toBe(CURRENT_SCHEMA_VERSION)
    expect(() => validateEnvelope(seedEnvelope())).not.toThrow()
  })

  it('differs from the empty catalog (content actually seeded)', () => {
    expect(Object.keys(seedFSState().nodes).length).toBeGreaterThan(
      Object.keys(emptyFSState().nodes).length,
    )
  })
})
