import { beforeEach, describe, expect, it } from 'vitest'
import {
  FSError,
  createNode,
  deleteNode,
  emptyFSState,
  moveNode,
  renameNode,
  setIconPosition,
} from '../../lib/fs'
import { SEED_INITIAL_FS_STATE, useFSStore } from './fs-store'

// Captured at import time, before any beforeEach re-init: the store's
// pristine boot state (the seeded catalog).
const pristineBootState = useFSStore.getState().fs

beforeEach(() => {
  useFSStore.getState().init(emptyFSState())
})

describe('fs-store · injected-state seam', () => {
  it('boots holding the seeded catalog until MF-2 injects state', () => {
    expect(pristineBootState).toBe(SEED_INITIAL_FS_STATE)
    expect(pristineBootState.nodes['root']).toMatchObject({ name: 'Hold', kind: 'folder' })
    for (const drawer of ['Projects', 'Field Notes', 'Archive']) {
      expect(Object.values(pristineBootState.nodes).some((node) => node.name === drawer)).toBe(true)
    }
  })

  it('init replaces the whole tree atomically (MF-2 loader path)', () => {
    const seeded = createNode(useFSStore.getState().fs, {
      parentId: 'root',
      name: 'specimens',
      kind: 'folder',
      id: 'specimens',
    })
    useFSStore.getState().init(seeded)
    expect(useFSStore.getState().fs).toBe(seeded)
    expect(useFSStore.getState().fs.nodes['specimens']).toBeDefined()
  })
})

describe('fs-store · real ops through the commit seam', () => {
  it('createNode + commit registers the node in the store', () => {
    useFSStore.getState().commit(
      createNode(useFSStore.getState().fs, {
        parentId: 'root',
        name: 'field-notes.txt',
        kind: 'text',
        id: 'fn',
      }),
    )
    const created = useFSStore.getState().fs.nodes['fn']
    expect(created).toMatchObject({ parentId: 'root', kind: 'text' })
    expect(created!.accession).toBe('SPC-0001')
  })

  it('moveNode + commit reparents the node', () => {
    let state = useFSStore.getState().fs
    state = createNode(state, {
      parentId: 'root',
      name: 'drawer-03',
      kind: 'folder',
      id: 'drawer-03',
    })
    state = createNode(state, {
      parentId: 'root',
      name: 'plate-07.txt',
      kind: 'text',
      id: 'plate-07',
    })
    useFSStore.getState().commit(state)

    useFSStore.getState().commit(moveNode(useFSStore.getState().fs, 'plate-07', 'drawer-03'))

    expect(useFSStore.getState().fs.nodes['plate-07']!.parentId).toBe('drawer-03')
  })

  it('deleteNode + commit removes folders recursively', () => {
    let state = useFSStore.getState().fs
    state = createNode(state, {
      parentId: 'root',
      name: 'drawer-03',
      kind: 'folder',
      id: 'drawer-03',
    })
    state = createNode(state, {
      parentId: 'drawer-03',
      name: 'inside.txt',
      kind: 'text',
      id: 'inside',
    })
    useFSStore.getState().commit(state)

    useFSStore.getState().commit(deleteNode(useFSStore.getState().fs, 'drawer-03'))

    expect(useFSStore.getState().fs.nodes['drawer-03']).toBeUndefined()
    expect(useFSStore.getState().fs.nodes['inside']).toBeUndefined()
    expect(useFSStore.getState().fs.nodes['root']).toBeDefined()
  })

  it('setIconPosition + commit updates the desktop icon map', () => {
    useFSStore
      .getState()
      .commit(
        createNode(useFSStore.getState().fs, {
          parentId: 'root',
          name: 'pinned',
          kind: 'text',
          id: 'pinned',
        }),
      )
    useFSStore
      .getState()
      .commit(setIconPosition(useFSStore.getState().fs, 'pinned', { x: 4, y: 2 }))
    expect(useFSStore.getState().fs.iconPositions['pinned']).toEqual({ x: 4, y: 2 })
  })

  it('a throwing op leaves the store untouched (nothing committed)', () => {
    let state = useFSStore.getState().fs
    state = createNode(state, { parentId: 'root', name: 'a.txt', kind: 'text', id: 'a' })
    state = createNode(state, { parentId: 'root', name: 'b.txt', kind: 'text', id: 'b' })
    useFSStore.getState().commit(state)
    const before = useFSStore.getState().fs

    expect(() => renameNode(before, 'b', 'A.TXT')).toThrow(FSError) // sibling collision
    expect(useFSStore.getState().fs).toBe(before)
  })

  it('one commit = exactly one notification, even when nodes and iconPositions change together', () => {
    let notifications = 0
    const unsubscribe = useFSStore.subscribe(
      (s) => s.fs,
      () => {
        notifications += 1
      },
    )

    const seeded = createNode(useFSStore.getState().fs, {
      parentId: 'root',
      name: 'combined-op',
      kind: 'folder',
      id: 'combined',
    })
    useFSStore.getState().commit(setIconPosition(seeded, 'combined', { x: 1, y: 1 }))
    unsubscribe()

    expect(notifications).toBe(1)
    expect(useFSStore.getState().fs.nodes['combined']).toBeDefined()
    expect(useFSStore.getState().fs.iconPositions['combined']).toEqual({ x: 1, y: 1 })
  })
})
