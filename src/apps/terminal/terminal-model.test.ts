import { describe, expect, it } from 'vitest'
import { createNode, emptyFSState, seedFSState } from '../../lib/fs'
import type { FSState } from '../../lib/fs'
import {
  HISTORY_CAP,
  bannerLines,
  catalogLines,
  catalogOrderNodes,
  completeInput,
  executeLine,
  freshSession,
  historyDown,
  historyUp,
  historyValue,
  promptFor,
  pushHistory,
  readSessionState,
  resolvePath,
  tokenizeLine,
  type TerminalSession,
} from './terminal-model'

/**
 * Terminal model unit tests (federated session 1) — the pure executor over
 * the REAL catalog ops: every floor command incl. its error paths, the
 * no-eval hard rule's refusal face, session validation, the history ring,
 * Tab completion, and the accession walk against both a deterministic
 * fixture and the shipped seed.
 */

/** A small deterministic catalog (accessions follow creation order). */
function fixture(): FSState {
  let s = emptyFSState(0)
  s = createNode(s, { id: 'projects', parentId: 'root', name: 'Projects', kind: 'folder', now: 1 })
  s = createNode(s, {
    id: 'charter',
    parentId: 'root',
    name: 'charter.txt',
    kind: 'text',
    content: 'ACCESSION CHARTER\n\nline two',
    now: 2,
  })
  s = createNode(s, { id: 'nested', parentId: 'projects', name: 'Nested', kind: 'folder', now: 3 })
  s = createNode(s, {
    id: 'plate',
    parentId: 'root',
    name: 'plate.png',
    kind: 'image',
    src: 'data:image/png;base64,AAAA',
    now: 4,
  })
  s = createNode(s, {
    id: 'nameplate',
    parentId: 'root',
    name: 'Nameplate Link',
    kind: 'app-link',
    appId: 'about',
    now: 5,
  })
  return s
}

/** fixture accessions, for assertions: DRW-0001 Projects, DRW-0002 Nested,
 *  SPC-0001 charter.txt, PLT-0001 plate.png, MOD-0001 Nameplate Link. */
const atRoot = (fs: FSState): TerminalSession => ({ cwd: fs.rootId, history: [] })
const atProjects = (): TerminalSession => ({ cwd: 'projects', history: [] })

const texts = (lines: readonly { kind: string; text: string }[]): string[] =>
  lines.map((line) => line.text)

describe('terminal model · tokenizer', () => {
  it('splits on whitespace and groups double-quoted words', () => {
    expect(tokenizeLine('cd Projects')).toEqual(['cd', 'Projects'])
    expect(tokenizeLine('  cat   "Nameplate Link"  ')).toEqual(['cat', 'Nameplate Link'])
    expect(tokenizeLine('cat "multi word name.txt"')).toEqual(['cat', 'multi word name.txt'])
  })

  it('empty and blank lines produce no words; unterminated quotes refuse', () => {
    expect(tokenizeLine('')).toEqual([])
    expect(tokenizeLine('   ')).toEqual([])
    expect(tokenizeLine('cat "oops')).toBeNull()
  })
})

describe('terminal model · path resolution', () => {
  it('resolves relative, absolute, dotted and climbing paths', () => {
    const fs = fixture()
    expect(resolvePath(fs, fs.rootId, 'Projects')).toBe('projects')
    expect(resolvePath(fs, fs.rootId, '/Projects/Nested')).toBe('nested')
    expect(resolvePath(fs, 'nested', '..')).toBe('projects')
    expect(resolvePath(fs, 'nested', '../..')).toBe(fs.rootId)
    expect(resolvePath(fs, 'nested', '.')).toBe('nested')
    expect(resolvePath(fs, fs.rootId, '')).toBe(fs.rootId)
    expect(resolvePath(fs, fs.rootId, '/charter.txt')).toBe('charter')
  })

  it('matches sibling names case-insensitively (the catalog uniqueness law)', () => {
    const fs = fixture()
    expect(resolvePath(fs, fs.rootId, 'projects')).toBe('projects')
    expect(resolvePath(fs, fs.rootId, 'CHARTER.TXT')).toBe('charter')
  })

  it('a missing segment resolves to null', () => {
    const fs = fixture()
    expect(resolvePath(fs, fs.rootId, 'Nowhere')).toBeNull()
    expect(resolvePath(fs, fs.rootId, '/Projects/Nowhere')).toBeNull()
  })
})

