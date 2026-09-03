/**
 * Field Notes markdown parser — the READING ROOM's typesetting mind (batch 2
 * brief 6). A hand-written markdown-SUBSET parser: pure string in → immutable
 * AST out. No DOM, no React, and no HTML string is ever produced — the
 * surface renders React elements from this AST alone, so raw HTML in a
 * specimen is escaped BY CONSTRUCTION (it becomes text nodes React prints as
 * visible ink).
 *
 * The subset (deliberate — the brief's v1 floor; every cut is recorded in the
 * session log):
 *
 * BLOCKS   heading levels 1–3 (ATX `# `), paragraph, unordered list
 *          (`-` `*` `+`), ordered list (`1.` / `1)` — the first item's number
 *          is honored as `start`), one level of list nesting by indentation,
 *          blockquote (recursive — any block may live inside), thematic rule
 *          (`---` `***` `___`, ≥3 markers).
 * INLINE   `**strong**`, `*emphasis*`, `` `code span` ``, `[label](url)` with
 *          HTTP(S)-only URL validation. Emphasis recurses over its inner
 *          text, so nesting (`**bold *em* end**`, code inside strong, a link
 *          inside emphasis) works.
 *
 * Deliberate refusals — each degrades to LITERAL TEXT, never an error, never
 * rendered HTML: tables, code BLOCKS, images, autolinks (`<https://…>` and
 * bare URLs stay text), raw HTML, setext headings, heading levels past 3,
 * `_`-emphasis (underscores stay literal so snake_case words survive),
 * lazy blockquote continuation, hard line breaks, escape sequences. Nothing
 * throws: a hostile specimen typesets as honest visible characters.
 */

/* --------------------------------- AST ------------------------------------ */

/** Inline content — the leaves of every block that carries prose. */
export type MdInline =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'strong'; readonly children: readonly MdInline[] }
  | { readonly type: 'em'; readonly children: readonly MdInline[] }
  | { readonly type: 'code'; readonly text: string }
  | { readonly type: 'link'; readonly label: string; readonly url: string }

/** One list item: its inline text plus any blocks nested by indentation. */
export interface MdListItem {
  readonly inline: readonly MdInline[]
  /** Indented list content under the item (one nesting level in practice). */
  readonly children: readonly MdBlock[]
}

/** Block-level constructs — a document is a flat run of these; quotes nest. */
export type MdBlock =
  | { readonly type: 'heading'; readonly level: 1 | 2 | 3; readonly inline: readonly MdInline[] }
  | { readonly type: 'paragraph'; readonly inline: readonly MdInline[] }
  | {
      readonly type: 'list'
      readonly ordered: boolean
      /** The first item's ordinal, rendered as `<ol start>` when not 1. */
      readonly start: number
      readonly items: readonly MdListItem[]
    }
  | { readonly type: 'blockquote'; readonly children: readonly MdBlock[] }
  | { readonly type: 'hr' }

/** A parsed document. Immutable by shape; safe to hand straight to React. */
export type MdDocument = readonly MdBlock[]

/* ------------------------------ link safety -------------------------------- */

/** URLs longer than this are refused (degrade to literal text). */
export const MAX_URL_LENGTH = 2048

const HTTP_URL = /^https?:\/\//i
const URL_FORBIDDEN = /[\s<>"'\\^`{}|]/ // whitespace + href-breaking punctuation

/**
 * The one door a URL passes through: HTTP(S) scheme only, bounded length, no
 * whitespace, no control characters, no href-breaking punctuation. `null` =
 * refused — the caller renders the construct as literal text instead.
 * `javascript:`, `data:`, `vbscript:`, relative URLs and protocol-relative
 * `//host` all fail here (none carries the `http(s)://` prefix).
 */
export function sanitizeUrl(url: string): string | null {
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return null
  if (!HTTP_URL.test(url)) return null
  if (URL_FORBIDDEN.test(url)) return null
  // eslint-disable-next-line no-control-regex -- hostile input is the point
  if (/[\u0000-\u001f\u007f]/.test(url)) return null
  return url
}

/* ------------------------------ inline pass -------------------------------- */

const isSpace = (ch: string | undefined): boolean => ch === ' ' || ch === '\t'

/**
 * Find the closing `*` of an emphasis run: a SOLO star (not adjacent to
 * another `*`, which would make it half of a `**` delimiter) that is not
 * preceded by whitespace (a closing delimiter hugs its word — `2 * 3 * 4`
 * stays literal). `-1` = none; the opener stays literal.
 */
function findEmClose(src: string, from: number): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] !== '*') continue
    if (src[j + 1] === '*' || src[j - 1] === '*') continue // strong delimiter
    if (isSpace(src[j - 1])) continue // not right-flanking
    return j
  }
  return -1
}

