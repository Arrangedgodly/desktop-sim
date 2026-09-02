// @vitest-environment jsdom
// UI-7 · notice — the LIMITED BANDWIDTH CONSOLE through its real seams: the
// pure model (placeholder law, lockstep with the about nameplate's stand-ins
// and link-safety constants), the rendered card against a FIXTURE pack (the
// same code path a filled content/author.json drives — link attributes
// included), the placeholder card against the REAL ambient seams (stand-ins
// in, template debris OUT), the page semantics (one h1, a nav with a real
// list — the card IS the page for phone users), and the portrait-floor
// source-scans on notice.css (touch targets, reading type, wrap law,
// phosphor confinement, token-only ink).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { defaultAuthorPack, parseAuthorPack, PLACEHOLDER_MARK } from '../../lib/content'
import {
  EXTERNAL_LINK_REL as ABOUT_LINK_REL,
  EXTERNAL_LINK_TARGET as ABOUT_LINK_TARGET,
  linkDomain as aboutLinkDomain,
  STANDIN_NAME as ABOUT_STANDIN_NAME,
} from '../../apps/about/about-model'
import { OS_NAME, OS_VERSION } from '../boot/os'
import { NoticeCard, NoticePlate } from './NoticeCard'
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  linkDomain,
  noticeView,
  NOTICE_MESSAGE,
  NOTICE_STATUS_LINE,
} from './notice-model'

/* -------------------------------- helpers --------------------------------- */

afterEach(() => cleanup())
const text = (): string => document.body.textContent ?? ''

/** A REAL filled pack (the about fixture — every field the card consumes). */
const FIXTURE_PACK = parseAuthorPack(
  JSON.stringify({
    version: 1,
    author: {
      name: 'Rosa Vega',
      handle: '@vega-cartograph',
      tagline: 'Maps for places that do not exist',
      bio: 'Cartographer of imaginary terrain.',
      links: [
        { label: 'Email', url: 'mailto:rosa@example.com' },
        { label: 'GitHub', url: 'https://github.com/rosavega/atlas' },
        { label: 'Website', url: 'https://www.rosavega.example.com/work' },
      ],
      skills: [],
      interests: [],
      missionLog: '',
    },
    projects: [],
  }),
)

/** The card document against the fixture pack (the filled-pack path). */
function mountFixture() {
  return render(<NoticePlate view={noticeView(FIXTURE_PACK, false)} />)
}

/** The card document against the REAL placeholder pack + ambient seams. */
function mountPlaceholder() {
  return render(<NoticePlate view={noticeView(defaultAuthorPack, true)} />)
}

/** The sheet under test (vitest runs from the repo root; jsdom-safe path). */
function sheet(): string {
  return readFileSync(resolve(process.cwd(), 'src/platform/notice/notice.css'), 'utf8')
}

