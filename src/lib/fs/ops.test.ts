import { describe, expect, it } from 'vitest'
import {
  createNode,
  deleteNode,
  emptyFSState,
  findNode,
  listChildren,
  moveNode,
  pathOf,
  renameNode,
  setIconPosition,
} from './ops'
import { FSError, isFSError } from './errors'
import type { FSState } from './types'

const NOW = 1_000

function state0(): FSState {
  return emptyFSState(NOW)
}

/** Drawer 'd1' with text 'a.txt' inside; plus root-level text 'loose.txt'. */
function state1(): FSState {
  let s = state0()
  s = createNode(s, { parentId: 'root', name: 'd1', kind: 'folder', id: 'd1', now: NOW })
  s = createNode(s, {
    parentId: 'd1',
    name: 'a.txt',
    kind: 'text',
    id: 'a',
    now: NOW,
    content: 'alpha',
  })
  s = createNode(s, { parentId: 'root', name: 'loose.txt', kind: 'text', id: 'loose', now: NOW })
  return s
}

function expectCode(block: () => unknown, code: string): FSError {
  try {
    block()
  } catch (error) {
    expect(isFSError(error)).toBe(true)
    expect((error as FSError).code).toBe(code)
    return error as FSError
  }
  throw new Error(`expected FSError(${code}), but nothing was thrown`)
}

/* ---------------------------------------------------------------------- */

describe('ops · createNode', () => {
  it('accessions a drawer into the root (DRW series, parent linkage)', () => {
    const next = createNode(state0(), {
      parentId: 'root',
      name: 'Projects',
      kind: 'folder',
      id: 'p',
      now: NOW,
    })
    const created = next.nodes['p']!
    expect(created).toMatchObject({ id: 'p', parentId: 'root', name: 'Projects', kind: 'folder' })
    expect(created.accession).toBe('DRW-0001')
    expect(created.accessionedAt).toBe(NOW)
  })

  it('accessions a text specimen (SPC series, default empty content)', () => {
    const next = createNode(state0(), {
      parentId: 'root',
      name: 'note.txt',
      kind: 'text',
      id: 'n',
      now: NOW,
    })
    expect(next.nodes['n']).toMatchObject({ kind: 'text', content: '' })
    expect(next.nodes['n']!.accession).toBe('SPC-0001')
  })

  it('accessions an image plate (PLT series, src required and kept)', () => {
    const next = createNode(state0(), {
      parentId: 'root',
      name: 'plate.png',
      kind: 'image',
      id: 'i',
      now: NOW,
      src: 'data:image/svg+xml,<x/>',
    })
    expect(next.nodes['i']).toMatchObject({ kind: 'image', src: 'data:image/svg+xml,<x/>' })
    expect(next.nodes['i']!.accession).toBe('PLT-0001')
  })

  it('accessions a module reference (MOD series, appId kept)', () => {
    const next = createNode(state0(), {
      parentId: 'root',
      name: 'Nameplate',
      kind: 'app-link',
      id: 'm',
      now: NOW,
      appId: 'about',
    })
    expect(next.nodes['m']).toMatchObject({ kind: 'app-link', appId: 'about' })
    expect(next.nodes['m']!.accession).toBe('MOD-0001')
  })

  it('does not mutate the input state', () => {
    const before = state1()
    const snapshot = structuredClone(before)
    createNode(before, { parentId: 'root', name: 'new', kind: 'folder', id: 'new', now: NOW })
    expect(before).toEqual(snapshot)
  })

  it('rejects unknown parent, non-folder parent, duplicate id', () => {
    const s = state1()
    expectCode(() => createNode(s, { parentId: 'ghost', name: 'x', kind: 'text' }), 'not-found')
    expectCode(() => createNode(s, { parentId: 'a', name: 'x', kind: 'text' }), 'not-a-folder')
    expectCode(
      () => createNode(s, { parentId: 'root', name: 'other', kind: 'text', id: 'd1' }),
      'invalid-data',
    )
  })

  it('rejects missing kind-specific payloads and cross-kind fields', () => {
    const s = state1()
    expectCode(() => createNode(s, { parentId: 'root', name: 'p', kind: 'image' }), 'invalid-data')
    expectCode(
      () => createNode(s, { parentId: 'root', name: 'p', kind: 'app-link' }),
      'invalid-data',
    )
    expectCode(
      () => createNode(s, { parentId: 'root', name: 'p', kind: 'folder', content: 'x' }),
      'invalid-data',
    )
    expectCode(
      () => createNode(s, { parentId: 'root', name: 'p', kind: 'text', src: 'x' }),
      'invalid-data',
    )
    expectCode(
      () => createNode(s, { parentId: 'root', name: 'p', kind: 'text', appId: 'x' }),
      'invalid-data',
    )
  })

  it('rejects sibling name collisions (case-insensitive) and invalid names', () => {
    const s = state1()
    expectCode(
      () => createNode(s, { parentId: 'root', name: 'D1', kind: 'text' }),
      'name-collision',
    )
    expectCode(
      () => createNode(s, { parentId: 'd1', name: 'A.TXT', kind: 'text' }),
      'name-collision',
    )
    expectCode(() => createNode(s, { parentId: 'root', name: '  ', kind: 'text' }), 'invalid-name')
    expectCode(() => createNode(s, { parentId: 'root', name: 'a/b', kind: 'text' }), 'invalid-name')
  })

  it('trims the label before storing it', () => {
    const next = createNode(state0(), {
      parentId: 'root',
      name: '  padded  ',
      kind: 'folder',
      id: 'f',
    })
    expect(next.nodes['f']!.name).toBe('padded')
  })
})

