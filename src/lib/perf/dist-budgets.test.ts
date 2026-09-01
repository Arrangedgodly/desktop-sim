import { describe, expect, it } from 'vitest'
import { classifyDistFile, DIST_BUDGETS, evaluateDistBudgets } from './dist-budgets'
import type { DistFile } from './dist-budgets'

/**
 * TH-1 unit tests: the budget checker runs against FAKE dist manifests — the
 * real one is produced by `npm run perf` (scripts/perf/run-perf.ts). Numbers
 * here are chosen to sit clearly inside/outside budgets, not to mirror dist/.
 */

const KB = 1024

function file(path: string, bytes: number, gzBytes = bytes): DistFile {
  return { path, bytes, gzBytes }
}

/** A passing, roughly-skeleton-shaped manifest (all values well under budget). */
const PASSING_MANIFEST: readonly DistFile[] = [
  file('index.html', 1200),
  file('assets/index-abc123.js', 207_642, 66_500),
  file('assets/DemoSurface-def456.js', 1140, 620),
  file('assets/index-abc123.css', 7059, 2130),
  file('assets/DemoSurface-def456.css', 1177, 480),
  file('assets/chakra-petch-latin-400-x.woff2', 9728),
  file('assets/lora-latin-var-400-700-x.woff2', 37_792),
]

describe('TH-1 · classifyDistFile', () => {
  it('sorts by extension, case-insensitively, unknown → other', () => {
    expect(classifyDistFile('assets/index-abc.js')).toBe('js')
    expect(classifyDistFile('assets/worker.mjs')).toBe('js')
    expect(classifyDistFile('assets/INDEX.CSS')).toBe('css')
    expect(classifyDistFile('assets/lora.woff2')).toBe('font')
    expect(classifyDistFile('assets/old.woff')).toBe('font')
    expect(classifyDistFile('assets/raw.ttf')).toBe('font')
    expect(classifyDistFile('index.html')).toBe('other')
    expect(classifyDistFile('assets/map.js.map')).toBe('other')
    expect(classifyDistFile('assets/font.css.map')).toBe('other')
    expect(classifyDistFile('noext')).toBe('other')
  })
})

describe('TH-1 · evaluateDistBudgets — accounting', () => {
  it('sums JS and CSS by gz bytes, fonts by raw bytes', () => {
    const report = evaluateDistBudgets(PASSING_MANIFEST, 'assets/index-abc123.js')

    expect(report.totalJsGzBytes).toBe(66_500 + 620)
    expect(report.cssGzBytes).toBe(2130 + 480)
    expect(report.fontBytes).toBe(9728 + 37_792)
    expect(report.ok).toBe(true)
  })

  it('picks the entry chunk as main when the path is supplied (and normalizes ./ and \\)', () => {
    const report = evaluateDistBudgets(PASSING_MANIFEST, './assets/index-abc123.js')
    expect(report.mainChunkPath).toBe('assets/index-abc123.js')
    expect(report.mainChunkGzBytes).toBe(66_500)
    expect(report.mainChunkSource).toBe('entry')
  })

  it('falls back conservatively to the LARGEST gz JS file when no entry is given', () => {
    const report = evaluateDistBudgets(PASSING_MANIFEST)
    expect(report.mainChunkSource).toBe('largest')
    expect(report.mainChunkPath).toBe('assets/index-abc123.js')
    expect(report.mainChunkGzBytes).toBe(66_500)
  })

  it('ignores a supplied entry that does not exist in the manifest (falls back)', () => {
    const report = evaluateDistBudgets(PASSING_MANIFEST, 'assets/missing.js')
    expect(report.mainChunkSource).toBe('largest')
    expect(report.mainChunkGzBytes).toBe(66_500)
  })

  it('handles a manifest with no JS at all', () => {
    const report = evaluateDistBudgets([file('index.html', 500), file('assets/a.woff2', 1000)])
    expect(report.mainChunkSource).toBe('none')
    expect(report.mainChunkPath).toBeNull()
    expect(report.mainChunkGzBytes).toBe(0)
    expect(report.ok).toBe(true)
  })

  it('ranks topJs by gz size for breach triage', () => {
    const report = evaluateDistBudgets(PASSING_MANIFEST)
    expect(report.topJs.map((f) => f.path)).toEqual([
      'assets/index-abc123.js',
      'assets/DemoSurface-def456.js',
    ])
    expect(report.topJs[0]?.gzBytes).toBe(66_500)
  })

  it('reports utilization and file counts per row', () => {
    const report = evaluateDistBudgets(PASSING_MANIFEST, 'assets/index-abc123.js')
    const byName = Object.fromEntries(report.rows.map((r) => [r.name, r]))
    expect(byName['total-js-gz']?.fileCount).toBe(2)
    expect(byName['main-chunk-gz']?.fileCount).toBe(1)
    expect(byName['fonts']?.fileCount).toBe(2)
    expect(byName['css-gz']?.fileCount).toBe(2)
    expect(byName['fonts']?.unit).toBe('raw')
    expect(byName['total-js-gz']?.unit).toBe('gz')
    expect(byName['fonts']?.utilizationPct).toBeCloseTo(
      ((9728 + 37_792) / DIST_BUDGETS.fontBytes) * 100,
      6,
    )
  })
})