/** One CSS rule block, extracted by its exact selector (source-scan seam). */
function rule(selector: string): string {
  const match = sheet().match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`),
  )
  if (match === null) throw new Error(`notice.css has no rule for ${selector}`)
  return match[1] ?? ''
}

/** Every flat rule as { selector, body } — comments stripped from selectors. */
function sheetRules(): { selector: string; body: string }[] {
  return [...sheet().matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    body: match[2] ?? '',
  }))
}

/* ------------------------------ the model ---------------------------------- */

describe('UI-7 · noticeView (placeholder law)', () => {
  it('placeholder mode forwards NOTHING from the pack — stand-in name, zero links', () => {
    const view = noticeView(defaultAuthorPack, true)
    expect(view.placeholder).toBe(true)
    expect(view.name).toBe('Unassigned Officer')
    expect(view.links).toEqual([])
    expect(view.name).not.toContain(PLACEHOLDER_MARK)
  })

  it('a filled pack forwards the officer\u2019s own name and channels', () => {
    const view = noticeView(FIXTURE_PACK, false)
    expect(view.placeholder).toBe(false)
    expect(view.name).toBe('Rosa Vega')
    expect(view.links).toHaveLength(3)
  })

  it('stands in LOCKSTEP with the about nameplate (one archive, one officer)', () => {
    const view = noticeView(defaultAuthorPack, true)
    expect(view.name).toBe(ABOUT_STANDIN_NAME)
  })
})

describe('UI-7 · link safety + domain (about precedent)', () => {
  it('the anchor constants match the about nameplate\u2019s exactly', () => {
    expect(EXTERNAL_LINK_TARGET).toBe('_blank')
    expect(EXTERNAL_LINK_REL).toBe('noopener noreferrer')
    expect(EXTERNAL_LINK_TARGET).toBe(ABOUT_LINK_TARGET)
    expect(EXTERNAL_LINK_REL).toBe(ABOUT_LINK_REL)
  })

  it('linkDomain is total and verbatim (mailto prints the address, web prints the host)', () => {
    expect(linkDomain('mailto:rosa@example.com')).toBe('rosa@example.com')
    expect(linkDomain('https://github.com/rosavega/atlas')).toBe('github.com')
    expect(linkDomain('https://www.rosavega.example.com/work')).toBe('www.rosavega.example.com')
    expect(linkDomain('not a url')).toBe('not a url') // never throws at a visitor
    for (const url of ['mailto:a@b.c', 'https://x.example/', 'http://x.example/y?z=1']) {
      expect(linkDomain(url)).toBe(aboutLinkDomain(url))
    }
  })
})

/* --------------------------- the fixture card ------------------------------- */

describe('UI-7 · the card against a fixture pack', () => {
  it('renders the POST-style well: status line, qualifier, the brief\u2019s message', () => {
    const { container } = mountFixture()
    const status = container.querySelector('[data-notice-status]')
    expect(status?.textContent).toBe(NOTICE_STATUS_LINE)
    expect(status?.textContent).toContain('BANDWIDTH CHECK')
    expect(status?.textContent).toContain('LIMITED')
    expect(container.querySelector('[data-notice-qualifier]')?.textContent).toBe(
      'HANDHELD VIEWPORT DETECTED',
    )
    expect(container.querySelector('[data-notice-message]')?.textContent).toBe(NOTICE_MESSAGE)
    // the caret and the raster are decoration, not content
    expect(container.querySelectorAll('[data-notice-well] > p')).toHaveLength(3)
  })

  it('renders the officer\u2019s name from the pack', () => {
    const { container } = mountFixture()
    expect(container.querySelector('[data-notice-name]')?.textContent).toBe('Rosa Vega')
  })

  it('renders the channels as REAL safe anchors with verbatim domains', () => {
    const { container } = mountFixture()
    const anchors = [...container.querySelectorAll('a[data-notice-link]')]
    expect(anchors).toHaveLength(3)

    expect(anchors.map((a) => a.getAttribute('href'))).toEqual([
      'mailto:rosa@example.com',
      'https://github.com/rosavega/atlas',
      'https://www.rosavega.example.com/work',
    ])
    expect(anchors.map((a) => a.getAttribute('target'))).toEqual([
      '_blank',
      '_blank',
      '_blank',
    ])
    expect(anchors.map((a) => a.getAttribute('rel'))).toEqual([
      'noopener noreferrer',
      'noopener noreferrer',
      'noopener noreferrer',
    ])
    // Domains are verbatim: mailto prints the address, `www.` is kept.
    expect(
      anchors.map((a) => a.querySelector('[data-notice-domain]')?.textContent),
    ).toEqual(['rosa@example.com', 'github.com', 'www.rosavega.example.com'])
    // The engraved labels ride the anchor text a screen reader announces.
    expect(
      anchors.map((a) => a.querySelector('.notice-link-label')?.textContent),
    ).toEqual(['Email', 'GitHub', 'Website'])
  })

  it('carries the HOLD/OS colophon (digits on the mono face)', () => {
    const { container } = mountFixture()
    expect(container.querySelector('[data-notice-colophon]')?.textContent).toContain(
      `${OS_NAME} ${OS_VERSION} · The Survey Archive`,
    )
    expect(container.querySelector('[data-notice-colophon-version]')?.textContent).toBe(OS_VERSION)
  })

  it('is semantic page structure: one h1, headed sections, a nav with a real list', () => {
    const { container } = mountFixture()
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('h1')?.textContent).toBe('Limited Bandwidth Console')
    expect(container.querySelectorAll('h2')).toHaveLength(2) // Science Officer · Contact Channels

    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-labelledby')).toBe('notice-channels-legend')
    const items = nav?.querySelectorAll('ul > li > a[data-notice-link]')
    expect(items).toHaveLength(3)

    expect(container.querySelector('main')).not.toBeNull() // the card is the page
    expect(container.querySelector('footer')).not.toBeNull()
  })

  it('hides the awaiting notice on a filled pack', () => {
    const { container } = mountFixture()
    expect(container.querySelector('[data-notice-awaiting]')).toBeNull()
    expect(container.querySelector('[data-notice-empty]')).toBeNull()
  })
})

/* -------------------------- the placeholder card ---------------------------- */

describe('UI-7 · the card against the REAL placeholder pack', () => {
  it('the ambient mount serves the stand-in officer and the awaiting notice', () => {
    const { container } = render(<NoticeCard />)
    expect(container.querySelector('[data-notice-name]')?.textContent).toBe('Unassigned Officer')
    expect(container.querySelector('[data-notice-awaiting]')?.textContent).toContain(
      'AWAITING OFFICER MANIFEST',
    )
    expect(container.querySelector('[data-notice-empty]')?.textContent).toContain(
      'No channels riveted',
    )
  })

  it('placeholder mode renders ZERO anchors — no fake links, no marker debris', () => {
    const { container } = mountPlaceholder()
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(text()).not.toContain(PLACEHOLDER_MARK)
    expect(text()).not.toContain('[YOUR')
    expect(text()).not.toContain('[BIO')
  })
})

/* ------------------------ the portrait-floor sheet -------------------------- */

describe('UI-7 · notice.css source-scans (the task\u2019s portrait floor)', () => {
  it('the stage fills the dynamic viewport and the plate never overflows its padding', () => {
    expect(rule('.notice')).toContain('min-height: 100dvh')
    expect(rule('.notice-plate')).toContain('box-sizing: border-box')
    expect(rule('.notice-plate')).toContain('width: min(460px, 100%)')
  })

  it('channel rows clear the 44px touch-target floor', () => {
    expect(rule('.notice-link')).toContain('min-height: 48px')
  })

  it('reading type stays at or over 16px (message 17, name 22, channel labels 16)', () => {
    expect(rule('.notice-post-msg')).toContain('font-size: 1.0625rem')
    expect(rule('.notice-name')).toContain('font-size: 1.375rem')
    expect(rule('.notice-link-label')).toContain('font-size: 1rem')
  })

  it('long strings wrap — no horizontal scrollbar at 320px, by construction', () => {
    expect(rule('.notice-name')).toContain('overflow-wrap: anywhere')
    expect(rule('.notice-link-label')).toContain('overflow-wrap: anywhere')
    expect(rule('.notice-link-domain')).toContain('overflow-wrap: anywhere')
    expect(rule('.notice-post-msg')).toContain('overflow-wrap: anywhere')
  })

  it('phosphor never leaves the well\u2019s own rows; brass never leaves the rows', () => {
    const rules = sheetRules()
    const phosphor = rules.filter((r) => r.body.includes('var(--phosphor'))
    expect(phosphor.length).toBeGreaterThan(0)
    for (const { selector } of phosphor) {
      // well children only
      expect(selector).toMatch(/^\.notice-(well|post|caret)/)
    }
    const brass = rules.filter((r) => r.body.includes('var(--brass'))
    expect(brass.length).toBeGreaterThan(0)
    for (const { selector } of brass) {
      // the channel hardware + the dashed provisional frame, nothing else
      expect(selector).toMatch(/^\.notice-(link|awaiting)/)
    }
  })

  it('every ink is a token — no hex anywhere in the sheet', () => {
    const css = sheet()
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('the one authored moment is the well warm-up + caret, both motion-cheap', () => {
    expect(rule('.notice-well')).toContain('animation: notice-well-up')
    expect(rule('.notice-caret')).toContain('animation: notice-caret-blink')
    const css = sheet()
    const animations = css.match(/animation:(?![^;]*notice-well-up)(?![^;]*notice-caret-blink)[^;]*;/g)
    expect(animations ?? []).toEqual([]) // no other entrance anywhere
  })
})
