// @vitest-environment jsdom
// AP-5 · about — the science officer's nameplate manifest through its real
// seams: the registration manifest (singleton reserved id, lazy mount,
// render-only icon), the singleton window dedupe, every content-pack field
// rendered from a FIXTURE pack (the same code path a filled
// content/author.json drives — link safety attributes included), placeholder
// mode (stand-ins in, template debris OUT — by construction, asserted on the
// real ambient seams), the commissioning stamp (the nameplate specimen's
// accession record from the LIVE FS store, LOG/— fallback), the colophon,
// and the pure model helpers.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { deleteNode, seedFSState } from '../../lib/fs'
import { defaultAuthorPack, parseAuthorPack, PLACEHOLDER_MARK } from '../../lib/content'
import { listApps, openApp, registerApps, resetAppRegistry } from '../../platform/app-registry'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { apps } from '../index'
import { aboutApp } from './index'
import { AboutIcon } from './AboutIcon'
import AboutSurface, { NameplateManifest } from './AboutSurface'
import {
  commissioning,
  formatLogStamp,
  linkDomain,
  manifestView,
  nameplateSpecimen,
  STANDIN_BIO,
  STANDIN_NAME,
  STANDIN_TAGLINE,
  UNFILED_STAMP,
} from './about-model'

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()

beforeEach(() => {
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  registerApps(apps) // the REAL startup registration (now six modules)
  cleanup()
})

/* -------------------------------- helpers --------------------------------- */

const windowCount = (): number => Object.keys(useWMStore.getState().windows).length
const text = (): string => document.body.textContent ?? ''

/** A REAL filled pack (the loader test's author, extended for every field). */
const FIXTURE_PACK = parseAuthorPack(
  JSON.stringify({
    version: 1,
    author: {
      name: 'Rosa Vega',
      handle: '@vega-cartograph',
      tagline: 'Maps for places that do not exist',
      bio: 'Cartographer of imaginary terrain. I build small web toys that let people wander.',
      links: [
        { label: 'Email', url: 'mailto:rosa@example.com' },
        { label: 'GitHub', url: 'https://github.com/rosavega/atlas' },
        { label: 'Website', url: 'https://www.rosavega.example.com/work' },
      ],
      skills: ['React', 'TypeScript', 'Canvas'],
      interests: ['Cartography', 'Letterboxing'],
      missionLog: 'Survey 44 continues; the hold smells of cedar and ozone.',
    },
    projects: [
      {
        id: 'exhibit-01',
        name: 'Atlas of Nowhere',
        description: 'A browsable atlas of procedurally drawn islands.',
        tech: ['Canvas', 'TypeScript'],
        liveUrl: 'https://atlas.example.com',
      },
    ],
  }),
)

const COMMISSIONED = commissioning(nameplateSpecimen(seedFSState().nodes))

/** The manifest document against the fixture pack (the filled-pack path). */
function mountFixture() {
  return render(
    <NameplateManifest view={manifestView(FIXTURE_PACK, false)} commissioning={COMMISSIONED} />,
  )
}

/** The manifest document against the REAL placeholder pack + ambient seams. */
function mountPlaceholder() {
  return render(
    <NameplateManifest view={manifestView(defaultAuthorPack, true)} commissioning={COMMISSIONED} />,
  )
}

/* ------------------------------ the manifest ------------------------------- */

