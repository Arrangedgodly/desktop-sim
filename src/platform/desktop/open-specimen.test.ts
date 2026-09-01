// UI-3 open seam (IM-5 stub) — routing dispatch, node env (no DOM needed
// beyond the console placeholder, which is spied).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNode, emptyFSState, type FSState, type FSNode } from '../../lib/fs'
import { registerApp, resetAppRegistry } from '../app-registry'
import { useWMStore } from '../stores/wm-store'
import { openSpecimen } from './open-specimen'
import { DemoIcon } from '../../apps/demo/DemoIcon'

/** A probe manifest the stub can really dispatch to. */
const probeApp = {
  id: 'probe',
  name: 'Probe Module',
  icon: DemoIcon,
  mount: () => null,
} as const

function rootChild(state: FSState, id: string): FSNode {
  const node = state.nodes[id]
  if (!node) throw new Error(`test fixture: node ${id} missing`)
  return node
}

beforeEach(() => {
  resetAppRegistry()
  registerApp(probeApp)
  useWMStore.setState({ windows: {}, zOrder: [], zCounter: 0, focusedId: null, dragging: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('openSpecimen · app-link dispatches through the registry', () => {
  it('opens the target app window with a file launch context', () => {
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

  it('fails SOFT on an unregistered app id (warn + no window, never a throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let state = emptyFSState(0)
    state = createNode(state, {
      id: 'nameplate',
      parentId: 'root',
      name: 'Science Officer Nameplate',
      kind: 'app-link',
      appId: 'about', // registered by AP-5, not yet
    })

    expect(() => openSpecimen(rootChild(state, 'nameplate'))).not.toThrow()
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
  })
})

describe('openSpecimen · folders/files hit the honest console placeholder', () => {
  it.each(['folder', 'text', 'image'] as const)('kind %s logs the stub, opens nothing', (kind) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    let state = emptyFSState(0)
    state = createNode(state, {
      id: `n-${kind}`,
      parentId: 'root',
      name: `N ${kind}`,
      kind,
      ...(kind === 'image' ? { src: 'data:image/svg+xml,x' } : {}),
    })

    openSpecimen(rootChild(state, `n-${kind}`))

    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0]![0]).toContain('open stub')
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)
  })

  it('the placeholder names the specimen (accession + name + kind)', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    let state = emptyFSState(0)
    state = createNode(state, {
      id: 'projects',
      parentId: 'root',
      name: 'Projects',
      kind: 'folder',
    })
    const node = rootChild(state, 'projects')

    openSpecimen(node)
    expect(String(info.mock.calls[0]![1])).toBe('DRW-0001')
    expect(String(info.mock.calls[0]![2])).toBe('Projects')
    expect(String(info.mock.calls[0]![3])).toContain('folder')
  })
})