/**
 * Try a `[label](url)` link starting AT `src[i] === '['`. The label may not
 * contain `[` or a backtick (hostile shapes degrade rather than guess); the
 * URL must survive `sanitizeUrl` and may not contain `(`. Returns the label,
 * the sanitized URL and the index after the closing `)` — or null, and the
 * caller emits the `[` as literal text and scanning continues, so a refused
 * construct degrades to its visible source characters.
 */
function tryLink(src: string, i: number): { label: string; url: string; next: number } | null {
  const close = src.indexOf(']', i + 1)
  if (close === -1) return null
  const label = src.slice(i + 1, close)
  if (label.includes('[') || label.includes('`')) return null
  if (src[close + 1] !== '(') return null
  const end = src.indexOf(')', close + 2)
  if (end === -1) return null
  const url = src.slice(close + 2, end)
  if (url.includes('(')) return null
  const safe = sanitizeUrl(url)
  if (safe === null) return null
  return { label, url: safe, next: end + 1 }
}

/**
 * Parse inline markup into nodes. One left-to-right scan; emphasis recurses
 * over its inner text, so nesting works and unclosed markers degrade to
 * literal characters. Adjacent text runs are merged (degradation paths pile
 * `[`, `]`, `(` up next to each other).
 */
export function parseInline(src: string): readonly MdInline[] {
  const nodes: MdInline[] = []
  let text = ''
  let i = 0

  const flush = (): void => {
    if (text !== '') {
      nodes.push({ type: 'text', text })
      text = ''
    }
  }

  while (i < src.length) {
    const ch = src[i]

    // Code span FIRST: verbatim content, no nested markup — `**not bold**`
    // inside backticks stays literal. An unpaired backtick is literal.
    if (ch === '`') {
      const end = src.indexOf('`', i + 1)
      if (end !== -1) {
        flush()
        nodes.push({ type: 'code', text: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
      text += ch
      i += 1
      continue
    }

    // Strong `**…**`: the opener must hug a non-space, the closer must not
    // sit after a space. Unclosed → both stars are literal characters.
    if (ch === '*' && src[i + 1] === '*') {
      if (isSpace(src[i + 2]) || src[i + 2] === undefined) {
        text += '**'
        i += 2
        continue
      }
      let end = src.indexOf('**', i + 2)
      // A closing run of THREE stars (`***x***`) splits: two close the
      // strong, the third belongs to an emphasis inside it.
      if (end !== -1 && src[end + 2] === '*') end += 1
      if (end !== -1 && !isSpace(src[end - 1])) {
        flush()
        nodes.push({ type: 'strong', children: parseInline(src.slice(i + 2, end)) })
        i = end + 2
        continue
      }
      text += '**'
      i += 2
      continue
    }

    // Emphasis `*…*` via the solo-delimiter scan (so `*a **b** c*` works).
    if (ch === '*') {
      if (isSpace(src[i + 1]) || src[i + 1] === undefined) {
        text += ch
        i += 1
        continue
      }
      const end = findEmClose(src, i + 1)
      if (end !== -1) {
        flush()
        nodes.push({ type: 'em', children: parseInline(src.slice(i + 1, end)) })
        i = end + 1
        continue
      }
      text += ch
      i += 1
      continue
    }

    // Link: `[label](http(s)://…)` — anything refused stays literal.
    if (ch === '[') {
      const link = tryLink(src, i)
      if (link) {
        flush()
        nodes.push({ type: 'link', label: link.label, url: link.url })
        i = link.next
        continue
      }
      text += ch
      i += 1
      continue
    }

    text += ch
    i += 1
  }

  flush()
  const merged: MdInline[] = []
  for (const node of nodes) {
    const last = merged[merged.length - 1]
    if (node.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', text: last.text + node.text }
    } else {
      merged.push(node)
    }
  }
  return merged
}

/* ------------------------------- block pass -------------------------------- */

const HEADING_RE = /^(#{1,3})(?:[ \t]+(.*))?$/
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
// Leading SPACES only — a tab is not indentation in this subset (so a
// tab-prefixed `- x` reads as prose, consistently everywhere).
const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/
const QUOTE_RE = /^ {0,3}>/
const QUOTE_STRIP_RE = /^ {0,3}> ?/

interface ListLine {
  readonly indent: number
  readonly ordered: boolean
  readonly start: number
  readonly content: string
}

/** Recognize a list line; `null` = not a list. */
function matchList(line: string): ListLine | null {
  const m = LIST_RE.exec(line)
  if (!m) return null
  const marker = m[2]!
  const ordered = /\d/.test(marker)
  return {
    indent: m[1]!.length,
    ordered,
    start: ordered ? Number.parseInt(marker, 10) : 1,
    content: m[3]!.trimEnd(),
  }
}

/** Leading-space width of a line (tabs are not indentation — documented cut). */
function indentWidth(line: string): number {
  let n = 0
  while (line[n] === ' ') n += 1
  return n
}

const isBlank = (line: string): boolean => line.trim() === ''

/** A list item under construction (text lines + nested blocks). */
interface ItemAcc {
  readonly textParts: string[]
  readonly children: MdBlock[]
}

/**
 * Parse a run of normalized lines into blocks. Recursive: blockquote interiors
 * and list-item children re-enter here.
 */
function parseBlocks(lines: readonly string[]): MdDocument {
  const blocks: MdBlock[] = []
  let k = 0

  while (k < lines.length) {
    const line = lines[k]!
    if (isBlank(line)) {
      k += 1
      continue
    }

    // Thematic rule BEFORE list: `- - -` and `* * *` are rules, not items.
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' })
      k += 1
      continue
    }

    // ATX heading, levels 1–3 only; `#nospace` and `#### x` fall to prose.
    const heading = HEADING_RE.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        inline: parseInline((heading[2] ?? '').trim()),
      })
      k += 1
      continue
    }

    // Blockquote: consecutive `>` lines, one level stripped, parsed recursive.
    // No lazy continuation — a non-`>` line closes the quote.
    if (QUOTE_RE.test(line)) {
      const quoted: string[] = []
      while (k < lines.length && QUOTE_RE.test(lines[k]!)) {
        quoted.push(lines[k]!.replace(QUOTE_STRIP_RE, ''))
        k += 1
      }
      const children = parseBlocks(quoted)
      if (children.length > 0) blocks.push({ type: 'blockquote', children })
      continue
    }

    // List (with its nested and continued lines).
    const listLine = matchList(line)
    if (listLine) {
      const parsed = parseListBlock(lines, k, listLine)
      blocks.push(parsed.block)
      k = parsed.next
      continue
    }

    // Paragraph: lines until a blank or the next block construct.
    const para: string[] = [line.trim()]
    k += 1
    while (
      k < lines.length &&
      !isBlank(lines[k]!) &&
      !HEADING_RE.test(lines[k]!) &&
      !HR_RE.test(lines[k]!) &&
      !QUOTE_RE.test(lines[k]!) &&
      !matchList(lines[k]!)
    ) {
      para.push(lines[k]!.trim())
      k += 1
    }
    blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) })
  }

  return blocks
}