describe('ops · renameNode', () => {
  it('relabels a node in place (same parent, same accession)', () => {
    const next = renameNode(state1(), 'loose', 'renamed.txt')
    expect(next.nodes['loose']).toMatchObject({ name: 'renamed.txt', parentId: 'root' })
    expect(next.nodes['loose']!.accession).toBe('SPC-0002')
  })

  it('same name is a reference-equal no-op', () => {
    const s = state1()
    expect(renameNode(s, 'loose', 'loose.txt')).toBe(s)
  })

  it('case-only relabel of the same node is allowed', () => {
    const next = renameNode(state1(), 'loose', 'LOOSE.TXT')
    expect(next.nodes['loose']!.name).toBe('LOOSE.TXT')
  })

  it('rejects collisions with a different sibling (case-insensitive)', () => {
    const s = state1()
    expectCode(() => renameNode(s, 'loose', 'D1'), 'name-collision') // drawer 'd1' sits at root
    const withPeer = createNode(s, { parentId: 'd1', name: 'peer.txt', kind: 'text', id: 'peer' })
    expectCode(() => renameNode(withPeer, 'peer', 'A.TXT'), 'name-collision') // 'a.txt' sits in d1
  })

  it('rejects root rename, unknown id, invalid names', () => {
    const s = state1()
    expectCode(() => renameNode(s, 'root', 'Elsewhere'), 'root-protected')
    expectCode(() => renameNode(s, 'ghost', 'x'), 'not-found')
    expectCode(() => renameNode(s, 'loose', ''), 'invalid-name')
    expectCode(() => renameNode(s, 'loose', 'with/slash'), 'invalid-name')
  })
})

