// @vitest-environment jsdom
// Field Notes surface (batch 2, brief 6) — the reading room through its real
// seams: the manifest's singleton law, the catalog ledger over the SEEDED
// store plus specimens accessioned through the FS commit seam, the typeset
// document (headings/emphasis/lists/quotes render from the AST), link
// safety at the RENDERED boundary (target/rel attrs, refused constructs stay
// literal text), the honest empty + removed states, and the keyboard floor
// (ledger arrows, Esc closes the catalog, Backspace returns to the ledger).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createNode, deleteNode } from '../../lib/fs'
import { openApp, registerApp, resetAppRegistry, type AppLaunchContext } from '../../platform/app-registry'
import { resetLazyMount } from '../../platform/app-registry/lazy-mount'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { fieldNotesApp } from './index'
import FieldNotesSurface from './FieldNotesSurface'
import { EMPTY_CATALOG_LINE, listTextSpecimens, textSpecimen } from './field-notes-model'

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()

beforeEach(() => {
  vi.useRealTimers()
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  registerApp(fieldNotesApp)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* --------------------------------- helpers --------------------------------- */

const node = (id: string) => useFSStore.getState().fs.nodes[id]!

/** Accession a text specimen into the hold through the REAL commit seam. */
function seedSpecimen(name: string, content: string): string {
  const { fs, commit } = useFSStore.getState()
  const id = crypto.randomUUID()
  act(() => {
    commit(createNode(fs, { id, parentId: fs.rootId, name, kind: 'text', content }))
  })
  return id
}

function mountLauncher() {
  const windowId = openApp('field-notes')!
  const view = render(<FieldNotesSurface windowId={windowId} launch={{ source: 'launcher' }} />)
  return { windowId, view }
}

const pickerRow = (id: string): HTMLElement => {
  const el = document.querySelector(`[data-field-notes-pick="${id}"]`)
  if (!(el instanceof HTMLElement)) throw new Error(`picker row ${id} not rendered`)
  return el
}

const windowCount = (): number => Object.keys(useWMStore.getState().windows).length

/** A representative field note exercising the whole block+inline subset. */
const SPECIMEN_MD = [
  '# Survey of Vela IX',
  '',
  'The **lower ridgeline** holds *phosphorescent* moss.',
  'See the [chart plate](https://charts.example.com/vela-9) for context.',
  '',
  '## Observations',
  '',
  '1. first light at 06:11',
  '3. ridge crossing',
  '',
  '- moss samples',
  '  - north face',
  '  - south face',
  '',
  '> Recorded by the science officer,',
  '> third watch.',
  '',
  '---',
  '',
  'End of entry.',
].join('\n')

/* --------------------------------- manifest -------------------------------- */

describe('field-notes · registration manifest', () => {
  it('declares the singleton reading room with NO file capability and a lazy mount', () => {
    expect(fieldNotesApp.id).toBe('field-notes')
    expect(fieldNotesApp.name).toBe('Field Notes')
    expect(fieldNotesApp.singleton).toBe(true)
    expect(fieldNotesApp.acceptedFileTypes).toBeUndefined() // the notepad owns text routing
    expect(fieldNotesApp.defaultGeometry).toEqual({ w: 780, h: 560 })
    expect(resetLazyMount(fieldNotesApp.mount)).toBe(true) // retryableLazy — own chunk
  })

  it('the icon is render-only SVG (no stores, no effects — source scan)', async () => {
    const source = await import('./FieldNotesIcon?raw').then((m) => m.default as string)
    expect(source).not.toContain('useFSStore')
    expect(source).not.toContain('useWMStore')
    expect(source).not.toContain('useEffect')
  })

  it('SINGLETON through the registry: a second open raises the SAME window', () => {
    const first = openApp('field-notes')
    const second = openApp('field-notes')
    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(windowCount()).toBe(1)
  })

  it('a hand-routed FILE launch still selects and titles its specimen at mount', () => {
    const id = seedSpecimen('vela-survey.txt', '# Vela')
    const launch: AppLaunchContext = { source: 'file', file: node(id) }
    const windowId = openApp('field-notes', launch)!
    expect(windowCount()).toBe(1) // still the singleton
    render(<FieldNotesSurface windowId={windowId} launch={launch} />)
    expect(document.querySelector('[data-field-notes-document] h1')).not.toBeNull()
    expect(useWMStore.getState().windows[windowId]?.title).toBe('vela-survey.txt')
  })
})

/* ------------------------------ the catalog -------------------------------- */

describe('field-notes · the catalog ledger (real store seam)', () => {
  it('lists EVERY text specimen in the catalog — accession first, name after', () => {
    const id = seedSpecimen('ridge-notes.txt', '# Ridge')
    const { view } = mountLauncher()

    const row = view.container.querySelector(`[data-field-notes-pick="${id}"]`)!
    expect(row.textContent).toContain('SPC-')
    expect(row.textContent).toContain('ridge-notes.txt')
    // The SEEDED catalog's text specimens are there too — nested drawers
    // included (Projects stubs, the field log, the charter).
    const seeded = listTextSpecimens(useFSStore.getState().fs)
    expect(seeded.length).toBeGreaterThan(3)
    for (const specimen of seeded) {
      expect(view.container.querySelector(`[data-field-notes-pick="${specimen.id}"]`)).not.toBeNull()
    }
  })

  it('a specimen accessioned AFTER mount appears in the ledger (live store)', () => {
    const { view } = mountLauncher()
    const id = seedSpecimen('late-note.txt', 'late')
    expect(view.container.querySelector(`[data-field-notes-pick="${id}"]`)).not.toBeNull()
  })

  it('decommissioning every text specimen leaves the honest empty line', () => {
    const { view } = mountLauncher()
    const { commit } = useFSStore.getState()
    for (const specimen of listTextSpecimens(useFSStore.getState().fs)) {
      const doomedId = specimen.id
      act(() => {
        commit(deleteNode(useFSStore.getState().fs, doomedId))
      })
    }
    expect(view.getByText(EMPTY_CATALOG_LINE)).toBeTruthy()
    expect(document.querySelector('[data-field-notes-pick]')).toBeNull()
  })

  it('arrows WALK the ledger (roving rows), Home/End jump, Tab stays inside', () => {
    seedSpecimen('a.txt', 'a')
    const ids = listTextSpecimens(useFSStore.getState().fs).map((s) => s.id)
    expect(ids.length).toBeGreaterThan(3) // the seeded catalog plus our accession
    const { view } = mountLauncher()
    const panel = view.container.querySelector('[data-field-notes-picker]')!

    expect(document.activeElement).toBe(pickerRow(ids[0]!)) // first row seated
    fireEvent.keyDown(panel, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(pickerRow(ids[1]!))
    fireEvent.keyDown(panel, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(pickerRow(ids[2]!))
    fireEvent.keyDown(panel, { key: 'End' })
    expect(document.activeElement).toBe(pickerRow(ids[ids.length - 1]!))
    fireEvent.keyDown(panel, { key: 'ArrowDown' }) // wraps from the end
    expect(document.activeElement).toBe(pickerRow(ids[0]!))
    fireEvent.keyDown(panel, { key: 'ArrowUp' }) // wraps back to the end
    expect(document.activeElement).toBe(pickerRow(ids[ids.length - 1]!))
    fireEvent.keyDown(panel, { key: 'Home' })
    expect(document.activeElement).toBe(pickerRow(ids[0]!))

    const before = document.activeElement
    fireEvent.keyDown(panel, { key: 'Tab' }) // the panel keeps its focus (DD-2)
    expect(document.activeElement).toBe(before)
  })
})

/* ---------------------------- the typeset sheet ----------------------------- */

describe('field-notes · the typeset document (AST → elements, never HTML)', () => {
  function openReading(name = 'vela-survey.txt', content = SPECIMEN_MD) {
    const id = seedSpecimen(name, content)
    const mounted = mountLauncher()
    fireEvent.click(pickerRow(id))
    const sheet = (): HTMLElement => {
      const el = document.querySelector('[data-field-notes-document]')
      if (!(el instanceof HTMLElement)) throw new Error('document sheet not rendered')
      return el
    }
    return { ...mounted, id, sheet }
  }

  it('renders headings at their authored levels, emphasis, lists, quotes, rules', () => {
    const { sheet } = openReading()
    const doc = sheet()
    expect(doc.querySelector('h1')?.textContent).toBe('Survey of Vela IX')
    expect(doc.querySelector('h2')?.textContent).toBe('Observations')
    expect(doc.querySelector('.field-notes-strong')?.textContent).toBe('lower ridgeline')
    expect(doc.querySelector('.field-notes-em')?.textContent).toBe('phosphorescent')
    const lists = doc.querySelectorAll('.field-notes-list')
    expect(lists.length).toBe(3) // ordered, unordered, nested (inside a li)
    // The ordered run begins at 1 — no start attribute is rendered for 1.
    expect(doc.querySelector('ol')?.getAttribute('start')).toBeNull()
    expect(doc.querySelector('.field-notes-quote')?.textContent).toContain('third watch')
    expect(doc.querySelector('hr.field-notes-hr')).not.toBeNull()
  })

  it('external links carry target=_blank rel="noopener noreferrer" and the parsed href', () => {
    const { sheet } = openReading()
    const link = sheet().querySelector('a.field-notes-link') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('https://charts.example.com/vela-9')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.textContent).toBe('chart plate')
  })

  it('raw HTML is ESCAPED BY CONSTRUCTION — <script> renders as visible text, never an element', () => {
    const { sheet } = openReading('hostile.txt', '# Note\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>')
    const doc = sheet()
    expect(doc.querySelector('script')).toBeNull()
    expect(doc.querySelector('img')).toBeNull()
    expect(doc.textContent).toContain('<script>alert(1)</script>')
    expect(doc.textContent).toContain('<img src=x onerror=alert(2)>')
  })

  it('a javascript: link NEVER renders an anchor — the construct stays literal text', () => {
    const { sheet } = openReading('bad-link.txt', 'click [me](javascript:alert(1)) now')
    const doc = sheet()
    expect(doc.querySelector('a')).toBeNull()
    expect(doc.querySelector('.field-notes-p')?.textContent).toContain('[me](javascript:alert(1))')
  })

  it('the toolbar reads the open specimen: label, accession well, live window title', () => {
    const { windowId } = openReading()
    expect(document.querySelector('[data-field-notes-label]')?.textContent).toBe('vela-survey.txt')
    const accession = document.querySelector('[data-field-notes-accession]')!
    expect(accession.textContent).toMatch(/^SPC-\d{4}$/)
    expect(accession.classList.contains('well')).toBe(true)
    expect(useWMStore.getState().windows[windowId]?.title).toBe('vela-survey.txt')
  })

  it('Backspace returns to the ledger; Esc closes the ledger (the one Esc claim)', () => {
    const { view } = mountLauncher()
    const id = seedSpecimen('vela-survey.txt', SPECIMEN_MD)
    fireEvent.click(pickerRow(id))
    expect(document.querySelector('[data-field-notes-document]')).not.toBeNull()

    fireEvent.keyDown(view.container.querySelector('[data-field-notes-surface]')!, { key: 'Backspace' })
    expect(document.querySelector('[data-field-notes-picker]')).not.toBeNull()
    expect(document.querySelector('[data-field-notes-document]')).toBeNull()

    fireEvent.keyDown(view.container.querySelector('[data-field-notes-picker]')!, { key: 'Escape' })
    expect(document.querySelector('[data-field-notes-picker]')).toBeNull()
    expect(windowCount()).toBe(1) // no Esc claim with the ledger closed: the window stays (the OS's call)
  })

  it('the Catalog control toggles the ledger over an open specimen', () => {
    const { view } = openReading()
    const btn = view.container.querySelector('[data-field-notes-catalog]') as HTMLButtonElement
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(document.querySelector('[data-field-notes-picker]')).not.toBeNull()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(btn)
    expect(document.querySelector('[data-field-notes-picker]')).toBeNull()
  })
})

/* ---------------------------- the removed notice ---------------------------- */

describe('field-notes · external deletion → SPECIMEN REMOVED notice', () => {
  it('deleting the node elsewhere swaps the sheet for the close-out notice', () => {
    const id = seedSpecimen('doomed.txt', '# Doomed')
    const { view } = mountLauncher()
    fireEvent.click(pickerRow(id))
    expect(document.querySelector('[data-field-notes-document]')).not.toBeNull()

    const { commit } = useFSStore.getState()
    act(() => {
      commit(deleteNode(useFSStore.getState().fs, id))
    })

    expect(document.querySelector('[data-field-notes-document]')).toBeNull()
    expect(document.querySelector('[data-field-notes-removed]')).not.toBeNull()
    expect(document.querySelector('[data-field-notes-removed]')?.textContent).toContain(
      'Specimen removed from catalog',
    )

    // Back to catalog: the ledger is open and lists the SURVIVING specimens
    // (the seeded catalog) — the doomed note is gone from it.
    fireEvent.click(view.container.querySelector('[data-field-notes-removed-back]')!)
    expect(document.querySelector('[data-field-notes-picker]')).not.toBeNull()
    expect(document.querySelector('[data-field-notes-removed]')).toBeNull()
    expect(document.querySelector(`[data-field-notes-pick="${id}"]`)).toBeNull()
    expect(document.querySelectorAll('[data-field-notes-pick]').length).toBeGreaterThan(0)
  })
})

/* ------------------------------ the pure model ------------------------------ */

describe('field-notes · model helpers (pure)', () => {
  it('textSpecimen: live text node → itself; missing/foreign-kind/null → null', () => {
    const id = seedSpecimen('model.txt', 'x')
    const fs = useFSStore.getState().fs // read AFTER the commit — the live tree
    expect(textSpecimen(fs, id)?.name).toBe('model.txt')
    expect(textSpecimen(fs, 'no-such-id')).toBeNull()
    expect(textSpecimen(fs, null)).toBeNull()
    expect(textSpecimen(fs, 'projects')).toBeNull() // a drawer, not a specimen
  })

  it('listTextSpecimens walks drawers depth-first in accession order', () => {
    const specimens = listTextSpecimens(useFSStore.getState().fs)
    const names = specimens.map((s) => s.name)
    expect(names).toContain('field-log.txt') // inside the Field Notes drawer
    expect(names).toContain('accession-charter.txt') // on the hold's ground
    // Every listed node IS a text specimen, and none are missing from the walk.
    for (const s of specimens) expect(s.kind).toBe('text')
    const allText = Object.values(useFSStore.getState().fs.nodes).filter((n) => n.kind === 'text')
    expect(specimens.length).toBe(allText.length)
  })
})
