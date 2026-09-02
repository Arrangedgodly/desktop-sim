// @vitest-environment jsdom
// AP-2 · notepad — the specimen editor through its real seams: the
// registration manifest, the routing that lights up the moment `notepad`
// registers (desktop reserved-id routing AND the explorer's
// acceptedFileTypes consultation), the per-specimen window dedupe, the
// surface itself (parchment sheet, dirty lamp lifecycle, debounced autosave
// through the FS store, explicit save via Ctrl/Cmd+S, inline rename, the
// untitled-launcher save flow, the close guard, the removed-specimen notice),
// and the full persistence round-trip against real fake-indexeddb.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createStore } from 'idb-keyval'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { deleteNode, renameNode, type FSTextNode } from '../../lib/fs'
import { buildStoredState, hydrateStores } from '../../lib/storage/stored-state'
import { bootPersistence } from '../../lib/storage/persistence'
import { attachAutosave, stopAutosave } from '../../lib/storage/autosave'
import { IDBStorageAdapter } from '../../lib/storage/adapter'
import { readStoredState } from '../../lib/storage/validate'
import { useStorageStatusStore } from '../../lib/storage/status'
import {
  appCloseGuardFor,
  listApps,
  openApp,
  registerApps,
  resetAppRegistry,
  type AppLaunchContext,
} from '../../platform/app-registry'
import { resetLazyMount } from '../../platform/app-registry/lazy-mount'
import { openSpecimen, resolveOpenRoute } from '../../platform/desktop'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { apps } from '../index'
import { notepadApp } from './index'
import { NotepadIcon } from './NotepadIcon'
import NotepadSurface from './NotepadSurface'
import {
  NOTEPAD_AUTOSAVE_DELAY_MS,
  UNFILED_ACCESSION,
  UNTITLED_LABEL,
  readDraftState,
  specimenId,
  textSpecimen,
  withTextContent,
} from './notepad-model'
import { childOpenTarget } from '../explorer/explorer-model'

/* ------------------------- store/module hygiene --------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()
const initialStatus = useStorageStatusStore.getState()

beforeEach(() => {
  vi.useRealTimers()
  useFSStore.setState(initialFS, true) // boots holding the SEEDED catalog
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
  useStorageStatusStore.setState(initialStatus, true)
  resetAppRegistry()
  registerApps(apps) // the REAL startup registration (notepad + demo + explorer)
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  stopAutosave()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* -------------------------------- helpers --------------------------------- */

const node = (id: string) => useFSStore.getState().fs.nodes[id]!

const textNode = (id: string): FSTextNode => {
  const found = node(id)
  if (found.kind !== 'text') throw new Error(`node ${id} is not a text specimen`)
  return found
}

const fileLaunch = (id: string): AppLaunchContext => ({ source: 'file', file: node(id) })

/** Mount against a REAL registry window so close paths are observable. */
function mountWindowed(id: string) {
  const windowId = openApp('notepad', fileLaunch(id))!
  const view = render(<NotepadSurface windowId={windowId} launch={fileLaunch(id)} />)
  return { windowId, view }
}

const mountLauncher = () => {
  const windowId = openApp('notepad')!
  const view = render(<NotepadSurface windowId={windowId} launch={{ source: 'launcher' }} />)
  return { windowId, view }
}

const sheet = (): HTMLTextAreaElement => {
  const el = document.querySelector('[data-notepad-textarea]')
  if (!(el instanceof HTMLTextAreaElement)) throw new Error('sheet (textarea) not rendered')
  return el
}

const lamp = (): HTMLElement => {
  const el = document.querySelector('.notepad-lamp')
  if (!(el instanceof HTMLElement)) throw new Error('lamp not rendered')
  return el
}

const strip = (): HTMLElement => {
  const el = document.querySelector('[data-notepad-strip]')
  if (!(el instanceof HTMLElement)) throw new Error('guard strip not open')
  return el
}

const windowCount = (): number => Object.keys(useWMStore.getState().windows).length

/**
 * Narrow fake timers: ONLY setTimeout/clearTimeout (the debounce seams).
 * Vitest's default toFake also freezes queueMicrotask/nextTick, which
 * deadlocks the async persistence chain in the round-trip test.
 */
const useNotepadTimers = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

const commit = useFSStore.getState().commit

/* ------------------------------ the manifest ------------------------------- */

