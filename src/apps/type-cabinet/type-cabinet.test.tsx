// @vitest-environment jsdom
// batch 2 · type-cabinet — the specimen book through its real seams. Five
// gates (the brief's acceptance list, order preserved):
//   1. DATA ↔ FONTS.CSS: every face/weight the cabinet shows is a face
//      src/styles/fonts.css actually ships, and every @font-face family has a
//      drawer — no drift, either direction (the CSS is PARSED, not mirrored).
//   2. TABS: the drawer tabs are keyboard-operable (arrows WRAP the ring,
//      Home/End jump, roving tabindex, ARIA wiring panel↔tab).
//   3. ZERO RAW HEX over the app sheet + the rest of the visual law (brass
//      confined to the tab pulls, no oxide, no free phosphor, one moment).
//   4. The specimen corpus itself is honest (pangrams are pangrams, runt and
//      display stops exist, tracking rides match the world's bands) and the
//      manifest/registration facts hold (singleton, lazy mount, icon).
//   5. The mono drawer counts (its digit row rides a real well) and the label
//      drawer's digits print OUTSIDE any well — the Measuring Law, shown.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import {
  openApp,
  registerApps,
  resetAppRegistry,
} from '../../platform/app-registry'
import { resetLazyMount } from '../../platform/app-registry/lazy-mount'
import { useWMStore } from '../../platform/stores/wm-store'
import { typeCabinetApp } from './index'
import { TypeCabinetIcon } from './TypeCabinetIcon'
import { TypeCabinet } from './TypeCabinetSurface'
import {
  TYPE_CABINET_FACES,
  WORLD_TRACKING_BANDS,
  drawerReadout,
  nextDrawer,
  type FaceSpecimen,
} from './type-cabinet-data'

const here = (name: string): string => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
const css = here('./type-cabinet.css')

/* --------------------------------------------------------------------------
 * 1 · the no-drift gate — the data module against the REAL shipped faces
 * ------------------------------------------------------------------------ */

/** One @font-face as fonts.css declares it (static `400` = the range [400,400]). */
interface DeclaredFace {
  readonly family: string
  readonly ranges: readonly (readonly [number, number])[]
}

/** Parse the shipped @font-face set — family + weight (single or range). */
function parseFontFaces(sheet: string): DeclaredFace[] {
  const blocks: DeclaredFace[] = []
  // Split on the AT-RULE SHAPE (not the bare token — fonts.css's header
  // comment names @font-face in prose; only "\@font-face {" is a real face).
  for (const block of sheet.split(/@font-face\s*\{/).slice(1)) {
    const family = block.match(/font-family:\s*'([^']+)'/)?.[1]
    const weightDecl = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim()
    expect(family, 'every @font-face declares a family').toBeTruthy()
    expect(weightDecl, 'every @font-face declares a weight').toBeTruthy()
    const tokens = weightDecl!.split(/\s+/).map((token) => Number.parseInt(token, 10))
    const lo = tokens[0]!
    const hi = tokens[tokens.length - 1]!
    blocks.push({ family: family!, ranges: [[Math.min(lo, hi), Math.max(lo, hi)]] })
  }
  // A family may ship as SEVERAL faces (Chakra 400 + 600, B612 400 + 700) —
  // merge them so a family's coverage is the union of its declared blocks.
  const byFamily = new Map<string, DeclaredFace>()
  for (const face of blocks) {
    const seen = byFamily.get(face.family)
    byFamily.set(face.family, {
      family: face.family,
      ranges: seen ? [...seen.ranges, ...face.ranges] : face.ranges,
    })
  }
  return [...byFamily.values()]
}

const fontsCss = here('../../styles/fonts.css')
const tokensCss = here('../../styles/tokens.css')
const declaredFaces = parseFontFaces(fontsCss)

const covers = (face: DeclaredFace, weight: number): boolean =>
  face.ranges.some(([lo, hi]) => weight >= lo && weight <= hi)

