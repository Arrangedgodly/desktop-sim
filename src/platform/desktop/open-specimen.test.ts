// IM-5 open routing — the routing table (pure) + its dispatch through the
// real registry (node env; the only DOM-adjacent call is openApp's console
// warn, which is spied).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNode, emptyFSState, type FSState, type FSNode } from '../../lib/fs'
import {
  EXPLORER_APP_ID,
  IMAGE_VIEWER_APP_ID,
  NOTEPAD_APP_ID,
  registerApp,
  resetAppRegistry,
} from '../app-registry'
import { useWMStore } from '../stores/wm-store'
import { OPEN_ROUTES, openSpecimen, resolveOpenRoute } from './open-specimen'
import { DemoIcon } from '../../apps/demo/DemoIcon'

/**
 * A probe manifest registered under a RESERVED id — exactly how AP-1/AP-2/AP-3
 * will light the routes up. First registration wins, so the reserved id is
 * genuinely the one routed to.
 */
const probeExplorerApp = {
  id: EXPLORER_APP_ID,
  name: 'Probe Explorer',
  icon: DemoIcon,
  mount: () => null,
} as const

function rootChild(state: FSState, id: string): FSNode {
  const node = state.nodes[id]
  if (!node) throw new Error(`test fixture: node ${id} missing`)
  return node
}

function fixture(kind: 'folder' | 'text' | 'image'): FSNode {
  let state = emptyFSState(0)
  state = createNode(state, {
    id: `n-${kind}`,
    parentId: 'root',
    name: `N ${kind}`,
    kind,
    ...(kind === 'image' ? { src: 'data:image/svg+xml,x' } : {}),
  })
  return rootChild(state, `n-${kind}`)
}

beforeEach(() => {
  resetAppRegistry()
  useWMStore.setState({ windows: {}, zOrder: [], zCounter: 0, focusedId: null, dragging: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveOpenRoute · the routing table (pure)', () => {
  it('folder → explorer, text → notepad, image → image-viewer — each with a file launch context', () => {
    for (const [kind, appId] of [
      ['folder', EXPLORER_APP_ID],
      ['text', NOTEPAD_APP_ID],
      ['image', IMAGE_VIEWER_APP_ID],
    ] as const) {
      const node = fixture(kind)
      expect(resolveOpenRoute(node)).toEqual({ appId, launch: { source: 'file', file: node } })
    }
  })

  it('the table is the reserved constants, frozen', () => {
    expect(OPEN_ROUTES).toEqual({
      folder: 'explorer',
      text: 'notepad',
      image: 'image-viewer',
    })
    expect(Object.isFrozen(OPEN_ROUTES)).toBe(true)
  })

  it('app-link routes to ITS OWN target manifest id', () => {
    let state = emptyFSState(0)
    state = createNode(state, {
      id: 'nameplate',
      parentId: 'root',
      name: 'Science Officer Nameplate',
      kind: 'app-link',
      appId: 'about',
    })
    const node = rootChild(state, 'nameplate')
    expect(resolveOpenRoute(node)).toEqual({ appId: 'about', launch: { source: 'file', file: node } })
  })
})

describe('openSpecimen · dispatch through the registry', () => {
  it('a folder opens the explorer with the drawer node as its launch context', () => {
    registerApp(probeExplorerApp)
    const node = fixture('folder')

    openSpecimen(node)

    const windows = Object.values(useWMStore.getState().windows)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.appId).toBe(EXPLORER_APP_ID)
    expect(windows[0]!.launch).toMatchObject({
      source: 'file',
      file: { id: 'n-folder', kind: 'folder' },
    })
  })

  it('unregistered fleet ids (today: AP-1/AP-2/AP-3 pending) fail SOFT — warn, no window, no throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    for (const kind of ['folder', 'text', 'image'] as const) {
      expect(() => openSpecimen(fixture(kind))).not.toThrow()
    }
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)

    // The dispatch REALLY went to the reserved ids — the soft-fail warnings
    // name explorer/notepad/image-viewer, in routing order.
    const warnedIds = warn.mock.calls.map((call) => String(call[1]))
    expect(warnedIds).toEqual(
      expect.arrayContaining(['explorer', 'notepad', 'image-viewer']),
    )
  })

  it('an app-link to an unregistered app (about, AP-5 pending) fails soft too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let state = emptyFSState(0)
    state = createNode(state, {
      id: 'nameplate',
      parentId: 'root',
      name: 'Science Officer Nameplate',
      kind: 'app-link',
      appId: 'about',
    })

    expect(() => openSpecimen(rootChild(state, 'nameplate'))).not.toThrow()
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
  })

  it('a registered app-link opens its target with a file launch context', () => {
    const probeApp = { id: 'probe', name: 'Probe Module', icon: DemoIcon, mount: () => null } as const
    registerApp(probeApp)
    let state = emptyFSState(0)
    state = createNode(state, {
      id: 'probe-link',
      parentId: 'root',
      name: 'Probe Link',
      kind: 'app-link',
      appId: 'probe',
    })

    openSpecimen(rootChild(state, 'probe-link'))

    const windows = Object.values(useWMStore.getState().windows)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.appId).toBe('probe')
    expect(windows[0]!.launch).toMatchObject({
      source: 'file',
      file: { id: 'probe-link', kind: 'app-link' },
    })
  })
})