describe('AP-2 · registration manifest', () => {
  it('rides the startup apps array under the RESERVED id "notepad"', () => {
    expect(apps).toContain(notepadApp)
    expect(notepadApp.id).toBe('notepad')
    expect(notepadApp.name).toBe('Specimen Notepad')
  })

  it('declares multi-instance (no singleton), text capability, and geometry hints', () => {
    expect(notepadApp.singleton).toBeUndefined() // one window PER SPECIMEN, not one ever
    expect(notepadApp.acceptedFileTypes).toEqual(['text'])
    expect(notepadApp.defaultGeometry).toEqual({ w: 600, h: 480 })
  })

  it('mounts a LAZY surface (own chunk) and a render-only icon', () => {
    expect(typeof notepadApp.mount).toBe('function') // retryableLazy(() => import(...)) — HU-1
    expect(resetLazyMount(notepadApp.mount)).toBe(true) // it IS a retryable lazy mount
    expect(notepadApp.icon).toBe(NotepadIcon)
    const { container } = render(<NotepadIcon size={20} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('registers BEFORE the demo module — the real text owner wins the routing tiebreak', () => {
    const ids = listApps().map((app) => app.id)
    expect(ids.indexOf('notepad')).toBeLessThan(ids.indexOf('demo'))
  })
})

/* ------------------------- routing lights up (the point of AP-2) ----------- */

describe('AP-2 · text routing lights up at registration', () => {
  it('the DESKTOP routing table targets notepad and openSpecimen opens THIS app', () => {
    expect(resolveOpenRoute(node('charter')).appId).toBe('notepad')
    openSpecimen(node('charter'))
    expect(windowCount()).toBe(1)
    const record = Object.values(useWMStore.getState().windows)[0]!
    expect(record.appId).toBe('notepad')
    expect(record.launch).toEqual({ source: 'file', file: node('charter') })
  })

  it('the EXPLORER consultation (acceptedFileTypes, first declaring wins) resolves notepad', () => {
    // The real startup registry — no probe. The demo also declares text; the
    // notepad's earlier registration must win, or in-drawer specimens would
    // open the contract demo instead of their owner.
    expect(childOpenTarget(node('charter'), listApps())).toBe('notepad')
    expect(childOpenTarget(node('exhibit-01'), listApps())).toBe('notepad')
  })
})

/* ------------------------ per-specimen window dedupe ----------------------- */

describe('AP-2 · one window per specimen (openApp instance rules)', () => {
  it('opening the same specimen twice focuses ONE window; different specimens get their own', () => {
    const charter = openApp('notepad', fileLaunch('charter'))!
    const again = openApp('notepad', fileLaunch('charter'))
    const fieldLog = openApp('notepad', fileLaunch('field-log'))!

    expect(again).toBe(charter)
    expect(fieldLog).not.toBe(charter)
    expect(windowCount()).toBe(2)
    const windows = useWMStore.getState().windows
    expect(windows[charter]!.instanceId).toBe('file:charter')
    expect(windows[fieldLog]!.instanceId).toBe('file:field-log')
  })

  it('re-opening a minimized specimen window restores + focuses it (no duplicate)', () => {
    const charter = openApp('notepad', fileLaunch('charter'))!
    act(() => {
      useWMStore.getState().minimizeWindow(charter)
    })
    const again = openApp('notepad', fileLaunch('charter'))

    expect(again).toBe(charter)
    expect(windowCount()).toBe(1)
    expect(useWMStore.getState().windows[charter]!.minimized).toBe(false)
    expect(useWMStore.getState().focusedId).toBe(charter)
  })

  it('a launcher open is its own fresh window (a new UNTITLED draft per open)', () => {
    const first = openApp('notepad')!
    const second = openApp('notepad')!
    expect(first).not.toBe(second)
    expect(windowCount()).toBe(2)
  })
})

/* ------------------------------- the surface -------------------------------- */

describe('AP-2 · the specimen-label editor surface', () => {
  it('shows the specimen name, accession in a well, and the seeded body on the parchment sheet', () => {
    mountWindowed('charter')

    const name = document.querySelector('[data-notepad-name]')!
    expect(name.textContent).toBe('accession-charter.txt')
    expect(document.querySelector('.notepad-accession')!.textContent).toBe('SPC-0005')
    expect(sheet().value).toBe(textNode('charter').content)
    expect(lamp().getAttribute('data-lit')).toBe('false') // clean at open
    expect(document.querySelector('[data-notepad-strip]')).toBeNull()
  })

  it('the sheet typesets as the reading surface, not a terminal (source-scan)', () => {
    // jsdom applies no CSS; the honest check is the sheet's own rule — Lora
    // (the content face) with the ledger leading, never the mono readout face.
    // (cwd-relative read: this file's jsdom global URL is foreign to node:fs.)
    const css = readFileSync('src/apps/notepad/notepad.css', 'utf-8')
    const sheetRule = /\.notepad-sheet\s*\{[^}]*\}/.exec(css)![0]!
    expect(sheetRule).toContain('font-family: var(--font-content)')
    expect(sheetRule).not.toContain('--font-mono')
    expect(sheetRule).toContain('line-height: 28px')
    expect(sheetRule).toContain('repeating-linear-gradient') // the ruled ledger baselines
  })
})

/* --------------------- dirty lamp + debounced autosave --------------------- */

describe('AP-2 · dirty lamp + debounced autosave', () => {
  beforeEach(() => {
    useNotepadTimers()
  })

  it('an edit lights the lamp; the commit lands ONLY after the debounce; the lamp dims', () => {
    mountWindowed('charter')

    fireEvent.change(sheet(), { target: { value: 'first entry' } })
    expect(lamp().getAttribute('data-lit')).toBe('true')
    expect(textNode('charter').content).not.toBe('first entry') // draft only

    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS - 1)
    })
    expect(textNode('charter').content).not.toBe('first entry') // still debouncing

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(textNode('charter').content).toBe('first entry') // committed to the store
    expect(lamp().getAttribute('data-lit')).toBe('false') // …and the lamp dims
  })

  it('the debounce is TRAILING — steady typing commits once, after the last edit', () => {
    mountWindowed('charter')
    const seeded = textNode('charter').content // the placeholder body, not ''

    for (const value of ['a', 'ab', 'abc']) {
      fireEvent.change(sheet(), { target: { value } })
      act(() => {
        vi.advanceTimersByTime(100)
      })
    }
    expect(textNode('charter').content).toBe(seeded) // mid-typing: nothing committed

    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS)
    })
    expect(textNode('charter').content).toBe('abc')
  })

  it('the store-level envelope carries the committed content (MF-2 seam, no app wiring)', () => {
    mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'archive remembers' } })
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS)
    })

    const envelope = buildStoredState()
    const persisted = envelope.fs.nodes['charter'] as FSTextNode
    expect(persisted.content).toBe('archive remembers')
  })
})