describe('type-cabinet · data ↔ fonts.css (no drift)', () => {
  it('shows only faces and weights the hold actually shipped', () => {
    for (const face of TYPE_CABINET_FACES) {
      const declared = declaredFaces.find((d) => d.family === face.family)
      expect(declared, `${face.family} ships in fonts.css`).toBeDefined()
      // Static faces match exactly; the variable Lora file's `400 700` range
      // honestly covers every weight between — the parse reads both shapes.
      const shown = [
        face.primaryWeight,
        face.displayWeight,
        ...face.weights.map((step) => step.weight),
      ]
      for (const weight of shown) {
        expect(
          covers(declared!, weight),
          `${face.family} ${weight} is a real shipped weight`,
        ).toBe(true)
      }
    }
  })

  it('gives every @font-face family a drawer — a new face cannot ship unannounced', () => {
    const shipped = declaredFaces.map((d) => d.family).sort()
    const drawers = TYPE_CABINET_FACES.map((f) => f.family).sort()
    // the five committed faces span three families (Chakra 400+600, Lora's
    // one variable file, B612 400+700) — one drawer per FAMILY
    expect(shipped).toEqual(['B612 Mono', 'Chakra Petch', 'Lora'])
    expect(drawers).toEqual(shipped)
  })

  it('points each drawer at the role token that names its family (tokens.css)', () => {
    for (const face of TYPE_CABINET_FACES) {
      expect(tokensCss, `${face.cssVar} names ${face.family}`).toContain(
        `${face.cssVar}: '${face.family}'`,
      )
    }
  })
})

/* --------------------------------------------------------------------------
 * 4a · the specimen corpus — honest authored data (DOM-free)
 * ------------------------------------------------------------------------ */

const A_TO_Z = 'abcdefghijklmnopqrstuvwxyz'
const ALPHABET = new Set(A_TO_Z.split(''))

const isPangram = (line: string): boolean => {
  const letters = new Set(line.toLowerCase().split('').filter((ch) => ALPHABET.has(ch)))
  return letters.size === ALPHABET.size
}

describe('type-cabinet · the specimen corpus', () => {
  it('sets only true pangrams (every letter of the alphabet, every line)', () => {
    for (const face of TYPE_CABINET_FACES) {
      for (const line of [face.waterfallSample, ...face.pangrams]) {
        expect(isPangram(line), `${face.family}: “${line}”`).toBe(true)
      }
    }
  })

  it('carries the full alphabet, upper and lower, in every drawer', () => {
    for (const face of TYPE_CABINET_FACES) {
      const lower = face.alphabet.toLowerCase()
      for (const letter of A_TO_Z) {
        expect(lower.includes(letter), `${face.family} alphabet has ${letter}`).toBe(true)
      }
    }
  })

  it('runs each waterfall from a runt to a display size, ascending', () => {
    for (const face of TYPE_CABINET_FACES) {
      const sizes = face.waterfall.map((stop) => stop.px)
      for (let at = 1; at < sizes.length; at += 1) {
        expect(sizes[at]!, `${face.family} waterfall ascends`).toBeGreaterThan(sizes[at - 1]!)
      }
      expect(sizes[0]!, `${face.family} has a runt`).toBeLessThanOrEqual(13)
      expect(sizes[sizes.length - 1]!, `${face.family} has a display size`).toBeGreaterThanOrEqual(28)
      // the world's floor holds: nothing rides below 11px
      expect(sizes[0]!).toBeGreaterThanOrEqual(11)
    }
  })

  it('rides the tracking bands the world actually rides — no more', () => {
    expect(WORLD_TRACKING_BANDS.map((band) => band.em)).toEqual([0.08, 0.1, 0.12])
    const byId = (id: string): FaceSpecimen =>
      TYPE_CABINET_FACES.find((face) => face.id === id)!
    expect(byId('label').ridesTracking).toEqual([0.08, 0.1, 0.12]) // the law's face: all three
    expect(byId('mono').ridesTracking).toEqual([0.08]) // readouts only
    expect(byId('content').ridesTracking).toEqual([]) // the serif is never tracked
    for (const face of TYPE_CABINET_FACES) {
      for (const em of face.ridesTracking) {
        expect(WORLD_TRACKING_BANDS.some((band) => band.em === em)).toBe(true)
      }
    }
  })

  it('annotates every drawer with its role and at least two cited laws', () => {
    for (const face of TYPE_CABINET_FACES) {
      expect(face.roleTitle.length).toBeGreaterThan(0)
      expect(face.roleNote.length).toBeGreaterThan(0)
      expect(face.lawCitations.length).toBeGreaterThanOrEqual(2)
      for (const law of face.lawCitations) expect(law.length).toBeGreaterThan(0)
    }
    // the brief's own three lines, verbatim in spirit
    expect(TYPE_CABINET_FACES.map((f) => f.roleLine)).toEqual([
      'This face speaks for the console.',
      'This face reads the archive.',
      'This face counts.',
    ])
  })

  it('tells the digit truth: mono counts, label is barred, content owes none', () => {
    const label = TYPE_CABINET_FACES[0]!
    const content = TYPE_CABINET_FACES[1]!
    const mono = TYPE_CABINET_FACES[2]!
    expect(label.digits?.barred).toBe(true) // proportional digits, barred from readouts
    expect(content.digits).toBeNull() // prose carries no readouts
    expect(mono.digits?.barred).toBe(false)
    for (const digit of '0123456789'.split('')) {
      expect(mono.digits!.row.includes(digit)).toBe(true)
    }
  })

  it('wraps the drawer ring and prints the readout', () => {
    expect(nextDrawer(0, 1, 3)).toBe(1)
    expect(nextDrawer(2, 1, 3)).toBe(0) // wraps past the last drawer
    expect(nextDrawer(0, -1, 3)).toBe(2) // and back past the first
    expect(nextDrawer(0, 1, 0)).toBe(0) // an empty cabinet opens nothing
    expect(drawerReadout(0, 3)).toBe('01 / 03')
    expect(drawerReadout(2, 3)).toBe('03 / 03')
  })
})

