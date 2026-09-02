import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

/**
 * Shared e2e helpers (TH-2).
 *
 * 1. registerDemoModule — the TEST-ONLY registration path for the IM-3 demo
 *    fixture. TH-2 de-registered the demo module from the shipped fleet
 *    (src/apps/index.ts carries the rationale; src/apps/apps.test.ts gates
 *    it), so any spec that wants a cheap multi-instance module registers the
 *    fixture AT RUNTIME through the registry's public `registerApp` seam —
 *    the same page-context dynamic-import pattern the UI-4 wallpaper spec
 *    and the HU-2 store probes use. Nothing test-only ships in the bundle:
 *    the fixture is only reachable because the DEV SERVER serves its source
 *    file on demand.
 *
 * 2. startPreviewServer — serves the PRODUCTION build (vite preview) for the
 *    perf/soak specs, building first when dist/ is missing or stale relative
 *    to src/. The playwright webServer runs the dev server; those specs need
 *    the built artifact instead.
 */

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')

/** Register the demo module fixture in the live page (idempotent). */
export async function registerDemoModule(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Non-literal specifiers: page-context dev-server URLs, not TS modules
    // this file resolves (see interactions.spec for the established shape).
    const registryUrl = '/src/platform/app-registry/index.ts'
    const demoUrl = '/src/apps/demo/index.ts'
    const { getApp, registerApp } = (await import(registryUrl)) as {
      getApp: (id: string) => unknown
      registerApp: (manifest: unknown) => boolean
    }
    if (getApp('demo')) return // already registered
    const { demoApp } = (await import(demoUrl)) as { demoApp: unknown }
    registerApp(demoApp)
  })
}

/** The newest mtime under a directory tree (0 when empty). */
function newestMtime(dir: string): number {
  let newest = 0
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, dirent.name)
    if (dirent.isDirectory()) newest = Math.max(newest, newestMtime(full))
    else if (dirent.isFile()) newest = Math.max(newest, statSync(full).mtimeMs)
  }
  return newest
}

/** True when dist/index.html exists and is newer than every file under src/. */
function distIsFresh(): boolean {
  const entry = join(REPO_ROOT, 'dist', 'index.html')
  if (!existsSync(entry)) return false
  return statSync(entry).mtimeMs >= newestMtime(join(REPO_ROOT, 'src'))
}

export interface PreviewServer {
  readonly port: number
  readonly baseUrl: string
  close(): Promise<void>
}

/**
 * Serve the production build on a pinned port (5181 — the dev server owns
 * 5180). Builds first when dist/ is missing or stale; a fresh dist/ from a
 * just-run `npm run perf` / `npm run build` is reused as-is.
 *
 * Binds 127.0.0.1 explicitly: vite preview otherwise listens on [::1] only,
 * which Node's fetch (IPv4-first for localhost) never reaches — the exact
 * mismatch that made the poll loop time out on macOS.
 */
export async function startPreviewServer(): Promise<PreviewServer> {
  const port = 5181
  if (!distIsFresh()) {
    await new Promise<void>((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      })
      build.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`npm run build exited ${code}`)),
      )
      build.on('error', reject)
    })
  }
  const server = spawn(
    'npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      shell: process.platform === 'win32',
      // Process-group leader → stopTree's `kill -- -pid` takes down npm AND
      // the vite preview child under it (a bare SIGTERM to npm would not).
      detached: process.platform !== 'win32',
    },
  )
  const baseUrl = `http://127.0.0.1:${port}`
  // Poll until the server answers (vite preview boots in well under a second
  // once dist/ exists; the 30s ceiling covers the coldest npm spin-up).
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/`)
      if (response.ok) break
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      server.kill('SIGTERM')
      throw new Error(`vite preview did not answer on ${baseUrl} within 30s`)
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return {
    port,
    baseUrl,
    close: () => stopTree(server),
  }
}

/** Kill the preview server (and whatever npm wrapped it). */
async function stopTree(server: ChildProcess): Promise<void> {
  if (process.platform === 'win32') {
    server.kill()
    return
  }
  const { execSync } = await import('node:child_process')
  try {
    // Negative pid = the whole process group (npm + vite preview).
    execSync(`kill -- -${server.pid}`, { stdio: 'ignore' })
  } catch {
    server.kill('SIGTERM')
  }
}