describe('TH-1 · evaluateDistBudgets — breaches (exit-nonzero conditions)', () => {
  it('flags total JS gz over 250 KB and marks the report not ok', () => {
    const fat: readonly DistFile[] = [
      file('assets/index-a.js', 900_000, 200 * KB),
      file('assets/lazy-b.js', 500_000, 51 * KB), // 251 KB total — 1 KB over
    ]
    const report = evaluateDistBudgets(fat, 'assets/index-a.js')
    expect(report.ok).toBe(false)
    const row = report.rows.find((r) => r.name === 'total-js-gz')
    expect(row?.breached).toBe(true)
    expect(row?.measuredBytes).toBe(251 * KB)
  })

  it('flags a main chunk over 120 KB even when the total is within budget', () => {
    const fatMain: readonly DistFile[] = [
      file('assets/index-a.js', 500_000, 121 * KB), // main over, total under
      file('assets/lazy-b.js', 100_000, 20 * KB),
    ]
    const report = evaluateDistBudgets(fatMain, 'assets/index-a.js')
    expect(report.rows.find((r) => r.name === 'main-chunk-gz')?.breached).toBe(true)
    expect(report.ok).toBe(false)
  })

  it('flags fonts over 150 KB raw (gz size of fonts is irrelevant)', () => {
    const fatFonts: readonly DistFile[] = [
      file('assets/a.woff2', 80 * KB, 70 * KB),
      file('assets/b.woff2', 80 * KB, 70 * KB), // 160 KB raw > 150 KB
    ]
    const report = evaluateDistBudgets(fatFonts)
    const row = report.rows.find((r) => r.name === 'fonts')
    expect(row?.breached).toBe(true)
    expect(row?.measuredBytes).toBe(160 * KB)
    expect(report.ok).toBe(false)
  })

  it('flags CSS gz over 40 KB', () => {
    const fatCss: readonly DistFile[] = [file('assets/index.css', 500_000, 41 * KB)]
    const report = evaluateDistBudgets(fatCss)
    expect(report.rows.find((r) => r.name === 'css-gz')?.breached).toBe(true)
    expect(report.ok).toBe(false)
  })

  it('reports ok for a manifest exactly AT the budgets (boundary is inclusive)', () => {
    const boundary: readonly DistFile[] = [
      file('assets/index.js', 1, 120 * KB), // main chunk exactly at 120 KB
      file('assets/lazy-app.js', 1, 130 * KB), // total exactly at 250 KB
      file('assets/index.css', 1, 40 * KB),
      file('assets/a.woff2', 150 * KB),
    ]
    const report = evaluateDistBudgets(boundary, 'assets/index.js')
    expect(report.totalJsGzBytes).toBe(250 * KB)
    expect(report.mainChunkGzBytes).toBe(120 * KB)
    expect(report.cssGzBytes).toBe(40 * KB)
    expect(report.fontBytes).toBe(150 * KB)
    expect(report.rows.every((r) => !r.breached)).toBe(true)
    expect(report.ok).toBe(true)
  })
})