describe('AP-5 · registration manifest', () => {
  it('rides the startup apps array under the RESERVED id "about"', () => {
    expect(apps).toContain(aboutApp)
    expect(aboutApp.id).toBe('about')
    expect(aboutApp.name).toBe('Nameplate Manifest')
  })

  it('declares SINGLETON (one manifest ever), no file routing, and geometry hints', () => {
    expect(aboutApp.singleton).toBe(true)
    expect(aboutApp.acceptedFileTypes).toBeUndefined() // opened, never opened-onto
    expect(aboutApp.defaultGeometry).toEqual({ w: 560, h: 640 })
  })

  it('mounts a LAZY surface (own chunk) and a render-only icon', () => {
    expect(typeof aboutApp.mount).toBe('object') // lazy(() => import(...))
    expect(aboutApp.icon).toBe(AboutIcon)
    const { container } = render(<AboutIcon size={20} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('rides between explorer and settings — the launcher ends stay stable', () => {
    const ids = listApps().map((app) => app.id)
    expect(ids.indexOf('notepad')).toBe(0) // launcher's first item (taskbar floor)
    expect(ids.indexOf('settings')).toBe(ids.length - 1) // launcher's last item
    expect(ids.indexOf('about')).toBe(ids.indexOf('settings') - 1)
  })
})

/* ---------------------- the singleton window rule -------------------------- */

describe('AP-5 · singleton: one manifest ever', () => {
  it('every open raises + focuses THE window — desktop reference opens included', () => {
    const first = openApp('about')!
    const again = openApp('about') // desktop double-click again
    const third = openApp('about') // launcher re-open

    expect(again).toBe(first)
    expect(third).toBe(first)
    expect(windowCount()).toBe(1)
    const record = useWMStore.getState().windows[first]!
    expect(record.appId).toBe('about')
    expect(record.instanceId).toBe('singleton')
  })

  it('re-opening a stowed manifest restores + focuses it (no duplicate)', () => {
    const id = openApp('about')!
    useWMStore.getState().minimizeWindow(id)
    const again = openApp('about')

    expect(again).toBe(id)
    expect(windowCount()).toBe(1)
    expect(useWMStore.getState().windows[id]!.minimized).toBe(false)
    expect(useWMStore.getState().focusedId).toBe(id)
  })
})

/* ------------------- every content-pack field, from a fixture --------------- */

describe("AP-5 · the filled manifest (fixture pack = the fill task's output)", () => {
  it('renders EVERY author field: name, handle, tagline, bio, mission log', () => {
    mountFixture()

    expect(document.querySelector('[data-about-name]')!.textContent).toBe('Rosa Vega')
    expect(document.querySelector('[data-about-handle]')!.textContent).toBe('@vega-cartograph')
    expect(document.querySelector('[data-about-tagline]')!.textContent).toBe(
      'Maps for places that do not exist',
    )
    expect(document.querySelector('[data-about-bio]')!.textContent).toContain('Cartographer')
    expect(document.querySelector('[data-about-missionlog]')!.textContent).toContain('Survey 44')
  })

  it('renders every link as an engraved row: label + domain', () => {
    mountFixture()

    const rows = document.querySelectorAll('[data-about-link]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.querySelector('.about-link-label')!.textContent).toBe('Email')
    expect(rows[0]!.querySelector('[data-about-domain]')!.textContent).toBe('rosa@example.com')
    expect(rows[1]!.querySelector('[data-about-domain]')!.textContent).toBe('github.com')
    expect(rows[2]!.querySelector('[data-about-domain]')!.textContent).toBe(
      'www.rosavega.example.com',
    )
  })

  it('every external anchor opens safely: target _blank + rel noopener noreferrer', () => {
    mountFixture()

    for (const anchor of document.querySelectorAll<HTMLAnchorElement>('[data-about-link]')) {
      expect(anchor.target).toBe('_blank')
      expect(anchor.rel).toContain('noopener')
      expect(anchor.rel).toContain('noreferrer')
    }
    const mailto = document.querySelectorAll<HTMLAnchorElement>('[data-about-link]')[0]!
    expect(mailto.getAttribute('href')).toBe('mailto:rosa@example.com')
  })

  it('renders skills + interests as engraved chips under their legends', () => {
    mountFixture()

    const chips = Array.from(document.querySelectorAll('[data-about-chip]'))
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'React',
      'TypeScript',
      'Canvas',
      'Cartography',
      'Letterboxing',
    ])
    expect(text()).toContain('Apparatus')
    expect(text()).toContain('Pursuits')
  })

  it('carries NO projects — the exhibits belong to the Project Browser (AP-6)', () => {
    mountFixture()

    expect(text()).not.toContain('Atlas of Nowhere')
    expect(text()).not.toContain('exhibit-01')
  })

  it('a pack without links or chips states its emptiness honestly', () => {
    const lean = parseAuthorPack(
      JSON.stringify({
        version: 1,
        author: { name: 'Rosa Vega', tagline: 'Maps', bio: 'Cartographer.' },
        projects: [],
      }),
    )
    render(<NameplateManifest view={manifestView(lean, false)} commissioning={COMMISSIONED} />)

    expect(document.querySelector('[data-about-empty]')!.textContent).toContain(
      'No channels riveted',
    )
    expect(document.querySelector('.about-chips-section')).toBeNull()
    expect(document.querySelector('[data-about-missionlog]')).toBeNull()
  })
})

/* ------------------------- placeholder honesty ------------------------------ */

describe('AP-5 · placeholder mode (a recruiter never sees template debris)', () => {
  it('renders the stand-ins: Unassigned Officer, manifest pending, the notice', () => {
    mountPlaceholder()

    expect(document.querySelector('[data-about-name]')!.textContent).toBe(STANDIN_NAME)
    expect(document.querySelector('[data-about-tagline]')!.textContent).toBe(STANDIN_TAGLINE)
    expect(document.querySelector('[data-about-bio]')!.textContent).toBe(STANDIN_BIO)
    const notice = document.querySelector('[data-about-awaiting]')!
    expect(notice.getAttribute('role')).toBe('note')
    expect(notice.textContent).toContain('AWAITING OFFICER MANIFEST')
  })

  it('NEVER renders the marker strings — not one bracket of template debris', () => {
    mountPlaceholder()

    expect(text()).not.toContain(PLACEHOLDER_MARK)
    expect(text()).not.toContain('REPLACE')
    expect(text()).not.toContain('[YOUR')
    expect(text()).not.toContain('[BIO')
    expect(text()).not.toContain('[ONE LINE')
    expect(text()).not.toContain('[TECH')
  })

  it('placeholder lists stay empty: no channels (no fake links), no chips', () => {
    mountPlaceholder()

    expect(document.querySelectorAll('[data-about-link]')).toHaveLength(0)
    expect(document.querySelector('[data-about-empty]')).not.toBeNull()
    expect(document.querySelector('.about-chips-section')).toBeNull()
    expect(document.querySelector('[data-about-handle]')).toBeNull()
  })

  it('the MOUNTED surface reads the ambient seams (placeholder until the pack lands)', () => {
    render(<AboutSurface />)
    expect(document.querySelector('[data-about-name]')!.textContent).toBe(STANDIN_NAME)
    expect(document.querySelector('[data-about-awaiting]')).not.toBeNull()
  })
})

/* ---------------------------- the commissioning ----------------------------- */

describe('AP-5 · the commissioning stamp', () => {
  it("prints the nameplate specimen's accession record: code + LOG/ timestamp", () => {
    render(<AboutSurface />)

    // Cross-derived from the real seed: the manifest's own specimen card.
    const seeded = nameplateSpecimen(seedFSState().nodes)!
    expect(seeded.kind).toBe('app-link')
    expect(document.querySelector('[data-about-stamp-code]')!.textContent).toBe(seeded.accession)
    expect(document.querySelector('[data-about-stamp-log]')!.textContent).toBe(
      formatLogStamp(seeded.accessionedAt),
    )
    expect(document.querySelector('[data-about-stamp-log]')!.textContent).toMatch(
      /^LOG\/\d{4}-\d{2}-\d{2} \d{2}:\d{2}Z$/,
    )
  })

  it('degrades to LOG/— when the archive holds no nameplate record', () => {
    const { fs } = useFSStore.getState()
    const specimen = nameplateSpecimen(fs.nodes)!
    useFSStore.getState().commit(deleteNode(fs, specimen.id))

    render(<AboutSurface />)

    expect(document.querySelector('[data-about-stamp-log]')!.textContent).toBe(UNFILED_STAMP)
    expect(document.querySelector('[data-about-stamp-code]')).toBeNull()
  })

  it('the mounted stamp tracks the LIVE store (a reset reseats the same record)', () => {
    render(<AboutSurface />)
    expect(document.querySelector('[data-about-stamp-code]')!.textContent).toBe('MOD-0001')
  })
})

/* -------------------------------- colophon ---------------------------------- */

describe('AP-5 · THIS CONSOLE colophon', () => {
  it('names the console + version (B612 digits) and the built-with truth', () => {
    mountFixture()

    const colophon = document.querySelector('[data-about-colophon]')!
    // jsdom applies no CSS — the legend is authored 'This Console' and the
    // sheet's text-transform engraves it; e2e reads the caps in a real browser.
    expect(colophon.textContent).toContain('This Console')
    expect(colophon.textContent).toContain('HOLD/OS')
    expect(document.querySelector('[data-about-colophon-version]')!.textContent).toBe('0.1.0')
    expect(colophon.textContent).toContain('REACT · TYPESCRIPT · VITE')
  })

  it('carries the one in-world sentence: the desktop IS the portfolio', () => {
    mountFixture()

    const note = document.querySelector('[data-about-colophon-note]')!
    expect(note.textContent).toContain('the portfolio')
  })

  it("typesets by the archive's laws (source-scan: jsdom applies no CSS)", () => {
    // The measuring law: digits in readouts ride B612 — the version span and
    // the stamp both do. The reading law: the bio rides Lora, never mono.
    const css = readFileSync('src/apps/about/about.css', 'utf-8')
    const versionRule = /\.about-colophon-version\s*\{[^}]*\}/.exec(css)![0]!
    expect(versionRule).toContain('var(--font-mono)')
    const stampRule = /\.about-stamp\s*\{[^}]*\}/.exec(css)![0]!
    expect(stampRule).toContain('var(--font-mono)')
    const bioRule = /\.about-bio\s*\{[^}]*\}/.exec(css)![0]!
    expect(bioRule).toContain('var(--font-content)')
    const nameRule = /\.about-name\s*\{[^}]*\}/.exec(css)![0]!
    expect(nameRule).toContain('var(--font-content)') // the engraving is a serif
    // Phosphor never leaves a seat: the only lamp glow in the module rides
    // inside the row lamp's own well.
    expect(css.match(/phosphor-glow/g)).toHaveLength(1)
    expect(css).toContain('inset 0 0 4px var(--phosphor-glow)')
  })
})

