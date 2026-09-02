// @vitest-environment jsdom
// UI-4 wallplates — the authored archive-plate set + the registry seam it
// registers into. Covers: four plates registered with full Settings-facing
// metadata and 40px swatches; the default id staying lockstep with the
// settings store; total resolution (unknown id → default); every plate being
// one static authored SVG that mounts/unmounts CLEAN (no detached nodes, no
// intervals, no animation frames — the pathological-loop catcher) inside a
// generous render-time budget; and the palette law: tokens only, no
// hardcoded hex outside tokens.css.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_WALLPAPER } from '../../platform/stores/settings-store'
import {
  DEFAULT_WALLPAPER_PLATE_ID,
  listWallpaperPlates,
  wallpaperPlateFor,
} from '../../platform/desktop/wallpaper-registry'
import {
  AnatomicalPlate,
  AnatomySwatch,
  PhytographPlate,
  PhytographSwatch,
  StarChartPlate,
  StarChartSwatch,
  SurveyPlate,
  SurveySwatch,
  WALLPLATE_ART,
} from './index'

/* ------------------------------ fixtures --------------------------------- */

const PLATE_COMPONENTS = {
  'star-chart': StarChartPlate,
  anatomy: AnatomicalPlate,
  phytograph: PhytographPlate,
  survey: SurveyPlate,
} as const

const SWATCHES = {
  'star-chart': StarChartSwatch,
  anatomy: AnatomySwatch,
  phytograph: PhytographSwatch,
  survey: SurveySwatch,
} as const