/* ------------------------------ explicit save ------------------------------- */

describe('AP-2 · explicit save (Ctrl/Cmd+S)', () => {
  it('Ctrl+S commits immediately, preventDefaulted — no browser save dialog', () => {
    useNotepadTimers()
    mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'saved now' } })

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      sheet().dispatchEvent(event) // native dispatch: act flushes React's commit
    })
    expect(event.defaultPrevented).toBe(true)
    expect(textNode('charter').content).toBe('saved now') // no debounce wait
    expect(lamp().getAttribute('data-lit')).toBe('false')
  })

  it('Cmd+S (mac) behaves identically; the Save button commits too', () => {
    useNotepadTimers()
    mountWindowed('field-log')
    fireEvent.change(sheet(), { target: { value: 'via meta' } })
    fireEvent.keyDown(sheet(), { key: 's', metaKey: true })
    expect(textNode('field-log').content).toBe('via meta')

    fireEvent.change(sheet(), { target: { value: 'via button' } })
    const save = document.querySelector<HTMLButtonElement>('[data-notepad-save]')!
    expect(save.disabled).toBe(false) // dirty → enabled
    fireEvent.click(save)
    expect(textNode('field-log').content).toBe('via button')
  })

  it('Save is DISABLED while the specimen is clean (nothing to commit)', () => {
    mountWindowed('charter')
    expect(document.querySelector<HTMLButtonElement>('[data-notepad-save]')!.disabled).toBe(true)
  })
})

/* ------------------------------ inline rename ------------------------------- */