describe('terminal model · prompt', () => {
  it('carries the cwd accession and path in the archive vocabulary', () => {
    const fs = fixture()
    expect(promptFor(fs, fs.rootId)).toBe('ARC-0000:/>')
    expect(promptFor(fs, 'projects')).toBe('DRW-0001:/Projects>')
    expect(promptFor(fs, 'nested')).toBe('DRW-0002:/Projects/Nested>')
  })
})

describe('terminal model · executor', () => {
  it('blank input is a no-op', () => {
    const outcome = executeLine(fixture(), atRoot(fixture()), '   ')
    expect(outcome.lines).toEqual([])
    expect(outcome.nextFs).toBeNull()
    expect(outcome.effect.type).toBe('none')
  })

  it('unterminated quotes answer with an in-world refusal', () => {
    const outcome = executeLine(fixture(), atRoot(fixture()), 'cat "oops')
    expect(outcome.lines[0]!.kind).toBe('err')
    expect(outcome.lines[0]!.text).toContain('unterminated quote')
    expect(outcome.nextFs).toBeNull()
  })

  it('help prints the command plate', () => {
    const outcome = executeLine(fixture(), atRoot(fixture()), 'help')
    const joined = texts(outcome.lines).join('\n')
    for (const command of ['help', 'clear', 'pwd', 'ls', 'cd', 'cat', 'mkdir', 'touch', 'rm', 'accession', 'open']) {
      expect(joined).toContain(command)
    }
  })

  it('clear requests the clear effect and prints nothing', () => {
    const outcome = executeLine(fixture(), atRoot(fixture()), 'clear')
    expect(outcome.lines).toEqual([])
    expect(outcome.effect.type).toBe('clear')
  })

  it('pwd prints the catalog path', () => {
    const fs = fixture()
    expect(texts(executeLine(fs, atProjects(), 'pwd').lines)).toEqual(['/Hold/Projects'])
  })

  it('ls lists the drawer in catalog order; drawers carry a slash', () => {
    const fs = fixture()
    const lines = texts(executeLine(fs, atRoot(fs), 'ls').lines)
    expect(lines).toEqual([
      'DRW-0001  drawer  Projects/',
      'MOD-0001  module  Nameplate Link',
      'PLT-0001  plate   plate.png',
      'SPC-0001  text    charter.txt',
    ])
  })

  it('ls [path] lists another drawer; an empty drawer says so', () => {
    const fs = fixture()
    expect(texts(executeLine(fs, atRoot(fs), 'ls Projects').lines)).toEqual([
      'DRW-0002  drawer  Nested/',
    ])
    expect(texts(executeLine(fs, atProjects(), 'ls Nested').lines)).toEqual(['(empty drawer)'])
  })

  it('ls on a specimen prints its own row; a bad path refuses', () => {
    const fs = fixture()
    expect(texts(executeLine(fs, atRoot(fs), 'ls charter.txt').lines)).toEqual([
      'SPC-0001  text    charter.txt',
    ])
    const refused = executeLine(fs, atRoot(fs), 'ls Nowhere')
    expect(refused.lines[0]!.kind).toBe('err')
    expect(refused.lines[0]!.text).toContain('no such path')
  })

  it('cd moves into drawers; cd into a specimen is REFUSED', () => {
    const fs = fixture()
    const moved = executeLine(fs, atRoot(fs), 'cd Projects')
    expect(moved.effect).toEqual({ type: 'cd', cwd: 'projects' })
    const refused = executeLine(fs, atRoot(fs), 'cd charter.txt')
    expect(refused.lines[0]!.kind).toBe('err')
    expect(refused.lines[0]!.text).toContain('is a specimen, not a drawer')
    expect(refused.effect.type).toBe('none')
  })

  it('cd .. climbs; cd with no argument returns to the hold', () => {
    const fs = fixture()
    expect(executeLine(fs, { cwd: 'nested', history: [] }, 'cd ..').effect).toEqual({
      type: 'cd',
      cwd: 'projects',
    })
    expect(executeLine(fs, atProjects(), 'cd').effect).toEqual({ type: 'cd', cwd: fs.rootId })
  })

  it('cat prints a text specimen line by line', () => {
    const fs = fixture()
    expect(texts(executeLine(fs, atRoot(fs), 'cat charter.txt').lines)).toEqual([
      'ACCESSION CHARTER',
      '',
      'line two',
    ])
  })

  it('cat refuses drawers, plates, module references and the missing', () => {
    const fs = fixture()
    const folder = executeLine(fs, atRoot(fs), 'cat Projects')
    expect(folder.lines[0]!.text).toContain('is a drawer')
    const plate = executeLine(fs, atRoot(fs), 'cat plate.png')
    expect(plate.lines[0]!.text).toContain('is a plate')
    const link = executeLine(fs, atRoot(fs), 'cat "Nameplate Link"')
    expect(link.lines[0]!.text).toContain('is a module reference')
    const missing = executeLine(fs, atRoot(fs), 'cat ghost.txt')
    expect(missing.lines[0]!.text).toContain('no such specimen')
  })

  it('mkdir accessions a real drawer through the real ops', () => {
    const fs = fixture()
    const outcome = executeLine(fs, atRoot(fs), 'mkdir Surveys', 1_000)
    expect(outcome.nextFs).not.toBeNull()
    const created = Object.values(outcome.nextFs!.nodes).find((n) => n.name === 'Surveys')
    expect(created?.kind).toBe('folder')
    expect(created?.accession).toBe('DRW-0003')
    expect(created?.parentId).toBe(fs.rootId)
    expect(outcome.lines[0]!.text).toContain('DRW-0003')
  })

  it('mkdir collisions refuse in-world and change nothing', () => {
    const fs = fixture()
    const outcome = executeLine(fs, atRoot(fs), 'mkdir projects')
    expect(outcome.nextFs).toBeNull()
    expect(outcome.lines[0]!.kind).toBe('err')
    expect(outcome.lines[0]!.text).toContain('already catalogued')
  })

  it('mkdir refuses empty labels and path-shaped names with guidance', () => {
    const fs = fixture()
    const empty = executeLine(fs, atRoot(fs), 'mkdir ""')
    expect(empty.lines[0]!.text).toContain('label')
    const slashed = executeLine(fs, atRoot(fs), 'mkdir Projects/Deep')
    expect(slashed.lines[0]!.text).toContain('cd first, then mkdir')
  })

  it('touch accessions an empty text specimen', () => {
    const fs = fixture()
    const outcome = executeLine(fs, atRoot(fs), 'touch notes.txt', 1_000)
    const created = Object.values(outcome.nextFs!.nodes).find((n) => n.name === 'notes.txt')
    expect(created?.kind).toBe('text')
    expect(created?.accession).toBe('SPC-0002')
    expect((created as { content?: string } | undefined)?.content).toBe('')
  })

  it('rm decommissions a specimen or an EMPTY drawer', () => {
    const fs = fixture()
    const specimen = executeLine(fixture(), atRoot(fs), 'rm charter.txt')
    expect(specimen.nextFs!.nodes['charter']).toBeUndefined()
    expect(specimen.lines[0]!.text).toContain('decommissioned SPC-0001')

    const drawer = executeLine(fixture(), atProjects(), 'rm Nested')
    expect(drawer.nextFs!.nodes['nested']).toBeUndefined()
  })

  it('rm on a NON-EMPTY drawer is refused WITH the recursive guidance', () => {
    const fs = fixture()
    const outcome = executeLine(fs, atRoot(fs), 'rm Projects')
    expect(outcome.nextFs).toBeNull()
    expect(outcome.lines[0]!.kind).toBe('err')
    expect(outcome.lines[0]!.text).toContain('non-empty drawer')
    expect(outcome.lines[0]!.text).toContain('rm -r')
    expect(outcome.nextFs ?? fs.nodes['projects']).toBeDefined() // tree untouched
  })

  it('rm -r decommissions the drawer and its whole subtree', () => {
    const outcome = executeLine(fixture(), atRoot(fixture()), 'rm -r Projects')
    expect(outcome.nextFs!.nodes['projects']).toBeUndefined()
    expect(outcome.nextFs!.nodes['nested']).toBeUndefined()
  })

  it('rm refuses the hold itself and unknown flags', () => {
    const fs = fixture()
    expect(executeLine(fs, atRoot(fs), 'rm /').lines[0]!.text).toContain('not removable')
    expect(executeLine(fs, atRoot(fs), 'rm -x charter.txt').lines[0]!.text).toContain('only flag is -r')
  })

  it('accession with no argument walks the whole catalog', () => {
    const fs = fixture()
    const lines = texts(executeLine(fs, atRoot(fs), 'accession').lines)
    expect(lines[0]).toBe('CATALOG — THE SURVEY ARCHIVE')
    expect(lines[1]).toBe('ARC-0000  hold   ................. Hold/')
    const joined = lines.join('\n')
    for (const node of Object.values(fs.nodes)) {
      expect(joined).toContain(node.accession)
      expect(joined).toContain(node.name)
    }
  })

  it('accession <code> shows the full label record', () => {
    const fs = fixture()
    const lines = texts(executeLine(fs, atRoot(fs), 'accession spc-0001').lines)
    expect(lines[0]).toBe('SPC-0001 · charter.txt')
    expect(lines.join('\n')).toContain('text')
    expect(lines.join('\n')).toContain('/Hold (ARC-0000)')
    expect(lines.join('\n')).toContain('entries')
  })

  it('accession <name> finds by name; unknown needles refuse', () => {
    const fs = fixture()
    const lines = texts(executeLine(fs, atRoot(fs), 'accession "Nameplate Link"').lines)
    expect(lines[0]).toBe('MOD-0001 · Nameplate Link')
    expect(lines.join('\n')).toContain('opens')
    expect(lines.join('\n')).toContain('about')
    const refused = executeLine(fs, atRoot(fs), 'accession DRW-9999')
    expect(refused.lines[0]!.text).toContain('nothing catalogued')
  })

  it('open routes every kind to its owning module with the real launch context', () => {
    const fs = fixture()
    const drawer = executeLine(fs, atRoot(fs), 'open Projects')
    expect(drawer.effect).toEqual({
      type: 'open',
      appId: 'explorer',
      launch: { source: 'file', file: fs.nodes['projects']! },
    })
    const text = executeLine(fs, atRoot(fs), 'open charter.txt')
    expect(text.effect.type).toBe('open')
    expect((text.effect as { appId: string }).appId).toBe('notepad')
    const plate = executeLine(fs, atRoot(fs), 'open plate.png')
    expect((plate.effect as { appId: string }).appId).toBe('image-viewer')
    const link = executeLine(fs, atRoot(fs), 'open "Nameplate Link"')
    expect((link.effect as { appId: string }).appId).toBe('about')
  })

  it('THE NO-EVAL HARD RULE: eval-shaped input meets the unknown-command refusal', () => {
    const fs = fixture()
    for (const payload of [
      'eval("alert(1)")',
      'eval(`document.location="https://evil.example"`)',
      'new Function("return 1")',
      'window.fetch("/steal")',
      'flurb',
    ]) {
      const outcome = executeLine(fs, atRoot(fs), payload)
      expect(outcome.nextFs, payload).toBeNull()
      expect(outcome.effect.type, payload).toBe('none')
      expect(outcome.lines, payload).toHaveLength(1)
      expect(outcome.lines[0]!.kind, payload).toBe('err')
      expect(outcome.lines[0]!.text, payload).toContain('unknown command')
    }
  })
})