/* --------------------------------------------------------------------------
 * 4b · the manifest + registration facts
 * ------------------------------------------------------------------------ */

const initialWM = useWMStore.getState()

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  cleanup()
})

describe('type-cabinet · manifest', () => {
  it('declares the contract-clean manifest', () => {
    expect(typeCabinetApp.id).toBe('type-cabinet')
    expect(typeCabinetApp.id).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(typeCabinetApp.name).toBe('Type Cabinet')
    expect(typeCabinetApp.singleton).toBe(true)
    expect(typeCabinetApp.acceptedFileTypes).toBeUndefined() // opened, never opened-onto
    expect(typeCabinetApp.defaultGeometry).toEqual({ w: 680, h: 560 })
  })

  it('mounts lazily (retryableLazy — the surface rides its own chunk)', () => {
    expect(resetLazyMount(typeCabinetApp.mount)).toBe(true)
  })

  it('draws the icon as a render-only stroke mark', () => {
    const { container } = render(<TypeCabinetIcon size={20} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('20')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg!.querySelectorAll('rect, line, path').length).toBeGreaterThan(0)
  })
})

describe('type-cabinet · registration', () => {
  it('opens ONE cabinet window; a second open raises it (singleton)', () => {
    expect(registerApps([typeCabinetApp])).toBe(1)
    const first = openApp('type-cabinet')
    const second = openApp('type-cabinet')
    expect(first).toBeTruthy()
    expect(second).toBe(first)
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(1)
  })
})

/* --------------------------------------------------------------------------
 * 2 · the cabinet document — tabs, keyboard, sheets
 * ------------------------------------------------------------------------ */

const mountCabinet = (): ReturnType<typeof render> => render(<TypeCabinet />)
const tabCount = 3