describe('AP-2 · inline rename (the header label edit)', () => {
  const beginRename = (): HTMLInputElement => {
    fireEvent.click(document.querySelector('[data-notepad-name]')!)
    const input = document.querySelector('[data-rename-input]')
    if (!(input instanceof HTMLInputElement)) throw new Error('rename field not rendered')
    return input
  }

  it('clicking the engraved name opens a seeded field; Enter commits to the FS', () => {
    mountWindowed('charter')
    const input = beginRename()

    expect(input.value).toBe('accession-charter.txt')
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'field-manual.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(node('charter').name).toBe('field-manual.txt')
    expect(document.querySelector('[data-notepad-name]')!.textContent).toBe('field-manual.txt')
    expect(buildStoredState().fs.nodes['charter']!.name).toBe('field-manual.txt')
  })

  it('a rename COMMITS the label without touching the body (content rides along)', () => {
    mountWindowed('charter')
    const body = textNode('charter').content
    const input = beginRename()
    fireEvent.change(input, { target: { value: 'renamed-charter.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(textNode('charter').content).toBe(body)
  })

  it('a collision REFUSES in-world: shake attribute, still editing, label intact', () => {
    mountWindowed('field-log')
    const input = beginRename() // sibling name in the same drawer
    fireEvent.change(input, { target: { value: 'observation-plate.png' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(node('field-log').name).toBe('field-log.txt')
    const stillEditing = document.querySelector('[data-rename-input]')!
    expect(document.activeElement).toBe(stillEditing)
    expect(stillEditing.getAttribute('data-rename-rejected')).toBe('true')
  })

  it('Escape cancels the edit; the sheet regains focus', () => {
    mountWindowed('charter')
    const input = beginRename()
    fireEvent.change(input, { target: { value: 'never-committed.txt' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(node('charter').name).toBe('accession-charter.txt')
    expect(document.querySelector('[data-rename-input]')).toBeNull()
    expect(document.activeElement).toBe(sheet())
  })
})

/* --------------------------- the untitled save flow ------------------------- */

describe('AP-2 · launcher open = an UNTITLED draft; save offers the name', () => {
  beforeEach(() => {
    useNotepadTimers()
  })

  it('a launcher window opens unfiled: Untitled label, UNFILED accession, no FS noise', () => {
    mountLauncher()

    expect(document.querySelector('[data-notepad-name]')!.textContent).toBe(UNTITLED_LABEL)
    expect(document.querySelector('.notepad-accession')!.textContent).toBe(UNFILED_ACCESSION)
    const before = Object.keys(useFSStore.getState().fs.nodes).length

    fireEvent.change(sheet(), { target: { value: 'field observation' } })
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS * 3)
    })
    // Nothing to autosave INTO: the draft stays app-local (guarded by the close
    // strip) until the operator names and accessions it.
    expect(Object.keys(useFSStore.getState().fs.nodes).length).toBe(before)
    expect(lamp().getAttribute('data-lit')).toBe('true')
  })

  it('Save offers the name; committing it accessions the specimen WITH the body', () => {
    mountLauncher()
    fireEvent.change(sheet(), { target: { value: 'the archive remembers' } })
    fireEvent.click(document.querySelector('[data-notepad-save]')!)

    // The offer: the label edit opens, seeded Untitled, focused + selected.
    const input = document.querySelector('[data-rename-input]') as HTMLInputElement
    expect(input.value).toBe(UNTITLED_LABEL)
    expect(document.activeElement).toBe(input)
    expect(document.querySelector('[data-notepad-name]')).toBeNull() // header is the field now

    fireEvent.change(input, { target: { value: 'night-watch.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const created = Object.values(useFSStore.getState().fs.nodes).find(
      (n) => n.name === 'night-watch.txt',
    ) as FSTextNode | undefined
    expect(created).toMatchObject({ kind: 'text', parentId: 'root' })
    expect(created!.content).toBe('the archive remembers') // the body rode along
    expect(document.querySelector('.notepad-accession')!.textContent).toMatch(/^SPC-\d{4}$/)
    expect(lamp().getAttribute('data-lit')).toBe('false') // accession committed it
  })

  it('a naming collision refuses in-world and keeps offering (no specimen created)', () => {
    mountLauncher()
    fireEvent.change(sheet(), { target: { value: 'body' } })
    fireEvent.click(document.querySelector('[data-notepad-save]')!)
    const input = document.querySelector('[data-rename-input]') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'Projects' } }) // a root drawer's name
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input.getAttribute('data-rename-rejected')).toBe('true')
    expect(document.querySelector('[data-rename-input]')).not.toBeNull() // still naming
    expect(Object.values(useFSStore.getState().fs.nodes).find((n) => n.name === 'Projects')!.kind).toBe('folder')
  })

  it('after accession, the window behaves like any bound specimen (autosave commits)', () => {
    mountLauncher()
    fireEvent.change(sheet(), { target: { value: 'first line' } })
    fireEvent.click(document.querySelector('[data-notepad-save]')!)
    const input = document.querySelector('[data-rename-input]')!
    fireEvent.change(input, { target: { value: 'watch-log.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const created = Object.values(useFSStore.getState().fs.nodes).find(
      (n) => n.name === 'watch-log.txt',
    ) as FSTextNode

    fireEvent.change(sheet(), { target: { value: 'first line\nsecond line' } })
    expect(lamp().getAttribute('data-lit')).toBe('true')
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS)
    })
    expect(useFSStore.getState().fs.nodes[created.id]).toMatchObject({ content: 'first line\nsecond line' })
  })
})

/* -------------------------------- close guard ------------------------------- */

describe('AP-2 · close guard (dirty close interposes in-window)', () => {
  beforeEach(() => {
    useNotepadTimers()
  })

  it('Esc with a dirty draft interposes the strip: lamp flares, window BLOCKED', () => {
    const { windowId } = mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'unsaved entry' } })
    fireEvent.keyDown(sheet(), { key: 'Escape' })

    expect(document.querySelector('[data-notepad-strip]')).not.toBeNull()
    expect(strip().getAttribute('role')).toBe('alertdialog')
    expect(strip().textContent).toContain('Catalog unsaved changes?')
    expect(lamp().getAttribute('data-flare')).toBe('true')
    expect(useWMStore.getState().windows[windowId]).toBeDefined() // close BLOCKED
  })

  it('the guard SUSPENDS the autosave — the archive waits for the answer', () => {
    mountWindowed('charter')
    const seeded = textNode('charter').content
    fireEvent.change(sheet(), { target: { value: 'pending' } })
    fireEvent.keyDown(sheet(), { key: 'Escape' })
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS * 5)
    })

    expect(textNode('charter').content).toBe(seeded) // nothing committed while deciding
    expect(document.querySelector('[data-notepad-strip]')).not.toBeNull() // still asking
  })

  it('Keep editing dismisses the strip; the draft stays and autosave resumes', () => {
    mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'resumed' } })
    fireEvent.keyDown(sheet(), { key: 'Escape' })
    fireEvent.click(document.querySelector('[data-notepad-keep]')!)

    expect(document.querySelector('[data-notepad-strip]')).toBeNull()
    expect(lamp().getAttribute('data-flare')).toBe('false')
    expect(sheet().value).toBe('resumed')
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS)
    })
    expect(textNode('charter').content).toBe('resumed') // the debounce resumed
  })

  it('Discard closes the window; the draft NEVER reaches the archive', () => {
    useNotepadTimers()
    const { windowId } = mountWindowed('charter')
    const seeded = textNode('charter').content
    fireEvent.change(sheet(), { target: { value: 'thrown away' } })
    fireEvent.keyDown(sheet(), { key: 'Escape' })
    fireEvent.click(document.querySelector('[data-notepad-discard]')!)

    expect(useWMStore.getState().windows[windowId]).toBeUndefined()
    expect(textNode('charter').content).toBe(seeded) // the draft died with the window
  })

  it('Esc on the OPEN strip keeps editing (the safe default)', () => {
    const { windowId } = mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'kept' } })
    fireEvent.keyDown(sheet(), { key: 'Escape' })
    fireEvent.keyDown(document.querySelector('[data-notepad-keep]')!, { key: 'Escape' })

    expect(document.querySelector('[data-notepad-strip]')).toBeNull()
    expect(useWMStore.getState().windows[windowId]).toBeDefined()
    expect(sheet().value).toBe('kept')
  })

  it('Esc on a CLEAN specimen closes immediately — no strip, no guard', () => {
    const { windowId } = mountWindowed('charter')
    fireEvent.keyDown(sheet(), { key: 'Escape' })
    expect(useWMStore.getState().windows[windowId]).toBeUndefined()
    expect(document.querySelector('[data-notepad-strip]')).toBeNull()
  })

  it('Ctrl+S while the strip is open resolves the question (commit + dismiss)', () => {
    mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'answered' } })
    fireEvent.keyDown(sheet(), { key: 'Escape' })
    fireEvent.keyDown(sheet(), { key: 's', ctrlKey: true })

    expect(textNode('charter').content).toBe('answered')
    expect(document.querySelector('[data-notepad-strip]')).toBeNull() // question answered
  })
})

