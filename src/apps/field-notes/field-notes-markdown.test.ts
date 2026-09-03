import { describe, expect, it } from 'vitest'
import {
  MAX_URL_LENGTH,
  parseDocument,
  parseInline,
  sanitizeUrl,
  type MdInline,
} from './field-notes-markdown'

/**
 * Batch 2 brief 6, acceptance 1 + 3 — the parser tested HARD: every
 * construct, nesting, and the hostile shapes (raw HTML stays visible text,
 * javascript: URLs refuse, malformed links degrade to literal source). All
 * pure — no DOM, no React, nothing may throw.
 */

/** Inline nodes as a compact shape for assertions: [['text','a'],['em',…]]. */
function shapes(nodes: readonly MdInline[]): unknown[] {
  return nodes.map((n) => {
    switch (n.type) {
      case 'text':
        return ['text', n.text]
      case 'code':
        return ['code', n.text]
      case 'link':
        return ['link', n.label, n.url]
      default:
        return [n.type, shapes(n.children)]
    }
  })
}

/* ------------------------------ link safety -------------------------------- */

describe('field-notes · sanitizeUrl (the one door a URL passes through)', () => {
  it('admits http and https, any case, preserving the URL verbatim', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com')
    expect(sanitizeUrl('https://example.com/a/b?c=d#e')).toBe('https://example.com/a/b?c=d#e')
    expect(sanitizeUrl('HTTPS://EXAMPLE.COM/PATH')).toBe('HTTPS://EXAMPLE.COM/PATH')
  })

  it('refuses every dangerous scheme and shape — null, never a guess', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>1</script>',
      'vbscript:msgbox(1)',
      'ftp://files.example.com',
      'mailto:a@example.com',
      '//protocol-relative.example.com',
      '/relative/path',
      'folder/specimen.txt',
      '#fragment',
      '',
    ]) {
      expect(sanitizeUrl(hostile), hostile).toBeNull()
    }
  })

  it('refuses whitespace, control characters, and href-breaking punctuation', () => {
    expect(sanitizeUrl('https://a b')).toBeNull()
    expect(sanitizeUrl('https://a\tb')).toBeNull()
    expect(sanitizeUrl('https://a\nb')).toBeNull()
    expect(sanitizeUrl('https://a\u0000b')).toBeNull()
    expect(sanitizeUrl('https://a\u007fb')).toBeNull()
    expect(sanitizeUrl('https://a"b')).toBeNull()
    expect(sanitizeUrl("https://a'b")).toBeNull()
    expect(sanitizeUrl('https://a<b')).toBeNull()
  })

  it('refuses absurd lengths (bounded hostility)', () => {
    expect(sanitizeUrl(`https://a.com/${'x'.repeat(MAX_URL_LENGTH)}`)).toBeNull()
    expect(sanitizeUrl(`https://a.com/${'x'.repeat(64)}`)).toBe(`https://a.com/${'x'.repeat(64)}`)
  })
})

/* -------------------------------- inline ----------------------------------- */

describe('field-notes · parseInline (the inline subset)', () => {
  it('plain text is one text node', () => {
    expect(shapes(parseInline('just words'))).toEqual([['text', 'just words']])
  })

  it('strong, emphasis, and code spans parse', () => {
    expect(shapes(parseInline('a **bold** b'))).toEqual([
      ['text', 'a '],
      ['strong', [['text', 'bold']]],
      ['text', ' b'],
    ])
    expect(shapes(parseInline('a *em* b'))).toEqual([
      ['text', 'a '],
      ['em', [['text', 'em']]],
      ['text', ' b'],
    ])
    expect(shapes(parseInline('run `cmd --flag` now'))).toEqual([
      ['text', 'run '],
      ['code', 'cmd --flag'],
      ['text', ' now'],
    ])
  })

  it('emphasis NESTS recursively — bold in italic, italic in bold, code and links inside both', () => {
    expect(shapes(parseInline('*a **b** c*'))).toEqual([
      ['em', [['text', 'a '], ['strong', [['text', 'b']]], ['text', ' c']]],
    ])
    expect(shapes(parseInline('**a *b* c**'))).toEqual([
      ['strong', [['text', 'a '], ['em', [['text', 'b']]], ['text', ' c']]],
    ])
    expect(shapes(parseInline('**run `cmd` end**'))).toEqual([
      ['strong', [['text', 'run '], ['code', 'cmd'], ['text', ' end']]],
    ])
    expect(shapes(parseInline('*see [docs](https://x.com)*'))).toEqual([
      ['em', [['text', 'see '], ['link', 'docs', 'https://x.com']]],
    ])
    // The triple delimiter: ***x*** is strong around em.
    expect(shapes(parseInline('***x***'))).toEqual([['strong', [['em', [['text', 'x']]]]]])
  })

  it('code spans win over emphasis — markup inside backticks stays literal', () => {
    expect(shapes(parseInline('`**not bold**`'))).toEqual([['code', '**not bold**']])
    expect(shapes(parseInline('`a * b`'))).toEqual([['code', 'a * b']])
  })

  it('unclosed markers degrade to literal characters', () => {
    expect(shapes(parseInline('**a'))).toEqual([['text', '**a']])
    expect(shapes(parseInline('*a'))).toEqual([['text', '*a']])
    expect(shapes(parseInline('a `b'))).toEqual([['text', 'a `b']])
    expect(shapes(parseInline('**a *b**'))).toEqual([['strong', [['text', 'a *b']]]])
  })

  it('spaced and flanking-star prose stays literal (math, bullets-as-text)', () => {
    expect(shapes(parseInline('2 * 3 * 4'))).toEqual([['text', '2 * 3 * 4']])
    expect(shapes(parseInline('* not a list, just a star'))).toEqual([
      ['text', '* not a list, just a star'],
    ])
  })

  it('underscores are NEVER emphasis — snake_case survives verbatim', () => {
    expect(shapes(parseInline('some_var_name and __dunder__'))).toEqual([
      ['text', 'some_var_name and __dunder__'],
    ])
  })

  it('adjacent literal runs MERGE into one text node', () => {
    expect(shapes(parseInline('x [a](javascript:1) y'))).toEqual([['text', 'x [a](javascript:1) y']])
  })
})