/* -------------------------------- pure model -------------------------------- */

describe('AP-5 · model helpers (pure)', () => {
  it('formatLogStamp: mission-epoch UTC, zero-padded, tabular-ready', () => {
    expect(formatLogStamp(Date.UTC(2087, 2, 14, 9, 37))).toBe('LOG/2087-03-14 09:37Z')
    expect(formatLogStamp(Date.UTC(2087, 0, 1, 0, 1))).toBe('LOG/2087-01-01 00:01Z')
    expect(formatLogStamp(Date.UTC(2087, 11, 31, 23, 59))).toBe('LOG/2087-12-31 23:59Z')
  })

  it('linkDomain: hostnames verbatim, mailto prints the address, junk is total', () => {
    expect(linkDomain('https://github.com/rosavega/atlas')).toBe('github.com')
    expect(linkDomain('https://www.rosavega.example.com/work')).toBe('www.rosavega.example.com')
    expect(linkDomain('mailto:rosa@example.com')).toBe('rosa@example.com')
    expect(linkDomain('not a url')).toBe('not a url')
  })

  it("commissioning: the specimen's record, or the honest unfiled stamp", () => {
    const specimen = nameplateSpecimen(seedFSState().nodes)!
    expect(commissioning(specimen)).toEqual({
      accession: 'MOD-0001',
      stamp: 'LOG/2087-03-14 09:37Z',
    })
    expect(commissioning(null)).toEqual({ accession: null, stamp: 'LOG/—' })
  })

  it('manifestView never forwards a placeholder string (by construction)', () => {
    const view = manifestView(defaultAuthorPack, true)
    const joined = [view.name, view.tagline, view.bio, ...view.links, ...view.skills].join(' ')
    expect(joined).not.toContain(PLACEHOLDER_MARK)
    expect(view.placeholder).toBe(true)
    expect(manifestView(FIXTURE_PACK, false).placeholder).toBe(false)
  })
})