/* --------------------------- removed-specimen notice ------------------------ */

describe('AP-2 · external deletion → SPECIMEN REMOVED notice', () => {
  it('deleting the node elsewhere swaps the sheet for a close-only notice', () => {
    const { windowId } = mountWindowed('charter')

    act(() => {
      const { fs } = useFSStore.getState()
      commit(deleteNode(fs, 'charter'))
    })

    expect(document.querySelector('[data-notepad-removed]')).not.toBeNull()
    expect(document.querySelector('[data-notepad-removed]')!.textContent).toContain(
      'Specimen removed from catalog',
    )
    expect(document.querySelector('[data-notepad-textarea]')).toBeNull() // editor gone
    // Close is the ONLY new action — no keep/discard strip on a terminal state.
    expect(document.querySelector('[data-notepad-keep]')).toBeNull()
    expect(document.querySelector('[data-notepad-discard]')).toBeNull()

    fireEvent.click(document.querySelector('[data-notepad-removed-close]')!)
    expect(useWMStore.getState().windows[windowId]).toBeUndefined()
  })

  it('a dirty draft deleted underneath the window lands on the notice, not the guard', () => {
    useNotepadTimers()
    const { windowId } = mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'doomed draft' } })

    act(() => {
      const { fs } = useFSStore.getState()
      commit(deleteNode(fs, 'charter'))
    })
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS * 3)
    })

    expect(document.querySelector('[data-notepad-removed]')).not.toBeNull()
    expect(useWMStore.getState().windows[windowId]).toBeDefined() // still open, terminal state
  })

  it('a window restored after its specimen died opens straight onto the notice', () => {
    // The WM record carries the launch ctx as an immutable SNAPSHOT — it
    // outlives the node. Mounting against that stale ctx (the reload path)
    // finds no live specimen and opens terminal.
    const launchCtx = fileLaunch('charter')
    act(() => {
      const { fs } = useFSStore.getState()
      commit(deleteNode(fs, 'charter'))
    })
    render(<NotepadSurface windowId="w-restore" launch={launchCtx} />)

    expect(document.querySelector('[data-notepad-removed]')).not.toBeNull()
    expect(document.querySelector('[data-notepad-textarea]')).toBeNull()
  })
})