/* ------------------------------ inline: links ------------------------------- */

describe('field-notes · links (the only sanctioned external door)', () => {
  it('parses [label](https://…) with the URL carried verbatim', () => {
    expect(shapes(parseInline('go [there](https://example.com/a) now'))).toEqual([
      ['text', 'go '],
      ['link', 'there', 'https://example.com/a'],
      ['text', ' now'],
    ])
    expect(shapes(parseInline('[x](http://plain.example.com)'))).toEqual([
      ['link', 'x', 'http://plain.example.com'],
    ])
  })

  it('refuses javascript:/data:/relative URLs — the whole construct degrades to literal text', () => {
    expect(shapes(parseInline('[click](javascript:alert(1))'))).toEqual([
      ['text', '[click](javascript:alert(1))'],
    ])
    expect(shapes(parseInline('[click](data:text/html,x)'))).toEqual([['text', '[click](data:text/html,x)']])
    expect(shapes(parseInline('[rel](./sibling.txt)'))).toEqual([['text', '[rel](./sibling.txt)']])
  })

  it('malformed links degrade to literal text, never a broken anchor', () => {
    for (const src of [
      '[unclosed](https://x.com', // no closing paren
      '[unclosed]  (https://x.com)', // gap between ] and (
      '[no url]()', // empty url
      '[no close](https://x.com', // truncated
      'just a [bracket', // no ] at all
      '[a](https://x.com/y(z))', // unbalanced parens in the url
      '[la`bel](https://x.com)', // backtick in the label
      '[[nested]](https://x.com)', // bracket in the label
    ]) {
      expect(shapes(parseInline(src)), src).toEqual([['text', src]])
    }
  })

  it('autolinking is OFF — angle and bare URLs stay plain text', () => {
    expect(shapes(parseInline('<https://example.com>'))).toEqual([['text', '<https://example.com>']])
    expect(shapes(parseInline('see https://example.com there'))).toEqual([
      ['text', 'see https://example.com there'],
    ])
  })

  it('image syntax has no image in v1 — the bang survives and the link degrades honestly', () => {
    // Documented degradation: `!` is punctuation; a valid [alt](https://…)
    // still links (there are no <img> elements anywhere in this module).
    expect(shapes(parseInline('![alt](https://example.com/x.png)'))).toEqual([
      ['text', '!'],
      ['link', 'alt', 'https://example.com/x.png'],
    ])
    expect(shapes(parseInline('![alt](javascript:1)'))).toEqual([['text', '![alt](javascript:1)']])
  })
})

/* -------------------------------- blocks ----------------------------------- */