describe('terminal model · session persistence', () => {
  it('reads a valid payload back', () => {
    const fs = fixture()
    const session = readSessionState({ cwd: 'projects', history: ['ls', 'cd Projects'] }, fs)
    expect(session).toEqual({ cwd: 'projects', history: ['ls', 'cd Projects'] })
  })

  it('malformed payloads degrade to null (fresh session at the hold)', () => {
    const fs = fixture()
    expect(readSessionState(null, fs)).toBeNull()
    expect(readSessionState('nonsense', fs)).toBeNull()
    expect(readSessionState({}, fs)).toBeNull()
    expect(readSessionState({ cwd: 42 }, fs)).toBeNull()
    expect(readSessionState({ cwd: 'projects', history: 'ls' }, fs)).toBeNull()
    expect(readSessionState({ cwd: 'projects', history: ['ls', 7] }, fs)).toBeNull()
  })

  it('a cwd that no longer names a LIVE DRAWER degrades to null', () => {
    const fs = fixture()
    expect(readSessionState({ cwd: 'ghost', history: [] }, fs)).toBeNull()
    expect(readSessionState({ cwd: 'charter', history: [] }, fs)).toBeNull() // a specimen
    const pruned: FSState = { ...fs, nodes: { ...fs.nodes, nested: undefined } } as unknown as FSState
    delete (pruned.nodes as Record<string, unknown>)['nested']
    expect(readSessionState({ cwd: 'nested', history: [] }, pruned)).toBeNull()
  })

  it('history is capped and de-duplicated on read', () => {
    const fs = fixture()
    const many = Array.from({ length: HISTORY_CAP + 20 }, (_, i) => `cmd-${i}`)
    const session = readSessionState({ cwd: fs.rootId, history: many }, fs)
    expect(session?.history).toHaveLength(HISTORY_CAP)
    expect(session?.history[HISTORY_CAP - 1]).toBe(`cmd-${HISTORY_CAP + 19}`)
  })

  it('freshSession sits in the hold', () => {
    const fs = fixture()
    expect(freshSession(fs)).toEqual({ cwd: fs.rootId, history: [] })
  })

  it('bannerLines names a restored session', () => {
    expect(bannerLines(null).length).toBe(2)
    const restored = bannerLines({ cwd: 'root', history: ['a', 'b'] })
    expect(restored[restored.length - 1]!.text).toContain('2 command(s) remembered')
  })
})