/* --------------------------- persistence round-trip ------------------------- */

describe('AP-2 · edit → autosave → persisted envelope (fake-indexeddb round-trip)', () => {
  let dbCount = 0

  it('the full chain lands: draft → store commit → debounced envelope write', async () => {
    useNotepadTimers()
    const store = createStore(`ds-notepad-test-${++dbCount}`, 'state')
    const adapter = new IDBStorageAdapter({ store })
    await bootPersistence({ adapter, autosave: false })
    attachAutosave({ adapter, delayMs: 500 })

    const windowId = openApp('notepad', fileLaunch('charter'))!
    render(<NotepadSurface windowId={windowId} launch={fileLaunch('charter')} />)

    fireEvent.change(sheet(), { target: { value: 'persisted by the archive' } })
    // Notepad debounce (400ms) + MF-2 writer debounce (500ms) + margin.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })

    const persisted = await adapter.load()
    expect((persisted!.fs.nodes['charter'] as FSTextNode).content).toBe('persisted by the archive')
    // The window record survives too — the WM envelope carries the launch ctx
    // (an immutable SNAPSHOT: its file copy keeps the pre-edit body by design).
    const savedWindow = persisted!.windows.find((w) => w.id === windowId)
    expect(savedWindow).toMatchObject({ appId: 'notepad' })
    const savedLaunch = savedWindow!.launch
    expect(savedLaunch?.source).toBe('file')
    expect(savedLaunch?.source === 'file' && savedLaunch.file).toMatchObject({
      id: 'charter',
      kind: 'text',
    })
  })
})

/* ------------------------------- the pure model ----------------------------- */

describe('AP-2 · model helpers (pure)', () => {
  const sheetState = () => useFSStore.getState().fs

  it('specimenId: file launch → the node id; launcher → null', () => {
    expect(specimenId(fileLaunch('charter'))).toBe('charter')
    expect(specimenId({ source: 'launcher' })).toBeNull()
  })

  it('textSpecimen: live text node → itself; missing/foreign-kind/null-id → null', () => {
    expect(textSpecimen(sheetState(), 'charter')!.kind).toBe('text')
    expect(textSpecimen(sheetState(), 'no-such-node')).toBeNull()
    expect(textSpecimen(sheetState(), 'projects')).toBeNull() // a drawer is not a specimen
    expect(textSpecimen(sheetState(), null)).toBeNull()
  })

  it('withTextContent: commits the body immutably; refuses missing and non-text ids', () => {
    const next = withTextContent(sheetState(), 'charter', 'new body')!
    expect(next.nodes['charter']!).toMatchObject({ kind: 'text', content: 'new body' })
    expect(sheetState().nodes['charter']!).not.toBe(next.nodes['charter']) // pure
    expect(withTextContent(sheetState(), 'gone', 'x')).toBeNull()
    expect(withTextContent(sheetState(), 'projects', 'x')).toBeNull()
  })
})