describe('field-notes · parseDocument (block constructs)', () => {
  it('empty and whitespace-only documents parse to nothing', () => {
    expect(parseDocument('')).toEqual([])
    expect(parseDocument(' \n \n')).toEqual([])
  })

  it('headings: ATX levels 1–3; #nospace and #### degrade to prose', () => {
    const doc = parseDocument('# One\n## Two\n### Three\n\n#Nospace\n\n#### Four\n\n#')
    expect(doc).toEqual([
      { type: 'heading', level: 1, inline: [{ type: 'text', text: 'One' }] },
      { type: 'heading', level: 2, inline: [{ type: 'text', text: 'Two' }] },
      { type: 'heading', level: 3, inline: [{ type: 'text', text: 'Three' }] },
      { type: 'paragraph', inline: [{ type: 'text', text: '#Nospace' }] },
      { type: 'paragraph', inline: [{ type: 'text', text: '#### Four' }] },
      { type: 'heading', level: 1, inline: [] },
    ])
  })

  it('headings carry inline markup', () => {
    const doc = parseDocument('## Notes on *Vela IX*')
    expect(doc[0]).toEqual({
      type: 'heading',
      level: 2,
      inline: [{ type: 'text', text: 'Notes on ' }, { type: 'em', children: [{ type: 'text', text: 'Vela IX' }] }],
    })
  })

  it('paragraphs: consecutive lines soft-wrap (joined with spaces), trailing space trimmed', () => {
    const doc = parseDocument('line one\nline two   \nline three')
    expect(doc).toEqual([{ type: 'paragraph', inline: [{ type: 'text', text: 'line one line two line three' }] }])
  })

  it('a list line INTERRUPTS a paragraph (no blank line required)', () => {
    const doc = parseDocument('prose line\n- item')
    expect(doc.map((b) => b.type)).toEqual(['paragraph', 'list'])
    expect(doc[1]).toMatchObject({ ordered: false, items: [{ inline: [expect.objectContaining({ type: 'text' })] }] })
  })

  it('thematic rules: ---, ***, ___, and spaced forms; -- is prose', () => {
    expect(parseDocument('---')[0]).toEqual({ type: 'hr' })
    expect(parseDocument('***')[0]).toEqual({ type: 'hr' })
    expect(parseDocument('___')[0]).toEqual({ type: 'hr' })
    expect(parseDocument('- - -')[0]).toEqual({ type: 'hr' }) // rule BEFORE list
    expect(parseDocument('  ---  ')[0]).toEqual({ type: 'hr' })
    expect(parseDocument('--')[0]).toMatchObject({ type: 'paragraph' })
  })

  it('blockquotes: strip one level, recurse; a non-> line closes the quote (no lazy continuation)', () => {
    const doc = parseDocument('> quoted prose\n> more of it\nafter the quote')
    expect(doc.map((b) => b.type)).toEqual(['blockquote', 'paragraph'])
    expect(doc[0]).toEqual({
      type: 'blockquote',
      children: [
        { type: 'paragraph', inline: [{ type: 'text', text: 'quoted prose more of it' }] },
      ],
    })
  })

  it('blockquotes nest and carry ANY block — headings, lists, rules, quotes', () => {
    const doc = parseDocument('> ## quoted head\n> - quoted item\n> > deeper\n> ---')
    expect(doc).toEqual([
      {
        type: 'blockquote',
        children: [
          { type: 'heading', level: 2, inline: [{ type: 'text', text: 'quoted head' }] },
          {
            type: 'list',
            ordered: false,
            start: 1,
            items: [{ inline: [{ type: 'text', text: 'quoted item' }], children: [] }],
          },
          {
            type: 'blockquote',
            children: [{ type: 'paragraph', inline: [{ type: 'text', text: 'deeper' }] }],
          },
          { type: 'hr' },
        ],
      },
    ])
  })

  it('>text with no space still quotes; a bare > quotes a blank line', () => {
    const doc = parseDocument('>tight\n>\n>loose')
    expect(doc).toEqual([
      {
        type: 'blockquote',
        children: [
          { type: 'paragraph', inline: [{ type: 'text', text: 'tight' }] },
          { type: 'paragraph', inline: [{ type: 'text', text: 'loose' }] },
        ],
      },
    ])
  })
})

/* --------------------------------- lists ----------------------------------- */