describe('terminal model · history ring', () => {
  it('blank and repeated lines are not recorded', () => {
    expect(pushHistory([], '   ')).toEqual([])
    expect(pushHistory(['ls'], 'ls')).toEqual(['ls'])
    expect(pushHistory(['ls'], ' pwd ')).toEqual(['ls', 'pwd'])
  })

  it('the ring drops the oldest past the cap', () => {
    let history: readonly string[] = []
    for (let i = 0; i < HISTORY_CAP + 5; i++) history = pushHistory(history, `cmd-${i}`)
    expect(history).toHaveLength(HISTORY_CAP)
    expect(history[0]).toBe('cmd-5')
    expect(history[HISTORY_CAP - 1]).toBe(`cmd-${HISTORY_CAP + 4}`)
  })

  it('Up walks toward the oldest, Down back to the live draft', () => {
    const history = ['a', 'b', 'c']
    expect(historyUp(history, null)).toBe(2)
    expect(historyUp(history, 2)).toBe(1)
    expect(historyUp(history, 0)).toBe(0)
    expect(historyDown(history, 1)).toBe(2)
    expect(historyDown(history, 2)).toBeNull()
    expect(historyValue(history, 1)).toBe('b')
    expect(historyValue(history, null)).toBe('')
    expect(historyUp([], null)).toBeNull()
  })
})