/* ================================ HU-2 seams =============================== */

describe('HU-2 (a) · platform close-request veto (the ✕ asks the archive)', () => {
  beforeEach(() => {
    useNotepadTimers()
  })

  it('the manifest declares onCloseRequest; a DIRTY window vetoes + interposes the strip', () => {
    expect(notepadApp.onCloseRequest).toBeDefined()
    const { windowId } = mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'unsaved entry' } })

    // The exact call the WM's ✕/Esc make through appCloseGuardFor.
    act(() => {
      expect(appCloseGuardFor(useWMStore.getState().windows[windowId]!)).toBe(true)
    })
    expect(document.querySelector('[data-notepad-strip]')).not.toBeNull() // the strip interposed
    expect(lamp().getAttribute('data-flare')).toBe('true')
    expect(useWMStore.getState().windows[windowId]).toBeDefined() // close blocked
  })

  it('a CLEAN window answers false — the platform closes immediately', () => {
    const { windowId } = mountWindowed('charter')
    expect(appCloseGuardFor(useWMStore.getState().windows[windowId]!)).toBe(false)
  })

  it('a window whose surface never mounted answers false (the safe default)', () => {
    const windowId = openApp('notepad', fileLaunch('charter'))!
    expect(appCloseGuardFor(useWMStore.getState().windows[windowId]!)).toBe(false)
  })

  it('Discard in the veto-opened strip closes the window (the app-owned close path)', () => {
    const { windowId } = mountWindowed('charter')
    fireEvent.change(sheet(), { target: { value: 'gone' } })
    act(() => {
      expect(appCloseGuardFor(useWMStore.getState().windows[windowId]!)).toBe(true)
    })
    fireEvent.click(document.querySelector('[data-notepad-discard]')!)
    expect(useWMStore.getState().windows[windowId]).toBeUndefined()
  })
})

