import { describe, expect, it } from 'vitest'
import { formatAccession, nextAccessionCode, parseAccession, compareAccessions } from './accession'
import { createNode, emptyFSState } from './ops'
import type { FSNode } from './types'

function fixture(nodes: Record<string, FSNode>) {
  return nodes
}

describe('accession · format & parse', () => {
  it('zero-pads serials to four digits', () => {
    expect(formatAccession('SPC', 1)).toBe('SPC-0001')
    expect(formatAccession('DRW', 42)).toBe('DRW-0042')
  })

  it('lets serials grow past the padding', () => {
    expect(formatAccession('SPC', 10000)).toBe('SPC-10000')
  })

  it('parses a code into prefix + serial', () => {
    expect(parseAccession('PLT-0007')).toEqual({ prefix: 'PLT', serial: 7 })
    expect(parseAccession('MOD-1234')).toEqual({ prefix: 'MOD', serial: 1234 })
  })

  it('returns null for non-codes', () => {
    expect(parseAccession('root')).toBeNull()
    expect(parseAccession('spc-0001')).toBeNull()
    expect(parseAccession('SPC-')).toBeNull()
    expect(parseAccession('')).toBeNull()
  })
})

describe('accession · allocation', () => {
  it('starts each series at 0001 from an empty catalog', () => {
    const nodes = fixture(emptyFSState().nodes)
    expect(nextAccessionCode(nodes, 'folder')).toBe('DRW-0001')
    expect(nextAccessionCode(nodes, 'text')).toBe('SPC-0001')
    expect(nextAccessionCode(nodes, 'image')).toBe('PLT-0001')
    expect(nextAccessionCode(nodes, 'app-link')).toBe('MOD-0001')
  })

  it('is monotonic per series and unaffected by other series', () => {
    let state = emptyFSState()
    state = createNode(state, { parentId: 'root', name: 'a', kind: 'text', id: 'a' })
    state = createNode(state, { parentId: 'root', name: 'd1', kind: 'folder', id: 'd1' })
    state = createNode(state, { parentId: 'root', name: 'b', kind: 'text', id: 'b' })
    state = createNode(state, { parentId: 'd1', name: 'p', kind: 'image', id: 'p', src: 'x' })
    state = createNode(state, { parentId: 'd1', name: 'c', kind: 'text', id: 'c' })

    expect(state.nodes['a']!.accession).toBe('SPC-0001')
    expect(state.nodes['b']!.accession).toBe('SPC-0002')
    expect(state.nodes['c']!.accession).toBe('SPC-0003')
    expect(state.nodes['d1']!.accession).toBe('DRW-0001')
    expect(state.nodes['p']!.accession).toBe('PLT-0001')
    expect(nextAccessionCode(state.nodes, 'text')).toBe('SPC-0004')
  })

  it('is always greater than every live code after deletions', () => {
    let state = emptyFSState()
    state = createNode(state, { parentId: 'root', name: 'a', kind: 'text', id: 'a' })
    state = createNode(state, { parentId: 'root', name: 'b', kind: 'text', id: 'b' })
    state = createNode(state, { parentId: 'root', name: 'c', kind: 'text', id: 'c' })
    state = createNode(state, { parentId: 'root', name: 'x', kind: 'text', id: 'x' }) // SPC-0004
    // decommission a MIDDLE code (SPC-0003): the high-water mark (SPC-0004) still rules
    const withoutC = Object.fromEntries(Object.entries(state.nodes).filter(([id]) => id !== 'c'))

    expect(nextAccessionCode(withoutC, 'text')).toBe('SPC-0005')
  })

  it('ignores malformed codes instead of crashing the scan', () => {
    const nodes = fixture({
      root: {
        id: 'root',
        parentId: null,
        name: 'Hold',
        kind: 'folder',
        accession: 'ARC-0000',
        accessionedAt: 0,
      },
      odd: {
        id: 'odd',
        parentId: 'root',
        name: 'odd',
        kind: 'text',
        accession: 'nonsense',
        accessionedAt: 0,
        content: '',
      },
      ok: {
        id: 'ok',
        parentId: 'root',
        name: 'ok',
        kind: 'text',
        accession: 'SPC-0009',
        accessionedAt: 0,
        content: '',
      },
    })
    expect(nextAccessionCode(nodes, 'text')).toBe('SPC-0010')
  })
})

describe('accession · catalog sort', () => {
  it('sorts by prefix then serial', () => {
    expect(compareAccessions('DRW-0002', 'DRW-0010')).toBeLessThan(0)
    expect(compareAccessions('DRW-0010', 'DRW-0002')).toBeGreaterThan(0)
    expect(compareAccessions('DRW-0002', 'MOD-0001')).toBeLessThan(0)
    expect(compareAccessions('MOD-0001', 'PLT-0001')).toBeLessThan(0)
    expect(compareAccessions('PLT-0001', 'SPC-0001')).toBeLessThan(0)
    expect(compareAccessions('SPC-0003', 'SPC-0003')).toBe(0)
  })

  it('falls back to string order for unparseable codes', () => {
    expect(compareAccessions('abc', 'zzz')).toBeLessThan(0)
  })
})
