// @vitest-environment jsdom
/**
 * Chart Plate · the accession path (batch 2, brief 9, acceptance 3): cutting
 * a plate through the REAL pure op (createNode on a real FSState, ports
 * injected — the painter's savePlate pattern), and proving the filed image
 * specimen's data URI parses back as a well-formed SVG document via the
 * browser's own DOMParser. jsdom only for the parser; the save path itself
 * is store-free and DOM-free.
 */

import { describe, expect, it, vi, type Mock } from 'vitest'
import { emptyFSState } from '../../lib/fs'
import type { FSImageNode, FSState } from '../../lib/fs'
import {
  SVG_DATA_URI_PREFIX,
  saveChartPlate,
  type ChartSavePorts,
  type PlatePalette,
} from './chart-model'

const PALETTE: PlatePalette = {
  ground: 'GROUND-INK',
  ink: 'RULE-INK',
  dim: 'DIM-INK',
  rule: 'GRID-INK',
  accent: 'DATA-INK',
}

const ROWS = [
  { label: 'Alpha', value: 12 },
  { label: 'Beta', value: 7 },
  { label: 'Gamma', value: -3 },
] as const

const ports = (cue: Mock = vi.fn()): { ports: ChartSavePorts; cue: Mock; commit: Mock } => {
  const commit = vi.fn()
  return { ports: { commit, cue }, cue, commit }
}

const cut = (
  fs: FSState,
  name: string,
  p: ChartSavePorts,
): ReturnType<typeof saveChartPlate> =>
  saveChartPlate(
    {
      fs,
      rows: [...ROWS],
      kind: 'bar',
      ground: 'parchment',
      palette: PALETTE,
      name,
      id: 'chart-node-1',
      now: 1_000,
    },
    p,
  )

describe('chart accession · the cut plate becomes a REAL image specimen', () => {
  it('commits once, cues exactly once, and files under the hold root', () => {
    const fs = emptyFSState(0)
    const { ports: p, cue, commit } = ports()
    const result = cut(fs, 'Survey 44', p)

    expect(result).toEqual({ status: 'saved', accession: 'PLT-0001' })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(cue).toHaveBeenCalledTimes(1)

    const next = commit.mock.calls[0]![0] as FSState
    const node = next.nodes['chart-node-1'] as FSImageNode | undefined
    expect(node).toBeDefined()
    expect(node!.kind).toBe('image')
    expect(node!.name).toBe('Survey 44')
    expect(node!.parentId).toBe(fs.rootId)
    expect(node!.accession).toBe('PLT-0001')
    expect(node!.accessionedAt).toBe(1_000)
    expect(node!.src.startsWith(SVG_DATA_URI_PREFIX)).toBe(true)
  })

  it("files a data URI that PARSES as well-formed SVG (the browser's own parser)", () => {
    const fs = emptyFSState(0)
    const { ports: p, commit } = ports()
    expect(cut(fs, 'Parses', p).status).toBe('saved')

    const committed = commit.mock.calls[0]![0] as FSState
    const src = (committed.nodes['chart-node-1'] as FSImageNode).src
    const svg = decodeURIComponent(src.slice(SVG_DATA_URI_PREFIX.length))

    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    const root = doc.documentElement
    expect(root.tagName.toLowerCase()).toBe('svg')
    expect(root.getAttribute('viewBox')).toBe('0 0 640 400')
    // The engraved vocabulary rides the document: hatched bars, ruled axes,
    // B612 numerals — and the hostile-input escapes survived the round trip.
    expect(root.querySelectorAll('rect').length).toBeGreaterThanOrEqual(3) // ground + bars
    expect(root.querySelectorAll('pattern').length).toBe(1)
    expect(root.querySelectorAll('line').length).toBeGreaterThanOrEqual(5) // axes + rules + hatch
    expect(root.querySelectorAll('polyline').length).toBe(0) // a bar cut, not a line cut
    expect(root.querySelectorAll('text').length).toBeGreaterThanOrEqual(4) // ticks + captions
    expect(svg).not.toContain('<script')
  })

  it('refuses an empty or blank name — nothing committed, nothing cued', () => {
    const fs = emptyFSState(0)
    for (const name of ['', '   ']) {
      const { ports: p, cue, commit } = ports()
      expect(cut(fs, name, p)).toEqual({ status: 'refused', reason: 'invalid-name' })
      expect(commit).not.toHaveBeenCalled()
      expect(cue).not.toHaveBeenCalled()
    }
  })

  it("refuses a ledger with NOTHING to chart (all labels blank, all values zero)", () => {
    const fs = emptyFSState(0)
    const { ports: p, cue, commit } = ports()
    const result = saveChartPlate(
      {
        fs,
        rows: [
          { label: '', value: 0 },
          { label: '   ', value: 0 },
        ],
        kind: 'line',
        ground: 'plate',
        palette: PALETTE,
        name: 'Empty survey',
        id: 'chart-node-1',
        now: 1_000,
      },
      p,
    )
    expect(result).toEqual({ status: 'refused', reason: 'no-data' })
    expect(commit).not.toHaveBeenCalled()
    expect(cue).not.toHaveBeenCalled()
  })

  it('refuses a label COLLISION in the drawer (the FSError, in-world)', () => {
    const fs = emptyFSState(0)
    const first = ports()
    expect(cut(fs, 'Duplicate', first.ports).status).toBe('saved')

    const withThePlate = first.commit.mock.calls[0]![0] as FSState
    const second = ports()
    const result = saveChartPlate(
      {
        fs: withThePlate,
        rows: [...ROWS],
        kind: 'bar',
        ground: 'parchment',
        palette: PALETTE,
        name: 'duplicate', // case-insensitive sibling rule, like the catalog
        id: 'chart-node-2',
        now: 2_000,
      },
      second.ports,
    )
    expect(result).toEqual({ status: 'refused', reason: 'collision' })
    expect(second.commit).not.toHaveBeenCalled()
    expect(second.cue).not.toHaveBeenCalled()
  })

  it('counts the PLT series honestly across cuts', () => {
    let fs = emptyFSState(0)
    const a = ports()
    expect(cut(fs, 'First', a.ports)).toEqual({ status: 'saved', accession: 'PLT-0001' })
    fs = a.commit.mock.calls[0]![0] as FSState
    const b = ports()
    const second = saveChartPlate(
      {
        fs,
        rows: [...ROWS],
        kind: 'line',
        ground: 'plate',
        palette: PALETTE,
        name: 'Second',
        id: 'chart-node-2',
        now: 2_000,
      },
      b.ports,
    )
    expect(second).toEqual({ status: 'saved', accession: 'PLT-0002' })
  })
})