describe('terminal model · Tab completion', () => {
  it('a unique prefix completes; drawers earn a slash, specimens a space', () => {
    const fs = fixture()
    expect(completeInput(fs, fs.rootId, 'Pro')).toEqual({ value: 'Projects/', options: [] })
    expect(completeInput(fs, fs.rootId, 'char')).toEqual({ value: 'charter.txt ', options: [] })
    expect(completeInput(fs, fs.rootId, 'Projects/')).toEqual({ value: 'Projects/Nested/', options: [] })
  })

  it('ambiguity completes to the longest common prefix and reports the options', () => {
    const ambiguous = createNode(fixture(), {
      id: 'chart2',
      parentId: 'root',
      name: 'chart-02.txt',
      kind: 'text',
      content: '',
      now: 9,
    })
    const outcome = completeInput(ambiguous, 'root', 'char')
    expect(outcome.value).toBe('chart')
    expect(outcome.options).toEqual(['chart-02.txt', 'charter.txt'])
  })

  it('no match leaves the input untouched', () => {
    const fs = fixture()
    expect(completeInput(fs, fs.rootId, 'zzz')).toEqual({ value: 'zzz', options: [] })
    expect(completeInput(fs, fs.rootId, 'Projects/Nes/x')).toEqual({
      value: 'Projects/Nes/x',
      options: [],
    })
  })
})

describe('terminal model · the accession walk matches the real catalog', () => {
  it('catalogLines carries every seeded node, in catalog (DFS) order', () => {
    const seed = seedFSState()
    const lines = catalogLines(seed).map((line) => line.text).join('\n')
    for (const node of Object.values(seed.nodes)) {
      expect(lines).toContain(node.accession)
      expect(lines).toContain(node.name)
    }
    // Real accession codes from the seed are on the page.
    expect(lines).toContain('DRW-0001')
    expect(lines).toContain('SPC-0001')
    expect(lines).toContain('ARC-0000')
  })

  it('catalogOrderNodes is the listChildren DFS — the catalog\'s own order', () => {
    const seed = seedFSState()
    const walked = catalogOrderNodes(seed)
    expect(walked).toHaveLength(Object.keys(seed.nodes).length - 1) // root excluded
    const first = walked[0]!
    expect(first.id).toBe('projects') // DRW-0001 leads the hold
  })
})
