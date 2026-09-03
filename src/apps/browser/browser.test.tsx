// @vitest-environment jsdom
// AP-6 · browser — the archive's FIELD ATLAS through its real seams: the
// registration manifest (singleton reserved id, lazy mount, render-only
// icon), the singleton window dedupe, the ledger index rendering EVERY pack
// project from a FIXTURE pack (incl. the zero-projects empty state),
// placeholder mode (stand-ins in, template debris OUT — by construction,
// asserted on the real ambient seams), card → plate page → back, prev/next
// WRAPPING, the keyboard floor (arrows page, Backspace returns), external
// links attribute-correct + the absent-URL disabled state (never hidden),
// the no-iframe law (DOM + source grep), and the pure model helpers.
import { readFileSync, readdirSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { seedFSState } from '../../lib/fs'
import { defaultAuthorPack, parseAuthorPack, PLACEHOLDER_MARK } from '../../lib/content'
import { listApps, openApp, registerApps, resetAppRegistry } from '../../platform/app-registry'
import { resetLazyMount } from '../../platform/app-registry/lazy-mount'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { apps } from '../index'
import { browserApp } from './index'
import { BrowserIcon } from './BrowserIcon'
import BrowserSurface, { FieldAtlas } from './BrowserSurface'
import type { CatalogSheet } from './browser-model'
import {
  EMPTY_TITLE,
  NO_LIVE_REASON,
  NO_REPO_REASON,
  STANDIN_DESCRIPTION,
  UNFILED_ACCESSION,
  atlasView,
  exhibitAccession,
  linkHost,
  normalizeScreenshotPath,
  plateReadout,
  platesLabel,
  romanNumeral,
  screenshotSrc,
  wrapIndex,
} from './browser-model'

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  registerApps(apps) // the REAL startup registration (now seven modules)
  cleanup()
})

/* -------------------------------- helpers --------------------------------- */

const windowCount = (): number => Object.keys(useWMStore.getState().windows).length
const text = (): string => document.body.textContent ?? ''
const active = (): HTMLElement => document.activeElement as HTMLElement

/** A REAL filled pack (three exhibits covering every field combination). */
const FIXTURE_PACK = parseAuthorPack(
  JSON.stringify({
    version: 1,
    author: { name: 'Rosa Vega', tagline: 'Maps', bio: 'Cartographer.' },
    projects: [
      {
        id: 'exhibit-01',
        name: 'Atlas of Nowhere',
        description: 'A browsable atlas of procedurally drawn islands.',
        tech: ['Canvas', 'TypeScript'],
        liveUrl: 'https://atlas.example.com',
        repoUrl: 'https://github.com/rosavega/atlas',
        story: 'Begun as a bet that a seeded walk could draw coastline worth reading.',
        screenshotPath: 'content/screenshots/atlas.png',
      },
      {
        id: 'exhibit-02',
        name: 'Ledger of Tides',
        description: 'Tide tables for harbors that appear only on the chart.',
        tech: ['React'],
        liveUrl: 'https://tides.example.com',
      },
      {
        id: 'exhibit-03',
        name: 'Quiet Meridian',
        description: 'A one-file SVG star chart of an invented sky.',
        tech: ['SVG'],
      },
    ],
  }),
)

/** A pack with no exhibits at all — the honest empty atlas. */
const EMPTY_PACK = parseAuthorPack(
  JSON.stringify({
    version: 1,
    author: { name: 'Rosa Vega', tagline: 'Maps', bio: 'Cartographer.' },
    projects: [],
  }),
)

/** The embedded-screenshot dictionary, as the surface builds from its glob. */
const SHOTS: Readonly<Record<string, string>> = {
  'content/screenshots/atlas.png': '/assets/atlas-BmXx2.webp',
}

/** The seeded sheet — the FILLED pack's five exhibits all have specimens. */
const SHEET = seedFSState()

/** A sheet with exhibit-03 deleted elsewhere (the honest-gap fixture). */
const GAP_SHEET: CatalogSheet = {
  rootId: SHEET.rootId,
  nodes: Object.fromEntries(Object.entries(SHEET.nodes).filter(([id]) => id !== 'exhibit-03')),
}

