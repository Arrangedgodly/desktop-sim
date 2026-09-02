import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppManifest } from './contract'
import {
  fileInstanceKey,
  getApp,
  listApps,
  openApp,
  registerApp,
  registerApps,
  resetAppRegistry,
  SINGLETON_INSTANCE_KEY,
  unregisterApp,
  useAppRegistryStore,
} from './registry'
import { appCloseGuardFor } from './content'
import { useWMStore, type WindowId } from '../stores/wm-store'
import type { FSNode } from '../../lib/fs'

// Module singletons — snapshot pristine state and hard-reset before each test
// (same pattern as the store-layer suites).
const initialWM = useWMStore.getState()

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  useWMStore.setState(initialWM, true)
  resetAppRegistry()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

// Minimal stub app pieces (node env: no rendering, just references).
const StubIcon = () => null
function StubSurface() {
  return null
}

function manifest(overrides: Partial<AppManifest> & Pick<AppManifest, 'id'>): AppManifest {
  return { name: overrides.id, icon: StubIcon, mount: StubSurface, ...overrides }
}

/** Minimal real FS domain node (MF-1 shape) for file-launch tests. */
function node(id: string, name = id): FSNode {
  return {
    id,
    parentId: 'root',
    name,
    kind: 'text',
    accession: 'SPC-9001',
    accessionedAt: 0,
    content: '',
  }
}

function windowIds(): WindowId[] {
  return Object.keys(useWMStore.getState().windows)
}

describe('registry · register / list', () => {
  it('stores a manifest, retrievable by id, and lists in registration order', () => {
    const alpha = manifest({ id: 'alpha' })
    const beta = manifest({ id: 'beta' })
    expect(registerApp(alpha)).toBe(true)
    expect(registerApp(beta)).toBe(true)

    expect(getApp('alpha')).toBe(alpha)
    expect(getApp('beta')).toBe(beta)
    expect(listApps()).toEqual([alpha, beta])
  })

  it('getApp returns null for an unregistered id', () => {
    expect(getApp('ghost')).toBeNull()
  })

  it('listApps stays empty before anything registers', () => {
    expect(listApps()).toEqual([])
  })

  it('registerApp stores the full manifest (icon, mount, flags, hints, file types)', () => {
    const m = manifest({
      id: 'full',
      name: 'Full',
      singleton: true,
      acceptedFileTypes: ['text', 'image'],
      defaultGeometry: { w: 500, h: 400, x: 5, y: 6 },
    })
    registerApp(m)
    expect(getApp('full')).toEqual(m)
  })
})