beforeEach(() => {
  cleanup()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* ------------------------------ the set ---------------------------------- */

describe('UI-4 · the authored plate set', () => {
  it('declares exactly the four archive plates with full metadata', () => {
    expect(WALLPLATE_ART.map((p) => p.id)).toEqual(['star-chart', 'anatomy', 'phytograph', 'survey'])
    for (const plate of WALLPLATE_ART) {
      expect(plate.name, `${plate.id} in-world name`).toMatch(/\S/)
      expect(plate.kind, `${plate.id} kind chip`).toMatch(/\S/)
      expect(typeof plate.Component).toBe('function')
      expect(typeof plate.Swatch).toBe('function')
    }
    // The brief's own vocabulary names the classes.
    expect(new Set(WALLPLATE_ART.map((p) => p.kind))).toEqual(
      new Set(['star chart', 'anatomical plate', 'phytograph', 'survey']),
    )
  })

  it('registers all four through the platform registry in list order', () => {
    expect(listWallpaperPlates().map((p) => p.id)).toEqual([
      'star-chart',
      'anatomy',
      'phytograph',
      'survey',
    ])
  })

  it('default plate id is star-chart and stays lockstep with the settings store', () => {
    expect(DEFAULT_WALLPAPER_PLATE_ID).toBe('star-chart')
    expect(DEFAULT_WALLPAPER_PLATE_ID).toBe(DEFAULT_WALLPAPER)
    expect(listWallpaperPlates()[0]!.id).toBe(DEFAULT_WALLPAPER_PLATE_ID)
  })

  it('resolves unknown ids to the default plate — never a blank layer', () => {
    expect(wallpaperPlateFor('star-chart').id).toBe('star-chart')
    expect(wallpaperPlateFor('anatomy').id).toBe('anatomy')
    expect(wallpaperPlateFor('no-such-plate').id).toBe('star-chart')
    expect(wallpaperPlateFor('').id).toBe('star-chart')
  })

  it('every registered plate exposes the same metadata it was declared with', () => {
    const registered = listWallpaperPlates()
    for (const art of WALLPLATE_ART) {
      const plate = registered.find((p) => p.id === art.id)!
      expect(plate.name).toBe(art.name)
      expect(plate.kind).toBe(art.kind)
      expect(plate.Component).toBe(art.Component)
      expect(plate.Swatch).toBe(art.Swatch)
    }
  })
})

/* --------------------------- the plates as SVG ---------------------------- */

describe('UI-4 · plates are authored scalable vector documents', () => {
  it('each plate renders one wide slice-cropped svg filling its layer', () => {
    for (const [id, Component] of Object.entries(PLATE_COMPONENTS)) {
      cleanup()
      const { container } = render(<Component />)
      const svg = container.querySelector('svg.wallplate')
      expect(svg, `${id} renders an svg.wallplate`).not.toBeNull()
      expect(svg!.getAttribute('viewBox')).toBe('0 0 1600 900')
      expect(svg!.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice')
      expect(svg!.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('each swatch renders a tiny 40px preview svg', () => {
    for (const [id, Swatch] of Object.entries(SWATCHES)) {
      cleanup()
      const { container } = render(<Swatch />)
      const svg = container.querySelector('svg')
      expect(svg, `${id} swatch renders`).not.toBeNull()
      expect(svg!.getAttribute('width')).toBe('40')
      expect(svg!.getAttribute('height')).toBe('40')
    }
  })

  it('plates carry real composed content (dozens–hundreds of marks, not a tile)', () => {
    for (const [id, Component] of Object.entries(PLATE_COMPONENTS)) {
      cleanup()
      const { container } = render(<Component />)
      const marks = container.querySelectorAll('circle, ellipse, line, path, text, rect')
        .length
      expect(marks, `${id} composition size`).toBeGreaterThanOrEqual(50)
      expect(marks, `${id} is not a pathological dump`).toBeLessThan(600)
    }
  })

  it('the star river is deterministic — two mounts paint identically', () => {
    const { container: first } = render(<StarChartPlate />)
    const firstHtml = first.querySelector('svg.wallplate')!.innerHTML
    cleanup()
    const { container: second } = render(<StarChartPlate />)
    expect(second.querySelector('svg.wallplate')!.innerHTML).toBe(firstHtml)
  })
})

/* --------------------- mount hygiene + render cost ------------------------ */

describe('UI-4 · plates mount and unmount clean (perf floor)', () => {
  it('ten mount/unmount cycles leave no detached nodes and arm no timers', () => {
    const rafDefined = typeof window.requestAnimationFrame === 'function'
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const rafSpy = rafDefined ? vi.spyOn(window, 'requestAnimationFrame') : null

    for (const [id, Component] of Object.entries(PLATE_COMPONENTS)) {
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(<Component />)
        expect(document.querySelector('svg.wallplate')).not.toBeNull()
        unmount()
        // React returned every node: nothing detached survives in the document.
        expect(document.querySelectorAll('svg.wallplate')).toHaveLength(0)
        expect(document.body.querySelectorAll('svg')).toHaveLength(0)
      }
      expect(document.querySelectorAll('.wallplate')).toHaveLength(0) // per-plate, same law
      expect(setIntervalSpy, `${id} never arms an interval`).not.toHaveBeenCalled()
      expect(rafSpy, `${id} never requests a frame`).not.toHaveBeenCalled()
    }
  })

  it('ten mounts per plate land inside a generous time budget (jsdom)', () => {
    // Budget is deliberately loose: it exists to CATCH pathological
    // accidental animation/re-render loops, not to gate machine speed.
    const BUDGET_MS = 2500
    for (const [id, Component] of Object.entries(PLATE_COMPONENTS)) {
      const started = performance.now()
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(<Component />)
        unmount()
      }
      const elapsed = performance.now() - started
      expect(elapsed, `${id}: 10× mount/unmount took ${elapsed.toFixed(0)}ms`).toBeLessThan(
        BUDGET_MS,
      )
    }
  })
})

/* ------------------------------ palette law -------------------------------- */

describe('UI-4 · plate ink comes from tokens (no hardcoded hex)', () => {
  const read = (name: string): string =>
    readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

  /** Every wallplate source module (the grep scope — enumerated, not globbed). */
  const WALLPLATE_SOURCES = [
    'index.ts',
    'plate-math.ts',
    'PlateSvg.tsx',
    'StarChartPlate.tsx',
    'AnatomicalPlate.tsx',
    'PhytographPlate.tsx',
    'SurveyPlate.tsx',
  ] as const

  /** 3/6/8-digit CSS hex color literals (SVG gradient ids use non-hex names). */
  const HEX_COLOR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/

  it('wallplate modules define no hex literals — palette rides var(--tokens)', () => {
    for (const file of WALLPLATE_SOURCES) {
      expect(read(file).match(HEX_COLOR), file).toBeNull()
    }
  })

  it('the desktop wallpaper seam keeps the same law (registry, layer, sheet)', () => {
    for (const file of [
      '../../platform/desktop/wallpaper-registry.ts',
      '../../platform/desktop/wallpaper.tsx',
      '../../platform/desktop/desktop.css',
    ]) {
      expect(read(file).match(HEX_COLOR), file).toBeNull()
    }
  })

  it('plate attributes reference token custom properties', () => {
    const { container } = render(<StarChartPlate />)
    const svg = container.querySelector('svg.wallplate')!
    expect(svg.innerHTML).toContain('var(--chrome-ground)')
    expect(svg.innerHTML).toContain('var(--phosphor-dim)')
    cleanup()

    const anatomy = render(<AnatomicalPlate />).container.querySelector('svg.wallplate')!
    expect(anatomy.innerHTML).toContain('var(--parchment)')
    expect(anatomy.innerHTML).toContain('var(--oxide)')
  })
})
