/**
 * dist/ budget checker (TH-1) — pure accounting over a built-bundle manifest.
 * `scripts/perf/run-perf.ts` walks dist/, gzips each file and hands the
 * manifest here; tests feed fake manifests. No fs, no process — the same logic
 * runs in node scripts and in vitest.
 *
 * BUDGETS (bytes; 1 KB = 1024 B, matching the committed font accounting):
 * - total JS gz ≤ 250 KB — COMMITTED (plan.md TH-1 "build size ≤ ~250KB gz JS").
 * - main chunk gz ≤ 120 KB — TH-1 sub-budget, rationale: the entry chunk is
 *   the critical path (download+parse+eval gates UI-2's ≤2s boot-to-desktop);
 *   skeleton main sits at ~66.5 KB gz, so 120 KB is ~1.8x headroom for the WM
 *   + desktop platform code while staying under half the total budget —
 *   anything bigger must ride lazy app chunks (TH-2), which is exactly the
 *   shape the budget should force.
 * - fonts (raw) ≤ 150 KB — COMMITTED (TYPEFACES research; pinned at source by
 *   src/styles/fonts.test.ts, re-asserted here against dist/ output).
 * - CSS gz ≤ 40 KB — TH-1 set: tokens+primitives+wm shell currently ~2 KB gz;
 *   40 KB absorbs per-app styles and archive-plate treatments (UI-4) with
 *   room, while keeping "styles are cheaper than scripts" structurally true.
 */

/** What a dist file is, for budget purposes. */
export type DistFileKind = 'js' | 'css' | 'font' | 'other'

/** One built file, measured. `path` is posix-style, relative to dist/ root. */
export interface DistFile {
  readonly path: string
  /** Raw size on disk. */
  readonly bytes: number
  /** gzip level-9 size — the number the JS/CSS budgets track. */
  readonly gzBytes: number
}

/** The four budgets, in bytes. */
export interface DistBudgets {
  readonly totalJsGzBytes: number
  readonly mainChunkGzBytes: number
  readonly fontBytes: number
  readonly cssGzBytes: number
}

export const DIST_BUDGETS: DistBudgets = {
  totalJsGzBytes: 250 * 1024,
  mainChunkGzBytes: 120 * 1024,
  fontBytes: 150 * 1024,
  cssGzBytes: 40 * 1024,
}

const FONT_EXTENSIONS = new Set(['.woff2', '.woff', '.ttf', '.otf'])

/** Classify a dist path by extension. Unknown → 'other' (html, maps, …). */
export function classifyDistFile(path: string): DistFileKind {
  const dot = path.lastIndexOf('.')
  const ext = dot < 0 ? '' : path.slice(dot).toLowerCase()
  if (ext === '.js' || ext === '.mjs') return 'js'
  if (ext === '.css') return 'css'
  if (FONT_EXTENSIONS.has(ext)) return 'font'
  return 'other'
}

/** Normalize a path for comparison: posix separators, no leading './'. */
function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '')
}

export type BudgetName = 'total-js-gz' | 'main-chunk-gz' | 'fonts' | 'css-gz'

export interface BudgetRow {
  readonly name: BudgetName
  readonly label: string
  /** "gz" (JS, CSS) or "raw" (fonts — woff2 is already the compressed form). */
  readonly unit: 'gz' | 'raw'
  readonly measuredBytes: number
  readonly budgetBytes: number
  readonly fileCount: number
  readonly utilizationPct: number
  readonly breached: boolean
}

export interface DistBudgetReport {
  readonly rows: readonly BudgetRow[]
  /** True iff no budget is breached. */
  readonly ok: boolean
  readonly totalJsGzBytes: number
  readonly mainChunkGzBytes: number
  readonly fontBytes: number
  readonly cssGzBytes: number
  /** The file counted as the entry (main) chunk, posix-relative to dist/. */
  readonly mainChunkPath: string | null
  /**
   * 'entry' — resolved from the caller-supplied entry path (dist/index.html
   * script tag in production use); 'largest' — conservative fallback to the
   * biggest gz JS file when no entry was supplied; 'none' — no JS at all.
   */
  readonly mainChunkSource: 'entry' | 'largest' | 'none'
  /** Largest JS files by gz — the first place to look on a breach. */
  readonly topJs: readonly { readonly path: string; readonly gzBytes: number }[]
}

function row(
  name: BudgetName,
  label: string,
  unit: 'gz' | 'raw',
  measuredBytes: number,
  budgetBytes: number,
  fileCount: number,
): BudgetRow {
  return {
    name,
    label,
    unit,
    measuredBytes,
    budgetBytes,
    fileCount,
    utilizationPct: budgetBytes > 0 ? (measuredBytes / budgetBytes) * 100 : 0,
    breached: measuredBytes > budgetBytes,
  }
}

/**
 * Evaluate the four budgets over a dist manifest. `entryJsPath` (optional)
 * is the entry chunk referenced by dist/index.html; when absent the largest
 * gz JS file is used as the main chunk — conservative for a gate.
 */
export function evaluateDistBudgets(
  manifest: readonly DistFile[],
  entryJsPath?: string | null,
): DistBudgetReport {
  const jsFiles = manifest.filter((f) => classifyDistFile(f.path) === 'js')
  const cssFiles = manifest.filter((f) => classifyDistFile(f.path) === 'css')
  const fontFiles = manifest.filter((f) => classifyDistFile(f.path) === 'font')

  const totalJsGz = jsFiles.reduce((sum, f) => sum + f.gzBytes, 0)
  const cssGz = cssFiles.reduce((sum, f) => sum + f.gzBytes, 0)
  const fontBytes = fontFiles.reduce((sum, f) => sum + f.bytes, 0)

  const sortedByGz = [...jsFiles].sort((a, b) => b.gzBytes - a.gzBytes)
  const entryPath = entryJsPath ? normalizePath(entryJsPath) : null
  const entryFile = entryPath ? jsFiles.find((f) => normalizePath(f.path) === entryPath) : undefined
  const mainChunk = entryFile ?? (sortedByGz.length > 0 ? sortedByGz[0]! : undefined)

  const mainChunkSource: DistBudgetReport['mainChunkSource'] = entryFile
    ? 'entry'
    : mainChunk
      ? 'largest'
      : 'none'

  const rows: readonly BudgetRow[] = [
    row(
      'total-js-gz',
      'total JS (gz)',
      'gz',
      totalJsGz,
      DIST_BUDGETS.totalJsGzBytes,
      jsFiles.length,
    ),
    row(
      'main-chunk-gz',
      'main chunk (gz)',
      'gz',
      mainChunk?.gzBytes ?? 0,
      DIST_BUDGETS.mainChunkGzBytes,
      mainChunk ? 1 : 0,
    ),
    row('fonts', 'fonts (raw)', 'raw', fontBytes, DIST_BUDGETS.fontBytes, fontFiles.length),
    row('css-gz', 'CSS (gz)', 'gz', cssGz, DIST_BUDGETS.cssGzBytes, cssFiles.length),
  ]

  return {
    rows,
    ok: rows.every((r) => !r.breached),
    totalJsGzBytes: totalJsGz,
    mainChunkGzBytes: mainChunk?.gzBytes ?? 0,
    fontBytes,
    cssGzBytes: cssGz,
    mainChunkPath: mainChunk ? normalizePath(mainChunk.path) : null,
    mainChunkSource,
    topJs: sortedByGz.slice(0, 3).map((f) => ({ path: normalizePath(f.path), gzBytes: f.gzBytes })),
  }
}