describe('type-cabinet · the cabinet document', () => {
  it('opens on the label drawer: three engraved tabs, the first engaged', () => {
    mountCabinet()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(tabCount)
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Chakra Petch', 'Lora', 'B612 Mono'])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
    // roving tabindex: the engaged tab is the ring's one tab stop
    expect(tabs[0]!.tabIndex).toBe(0)
    expect(tabs[1]!.tabIndex).toBe(-1)
    expect(tabs[2]!.tabIndex).toBe(-1)
  })

  it('wires the panel to the engaged tab (aria-controls / aria-labelledby)', () => {
    mountCabinet()
    const tabs = screen.getAllByRole('tab')
    const panel = screen.getByRole('tabpanel')
    expect(tabs[0]!.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]!.id)
  })

  it('walks the drawers by keyboard — arrows WRAP, Home/End jump, focus follows', () => {
    const { container } = mountCabinet()
    const tabs = screen.getAllByRole('tab')
    const tablist = container.querySelector('[role="tablist"]')!

    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1])
    expect(screen.getByText('02 / 03')).toBeTruthy() // the B612 drawer readout

    fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' })
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tabs[2]!, { key: 'ArrowRight' }) // wraps III → I
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[0])

    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' }) // wraps I → III
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tabs[2]!, { key: 'Home' })
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs[0]!, { key: 'End' })
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('03 / 03')).toBeTruthy()
  })

  it('clicks open drawers too — every sheet carries its role line and laws', () => {
    mountCabinet()
    const tabs = screen.getAllByRole('tab')
    const sheet = (): HTMLElement => screen.getByRole('tabpanel')

    expect(screen.getByText(/speaks for the console/i)).toBeTruthy() // label, open by default
    fireEvent.click(tabs[1]!)
    expect(within(sheet()).getByText('Lora')).toBeTruthy() // the face, set in itself
    expect(screen.getByText(/reads the archive/i)).toBeTruthy()
    fireEvent.click(tabs[2]!)
    expect(screen.getByText(/this face counts/i)).toBeTruthy()
  })

  it('renders the runt and the display stop on every sheet (the waterfall floor)', () => {
    const { container } = mountCabinet()
    for (const face of TYPE_CABINET_FACES) {
      const tabs = screen.getAllByRole('tab')
      fireEvent.click(tabs[face.drawer - 1]!)
      const sizes = face.waterfall.map((stop) => stop.px)
      const runt = sizes[0]!
      const display = sizes[sizes.length - 1]!
      expect(container.querySelector(`[data-tc-size="${runt}"]`), `${face.family} runt`).toBeTruthy()
      expect(
        container.querySelector(`[data-tc-size="${display}"]`),
        `${face.family} display`,
      ).toBeTruthy()
    }
  })

  it('seats the mono digit row in a WELL; the label drawer\u2019s barred digits print outside any well', () => {
    const { container } = mountCabinet()
    const tabs = screen.getAllByRole('tab')

    fireEvent.click(tabs[2]!) // the mono drawer
    const digits = container.querySelector('[data-tc-digits]')!
    expect(digits.className).toContain('well')
    expect(digits.textContent).toContain('0123456789')

    fireEvent.click(tabs[0]!) // the label drawer — proportional digits, barred
    const barred = container.querySelector('[data-tc-digits]')!
    expect(barred.className).not.toContain('well')
    expect(barred.className).toContain('typecabinet-digits--barred')

    fireEvent.click(tabs[1]!) // the content drawer owes no digit story
    expect(container.querySelector('[data-tc-digits]')).toBeNull()
  })

  it('marks the tracking bands each face actually rides', () => {
    const { container } = mountCabinet()
    const ridesMarks = (): string[] =>
      [...container.querySelectorAll('.typecabinet-rides')].map((el) => el.textContent ?? '')
    expect(ridesMarks()).toEqual(['Rides', 'Rides', 'Rides']) // label: all three bands
    fireEvent.click(screen.getAllByRole('tab')[1]!)
    expect(ridesMarks()).toEqual(['Does not ride', 'Does not ride', 'Does not ride'])
    fireEvent.click(screen.getAllByRole('tab')[2]!)
    expect(ridesMarks()).toEqual(['Rides', 'Does not ride', 'Does not ride'])
  })
})

/* --------------------------------------------------------------------------
 * 3 · the visual law over the app sheet
 * ------------------------------------------------------------------------ */

describe('type-cabinet · visual law over the app sheet', () => {
  it('carries ZERO raw hex — every ink rides a token', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeNull()
    for (const token of ['--font-label', '--font-content', '--font-mono', '--parchment-ink']) {
      expect(css, token).toContain(`var(${token}`)
    }
  })

  it('keeps brass at the tab pulls — the drawer fronts\u2019 one touchpoint', () => {
    expect(css).toContain('--brass')
    for (const block of css.split('\n\n')) {
      if (!block.includes('--brass')) continue
      expect(block).toMatch(/typecabinet-tab/)
    }
  })

  it('spends no oxide and names no free phosphor — glow stays in the .well primitive', () => {
    expect(css).not.toContain('--oxide') // nothing is destroyed in a specimen book
    expect(css).not.toContain('--phosphor') // the toolbar readout + digit row ride .well
  })

  it('rounds nothing (the Machined Edge Rule — no hardware circles here)', () => {
    for (const match of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(match[1]!.trim()).toBe('50%')
    }
  })

  it('authors exactly ONE motion moment — the drawer sheet settling', () => {
    expect(css).toContain('typecabinet-settle')
    expect(css.match(/animation:/g)?.length).toBe(1)
    // control feedback only: every transition is the tabs' paint swap
    for (const match of css.matchAll(/transition:\s*([^;]+);/g)) {
      expect(match[1]!).toContain('background-color')
    }
  })

  it('keeps the focus beam on the in-world tokens', () => {
    expect(css).toContain('outline: 2px solid var(--focus-ring)')
  })
})