/**
 * Consume one list block starting at `lines[k]` (a list line whose own indent
 * is the list's base). Rules, in dispatch order:
 *
 * - BLANK: the list continues past it only if the next content line belongs —
 *   a list line at indent ≥ base, or prose at indent ≥ base+2.
 * - NESTED LIST (list line at indent ≥ base+2): recursed as its own list
 *   block and attached to the current item's `children` (which is how nested
 *   lists nest — the recursion consumes its own deeper indents).
 * - CONTINUATION (prose at indent ≥ base+2, not a rule): joined onto the
 *   current item's text with spaces.
 * - SIBLING (list line, same orderliness, indent within [base, base+2)):
 *   a new item of THIS list. An ordered/unordered flip closes it (the outer
 *   loop then opens a sibling list block).
 * - Anything else (shallow prose, a rule, a foreign construct): closes the
 *   list; the outer loop reads that line as the next block.
 */
function parseListBlock(
  lines: readonly string[],
  start: number,
  first: ListLine,
): { block: Extract<MdBlock, { type: 'list' }>; next: number } {
  const base = first.indent
  const items: ItemAcc[] = [{ textParts: [first.content], children: [] }]
  let k = start + 1

  while (k < lines.length) {
    const line = lines[k]!

    if (isBlank(line)) {
      let j = k
      while (j < lines.length && isBlank(lines[j]!)) j += 1
      if (j >= lines.length) break
      const next = lines[j]!
      const nextIndent = indentWidth(next)
      const belongs = matchList(next) ? nextIndent >= base : nextIndent >= base + 2
      if (!belongs) break
      k = j // the blank separated list content; the loop re-dispatches
      continue
    }

    const m = matchList(line)
    const ind = indentWidth(line)
    const current = items[items.length - 1]!

    if (m && ind >= base + 2) {
      const nested = parseListBlock(lines, k, m)
      current.children.push(nested.block)
      k = nested.next
      continue
    }

    if (!m && ind >= base + 2 && !HR_RE.test(line)) {
      current.textParts.push(line.trim()) // wrapped prose of the item
      k += 1
      continue
    }

    if (m && ind >= base && m.ordered === first.ordered) {
      items.push({ textParts: [m.content], children: [] })
      k += 1
      continue
    }

    break // shallow prose, a rule, or a foreign construct: not ours
  }

  return {
    block: {
      type: 'list',
      ordered: first.ordered,
      start: first.start,
      items: items.map((item) => ({
        inline: parseInline(item.textParts.join(' ')),
        children: item.children,
      })),
    },
    next: k,
  }
}

/**
 * Parse a specimen's markdown into its AST. Pure: same input, same output,
 * no throws. Line endings are normalized and trailing whitespace trimmed;
 * tabs do not count as indentation.
 */
export function parseDocument(src: string): MdDocument {
  const lines = src
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
  return parseBlocks(lines)
}