/** The atlas document against the fixture pack (the filled-pack path). */
function mountFixture(): ReturnType<typeof render> {
  return render(<FieldAtlas view={atlasView(FIXTURE_PACK, false)} sheet={SHEET} shots={SHOTS} />)
}

/** The atlas document against the REAL placeholder pack + ambient seams. */
function mountPlaceholder(): ReturnType<typeof render> {
  return render(
    <FieldAtlas view={atlasView(defaultAuthorPack, true)} sheet={SHEET} shots={{}} />,
  )
}

/** Every <iframe> in the served document (the no-iframe law's probe). */
const iframes = (): number => document.querySelectorAll('iframe').length

/* ------------------------------ the manifest ------------------------------- */

describe('AP-6 · registration manifest', () => {
  it('rides the startup apps array under the RESERVED id "browser"', () => {
    expect(apps).toContain(browserApp)
    expect(browserApp.id).toBe('browser')
    expect(browserApp.name).toBe('Field Atlas')
  })

  it('declares SINGLETON (one atlas ever), no file routing, and geometry hints', () => {
    expect(browserApp.singleton).toBe(true)
    expect(browserApp.acceptedFileTypes).toBeUndefined() // opened, never opened-onto
    expect(browserApp.defaultGeometry).toEqual({ w: 720, h: 560 })
  })

  it('mounts a LAZY surface (own chunk) and a render-only icon', () => {
    expect(typeof browserApp.mount).toBe('function') // retryableLazy(() => import(...)) — HU-1
    expect(resetLazyMount(browserApp.mount)).toBe(true) // it IS a retryable lazy mount
    expect(browserApp.icon).toBe(BrowserIcon)
    const { container } = render(<BrowserIcon size={20} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('rides between about and the closing run — the launcher ends stay stable', () => {
    const ids = listApps().map((app) => app.id)
    expect(ids.indexOf('notepad')).toBe(0) // launcher's first item (taskbar floor)
    expect(ids.indexOf('settings')).toBe(ids.length - 1) // launcher's last item
    // FEDERATED UNFREEZE (session 1): the catalog terminal joined the closing
    // run between the atlas and the console (its sanctioned slot) — the ends
    // stay stable, and the atlas now rides directly ahead of the TERMINAL.
    expect(ids.indexOf('browser')).toBe(ids.indexOf('terminal') - 1)
  })
})

/* ---------------------- the singleton window rule -------------------------- */

describe('AP-6 · singleton: one atlas ever', () => {
  it('every open raises + focuses THE window — re-opens included', () => {
    const first = openApp('browser')!
    const again = openApp('browser') // launcher re-open
    const third = openApp('browser') // taskbar rail re-open

    expect(again).toBe(first)
    expect(third).toBe(first)
    expect(windowCount()).toBe(1)
    const record = useWMStore.getState().windows[first]!
    expect(record.appId).toBe('browser')
    expect(record.instanceId).toBe('singleton')
  })

  it('re-opening a stowed atlas restores + focuses it (no duplicate)', () => {
    const id = openApp('browser')!
    useWMStore.getState().minimizeWindow(id)
    const again = openApp('browser')

    expect(again).toBe(id)
    expect(windowCount()).toBe(1)
    expect(useWMStore.getState().windows[id]!.minimized).toBe(false)
    expect(useWMStore.getState().focusedId).toBe(id)
  })
})

/* ------------------- the ledger index, from a fixture pack ------------------ */

describe('AP-6 · the ledger index (fixture pack = the fill task\'s output)', () => {
  it('renders EVERY pack project as a catalog card, in pack order', () => {
    mountFixture()

    const cards = document.querySelectorAll('[data-browser-card]')
    expect(cards).toHaveLength(3)
    expect(cards[0]!.getAttribute('data-plate-id')).toBe('exhibit-01')
    expect(cards[0]!.textContent).toContain('Atlas of Nowhere')
    expect(cards[1]!.textContent).toContain('Ledger of Tides')
    expect(cards[2]!.textContent).toContain('Quiet Meridian')
    expect(text()).toContain('A browsable atlas of procedurally drawn islands.')
  })

  it('carries the plate-book furniture: roman plate numbers, tech chips, previews', () => {
    mountFixture()

    expect(text()).toContain('PLATE I')
    expect(text()).toContain('PLATE II')
    expect(text()).toContain('PLATE III')
    // Tech tags stamp as chips on their own cards only.
    const chips = document.querySelectorAll('[data-browser-chip]')
    expect(chips).toHaveLength(0) // chips render on the PLATE PAGE (asserted below)
    // The one resolvable screenshot renders its preview; the others frame.
    expect(document.querySelectorAll('.browser-card-image')).toHaveLength(1)
    expect(document.querySelectorAll('[data-browser-undeveloped]')).toHaveLength(2)
    // The ledger readout counts the ring.
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('3 PLATES')
  })

  it('renders card tech as small stamped chips', () => {
    mountFixture()

    // Card-level chips (no data attribute) carry the tags near the name.
    const firstCard = document.querySelectorAll('[data-browser-card]')[0]!
    const cardChips = firstCard.querySelectorAll('.browser-chip')
    expect(Array.from(cardChips).map((chip) => chip.textContent)).toEqual([
      'Canvas',
      'TypeScript',
    ])
  })

  it('a zero-project pack states the empty atlas honestly', () => {
    render(<FieldAtlas view={atlasView(EMPTY_PACK, false)} sheet={SHEET} shots={{}} />)

    expect(document.querySelector('[data-browser-empty]')!.textContent).toContain(EMPTY_TITLE)
    expect(text()).toContain('No exhibits are catalogued')
    expect(document.querySelectorAll('[data-browser-card]')).toHaveLength(0)
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('0 PLATES')
    // Nowhere to page, nothing to open — the controls say so.
    expect(
      (document.querySelector('[data-browser-prev]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (document.querySelector('[data-browser-next]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (document.querySelector('[data-browser-back]') as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

/* ------------------------- placeholder honesty ------------------------------ */

describe('AP-6 · placeholder mode (a recruiter never sees template debris)', () => {
  it('renders stand-in cards: Unindexed Specimens awaiting the field notes', () => {
    mountPlaceholder()

    const cards = document.querySelectorAll('[data-browser-card]')
    expect(cards).toHaveLength(2) // the default pack carries two slots
    expect(cards[0]!.textContent).toContain('Unindexed Specimen 01')
    expect(cards[1]!.textContent).toContain('Unindexed Specimen 02')
    expect(text()).toContain(STANDIN_DESCRIPTION)
    const notice = document.querySelector('[data-browser-awaiting]')!
    expect(notice.getAttribute('role')).toBe('note')
    expect(notice.textContent).toContain('AWAITING FIELD ACCESSION')
  })

  it('NEVER renders the marker strings — not one bracket of template debris', () => {
    mountPlaceholder()

    expect(text()).not.toContain(PLACEHOLDER_MARK)
    expect(text()).not.toContain('REPLACE')
    expect(text()).not.toContain('[PROJECT')
    expect(text()).not.toContain('[ONE LINE')
    expect(text()).not.toContain('[TECH')
  })

  it('placeholder cards stay honest: no fake tech, no previews, disabled externals', () => {
    mountPlaceholder()

    expect(document.querySelectorAll('.browser-chip')).toHaveLength(0)
    expect(document.querySelectorAll('.browser-card-image')).toHaveLength(0)
    // Enter a stand-in plate: both external actions disabled with reasons.
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[0]!)
    const live = document.querySelector('[data-browser-live]') as HTMLButtonElement
    const repo = document.querySelector('[data-browser-repo]') as HTMLButtonElement
    expect(live.disabled).toBe(true)
    expect(repo.disabled).toBe(true)
    expect(document.querySelector('[data-browser-live-note]')!.textContent).toBe(NO_LIVE_REASON)
    expect(document.querySelector('[data-browser-repo-note]')!.textContent).toBe(NO_REPO_REASON)
    expect(document.querySelector('[data-browser-undeveloped]')).not.toBeNull()
  })

  it('the MOUNTED surface reads the ambient seams (filled: the officer’s five exhibits)', () => {
    // REFINEMENT #1 UNFREEZE: content/author.json ships filled — the ambient
    // atlas renders the real catalogue, stand-ins gone.
    render(<BrowserSurface windowId="w-browser" launch={{ source: 'launcher' }} />)
    expect(document.querySelectorAll('[data-browser-card]')).toHaveLength(5)
    expect(document.querySelector('[data-browser-awaiting]')).toBeNull()
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('5 PLATES')
  })
})

/* ---------------------- the plate page + navigation ------------------------- */

describe('AP-6 · card → plate page → back, with wrapping pages', () => {
  it('clicking a card turns to its plate; the ledger returns to the index', () => {
    mountFixture()

    fireEvent.click(document.querySelectorAll('[data-browser-card]')[0]!)
    const page = document.querySelector('[data-browser-page]')!
    expect(page.getAttribute('data-plate-id')).toBe('exhibit-01')
    expect(document.querySelector('[data-browser-plate-name]')!.textContent).toBe(
      'Atlas of Nowhere',
    )
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('PLATE I / III')
    // The accession well cites the archive's own record for the joined node.
    expect(document.querySelector('[data-browser-accession]')!.textContent).toBe(
      SHEET.nodes['exhibit-01']!.accession,
    )
    // Back to the ledger: the index returns, focus lands on the card we left.
    fireEvent.click(document.querySelector('[data-browser-back]')!)
    expect(document.querySelector('[data-browser-page]')).toBeNull()
    expect(document.querySelectorAll('[data-browser-card]')).toHaveLength(3)
    expect(active().matches('[data-browser-card]')).toBe(true)
  })

  it('renders the plate page in full: screenshot, story, chips, caption', () => {
    mountFixture()
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[0]!)

    const shot = document.querySelector('[data-browser-screenshot]') as HTMLImageElement
    expect(shot.getAttribute('src')).toBe('/assets/atlas-BmXx2.webp')
    expect(shot.getAttribute('alt')).toBe('Atlas of Nowhere — exhibit plate')
    expect(document.querySelector('[data-browser-story]')!.textContent).toContain('seeded walk')
    const chips = Array.from(document.querySelectorAll('[data-browser-chip]'))
    expect(chips.map((chip) => chip.textContent)).toEqual(['Canvas', 'TypeScript'])
    expect(document.querySelector('.browser-figure-caption')!.textContent).toContain(
      SHEET.nodes['exhibit-01']!.accession,
    )
  })

  it('a plate without story/screenshot states their absence in-world', () => {
    mountFixture()
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[1]!)

    expect(document.querySelector('[data-browser-story]')).toBeNull()
    expect(document.querySelector('[data-browser-screenshot]')).toBeNull()
    expect(document.querySelector('[data-browser-undeveloped]')!.textContent).toContain(
      'PLATE NOT DEVELOPED',
    )
  })

  it('an unjoined slot degrades to UNFILED — never a stale accession', () => {
    // REFINEMENT #1 UNFREEZE: the filled pack seeds all five exhibits, so the
    // gap is manufactured honestly — the specimen deleted elsewhere — exactly
    // the state the UNFILED fallback exists for.
    render(<FieldAtlas view={atlasView(FIXTURE_PACK, false)} sheet={GAP_SHEET} shots={SHOTS} />)
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[2]!)

    expect(document.querySelector('[data-browser-accession]')!.textContent).toBe(
      UNFILED_ACCESSION,
    )
  })

  it('prev/next WRAP the ledger both ways (a plate book is a ring)', () => {
    mountFixture()
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[0]!)

    fireEvent.click(document.querySelector('[data-browser-next]')!)
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('PLATE II / III')
    fireEvent.click(document.querySelector('[data-browser-next]')!)
    expect(document.querySelector('[data-browser-plate-name]')!.textContent).toBe(
      'Quiet Meridian',
    )
    fireEvent.click(document.querySelector('[data-browser-next]')!) // wraps I ← III
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('PLATE I / III')
    fireEvent.click(document.querySelector('[data-browser-prev]')!) // wraps I → III
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('PLATE III / III')
  })

  it('a one-plate atlas disables paging (the ring would page to itself)', () => {
    const solo = parseAuthorPack(
      JSON.stringify({
        version: 1,
        author: { name: 'Rosa Vega', tagline: 'Maps', bio: 'Cartographer.' },
        projects: [
          {
            id: 'exhibit-01',
            name: 'Atlas of Nowhere',
            description: 'A browsable atlas.',
            tech: ['Canvas'],
          },
        ],
      }),
    )
    render(<FieldAtlas view={atlasView(solo, false)} sheet={SHEET} shots={{}} />)
    fireEvent.click(document.querySelector('[data-browser-card]')!)

    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('PLATE I / I')
    expect((document.querySelector('[data-browser-prev]') as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((document.querySelector('[data-browser-next]') as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

/* ---------------------------- keyboard floor -------------------------------- */

describe('AP-6 · keyboard floor (arrows page, Backspace returns)', () => {
  it('arrow keys page an open plate BOTH ways with wrap', () => {
    mountFixture()
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[0]!)

    fireEvent.keyDown(active(), { key: 'ArrowRight' })
    expect(document.querySelector('[data-browser-plate-name]')!.textContent).toBe(
      'Ledger of Tides',
    )
    fireEvent.keyDown(active(), { key: 'ArrowRight' })
    fireEvent.keyDown(active(), { key: 'ArrowRight' }) // wraps to I
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('PLATE I / III')
    fireEvent.keyDown(active(), { key: 'ArrowLeft' }) // wraps to III
    expect(document.querySelector('[data-browser-plate-name]')!.textContent).toBe(
      'Quiet Meridian',
    )
  })

  it('Backspace returns to the ledger (focus lands on the departed card)', () => {
    mountFixture()
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[1]!)

    fireEvent.keyDown(active(), { key: 'Backspace' })
    expect(document.querySelector('[data-browser-page]')).toBeNull()
    expect(active().matches('[data-browser-card]')).toBe(true)
    expect(active().getAttribute('data-plate-id')).toBe('exhibit-02')
  })

  it('arrows do nothing on the ledger — pages turn only while a plate is open', () => {
    mountFixture()

    // Dispatch INSIDE the surface (on the ledger itself) so the handler is
    // genuinely reached and genuinely declines to act.
    fireEvent.keyDown(document.querySelector('[data-browser-index]')!, { key: 'ArrowRight' })
    expect(document.querySelector('[data-browser-page]')).toBeNull()
    expect(document.querySelector('[data-browser-readout]')!.textContent).toBe('3 PLATES')
  })
})

/* --------------------------- external actions -------------------------------- */

describe('AP-6 · external actions (safe when present, honest when absent)', () => {
  it('URLs the pack carries open as safe anchors: _blank + noopener noreferrer', () => {
    mountFixture()
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[0]!)

    const live = document.querySelector('[data-browser-live]') as HTMLAnchorElement
    expect(live.tagName).toBe('A')
    expect(live.getAttribute('href')).toBe('https://atlas.example.com')
    expect(live.target).toBe('_blank')
    expect(live.rel).toContain('noopener')
    expect(live.rel).toContain('noreferrer')
    expect(document.querySelector('[data-browser-live-note]')!.textContent).toBe(
      'atlas.example.com',
    )

    const repo = document.querySelector('[data-browser-repo]') as HTMLAnchorElement
    expect(repo.tagName).toBe('A')
    expect(repo.getAttribute('href')).toBe('https://github.com/rosavega/atlas')
    expect(repo.target).toBe('_blank')
    expect(repo.rel).toContain('noopener')
    expect(repo.rel).toContain('noreferrer')
    expect(document.querySelector('[data-browser-repo-note]')!.textContent).toBe('github.com')
  })

  it('absent URLs render the buttons DISABLED with engraved reasons — never hidden', () => {
    mountFixture()
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[2]!)

    const live = document.querySelector('[data-browser-live]') as HTMLButtonElement
    const repo = document.querySelector('[data-browser-repo]') as HTMLButtonElement
    expect(live.tagName).toBe('BUTTON')
    expect(live.disabled).toBe(true)
    expect(repo.disabled).toBe(true)
    expect(document.querySelector('[data-browser-live-note]')!.textContent).toBe(NO_LIVE_REASON)
    expect(document.querySelector('[data-browser-repo-note]')!.textContent).toBe(NO_REPO_REASON)
  })

  it('a live site without a repository mixes both states on one plate', () => {
    mountFixture()
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[1]!)

    expect(
      (document.querySelector('[data-browser-live]') as HTMLAnchorElement).getAttribute('href'),
    ).toBe('https://tides.example.com')
    expect((document.querySelector('[data-browser-repo]') as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

/* ------------------------------ the no-iframe law ---------------------------- */

describe('AP-6 · a URL-free zone (no iframes, anywhere)', () => {
  it('no iframe renders in ANY view: index, plate, placeholder, empty', () => {
    mountFixture()
    expect(iframes()).toBe(0)
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[0]!)
    expect(iframes()).toBe(0)
    cleanup()

    mountPlaceholder()
    expect(iframes()).toBe(0)
    fireEvent.click(document.querySelectorAll('[data-browser-card]')[0]!)
    expect(iframes()).toBe(0)
    cleanup()

    render(<FieldAtlas view={atlasView(EMPTY_PACK, false)} sheet={SHEET} shots={{}} />)
    expect(iframes()).toBe(0)
    cleanup()

    render(<BrowserSurface windowId="w-browser" launch={{ source: 'launcher' }} />)
    expect(iframes()).toBe(0)
  })

  it("source grep: the module never mounts an iframe — it can't regress silently", () => {
    const dir = 'src/apps/browser'
    for (const file of readdirSync(dir)) {
      if (!/\.(ts|tsx|css)$/.test(file) || /\.test\./.test(file)) continue
      const source = readFileSync(`${dir}/${file}`, 'utf-8')
      // The ELEMENT forms (JSX tag / DOM factory); the headers may prose
      // about the law they enforce ("never an iframe") — the tag cannot.
      expect(source.includes('<iframe')).toBe(false)
      expect(source.includes("'iframe'")).toBe(false)
      expect(source.includes('"iframe"')).toBe(false)
    }
    // The committed decision itself is recorded in the module's header law.
    expect(readFileSync(`${dir}/BrowserSurface.tsx`, 'utf-8')).toContain('URL-FREE')
  })

  it("typesets by the archive's laws (source-scan: jsdom applies no CSS)", () => {
    const css = readFileSync('src/apps/browser/browser.css', 'utf-8')
    // Phosphor never leaves the well primitive — this sheet names no phosphor.
    expect(css).not.toContain('--phosphor')
    // The reading law: descriptions + stories ride Lora; the measuring law:
    // plate numbers + accessions ride B612.
    const descRule = /\.browser-desc\s*\{[^}]*\}/.exec(css)![0]!
    expect(descRule).toContain('var(--font-content)')
    const storyRule = /\.browser-story-body\s*\{[^}]*\}/.exec(css)![0]!
    expect(storyRule).toContain('var(--font-content)')
    const numberRule = /\.browser-card-number\s*\{[^}]*\}/.exec(css)![0]!
    expect(numberRule).toContain('var(--font-mono)')
    const accessionRule = /\.browser-figure-accession\s*\{[^}]*\}/.exec(css)![0]!
    expect(accessionRule).toContain('var(--font-mono)')
    // The authored moment is transform+opacity ONLY (the motion law).
    const turn = /@keyframes browser-page-turn\s*\{[^}]*\}/.exec(css)![0]!
    expect(turn).toContain('opacity')
    expect(turn).toContain('translateY')
    expect(turn).not.toContain('width')
    // Brass stays at its touchpoints: the primary action + the engaged frame.
    const brassRules = css.match(/--brass[a-z-]*/g) ?? []
    expect(new Set(brassRules).size).toBeGreaterThan(0)
    expect(css).not.toContain('--oxide')
  })
})

/* -------------------------------- pure model -------------------------------- */

describe('AP-6 · model helpers (pure)', () => {
  it('romanNumeral: plate-book numbering, total at the edges', () => {
    expect(romanNumeral(1)).toBe('I')
    expect(romanNumeral(2)).toBe('II')
    expect(romanNumeral(3)).toBe('III')
    expect(romanNumeral(4)).toBe('IV')
    expect(romanNumeral(6)).toBe('VI')
    expect(romanNumeral(9)).toBe('IX')
    expect(romanNumeral(14)).toBe('XIV')
    expect(romanNumeral(40)).toBe('XL')
    expect(romanNumeral(1994)).toBe('MCMXCIV')
    expect(romanNumeral(0)).toBe('0') // total, never throws at a visitor
  })

  it('wrapIndex: the ring wraps both ways; an empty ring stays put', () => {
    expect(wrapIndex(0, 1, 3)).toBe(1)
    expect(wrapIndex(2, 1, 3)).toBe(0) // forward wrap
    expect(wrapIndex(0, -1, 3)).toBe(2) // backward wrap
    expect(wrapIndex(1, -1, 3)).toBe(0)
    expect(wrapIndex(0, 5, 3)).toBe(2) // multiple laps
    expect(wrapIndex(0, 1, 0)).toBe(0)
    expect(wrapIndex(0, 0, 1)).toBe(0)
  })

  it('readouts: plate ring position + ledger count', () => {
    expect(plateReadout(0, 3)).toBe('PLATE I / III')
    expect(plateReadout(2, 3)).toBe('PLATE III / III')
    expect(platesLabel(1)).toBe('1 PLATE')
    expect(platesLabel(3)).toBe('3 PLATES')
    expect(platesLabel(0)).toBe('0 PLATES')
  })

  it('screenshotSrc: normalizes the pack path onto the embedded dictionary', () => {
    expect(screenshotSrc('content/screenshots/atlas.png', SHOTS)).toBe('/assets/atlas-BmXx2.webp')
    expect(screenshotSrc('/content/screenshots/atlas.png', SHOTS)).toBe('/assets/atlas-BmXx2.webp')
    expect(screenshotSrc('./content/screenshots/atlas.png', SHOTS)).toBe(
      '/assets/atlas-BmXx2.webp',
    )
    // REFINEMENT #1: the fill's natural shorthand — a BARE FILENAME names a
    // file in the archive's screenshot directory (the shipped pack uses it).
    expect(screenshotSrc('atlas.png', SHOTS)).toBe('/assets/atlas-BmXx2.webp')
    expect(screenshotSrc('content/screenshots/missing.png', SHOTS)).toBe('')
    expect(screenshotSrc('missing.png', SHOTS)).toBe('')
    expect(screenshotSrc('', SHOTS)).toBe('')
    expect(normalizeScreenshotPath('/content/x.png')).toBe('content/x.png')
    expect(normalizeScreenshotPath('./content/x.png')).toBe('content/x.png')
    expect(normalizeScreenshotPath('x.png')).toBe('content/screenshots/x.png')
  })

  it('linkHost: hostname verbatim, junk is total', () => {
    expect(linkHost('https://atlas.example.com')).toBe('atlas.example.com')
    expect(linkHost('https://www.rosavega.example.com/work')).toBe('www.rosavega.example.com')
    expect(linkHost('not a url')).toBe('not a url')
  })

  it('exhibitAccession: the seeded join reads the archive; gaps degrade to null', () => {
    expect(exhibitAccession(SHEET, 'exhibit-01')).toBe(SHEET.nodes['exhibit-01']!.accession)
    expect(exhibitAccession(SHEET, 'exhibit-02')).toBe(SHEET.nodes['exhibit-02']!.accession)
    expect(exhibitAccession(SHEET, 'no-such-node')).toBeNull()
  })

  it('atlasView never forwards a placeholder string (by construction)', () => {
    const view = atlasView(defaultAuthorPack, true)
    expect(view.placeholder).toBe(true)
    expect(view.plates).toHaveLength(2)
    const joined = view.plates
      .flatMap((plate) => [plate.name, plate.description, ...plate.tech, plate.story])
      .join(' ')
    expect(joined).not.toContain(PLACEHOLDER_MARK)
    // Slot ids survive the swap — they are join keys, never human copy.
    expect(view.plates.map((plate) => plate.id)).toEqual(['exhibit-01', 'exhibit-02'])
    expect(atlasView(FIXTURE_PACK, false).placeholder).toBe(false)
  })
})
