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
 *
 * FEDERATED FLEET (session 1 · the honest unfreeze): `terminal` joined the
 * shipped fleet — the first federated app built against the contract
 * (docs/FEDERATED-SESSIONS.md). The gate's INTENT holds exactly: no demo,
 * every RESERVED id still ships (no squatters, no gaps — the check now
 * reads "reserved ⊆ fleet" because a federated id is legitimate), every
 * mount still retryableLazy, and the order is still pinned — the notepad
 * keeps the launcher's opening run, the console keeps the closing one.
 *
 * FEDERATED FLEET (session 2): `paint` joined the closing run the same way,
 * between the terminal and the console. Same intent, same laws.
 *
 * FEDERATED FLEET (batch 2): ten more federated apps joined — `cursor`,
 * `chart-plate`, `specimen-survey` (the fleet's first multi-instance app),
 * `vivarium`, `relay`, `field-notes`, `reliquary`, `type-cabinet`,
 * `archive-backup`, `vitals` — none declaring file types, so routing is
 * untouched and every position is free. Same intent, same laws: no demo,
 * reserved ⊆ fleet, every mount retryableLazy, order pinned — notepad still
 * opens the launcher, the console still closes it, and the batch-2 order
 * runs utility (cursor behind the terminal) → studio (engraver + dig +
 * tank around the painter) → reading (relay, field-notes, reliquary,
 * type-cabinet between the atlas and the nameplate) → closing (nameplate,
 * vault, vitals panel, console).
 */

describe('TH-2 · the shipped app fleet', () => {
  it('registers the reserved platform apps plus the ten federated apps, in the stable order', () => {
    expect(apps.map((app) => app.id)).toEqual([
      'notepad',
      'image-viewer',
      'explorer',
      'browser',
      'terminal',
      'cursor',
      'paint',
      'chart-plate',
      'specimen-survey',
      'vivarium',
      'relay',
      'field-notes',
      'reliquary',
      'type-cabinet',
      'about',
      'archive-backup',
      'vitals',
      'settings',
    ])
    // Every reserved id still ships — no squatters, no gaps. The twelve
    // non-reserved ids are federated apps, registered the standard way; the
    // reserved set itself is untouched.
    const fleetIds = apps.map((a) => a.id)
    for (const reserved of RESERVED_APP_IDS) {
      expect(fleetIds, reserved).toContain(reserved)
    }
    expect(fleetIds.filter((id) => !RESERVED_APP_IDS.includes(id))).toEqual([
      'terminal',
      'cursor',
      'paint',
      'chart-plate',
      'specimen-survey',
      'vivarium',
      'relay',
      'field-notes',
      'reliquary',
      'type-cabinet',
      'archive-backup',
      'vitals',
    ])
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
