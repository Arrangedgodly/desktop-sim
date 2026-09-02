/**
 * Terminal model — the pure, React-free, DOM-free math behind the Catalog
 * Terminal (federated session 1, docs/FEDERATED-SESSIONS.md). Everything
 * testable without a browser lives here: the command tokenizer, path
 * resolution over the real catalog tree, the command EXECUTOR (pure state in,
 * lines + optional next-FS + an effect descriptor out — it never touches a
 * store; the surface commits `nextFs` through the FS store's single atomic
 * seam), the history ring, session-state validation, and the prompt/catalog
 * formatting.
 *
 * Import discipline (docs/APP-CONTRACT.md — notepad-model's, verbatim): node
 * TYPES ride the app-registry contract (`FSNodeRef`, `FileLaunch`); the pure
 * catalog ops (`createNode`, `deleteNode`, `listChildren`, `pathOf`) are the
 * sanctioned lib/fs surface every app drives. No store access, no DOM, no
 * timers, no eval — the HARD RULE is structural: input is only ever matched
 * against a fixed command table, so `eval("…")` and backtick payloads meet
 * the same unknown-command refusal as `flurb`.
 */

import {
  createNode,
  deleteNode,
  FSError,
  listChildren,
  pathOf,
} from '../../lib/fs'
import type { FSState } from '../../lib/fs'
import {
  EXPLORER_APP_ID,
  IMAGE_VIEWER_APP_ID,
  NOTEPAD_APP_ID,
  type FileLaunch,
  type FSNodeRef,
} from '../../platform/app-registry'

/* --------------------------------------------------------------------------
 * Output lines
 * ------------------------------------------------------------------------ */

/** One rendered console line. `err` is still amber (monochrome well law) —
 *  brighter, with a leading `!`; oxide never enters a display well. */
export interface TermLine {
  readonly kind: 'out' | 'err' | 'dim' | 'in'
  readonly text: string
}

const out = (text: string): TermLine => ({ kind: 'out', text })
const err = (text: string): TermLine => ({ kind: 'err', text: `! ${text}` })
const dim = (text: string): TermLine => ({ kind: 'dim', text })

/** Side effects the executor may request — interpreted by the surface. */
export type CommandEffect =
  | { readonly type: 'none' }
  | { readonly type: 'clear' }
  | { readonly type: 'cd'; readonly cwd: string }
  | { readonly type: 'open'; readonly appId: string; readonly launch: FileLaunch }

/** One executed command line's full outcome. */
export interface ExecOutcome {
  readonly lines: readonly TermLine[]
  /** The next catalog state, when the command mutated the archive — the
   *  surface commits it through `useFSStore.getState().commit(...)`. */
  readonly nextFs: FSState | null
  readonly effect: CommandEffect
}

const NO_CHANGE: ExecOutcome = { lines: [], nextFs: null, effect: { type: 'none' } }

/* --------------------------------------------------------------------------
 * Session state (rides the WM window record's opaque appState)
 * ------------------------------------------------------------------------ */

/** The terminal's persisted window payload (structured-clone-safe by shape). */
export interface TerminalSession {
  /** Node id of the drawer the shell sits in. */
  readonly cwd: string
  /** Command history, OLDEST → NEWEST, capped. */
  readonly history: readonly string[]
}

/** How many commands the line remembers (the ring's bound). */
export const HISTORY_CAP = 64

/**
 * Defensively read the session off an UNTRUSTED `appState` (it crossed the
 * persistence boundary; validate.ts carries it verbatim). `null` = absent,
 * malformed, or not the terminal's payload — callers fall back to a fresh
 * session at the hold root. The cwd must name a LIVE DRAWER: a stale id (the
 * drawer was decommissioned elsewhere) or a specimen id degrades to null.
 */
