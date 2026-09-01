/**
 * TH-1 perf gate — `npm run perf` (Node ≥ 23.6: runs .ts via native type
 * stripping; the shared accounting lives in src/lib/perf/dist-budgets.ts).
 *
 * What it does, in order:
 *  1. builds a fresh dist/ (`npm run build`) — skip with PERF_SKIP_BUILD=1 or
 *     --skip-build to measure an existing dist/;
 *  2. walks dist/ and measures every file (raw + gzip level 9 — the size a
 *     precompressed static host serves; fonts are counted raw);
 *  3. resolves the entry chunk from dist/index.html's module script tag;
 *  4. checks the four budgets and prints a table;
 *  5. exits non-zero on any breach (milestone gate — TH-2 and HE-2 re-run it).
 *
 * The drag-fps probe and boot-timeline seam (the rest of TH-1) are runtime
 * modules under src/lib/perf/ — they ship in the app bundle only when
 * imported, so this gate's own footprint is zero.
 */

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { evaluateDistBudgets } from '../../src/lib/perf/dist-budgets.ts'
import type { DistFile } from '../../src/lib/perf/dist-budgets.ts'

const DIST_ROOT = 'dist'
const skipBuild = process.argv.includes('--skip-build') || process.env.PERF_SKIP_BUILD === '1'

function fail(message: string): never {
  console.error(`perf: ${message}`)
  process.exit(1)
}

/** `npm run build` with output streamed through; propagate its exit code. */
function build(): void {
  console.log('perf: building (npm run build)…\n')
  const result = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) fail(`build failed (exit ${result.status ?? 'null'})`)
}

/** Every file under dist/, as posix-relative paths with raw + gz sizes. */
function collectManifest(rootDir: string): DistFile[] {
  const files: DistFile[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        const buf = readFileSync(full)
        files.push({
          path: relative(rootDir, full).split(sep).join('/'),
          bytes: buf.length,
          gzBytes: gzipSync(buf, { level: 9 }).length,
        })
      }
    }
  }
  walk(rootDir)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * The entry (main) chunk = the module script dist/index.html loads eagerly.
 * Everything else Vite emits is a lazy chunk by definition.
 */
function findEntryScript(html: string): string | null {
  for (const tag of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = tag[1] ?? ''
    if (!/\btype\s*=\s*"module"/.test(attrs)) continue
    const src = /\bsrc\s*=\s*"([^"]+)"/.exec(attrs)?.[1]
    if (src) return src.replace(/^\.\//, '').split(sep).join('/')
  }
  return null
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`

function gitShortHash(): string | null {
  const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
  return git.status === 0 ? git.stdout.trim() : null
}

function main(): void {
  if (!skipBuild) build()

  let manifest: DistFile[]
  let entry: string | null
  try {
    manifest = collectManifest(DIST_ROOT)
    entry = findEntryScript(readFileSync(join(DIST_ROOT, 'index.html'), 'utf8'))
  } catch (error) {
    fail(
      `cannot read ${DIST_ROOT}/ — ${error instanceof Error ? error.message : String(error)} (build first; PERF_SKIP_BUILD reuses an existing dist/)`,
    )
  }

  const report = evaluateDistBudgets(manifest, entry)
  const hash = gitShortHash()

  console.log(`\nTH-1 perf budgets — desktop-sim${hash ? ` @ ${hash}` : ''}`)
  console.log(
    `dist/: ${manifest.length} files, ${kb(manifest.reduce((s, f) => s + f.bytes, 0))} raw total`,
  )
  console.log(
    `main chunk: ${report.mainChunkPath ?? '(none)'} (${report.mainChunkSource}${entry && report.mainChunkSource !== 'entry' ? ' — entry not found, using largest' : ''})\n`,
  )

  const nameWidth = Math.max(...report.rows.map((r) => r.label.length))
  const head = `  ${'budget'.padEnd(nameWidth)}  ${'measured'.padStart(10)}  ${'budget'.padStart(10)}  ${'util'.padStart(5)}  status`
  console.log(head)
  console.log(`  ${'─'.repeat(head.length - 2)}`)
  for (const r of report.rows) {
    console.log(
      `  ${r.label.padEnd(nameWidth)}  ${kb(r.measuredBytes).padStart(10)}  ${kb(r.budgetBytes).padStart(10)}  ${`${Math.round(r.utilizationPct)}%`.padStart(5)}  ${r.breached ? 'FAIL ✗' : 'PASS ✓'}`,
    )
  }

  if (report.topJs.length > 0) {
    console.log(`\n  largest JS (gz):`)
    for (const f of report.topJs) console.log(`    ${kb(f.gzBytes).padStart(10)}  ${f.path}`)
  }

  const breaches = report.rows.filter((r) => r.breached)
  if (report.ok) {
    console.log(`\nPERF GATE PASSED — all 4 budgets hold (${manifest.length} files measured).\n`)
  } else {
    console.error(`\nPERF GATE FAILED — ${breaches.length} budget(s) breached:`)
    for (const r of breaches) {
      console.error(
        `  ✗ ${r.label}: ${kb(r.measuredBytes)} > ${kb(r.budgetBytes)} (+${kb(r.measuredBytes - r.budgetBytes)} over)`,
      )
    }
    console.error('')
    process.exitCode = 1
  }
}

main()