describe('ops · moveNode', () => {
  it('files a specimen into a drawer', () => {
    const next = moveNode(state1(), 'loose', 'd1')
    expect(next.nodes['loose']!.parentId).toBe('d1')
    expect(listChildren(next, 'd1').map((n) => n.id)).toContain('loose')
  })

  it('moving a drawer into another drawer works', () => {
    let s = state1()
    s = createNode(s, { parentId: 'root', name: 'd2', kind: 'folder', id: 'd2' })
    const next = moveNode(s, 'd2', 'd1')
    expect(next.nodes['d2']!.parentId).toBe('d1')
    // grandchild content stays reachable
    expect(pathOf(next, 'a')).toBe('/Hold/d1/a.txt')
  })

  it('same-parent move is a reference-equal no-op', () => {
    const s = state1()
    expect(moveNode(s, 'loose', 'root')).toBe(s)
  })

  it('CYCLE PREVENTION: a drawer cannot move into itself', () => {
    expectCode(() => moveNode(state1(), 'd1', 'd1'), 'cycle')
  })

  it('CYCLE PREVENTION: a drawer cannot move into its own descendant', () => {
    let s = state1()
    s = createNode(s, { parentId: 'd1', name: 'inner', kind: 'folder', id: 'inner' })
    s = createNode(s, { parentId: 'inner', name: 'deep', kind: 'folder', id: 'deep' })
    expectCode(() => moveNode(s, 'd1', 'inner'), 'cycle')
    expectCode(() => moveNode(s, 'd1', 'deep'), 'cycle')
  })

  it('rejects moves into a non-folder (specimen)', () => {
    expectCode(() => moveNode(state1(), 'loose', 'a'), 'not-a-folder')
  })

  it('rejects unknown node/target and moving the root', () => {
    const s = state1()
    expectCode(() => moveNode(s, 'ghost', 'd1'), 'not-found')
    expectCode(() => moveNode(s, 'loose', 'ghost'), 'not-found')
    expectCode(() => moveNode(s, 'root', 'd1'), 'root-protected')
  })

  it('enforces the sibling-name rule in the destination drawer', () => {
    let s = state1()
    s = createNode(s, { parentId: 'root', name: 'a.txt', kind: 'text', id: 'a-dup' })
    expectCode(() => moveNode(s, 'a-dup', 'd1'), 'name-collision') // d1 already holds a.txt
  })

  it('prunes the moved subtree’s icon positions', () => {
    let s = state1()
    s = setIconPosition(s, 'loose', { x: 3, y: 1 })
    const next = moveNode(s, 'loose', 'd1')
    expect(next.iconPositions['loose']).toBeUndefined()
  })

  it('prunes positions of the whole moved subtree, not just the node', () => {
    let s = state1()
    s = createNode(s, { parentId: 'd1', name: 'inner', kind: 'folder', id: 'inner' })
    s = createNode(s, { parentId: 'inner', name: 'deep.txt', kind: 'text', id: 'deep' })
    s = createNode(s, { parentId: 'root', name: 'd2', kind: 'folder', id: 'd2' })
    s = setIconPosition(s, 'd1', { x: 0, y: 0 })
    s = setIconPosition(s, 'inner', { x: 1, y: 0 })
    s = setIconPosition(s, 'deep', { x: 2, y: 0 })
    s = setIconPosition(s, 'loose', { x: 7, y: 7 })

    const next = moveNode(s, 'd1', 'd2')
    expect(next.iconPositions['d1']).toBeUndefined()
    expect(next.iconPositions['inner']).toBeUndefined()
    expect(next.iconPositions['deep']).toBeUndefined()
    // unaffected positions survive
    expect(next.iconPositions['loose']).toEqual({ x: 7, y: 7 })
  })
})

describe('ops · deleteNode', () => {
  it('decommissions a single specimen and prunes its position', () => {
    let s = state1()
    s = setIconPosition(s, 'loose', { x: 4, y: 2 })
    const next = deleteNode(s, 'loose')
    expect(next.nodes['loose']).toBeUndefined()
    expect(next.iconPositions['loose']).toBeUndefined()
    expect(next.nodes['d1']).toBeDefined()
  })

  it('recursive: deleting a drawer removes the whole subtree', () => {
    let s = state1()
    s = createNode(s, { parentId: 'd1', name: 'inner', kind: 'folder', id: 'inner' })
    s = createNode(s, { parentId: 'inner', name: 'deep.txt', kind: 'text', id: 'deep' })
    s = setIconPosition(s, 'deep', { x: 9, y: 9 })

    const next = deleteNode(s, 'd1')
    expect(next.nodes['d1']).toBeUndefined()
    expect(next.nodes['a']).toBeUndefined()
    expect(next.nodes['inner']).toBeUndefined()
    expect(next.nodes['deep']).toBeUndefined()
    expect(next.iconPositions['deep']).toBeUndefined()
    expect(next.nodes['root']).toBeDefined()
    expect(next.nodes['loose']).toBeDefined()
  })

  it('rejects deleting the root or an unknown id', () => {
    const s = state1()
    expectCode(() => deleteNode(s, 'root'), 'root-protected')
    expectCode(() => deleteNode(s, 'ghost'), 'not-found')
  })
})