export function readSessionState(appState: unknown, fs: FSState): TerminalSession | null {
  if (typeof appState !== 'object' || appState === null) return null
  const record = appState as Record<string, unknown>
  const cwd = record['cwd']
  const history = record['history']
  if (typeof cwd !== 'string') return null
  const node = fs.nodes[cwd]
  if (!node || node.kind !== 'folder') return null
  if (!Array.isArray(history)) return null
  const clean: string[] = []
  for (const entry of history) {
    if (typeof entry !== 'string') return null // hostile payload → whole state refused
    if (entry.length > 0 && entry !== clean[clean.length - 1]) clean.push(entry)
  }
  return { cwd, history: clean.slice(-HISTORY_CAP) }
}

/** The fresh session — the shell sits in the hold itself. */
export function freshSession(fs: FSState): TerminalSession {
  return { cwd: fs.rootId, history: [] }
}

/* --------------------------------------------------------------------------
 * Tokenizer
 * ------------------------------------------------------------------------ */

/**
 * Split a command line into words. Double quotes group words (catalog labels
 * legitimately contain spaces: `cat "Science Officer Nameplate"`); returns
 * null on an unterminated quote — the executor answers with an in-world
 * refusal. No escapes, no substitution: there is nothing to substitute INTO
 * (the no-eval hard rule is structural).
 */
export function tokenizeLine(line: string): readonly string[] | null {
  const words: string[] = []
  let current = ''
  let inQuotes = false
  let any = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
      any = true
      continue
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current.length > 0 || any) words.push(current)
      current = ''
      any = false
      continue
    }
    current += char
    any = true
  }
  if (inQuotes) return null
  if (current.length > 0 || any) words.push(current)
  return words
}

/* --------------------------------------------------------------------------
 * Path resolution (the catalog's own law: sibling names are unique
 * case-insensitively, so resolution matches case-insensitively)
 * ------------------------------------------------------------------------ */

/** Resolve a shell path (`/`-rooted, `.`, `..`, relative names) to a node id,
 *  or null when a segment names nothing. `''` and `.` are the cwd; `..` at
 *  the hold root stays at the root (there is no drawer above the hold). */
export function resolvePath(fs: FSState, cwdId: string, input: string): string | null {
  const start = input.startsWith('/') ? fs.rootId : cwdId
  const segments = input.split('/').filter((segment) => segment.length > 0)
  let current = start
  for (const segment of segments) {
    if (segment === '.') continue
    if (segment === '..') {
      const parent = fs.nodes[current]?.parentId
      current = parent ?? fs.rootId
      continue
    }
    const lowered = segment.toLowerCase()
    const child = listChildren(fs, current).find(
      (node) => node.name.toLowerCase() === lowered,
    )
    if (!child) return null
    current = child.id
  }
  return current
}

/* --------------------------------------------------------------------------
 * Formatting (prompt, listings, label records, banner)
 * ------------------------------------------------------------------------ */

const KIND_WORDS: Readonly<Record<FSNodeRef['kind'], string>> = {
  folder: 'drawer',
  text: 'text',
  image: 'plate',
  'app-link': 'module',
}

