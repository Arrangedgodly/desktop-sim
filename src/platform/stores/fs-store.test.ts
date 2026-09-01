import { beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptyFSState,
  createNodePlaceholder,
  moveNodePlaceholder,
  setIconPositionPlaceholder,
  useFSStore,
} from './fs-store'

beforeEach(() => {
  useFSStore.getState().init(createEmptyFSState())
})

describe('fs-store · injected-state seam', () => {
  it('holds the root-only placeholder until state is injected', () => {
    const fs = useFSStore.getState().fs
    expect(fs.version).toBe(0)
    expect(fs.rootId).toBe('root')
    expect(Object.keys(fs.nodes)).toEqual(['root'])
  })

  it('init replaces the whole tree atomically (MF-2 loader path)', () => {
    const seeded = createNodePlaceholder(createEmptyFSState(), {
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

describe('fs-store · creating and moving nodes through the store', () => {
  it('createNodePlaceholder + commit registers the node in the store', () => {
    useFSStore.getState().commit(
      createNodePlaceholder(useFSStore.getState().fs, {
        parentId: 'root',
        name: 'field-notes.txt',
        kind: 'text',
      }),
    )
    const nodes = useFSStore.getState().fs.nodes
    const created = Object.values(nodes).find((n) => n.name === 'field-notes.txt')
    expect(created).toMatchObject({ parentId: 'root', kind: 'text' })
  })

  it('moveNodePlaceholder + commit reparents the node', () => {
    const withFolder = createNodePlaceholder(useFSStore.getState().fs, {
      parentId: 'root',
      name: 'drawer-03',
      kind: 'folder',
      id: 'drawer-03',
    })
    const withFile = createNodePlaceholder(withFolder, {
      parentId: 'root',
      name: 'plate-07.txt',
      kind: 'text',
      id: 'plate-07',
    })
    useFSStore.getState().commit(withFile)

    useFSStore
      .getState()
      .commit(moveNodePlaceholder(useFSStore.getState().fs, 'plate-07', 'drawer-03'))

    expect(useFSStore.getState().fs.nodes['plate-07']!.parentId).toBe('drawer-03')
  })

  it('setIconPositionPlaceholder + commit updates the desktop icon map', () => {
    useFSStore
      .getState()
      .commit(setIconPositionPlaceholder(useFSStore.getState().fs, 'root', { x: 4, y: 2 }))
    expect(useFSStore.getState().fs.iconPositions['root']).toEqual({ x: 4, y: 2 })
  })

  it('one commit = exactly one notification, even when nodes and iconPositions change together', () => {
    let notifications = 0
    const unsubscribe = useFSStore.subscribe(
      (s) => s.fs,
      () => {
        notifications += 1
      },
    )

    const seeded = createNodePlaceholder(useFSStore.getState().fs, {
      parentId: 'root',
      name: 'combined-op',
      kind: 'folder',
      id: 'combined',
    })
    useFSStore.getState().commit(setIconPositionPlaceholder(seeded, 'combined', { x: 1, y: 1 }))
    unsubscribe()

    expect(notifications).toBe(1)
    expect(useFSStore.getState().fs.nodes['combined']).toBeDefined()
    expect(useFSStore.getState().fs.iconPositions['combined']).toEqual({ x: 1, y: 1 })
  })
})