describe('HU-2 (b) · untitled draft across reload (appState draft + launch rebind)', () => {
  beforeEach(() => {
    useNotepadTimers()
  })

  it('the draft body rides the window record (opaque appState) after the debounce', () => {
    const { windowId } = mountLauncher()
    fireEvent.change(sheet(), { target: { value: 'storm notes' } })
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS)
    })
    expect(readDraftState(useWMStore.getState().windows[windowId]!.appState)).toBe('storm notes')
  })

  it('a reload restores the SAME untitled draft — no blank sheet, no duplicated node', () => {
    const { windowId } = mountLauncher()
    fireEvent.change(sheet(), { target: { value: 'unsubmitted field report' } })
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS)
    })
    const nodeCount = Object.keys(useFSStore.getState().fs.nodes).length

    // "Reload": the envelope MF-2 would have persisted rehydrates fresh stores.
    const reloaded = readStoredState(buildStoredState(Date.now()))
    hydrateStores(reloaded)
    cleanup() // the pre-reload surface dies with the page

    const restored = useWMStore.getState().windows[windowId]!
    expect(readDraftState(restored.appState)).toBe('unsubmitted field report') // carried
    render(
      <NotepadSurface windowId={windowId} launch={restored.launch ?? { source: 'launcher' }} />,
    )
    expect(sheet().value).toBe('unsubmitted field report') // the SAME draft
    expect(document.querySelector('[data-notepad-name]')!.textContent).toBe(UNTITLED_LABEL)
    expect(Object.keys(useFSStore.getState().fs.nodes)).toHaveLength(nodeCount) // nothing accessioned behind the operator's back
  })

  it('a draft kept waiting by the OPEN GUARD still restores (the mirror never suspends)', () => {
    const { windowId } = mountWindowed('charter')
    const committed = textNode('charter').content
    fireEvent.change(sheet(), { target: { value: 'deciding, not abandoned' } })
    fireEvent.keyDown(sheet(), { key: 'Escape' }) // guard opens — content autosave SUSPENDS
    act(() => {
      vi.advanceTimersByTime(NOTEPAD_AUTOSAVE_DELAY_MS * 3)
    })
    expect(textNode('charter').content).toBe(committed) // the archive waits…
    // …but the window-record mirror kept running: a reload mid-decision keeps the draft.
    const reloaded = readStoredState(buildStoredState(Date.now()))
    hydrateStores(reloaded)
    cleanup()
    render(
      <NotepadSurface windowId={windowId} launch={fileLaunch('charter')} />,
    )
    expect(sheet().value).toBe('deciding, not abandoned')
    expect(lamp().getAttribute('data-lit')).toBe('true') // honestly dirty vs the committed body
  })

  it('naming the draft REBINDS the window onto the accessioned specimen (dedupe holds)', () => {
    const { windowId } = mountLauncher()
    fireEvent.change(sheet(), { target: { value: 'the binding' } })
    fireEvent.click(document.querySelector('[data-notepad-save]')!)
    const input = document.querySelector('[data-rename-input]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'rebound.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const created = Object.values(useFSStore.getState().fs.nodes).find(
      (n) => n.name === 'rebound.txt',
    )!
    const record = useWMStore.getState().windows[windowId]!
    expect(record.instanceId).toBe(`file:${created.id}`) // the launch-rebind seam
    expect(record.launch?.source).toBe('file')

    // Re-opening the specimen lands on THIS window — no duplicate.
    expect(openApp('notepad', fileLaunch(created.id))).toBe(windowId)
    expect(windowCount()).toBe(1)
  })

  it('after a reload, the SAVED draft window restores as the specimen\'s own window', () => {
    const { windowId } = mountLauncher()
    fireEvent.change(sheet(), { target: { value: 'survivor body' } })
    fireEvent.click(document.querySelector('[data-notepad-save]')!)
    const input = document.querySelector('[data-rename-input]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'survivor.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const created = Object.values(useFSStore.getState().fs.nodes).find(
      (n) => n.name === 'survivor.txt',
    )!

    const reloaded = readStoredState(buildStoredState(Date.now()))
    hydrateStores(reloaded)
    cleanup()

    const restored = useWMStore.getState().windows[windowId]!
    expect(restored.launch?.source).toBe('file') // the rebind persisted
    expect(restored.instanceId).toBe(`file:${created.id}`)
    render(<NotepadSurface windowId={windowId} launch={restored.launch!} />)
    expect(sheet().value).toBe('survivor body') // bound to the real node
    expect(document.querySelector('[data-notepad-name]')!.textContent).toBe('survivor.txt')
    expect(document.querySelector('.notepad-accession')!.textContent).toMatch(/^SPC-\d{4}$/)
    // And the dedupe survived the reload too.
    expect(openApp('notepad', fileLaunch(created.id))).toBe(windowId)
    expect(windowCount()).toBe(1)
  })
})

describe('HU-2 (h) · the window follows a rename made elsewhere', () => {
  it('an explorer-side relabel lands in the notepad header AND the WM title bar', () => {
    const { windowId } = mountWindowed('charter')
    const seededName = node('charter').name
    // Mounting retitled the record onto the specimen (title-follow).
    expect(useWMStore.getState().windows[windowId]!.title).toBe(seededName)

    act(() => {
      commit(renameNode(useFSStore.getState().fs, 'charter', 'RELABELLED.TXT'))
    })

    expect(document.querySelector('[data-notepad-name]')!.textContent).toBe('RELABELLED.TXT')
    expect(useWMStore.getState().windows[windowId]!.title).toBe('RELABELLED.TXT')
  })

  it('an untitled window keeps the module name until it binds a specimen', () => {
    const { windowId } = mountLauncher()
    expect(useWMStore.getState().windows[windowId]!.title).toBe('Specimen Notepad')
  })
})

describe('HU-2 (d) · long names in the notepad chrome', () => {
  it('the engraved name carries the whole specimen name in its tooltip', () => {
    mountWindowed('charter')
    const title = document.querySelector('[data-notepad-name]')!.getAttribute('title')!
    expect(title).toContain(node('charter').name)
    expect(title).toContain('relabel')
  })

  it('the chrome name clamps with an ellipsis (CSS source-scan)', () => {
    const css = readFileSync('src/apps/notepad/notepad.css', 'utf8')
    const nameBlock = css.split('.notepad-name {')[1]!.split('}')[0]!
    expect(nameBlock).toContain('text-overflow: ellipsis')
    expect(nameBlock).toContain('white-space: nowrap')
    expect(nameBlock).toContain('min-width: 0')
  })
})
