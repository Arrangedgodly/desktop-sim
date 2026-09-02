import { describe, expect, it } from 'vitest'
import { RESERVED_APP_IDS } from '../platform/app-registry/app-ids'
import { resetLazyMount } from '../platform/app-registry/lazy-mount'
import { apps } from './index'

/**
 * TH-2 · the shipped fleet gate — what `registerApps(apps)` will register on
 * a real boot, pinned. Two laws live here:
 *
 * 1. DEMO DE-REGISTRATION (TH-2): src/apps/demo/ is a test fixture, not a
 *    shipped module — the IM-3 contract demo left the startup array, so the
 *    production entry graph cannot reach it (no demo chunk in dist/; the
 *    example survives in docs/APP-CONTRACT.md, the fixture survives for
 *    tests via the registry's public `registerApp` seam).
 * 2. LAZY FLEET (TH-2): every shipped surface is a retryableLazy mount —
 *    each app rides its own chunk (verified against dist/ by `npm run perf`
 *    + the sourcemap audit in the TH-2 log entry).
 *
 * Order is asserted too: it is the launcher's listing order AND the
 * first-declaration tiebreak for capability routing (see src/apps/index.ts).
 */

describe('TH-2 · the shipped app fleet', () => {
  it('registers exactly the six reserved platform apps, in the stable order', () => {
    expect(apps.map((app) => app.id)).toEqual([
      'notepad',
      'image-viewer',
      'explorer',
      'about',
      'browser',
      'settings',
    ])
    // Every shipped id is a reserved id (no squatters, no gaps).
    expect([...RESERVED_APP_IDS].sort()).toEqual([...new Set(apps.map((a) => a.id))].sort())
  })

  it('does NOT ship the demo module — it is a test-only fixture now', () => {
    expect(apps.map((app) => app.id)).not.toContain('demo')
  })

  it('mounts every surface lazily (retryableLazy — own chunk per app)', () => {
    for (const app of apps) {
      expect(resetLazyMount(app.mount), `${app.id} mount is retryableLazy`).toBe(true)
    }
  })
})
