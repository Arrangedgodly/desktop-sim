// IM-5 drop-on-folder validation — pure decision table (node env, no DOM).
// The rules mirror moveNode's refusals; the gesture hook consults this for
// BOTH the live highlight and the pointerup commit.
import { describe, expect, it } from 'vitest'
import { createNode, emptyFSState, type FSState } from '../../lib/fs'
import { resolveDropTarget, type DropResolution } from './drop-target'

/** Narrow a resolution to its reject reason (fails loudly when not rejected). */
function reasonOf(resolution: DropResolution): string {
  return resolution.status === 'rejected'
    ? resolution.reason
    : `expected a rejection, got ${resolution.status}`
}

/** Desktop-shaped fixture: two drawers (one nested child) + specimens. */
function fixture(): FSState {
  let state = emptyFSState(0)
  state = createNode(state, { id: 'projects', parentId: 'root', name: 'Projects', kind: 'folder' })
  state = createNode(state, {
    id: 'field-notes',
    parentId: 'root',
    name: 'Field Notes',
    kind: 'folder',
  })
  state = createNode(state, {
    id: 'sub-drawer',
    parentId: 'projects',
    name: 'Nested Drawer',
    kind: 'folder',
  })
  state = createNode(state, {
    id: 'charter',
    parentId: 'root',
    name: 'accession-charter.txt',
    kind: 'text',
    content: '…',
  })
  state = createNode(state, {
    id: 'nameplate',
    parentId: 'root',
    name: 'Nameplate',
    kind: 'app-link',
    appId: 'about',
  })
  state = createNode(state, {
    id: 'inside-projects',
    parentId: 'projects',
    name: 'inside.txt',
    kind: 'text',
    content: '…',
  })
  return state
}

describe('resolveDropTarget · valid + none', () => {
  it('a drawer receives any node from elsewhere', () => {
    const state = fixture()
    expect(resolveDropTarget(state, 'charter', 'projects')).toEqual({
      status: 'folder',
      targetId: 'projects',
    })
    expect(resolveDropTarget(state, 'projects', 'field-notes')).toEqual({
      status: 'folder',
      targetId: 'field-notes',
    })
  })

  it('null target (bare plate under the pointer) is none, never a rejection', () => {
    expect(resolveDropTarget(fixture(), 'charter', null)).toEqual({ status: 'none' })
  })

  it('an unknown target id (deleted mid-gesture) reads as none', () => {
    expect(resolveDropTarget(fixture(), 'charter', 'ghost')).toEqual({ status: 'none' })
  })
})

describe('resolveDropTarget · rejections (each soft: shake + bounce, no commit)', () => {
  it('a specimen is not a drawer: non-folder targets are rejected', () => {
    const state = fixture()
    expect(resolveDropTarget(state, 'charter', 'nameplate')).toEqual({
      status: 'rejected',
      targetId: 'nameplate',
      reason: 'not-a-folder',
    })
    // text target, same rule
    expect(reasonOf(resolveDropTarget(state, 'nameplate', 'charter'))).toBe('not-a-folder')
  })

  it('a drawer may not be filed inside its own subtree (folder onto its child)', () => {
    const state = fixture()
    // 'sub-drawer' is projects' OWN CHILD — cycle prevention, exactly the rule
    // moveNode enforces; here it is refused before any commit is attempted.
    expect(resolveDropTarget(state, 'projects', 'sub-drawer')).toEqual({
      status: 'rejected',
      targetId: 'sub-drawer',
      reason: 'descendant-of-self',
    })
  })

  it('nothing drops onto itself (defensive — the ghost is hit-test-transparent)', () => {
    expect(resolveDropTarget(fixture(), 'projects', 'projects')).toEqual({
      status: 'rejected',
      targetId: 'projects',
      reason: 'self',
    })
  })

  it('a node already filed in the target drawer is a same-location no-op', () => {
    const state = fixture()
    expect(resolveDropTarget(state, 'inside-projects', 'projects')).toEqual({
      status: 'rejected',
      targetId: 'projects',
      reason: 'same-location',
    })
  })
})