describe('ops · queries', () => {
  it('findNode hits and misses', () => {
    const s = state1()
    expect(findNode(s, 'a')?.name).toBe('a.txt')
    expect(findNode(s, 'ghost')).toBeNull()
  })

  it('listChildren returns direct children only, in catalog order', () => {
    let s = state0()
    s = createNode(s, { parentId: 'root', name: 'z-note', kind: 'text', id: 'z' }) // SPC-0001
    s = createNode(s, { parentId: 'root', name: 'drawer', kind: 'folder', id: 'd' }) // DRW-0001
    s = createNode(s, { parentId: 'root', name: 'm-note', kind: 'text', id: 'm' }) // SPC-0002
    s = createNode(s, { parentId: 'root', name: 'plate', kind: 'image', id: 'p', src: 'x' }) // PLT-0001
    s = createNode(s, { parentId: 'd', name: 'nested.txt', kind: 'text', id: 'n' })

    expect(listChildren(s, 'root').map((node) => node.id)).toEqual(['d', 'p', 'z', 'm'])
  })

  it('listChildren throws for a specimen or an unknown id', () => {
    const s = state1()
    expectCode(() => listChildren(s, 'a'), 'not-a-folder')
    expectCode(() => listChildren(s, 'ghost'), 'not-found')
  })

  it('pathOf walks label segments from the root', () => {
    let s = state1()
    s = createNode(s, { parentId: 'd1', name: 'inner', kind: 'folder', id: 'inner' })
    s = createNode(s, { parentId: 'inner', name: 'deep.txt', kind: 'text', id: 'deep' })

    expect(pathOf(s, 'root')).toBe('/Hold')
    expect(pathOf(s, 'd1')).toBe('/Hold/d1')
    expect(pathOf(s, 'a')).toBe('/Hold/d1/a.txt')
    expect(pathOf(s, 'deep')).toBe('/Hold/d1/inner/deep.txt')
    expect(pathOf(s, 'ghost')).toBeNull()
  })

  it('pathOf returns null on a broken parent chain', () => {
    const broken: FSState = {
      ...state1(),
      nodes: {
        ...state1().nodes,
        orphan: { ...state1().nodes['a']!, id: 'orphan', parentId: 'nowhere' },
      },
    }
    expect(pathOf(broken, 'orphan')).toBeNull()
  })
})

describe('ops · setIconPosition', () => {
  it('pins a node to a desktop grid slot', () => {
    const next = setIconPosition(state1(), 'loose', { x: 2, y: 3 })
    expect(next.iconPositions['loose']).toEqual({ x: 2, y: 3 })
  })

  it('overwrites a previous slot for the same node', () => {
    let s = state1()
    s = setIconPosition(s, 'loose', { x: 1, y: 1 })
    s = setIconPosition(s, 'loose', { x: 5, y: 0 })
    expect(Object.keys(s.iconPositions).filter((id) => id === 'loose')).toHaveLength(1)
    expect(s.iconPositions['loose']).toEqual({ x: 5, y: 0 })
  })

  it('rejects unknown nodes and non-grid values', () => {
    const s = state1()
    expectCode(() => setIconPosition(s, 'ghost', { x: 0, y: 0 }), 'not-found')
    expectCode(() => setIconPosition(s, 'loose', { x: -1, y: 0 }), 'invalid-data')
    expectCode(() => setIconPosition(s, 'loose', { x: 1.5, y: 0 }), 'invalid-data')
  })
})

describe('ops · FSError shape', () => {
  it('carries the code on the error and names itself FSError', () => {
    const error = expectCode(() => deleteNode(state0(), 'root'), 'root-protected')
    expect(error.name).toBe('FSError')
    expect(error.message).toContain('[root-protected]')
    expect(isFSError(error)).toBe(true)
    expect(isFSError(new Error('plain'))).toBe(false)
  })
})