/** `2087-03-14 09:31Z` — the mission-epoch stamp style of the catalog. */
function fmtEpoch(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}Z`
}

/**
 * The shell prompt: the cwd's own accession code plus its path from the hold
 * — `ARC-0000:/>` in the hold, `DRW-0001:/Projects>` inside the Projects
 * drawer. Accession codes are the archive's own vocabulary.
 */
export function promptFor(fs: FSState, cwdId: string): string {
  const node = fs.nodes[cwdId] ?? fs.nodes[fs.rootId]!
  const path = pathOf(fs, node.id) ?? `/${node.name}`
  const fromHold = path.split('/').slice(2).join('/')
  return `${node.accession}:/${fromHold}>`
}

/** Dot-leader field for label records: `kind .......... text specimen`. */
function field(label: string, value: string): TermLine {
  return out(`${`${label} `.padEnd(15, '.')} ${value}`)
}

/** The full label record for one specimen (the `accession <arg>` view). */
export function labelRecordLines(fs: FSState, node: FSNodeRef): readonly TermLine[] {
  const parent = node.parentId === null ? null : fs.nodes[node.parentId]
  const lines: TermLine[] = [out(`${node.accession} · ${node.name}`)]
  lines.push(field('kind', KIND_WORDS[node.kind]))
  lines.push(
    field(
      'filed under',
      parent
        ? `${pathOf(fs, parent.id) ?? `/${parent.name}`} (${parent.accession})`
        : 'the hold itself',
    ),
  )
  lines.push(field('accessioned', fmtEpoch(node.accessionedAt)))
  switch (node.kind) {
    case 'text':
      lines.push(field('entries', `${node.content === '' ? 0 : node.content.split('\n').length} lines`))
      break
    case 'image':
      lines.push(field('carrier', 'image data — read it in the Plate Viewer'))
      break
    case 'app-link':
      lines.push(field('opens', node.appId))
      break
    case 'folder':
      lines.push(field('holds', `${listChildren(fs, node.id).length} catalogued`))
      break
  }
  return lines
}

/** The whole catalog, walked depth-first in catalog order (`listChildren`
 *  per drawer) — columns, dot leaders, depth indents. */
export function catalogLines(fs: FSState): readonly TermLine[] {
  const lines: TermLine[] = [dim('CATALOG — THE SURVEY ARCHIVE')]
  const row = (accession: string, kind: string, name: string, depth: number, slash: boolean): void => {
    const prefix = `${'  '.repeat(depth)}${accession}  ${kind.padEnd(7)}`
    const leader = '.'.repeat(Math.max(3, 34 - prefix.length))
    lines.push(out(`${prefix}${leader} ${name}${slash ? '/' : ''}`))
  }
  row('ARC-0000', 'hold', 'Hold', 0, true)
  const walk = (id: string, depth: number): void => {
    for (const node of listChildren(fs, id)) {
      row(node.accession, KIND_WORDS[node.kind], node.name, depth, node.kind === 'folder')
      if (node.kind === 'folder') walk(node.id, depth + 1)
    }
  }
  walk(fs.rootId, 0)
  return lines
}

/** Mount-time banner. `restored` names a session that came back across a
 *  reload (cwd + history survived). */
export function bannerLines(restored: TerminalSession | null): readonly TermLine[] {
  const lines: TermLine[] = [
    dim('HOLD/OS CATALOG TERMINAL'),
    dim('the living archive on a command line — type help for the plate.'),
  ]
  if (restored !== null) {
    lines.push(dim(`session restored — ${restored.history.length} command(s) remembered.`))
  }
  return lines
}

/* --------------------------------------------------------------------------
 * History ring
 * ------------------------------------------------------------------------ */

/** Record an executed line: blanks and immediate repeats are not recorded;
 *  the ring drops the OLDEST past HISTORY_CAP. */
export function pushHistory(history: readonly string[], line: string): readonly string[] {
  const trimmed = line.trim()
  if (trimmed.length === 0) return history
  if (history[history.length - 1] === trimmed) return history
  const next = [...history, trimmed]
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next
}

/**
 * History navigation cursor: `null` = the live draft (newest position),
 * a number = an index into the history array (oldest → newest).
 * Up walks toward the OLDEST; Down walks back toward the draft.
 */
export type HistoryCursor = number | null

export function historyUp(history: readonly string[], cursor: HistoryCursor): HistoryCursor {
  if (history.length === 0) return null
  return cursor === null ? history.length - 1 : Math.max(0, cursor - 1)
}

export function historyDown(history: readonly string[], cursor: HistoryCursor): HistoryCursor {
  if (cursor === null) return null
  return cursor + 1 > history.length - 1 ? null : cursor + 1
}

export function historyValue(history: readonly string[], cursor: HistoryCursor): string {
  return cursor === null ? '' : (history[cursor] ?? '')
}

/* --------------------------------------------------------------------------
 * Tab completion (sibling names)
 * ------------------------------------------------------------------------ */

export interface CompletionOutcome {
  /** The completed input value (unchanged when nothing matched). */
  readonly value: string
  /** Ambiguous matches, for the surface to echo. */
  readonly options: readonly string[]
}

/**
 * Complete the TRAILING segment of the input against the sibling names of
 * the drawer that segment sits in (the cwd by default). One match completes
 * (a drawer earns a trailing `/`, a specimen a trailing space); many matches
 * complete to the longest common prefix and report the candidates.
 */
export function completeInput(fs: FSState, cwdId: string, value: string): CompletionOutcome {
  const slash = value.lastIndexOf('/')
  const dirPart = slash >= 0 ? value.slice(0, slash + 1) : ''
  const prefix = slash >= 0 ? value.slice(slash + 1) : value
  const baseId = dirPart === '' ? cwdId : resolvePath(fs, cwdId, dirPart)
  if (baseId === null) return { value, options: [] }
  const base = fs.nodes[baseId]
  if (!base || base.kind !== 'folder') return { value, options: [] }

  const lowered = prefix.toLowerCase()
  const matches = listChildren(fs, baseId)
    .filter((node) => node.name.toLowerCase().startsWith(lowered))
    .map((node) => node.name)
  if (matches.length === 0) return { value, options: [] }

  if (matches.length === 1) {
    const name = matches[0]!
    const node = listChildren(fs, baseId).find((child) => child.name === name)!
    const terminator = node.kind === 'folder' ? '/' : ' '
    return { value: `${dirPart}${name}${terminator}`, options: [] }
  }

  let common = matches[0]!
  for (const candidate of matches.slice(1)) {
    while (!candidate.toLowerCase().startsWith(common.toLowerCase())) {
      common = common.slice(0, -1)
    }
  }
  return { value: `${dirPart}${common}`, options: [...matches].sort() }
}

/* --------------------------------------------------------------------------
 * The executor
 * ------------------------------------------------------------------------ */

/** `ls` row for one node — accession, kind, name (drawers earn a slash). */
function lsRow(node: FSNodeRef): string {
  return `${node.accession}  ${KIND_WORDS[node.kind].padEnd(7)} ${node.name}${
    node.kind === 'folder' ? '/' : ''
  }`
}

/** In-world refusal text for a thrown FSError (code decides the wording). */
function refusalFor(error: FSError): string {
  switch (error.code) {
    case 'invalid-name':
      return 'a catalog label may not be empty, and may not contain “/”'
    case 'name-collision':
      return error.message.replace(/^\[[a-z-]+\]\s*/, '')
    default:
      return error.message.replace(/^\[[a-z-]+\]\s*/, '')
  }
}

/** The id a just-created node landed under (diff of the node maps). */
function createdId(before: FSState, after: FSState): string | null {
  for (const id of Object.keys(after.nodes)) {
    if (!(id in before.nodes)) return id
  }
  return null
}

const HELP_LINES: readonly TermLine[] = [
  dim('command plate — every command works on the REAL catalog:'),
  dim('  help                  this plate'),
  dim('  clear                 wipe the screen'),
  dim('  pwd                   print the current drawer'),
  dim('  ls [path]             list a drawer (default: here)'),
  dim('  cd <path>             sit in a drawer (“cd ..” climbs)'),
  dim('  cat <specimen>        print a text specimen'),
  dim('  mkdir <name>          accession a new drawer here'),
  dim('  touch <name>          accession a new text specimen here'),
  dim('  rm [-r] <name>        decommission a specimen or EMPTY drawer'),
  dim('  accession [code|name] the whole catalog, or one label record'),
  dim('  open <name>           hand a node to its owning module'),
  dim('  Tab completes sibling names · ↑/↓ walk history · Esc clears the line'),
]

/**
 * Execute one command line against the live catalog state. PURE: mutations
 * come back as `nextFs` (the surface commits them), side effects as
 * descriptors (`clear`, `cd`, `open`) — this function never touches a store,
 * the DOM, or anything dynamic. Unknown commands — eval-shaped payloads
 * included — meet the same polite refusal.
 */
export function executeLine(
  fs: FSState,
  session: TerminalSession,
  raw: string,
  now: number = Date.now(),
): ExecOutcome {
  const line = raw.trim()
  if (line.length === 0) return NO_CHANGE

  const words = tokenizeLine(line)
  if (words === null) {
    return { ...NO_CHANGE, lines: [err('unterminated quote — close the " to group words')] }
  }

  const command = words[0]!.toLowerCase()
  const args = words.slice(1)
  const cwd = session.cwd

  switch (command) {
    case 'help':
      return { ...NO_CHANGE, lines: HELP_LINES }

    case 'clear':
      return { lines: [], nextFs: null, effect: { type: 'clear' } }

    case 'pwd': {
      const path = pathOf(fs, cwd)
      return { ...NO_CHANGE, lines: [out(path ?? '?')] }
    }
  }

  // Commands below share a "resolve one path argument" shape.
  const argErr = (usage: string): ExecOutcome => ({ ...NO_CHANGE, lines: [err(usage)] })

  if (command === 'ls') {
    const targetId = args.length === 0 ? cwd : resolvePath(fs, cwd, args[0]!)
    if (targetId === null) return argErr(`no such path: ${args[0] ?? ''}`)
    const node = fs.nodes[targetId]!
    if (node.kind !== 'folder') return { ...NO_CHANGE, lines: [out(lsRow(node))] }
    const children = listChildren(fs, targetId)
    if (children.length === 0) return { ...NO_CHANGE, lines: [out('(empty drawer)')] }
    return { ...NO_CHANGE, lines: children.map((child) => out(lsRow(child))) }
  }

  if (command === 'cd') {
    const targetId = args.length === 0 ? fs.rootId : resolvePath(fs, cwd, args[0]!)
    if (targetId === null) return argErr(`no such path: ${args[0] ?? ''}`)
    const node = fs.nodes[targetId]!
    if (node.kind !== 'folder') {
      return argErr(`${node.accession} ${node.name} is a specimen, not a drawer — cd takes a drawer`)
    }
    return { lines: [], nextFs: null, effect: { type: 'cd', cwd: targetId } }
  }

  if (command === 'cat') {
    if (args.length === 0) return argErr('usage: cat <specimen>')
    const targetId = resolvePath(fs, cwd, args[0]!)
    if (targetId === null) return argErr(`no such specimen: ${args[0] ?? ''}`)
    const node = fs.nodes[targetId]!
    switch (node.kind) {
      case 'folder':
        return argErr(`${node.accession} ${node.name} is a drawer — cat reads specimens`)
      case 'image':
        return argErr(`${node.accession} ${node.name} is a plate — open it in the Plate Viewer (open ${args[0]})`)
      case 'app-link':
        return argErr(`${node.accession} ${node.name} is a module reference — try: open ${args[0]}`)
      case 'text':
        return {
          ...NO_CHANGE,
          lines:
            node.content === ''
              ? [out('(empty specimen)')]
              : node.content.split('\n').map((text) => out(text)),
        }
    }
  }

  if (command === 'mkdir' || command === 'touch') {
    if (args.length === 0) {
      return argErr(command === 'mkdir' ? 'usage: mkdir <name>' : 'usage: touch <name>')
    }
    const name = args[0]!
    if (name.includes('/')) {
      return argErr(
        command === 'mkdir'
          ? 'a new drawer is filed by NAME in the current drawer — cd first, then mkdir'
          : 'a new specimen is filed by NAME in the current drawer — cd first, then touch',
      )
    }
    try {
      const next =
        command === 'mkdir'
          ? createNode(fs, { parentId: cwd, name, kind: 'folder', now })
          : createNode(fs, { parentId: cwd, name, kind: 'text', content: '', now })
      const id = createdId(fs, next)
      const node = id === null ? null : next.nodes[id]
      if (node) {
        const filed = pathOf(next, cwd) ?? '/'
        return {
          lines: [
            out(
              command === 'mkdir'
                ? `accessioned ${node.accession} — “${node.name}” filed in ${filed}`
                : `accessioned ${node.accession} — “${node.name}” recorded as a text specimen in ${filed}`,
            ),
          ],
          nextFs: next,
          effect: { type: 'none' },
        }
      }
      return { lines: [out('accessioned.')], nextFs: next, effect: { type: 'none' } }
    } catch (error) {
      if (!(error instanceof FSError)) throw error
      return argErr(refusalFor(error))
    }
  }

  if (command === 'rm') {
    const flags = args.filter((arg) => arg.startsWith('-'))
    const names = args.filter((arg) => !arg.startsWith('-'))
    const recursive = flags.includes('-r')
    if (flags.some((flag) => flag !== '-r')) return argErr('usage: rm [-r] <name> — the only flag is -r')
    if (names.length === 0) return argErr('usage: rm [-r] <name>')
    const targetId = resolvePath(fs, cwd, names[0]!)
    if (targetId === null) return argErr(`no such specimen or drawer: ${names[0] ?? ''}`)
    const node = fs.nodes[targetId]!
    if (node.id === fs.rootId) return argErr('the hold itself is not removable')
    if (node.kind === 'folder' && !recursive) {
      const held = listChildren(fs, targetId).length
      if (held > 0) {
        return argErr(
          `“${node.name}” is a non-empty drawer (${held} catalogued) — decommissioning it takes: rm -r ${names[0]}`,
        )
      }
    }
    try {
      const next = deleteNode(fs, targetId)
      return {
        lines: [out(`decommissioned ${node.accession} — “${node.name}” struck from the catalog`)],
        nextFs: next,
        effect: { type: 'none' },
      }
    } catch (error) {
      if (!(error instanceof FSError)) throw error
      return argErr(refusalFor(error))
    }
  }

  if (command === 'accession') {
    if (args.length === 0) return { ...NO_CHANGE, lines: catalogLines(fs) }
    const needle = args[0]!.toLowerCase()
    const byCode = Object.values(fs.nodes).find(
      (node) => node.accession.toLowerCase() === needle,
    )
    const node =
      byCode ??
      catalogOrderNodes(fs).find((candidate) => candidate.name.toLowerCase() === needle)
    if (!node) return argErr(`nothing catalogued under “${args[0]}”`)
    return { ...NO_CHANGE, lines: labelRecordLines(fs, node) }
  }

  if (command === 'open') {
    if (args.length === 0) return argErr('usage: open <name>')
    const targetId = resolvePath(fs, cwd, args[0]!)
    if (targetId === null) return argErr(`no such specimen or drawer: ${args[0] ?? ''}`)
    const node = fs.nodes[targetId]!
    const appId =
      node.kind === 'app-link'
        ? node.appId
        : node.kind === 'folder'
          ? EXPLORER_APP_ID
          : node.kind === 'text'
            ? NOTEPAD_APP_ID
            : IMAGE_VIEWER_APP_ID
    const launch: FileLaunch = { source: 'file', file: node }
    return {
      lines: [out(`passing “${node.name}” to its owning module…`)],
      nextFs: null,
      effect: { type: 'open', appId, launch },
    }
  }

  // Unknown command — the NO-EVAL hard rule's visible face: nothing is ever
  // interpreted, matched, or executed beyond this fixed table. eval("…"),
  // backtick payloads, and “flurb” all land here together.
  return {
    ...NO_CHANGE,
    lines: [err(`unknown command “${words[0]}” — type help for the command plate`)],
  }
}

/**
 * All nodes, depth-first in catalog order (the `accession` walk's order):
 * each drawer's children in `listChildren` order, recursing in place — the
 * tree's own reading order, not a flat accession sort (a flat sort would
 * group every drawer before every specimen and lose the drawer structure).
 */
export function catalogOrderNodes(fs: FSState): readonly FSNodeRef[] {
  const ordered: FSNodeRef[] = []
  const walk = (id: string): void => {
    for (const node of listChildren(fs, id)) {
      ordered.push(node)
      if (node.kind === 'folder') walk(node.id)
    }
  }
  walk(fs.rootId)
  return ordered
}