describe('registry · dedupe + validation', () => {
  it('rejects a duplicate id: first registration wins, warns, returns false', () => {
    const first = manifest({ id: 'dup', name: 'First' })
    const second = manifest({ id: 'dup', name: 'Second' })
    expect(registerApp(first)).toBe(true)
    expect(registerApp(second)).toBe(false)

    expect(getApp('dup')).toBe(first)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]!.join(' ')).toContain('dup')
  })

  it('rejects ids that are not kebab-case', () => {
    expect(registerApp(manifest({ id: 'Bad_Id' }))).toBe(false)
    expect(registerApp(manifest({ id: '2fast' }))).toBe(false)
    expect(registerApp(manifest({ id: '' }))).toBe(false)
    expect(listApps()).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(3)
  })

  it('registerApps bulk-registers and rejects duplicates within/across the batch', () => {
    const a = manifest({ id: 'a' })
    const b = manifest({ id: 'b' })
    const bAgain = manifest({ id: 'b', name: 'B again' })
    expect(registerApps([a, b, bAgain])).toBe(2)
    expect(registerApps([manifest({ id: 'a' })])).toBe(0) // already landed above
    expect(listApps().map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('reactive store: field-narrow selector reflects registration state', () => {
    const m = manifest({ id: 'probe' })
    expect(useAppRegistryStore.getState().apps['probe']).toBeUndefined()
    registerApp(m)
    expect(useAppRegistryStore.getState().apps['probe']).toBe(m)
    expect(useAppRegistryStore.getState().order).toEqual(['probe'])
  })
})

describe('registry · unregister', () => {
  it('removes the manifest from apps and order', () => {
    registerApp(manifest({ id: 'a' }))
    registerApp(manifest({ id: 'b' }))

    expect(unregisterApp('a')).toBe(true)
    expect(getApp('a')).toBeNull()
    expect(listApps().map((m) => m.id)).toEqual(['b'])
    expect(useAppRegistryStore.getState().order).toEqual(['b'])
  })

  it('unregistering an unknown id returns false and warns', () => {
    expect(unregisterApp('ghost')).toBe(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('unregister does NOT touch already-open windows (content layer warns gracefully)', () => {
    registerApp(manifest({ id: 'kept' }))
    const id = openApp('kept')!
    expect(id).toBeTruthy()

    unregisterApp('kept')
    // Window stays in the WM registry untouched.
    expect(useWMStore.getState().windows[id]).toBeDefined()
    expect(useWMStore.getState().windows[id]!.appId).toBe('kept')
  })
})

describe('openApp · instance rules (through the WM store)', () => {
  it('multi-instance: one new window per open', () => {
    registerApp(manifest({ id: 'multi' }))
    const a = openApp('multi')
    const b = openApp('multi')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a).not.toBe(b)
    expect(windowIds()).toHaveLength(2)
  })

  it('multi-instance + file: same file dedupes to one window, different files do not', () => {
    registerApp(manifest({ id: 'multi' }))
    const first = openApp('multi', { source: 'file', file: node('n1') })
    const same = openApp('multi', { source: 'file', file: node('n1') })
    const other = openApp('multi', { source: 'file', file: node('n2') })

    expect(same).toBe(first)
    expect(other).not.toBe(first)
    expect(windowIds()).toHaveLength(2)

    const windows = useWMStore.getState().windows
    expect(windows[first!]!.instanceId).toBe(fileInstanceKey('n1'))
    expect(windows[other!]!.instanceId).toBe(fileInstanceKey('n2'))
  })

  it('singleton: re-open (even with a file) returns, raises and focuses the same window', () => {
    registerApp(manifest({ id: 'solo', singleton: true }))
    registerApp(manifest({ id: 'other-app' }))
    const first = openApp('solo')
    openApp('other-app') // something on top
    const again = openApp('solo', { source: 'file', file: node('n1') })

    expect(again).toBe(first)
    expect(windowIds()).toHaveLength(2)
    const windows = useWMStore.getState().windows
    expect(windows[first!]!.instanceId).toBe(SINGLETON_INSTANCE_KEY)
    expect(useWMStore.getState().focusedId).toBe(first)
    expect(useWMStore.getState().zOrder.at(-1)).toBe(first)
  })
})

describe('openApp · manifest application', () => {
  it('uses the manifest name as the window title', () => {
    registerApp(manifest({ id: 'titled', name: 'Specimen Viewer' }))
    const id = openApp('titled')!
    expect(useWMStore.getState().windows[id]!.title).toBe('Specimen Viewer')
  })

  it('applies defaultGeometry size over the platform cascade origin', () => {
    registerApp(manifest({ id: 'sized', defaultGeometry: { w: 500, h: 400 } }))
    const id = openApp('sized')!
    // First window → cascade origin 96/64 (wm-store constants); size from hints.
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({ x: 96, y: 64, w: 500, h: 400 })
  })

  it('honors explicit x/y hints when provided', () => {
    registerApp(manifest({ id: 'placed', defaultGeometry: { x: 10, y: 20, w: 100, h: 80 } }))
    const id = openApp('placed')!
    expect(useWMStore.getState().windows[id]!.geometry).toEqual({ x: 10, y: 20, w: 100, h: 80 })
  })

  it('no hints → the wm-store cascade applies unchanged', () => {
    registerApp(manifest({ id: 'plain' }))
    registerApp(manifest({ id: 'plain2' }))
    openApp('plain')
    const second = openApp('plain2')!
    expect(useWMStore.getState().windows[second]!.geometry).toEqual({
      x: 128,
      y: 96,
      w: 720,
      h: 480,
    })
  })
})

describe('openApp · launch context', () => {
  it('stores the launch context on the window record', () => {
    registerApp(manifest({ id: 'ctx' }))
    const file = node('note-1', 'note-1.txt')
    const id = openApp('ctx', { source: 'file', file })!
    expect(useWMStore.getState().windows[id]!.launch).toEqual({ source: 'file', file })
  })

  it('defaults to a launcher open when no context is passed', () => {
    registerApp(manifest({ id: 'ctx' }))
    const id = openApp('ctx')!
    expect(useWMStore.getState().windows[id]!.launch).toEqual({ source: 'launcher' })
  })
})

describe('openApp · soft failure', () => {
  it('returns null for an unregistered app, opens nothing, warns, does not throw', () => {
    const result = openApp('ghost')
    expect(result).toBeNull()
    expect(windowIds()).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]!.join(' ')).toContain('ghost')
  })

  it('fails soft after the app was unregistered mid-session', () => {
    registerApp(manifest({ id: 'gone' }))
    unregisterApp('gone')
    expect(openApp('gone')).toBeNull()
    expect(windowIds()).toHaveLength(0)
  })
})

/* --------------------------- HU-2 · close-request seam ---------------------- */

describe('HU-2 (a) · appCloseGuardFor (the ✕/Esc policy)', () => {
  it('consults the manifest onCloseRequest with windowId + launch; true vetoes', () => {
    const asked: Array<{ windowId: string; launchSource: string }> = []
    registerApp(
      manifest({
        id: 'guarded',
        onCloseRequest: (request) => {
          asked.push({ windowId: request.windowId, launchSource: request.launch.source })
          return true
        },
      }),
    )
    const id = openApp('guarded', { source: 'file', file: node('f1') })!

    expect(appCloseGuardFor(useWMStore.getState().windows[id]!)).toBe(true)
    expect(asked).toEqual([{ windowId: id, launchSource: 'file' }])
  })

  it('false from the handler, an absent handler, or an unregistered app → no veto', () => {
    registerApp(manifest({ id: 'plain', onCloseRequest: () => false }))
    registerApp(manifest({ id: 'bare' }))
    const plain = openApp('plain')!
    const bare = openApp('bare')!
    const ghost = useWMStore.getState().openWindow({ appId: 'ghost' })

    expect(appCloseGuardFor(useWMStore.getState().windows[plain]!)).toBe(false)
    expect(appCloseGuardFor(useWMStore.getState().windows[bare]!)).toBe(false)
    expect(appCloseGuardFor(useWMStore.getState().windows[ghost]!)).toBe(false)
  })

  it('a launcher-opened window without a launch record is asked as a launcher open', () => {
    registerApp(
      manifest({
        id: 'asked',
        onCloseRequest: (request) => request.launch.source === 'launcher',
      }),
    )
    const id = useWMStore.getState().openWindow({ appId: 'asked' }) // no launch ctx
    expect(appCloseGuardFor(useWMStore.getState().windows[id]!)).toBe(true)
  })
})

/* ------------------------ HU-2 (i) · rapid open stress ---------------------- */

describe('HU-2 (i) · rapid double-open races (Enter + dblclick in one tick)', () => {
  it('25 racing same-file opens converge on ONE window (file-instance dedupe)', () => {
    registerApp(manifest({ id: 'multi', acceptedFileTypes: ['text'] }))
    let first = ''
    for (let i = 0; i < 25; i++) {
      const id = openApp('multi', { source: 'file', file: node('race-1') })
      if (i === 0) first = id!
      expect(id).toBe(first)
    }
    expect(windowIds()).toHaveLength(1)
    expect(useWMStore.getState().focusedId).toBe(first)
  })

  it('two files raced in interleaved bursts converge on exactly two windows', () => {
    registerApp(manifest({ id: 'multi', acceptedFileTypes: ['text'] }))
    for (let i = 0; i < 24; i++) {
      openApp('multi', { source: 'file', file: node(`race-${(i % 2) + 1}`) })
    }
    expect(windowIds()).toHaveLength(2)
  })

  it('a raced singleton stays single; raced launcher opens stay multi-instance', () => {
    registerApp(manifest({ id: 'solo', singleton: true }))
    for (let i = 0; i < 10; i++) openApp('solo')
    expect(windowIds()).toHaveLength(1)

    registerApp(manifest({ id: 'fresh' }))
    for (let i = 0; i < 6; i++) openApp('fresh') // launcher opens = fresh drafts
    expect(windowIds()).toHaveLength(7) // 1 + 6
  })
})

/* ------------------- HU-2 (h) · opening title from the file ---------------- */

describe('HU-2 (h) · titleForLaunch (document apps title by their file)', () => {
  it('a manifest with titleForLaunch opens titled by the file; without it, by manifest name', () => {
    registerApp(
      manifest({
        id: 'docapp',
        titleForLaunch: (launch) => (launch.source === 'file' ? launch.file.name : undefined),
      }),
    )
    registerApp(manifest({ id: 'plainapp' }))

    const doc = openApp('docapp', { source: 'file', file: node('f1', 'FIELD-NOTES.TXT') })!
    const untitled = openApp('docapp')!
    const plain = openApp('plainapp', { source: 'file', file: node('f2', 'OTHER.TXT') })!

    expect(useWMStore.getState().windows[doc]!.title).toBe('FIELD-NOTES.TXT')
    expect(useWMStore.getState().windows[untitled]!.title).toBe('docapp') // fell back to the name
    expect(useWMStore.getState().windows[plain]!.title).toBe('plainapp') // no seam, unchanged law
  })
})