describe('field-notes · lists', () => {
  it('unordered: - * + all open items; marker changes stay ONE list', () => {
    const doc = parseDocument('- a\n* b\n+ c')
    expect(doc).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          { inline: [{ type: 'text', text: 'a' }], children: [] },
          { inline: [{ type: 'text', text: 'b' }], children: [] },
          { inline: [{ type: 'text', text: 'c' }], children: [] },
        ],
      },
    ])
  })

  it('ordered: 1. and 1) both open; the FIRST ordinal is honored as start', () => {
    const dot = parseDocument('3. three\n4. four')
    expect(dot[0]).toMatchObject({ type: 'list', ordered: true, start: 3 })
    const paren = parseDocument('1) one')
    expect(paren[0]).toMatchObject({ type: 'list', ordered: true, start: 1 })
  })

  it('an ordered/unordered FLIP closes the list — two sibling blocks', () => {
    const doc = parseDocument('- bullet\n1. numbered')
    expect(doc.map((b) => b.type)).toEqual(['list', 'list'])
    expect(doc[0]).toMatchObject({ ordered: false })
    expect(doc[1]).toMatchObject({ ordered: true, start: 1 })
  })

  it('indented continuation prose JOINS the item (soft-wrapped field notes)', () => {
    const doc = parseDocument('- a long observation\n  wrapped onto the next line\n- next item')
    expect(doc[0]).toMatchObject({
      type: 'list',
      items: [
        { inline: [{ type: 'text', text: 'a long observation wrapped onto the next line' }], children: [] },
        { inline: [{ type: 'text', text: 'next item' }], children: [] },
      ],
    })
  })

  it('an indented list NESTS as the parent item’s children', () => {
    const doc = parseDocument('- outer\n  - inner a\n  - inner b\n- outer two')
    expect(doc).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          {
            inline: [{ type: 'text', text: 'outer' }],
            children: [
              {
                type: 'list',
                ordered: false,
                start: 1,
                items: [
                  { inline: [{ type: 'text', text: 'inner a' }], children: [] },
                  { inline: [{ type: 'text', text: 'inner b' }], children: [] },
                ],
              },
            ],
          },
          { inline: [{ type: 'text', text: 'outer two' }], children: [] },
        ],
      },
    ])
  })

  it('a nested list survives a blank line (loose sublists)', () => {
    const doc = parseDocument('- a\n\n  - b')
    expect(doc.length).toBe(1)
    expect(doc[0]).toMatchObject({
      items: [{ inline: [{ type: 'text', text: 'a' }], children: [{ type: 'list' }] }],
    })
  })

  it('a blank between items keeps ONE list; a blank then prose closes it', () => {
    const doc = parseDocument('- one\n\n- two\n\na closing paragraph')
    expect(doc.map((b) => b.type)).toEqual(['list', 'paragraph'])
    expect(doc[0]).toMatchObject({ items: [{}, {}] })
  })

  it('shallow prose after items closes the list; the prose becomes its own block', () => {
    const doc = parseDocument('- a\n- b\ncoda')
    expect(doc.map((b) => b.type)).toEqual(['list', 'paragraph'])
  })

  it('list items carry inline markup', () => {
    const doc = parseDocument('- **bold** item\n- with `code`')
    expect(doc[0]).toMatchObject({
      items: [
        { inline: [{ type: 'strong', children: [{ type: 'text', text: 'bold' }] }, { type: 'text', text: ' item' }], children: [] },
        { inline: [{ type: 'text', text: 'with ' }, { type: 'code', text: 'code' }], children: [] },
      ],
    })
  })

  it('tabs are not indentation — a tab-prefixed item is prose', () => {
    const doc = parseDocument('\t- not a list')
    expect(doc[0]).toMatchObject({ type: 'paragraph' })
  })
})

/* ------------------------------- hostile input ------------------------------ */

describe('field-notes · hostile input (the reading room never renders HTML)', () => {
  it('raw <script> becomes VISIBLE TEXT nodes — there is no HTML surface to reach', () => {
    const doc = parseDocument('<script>alert(1)</script>')
    expect(doc).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', text: '<script>alert(1)</script>' }] },
    ])
  })

  it('attribute-injection shapes degrade to text, not markup', () => {
    const doc = parseDocument('<img src=x onerror=alert(1)>')
    expect(doc).toEqual([{ type: 'paragraph', inline: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] }])
    expect(parseDocument('[x](https://a"onmouseover="1)')[0]).toMatchObject({ type: 'paragraph' })
  })

  it('an onclick URL inside a VALID link shape is refused by the scheme door', () => {
    expect(shapes(parseInline('[a](onclick=run)'))).toEqual([['text', '[a](onclick=run)']])
  })

  it('control characters and lone markers parse without throwing', () => {
    expect(() => parseDocument('a\u0000\u0001**\u007f`[')).not.toThrow()
    expect(() => parseInline('`*[*`*`')).not.toThrow()
  })

  it('a deep wall of markers does not blow the stack (bounded nesting by construction)', () => {
    const wall = '**'.repeat(200) + 'x'
    expect(() => parseDocument(wall)).not.toThrow()
  })

  it('CRLF and CR documents parse like LF (specimens from other hands)', () => {
    const doc = parseDocument('# Title\r\n\r\nbody line\r\nmore')
    expect(doc.map((b) => b.type)).toEqual(['heading', 'paragraph'])
  })
})
