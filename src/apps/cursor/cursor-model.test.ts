/**
 * Cursor model tests (batch 2, brief 4, acceptance 1–3) — the parser driven
 * HARD: precedence, associativity, unary chains, nesting, whitespace
 * tolerance, every error class, eval-shaped input met with REFUSAL (never
 * execution); the tape ring; the hostile-payload guard on restored tape; and
 * the no-eval grep over the whole app folder (the hard rule made structural
 * AND tested).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  appendEntry,
  calculate,
  clearTape,
  CONSTANTS,
  entryFor,
  evaluate,
  formatResult,
  nextEntryId,
  parse,
  readTapeState,
  TAPE_CAP,
  tokenize,
  type TapeEntry,
} from './cursor-model'

/* ------------------------------ helpers ---------------------------------- */

/** A value assertion: input must compute to exactly this number. */
const value = (input: string): number => {
  const outcome = calculate(input)
  if (outcome.kind !== 'value') {
    throw new Error(`expected a value for “${input}”, got refusal ${outcome.refusal.code} (${outcome.refusal.detail})`)
  }
  return outcome.value
}

/** A refusal assertion: input must refuse with exactly this error code. */
const refusal = (input: string): string => {
  const outcome = calculate(input)
  if (outcome.kind === 'refusal') return outcome.refusal.code
  throw new Error(`expected a refusal for “${input}”, got value ${outcome.value}`)
}

/* -------------------------- tokenizer ------------------------------------- */

describe('cursor · tokenizer', () => {
  it('splits numbers, operators, parens and words; whitespace is free', () => {
    const out = tokenize(' 2 + 3.5*(.5 - pi) ^ -2\t')
    if (!('tokens' in out)) throw new Error('should tokenize')
    expect(out.tokens).toEqual([
      { t: 'num', v: 2, raw: '2' },
      { t: 'op', v: '+' },
      { t: 'num', v: 3.5, raw: '3.5' },
      { t: 'op', v: '*' },
      { t: 'lp' },
      { t: 'num', v: 0.5, raw: '.5' },
      { t: 'op', v: '-' },
      { t: 'word', v: 'pi' },
      { t: 'rp' },
      { t: 'op', v: '^' },
      { t: 'op', v: '-' },
      { t: 'num', v: 2, raw: '2' },
    ])
  })

  it('accepts trailing-dot numbers and rejects a stray dot', () => {
    expect(value('2.') === 2).toBe(true)
    expect(refusal('.')).toBe('bad-number')
    expect(refusal('.a')).toBe('bad-number')
  })

  it('refuses unknown glyphs with bad-character', () => {
    expect(refusal('2 @ 3')).toBe('bad-character')
    expect(refusal('2,5')).toBe('bad-character')
    expect(refusal('1;2')).toBe('bad-character')
  })

  it('groups letters into whole words (case-sensitive vocabulary)', () => {
    const out = tokenize('sqrt abs pie')
    if (!('tokens' in out)) throw new Error('should tokenize')
    expect(out.tokens.map((t) => (t.t === 'word' ? t.v : t.t))).toEqual(['sqrt', 'abs', 'pie'])
  })
})

/* -------------------------- parser: the good paths ------------------------ */

describe('cursor · parser precedence and associativity', () => {
  it('multiplies and divides before adding and subtracting', () => {
    expect(value('2+3*4')).toBe(14)
    expect(value('2*3+4')).toBe(10)
    expect(value('10-4/2')).toBe(8)
    expect(value('2+3*4-6/3')).toBe(12)
  })

  it('parentheses override precedence, at arbitrary nesting depth', () => {
    expect(value('(2+3)*4')).toBe(20)
    expect(value('((((2))))')).toBe(2)
    expect(value('((2+3))*((4))')).toBe(20)
    expect(value('-(2+3)*2')).toBe(-10)
  })

  it('^ is right-associative: 2^3^2 = 512 (brief e2e truth)', () => {
    expect(value('2^3^2')).toBe(512)
    // and the TREE agrees: the top node is 2^(3^2), not (2^3)^2
    const parsed = parse('2^3^2')
    if (!('ast' in parsed)) throw new Error('should parse')
    const top = parsed.ast
    if (top.k !== 'bin' || top.op !== '^') throw new Error('top must be ^')
    if (top.lhs.k !== 'num' || top.lhs.v !== 2) throw new Error('lhs must be 2')
    if (top.rhs.k !== 'bin' || top.rhs.op !== '^') throw new Error('rhs must be the inner ^')
    expect(evaluate(parsed.ast)).toBe(512)
  })

  it('^ binds tighter than unary minus (the math convention): -2^2 = -4', () => {
    expect(value('-2^2')).toBe(-4)
    expect(value('(-2)^2')).toBe(4)
  })

  it('an exponent may carry its own sign', () => {
    expect(value('2^-3')).toBe(0.125)
    expect(value('2^-2^2')).toBeCloseTo(2 ** -4, 15)
  })

  it('unary chains collapse: --5 = 5, ---5 = -5; unary PLUS is not a glyph', () => {
    expect(value('--5')).toBe(5)
    expect(value('---5')).toBe(-5)
    // the language carries unary MINUS only (brief 4): a leading “+” operand
    // is honestly refused, not silently promoted
    expect(refusal('-+-5')).toBe('unexpected-token')
    expect(refusal('+5')).toBe('unexpected-token')
  })

  it('unary minus composes with * / % operands', () => {
    expect(value('2*-3')).toBe(-6)
    expect(value('-6/-2')).toBe(3)
    expect(value('2*-3^2')).toBe(-18) // -(3^2)*2's operand reads: 2 * -(3^2)
  })

  it('% is the machine remainder (sign of the dividend, JS-honest)', () => {
    expect(value('10%3')).toBe(1)
    expect(value('-10%3')).toBe(-1)
    expect(value('10%-3')).toBe(1)
    expect(value('7%4*2')).toBe(6) // % rides the term tier with * /
  })

  it('knows the constants pi and e (lowercase, exact)', () => {
    expect(value('pi')).toBe(Math.PI)
    expect(value('e')).toBe(Math.E)
    expect(value('2*pi')).toBeCloseTo(2 * Math.PI, 15)
    expect(value('e^2')).toBeCloseTo(Math.E ** 2, 15)
    expect(CONSTANTS['pi']).toBe(Math.PI)
    expect(CONSTANTS['e']).toBe(Math.E)
  })

  it('sqrt and abs compute with REQUIRED parens, nesting freely', () => {
    expect(value('sqrt(16)')).toBe(4)
    expect(value('sqrt(abs(-16))')).toBe(4)
    expect(value('abs(0-3)')).toBe(3)
    expect(value('sqrt(sqrt(16))')).toBe(2)
    expect(value('sqrt(2)^2')).toBeCloseTo(2, 12)
    expect(value('abs(-pi)*2')).toBeCloseTo(2 * Math.PI, 15)
  })

  it('tolerates whitespace everywhere it is meaningless', () => {
    expect(value('  2 +  3 ')).toBe(5)
    expect(value('\t2\n+\r3\n')).toBe(5)
    expect(value('  ( 1 + 2 ) * 2 ')).toBe(6)
    expect(value('sqrt ( 4 )')).toBe(2)
  })
})

/* -------------------------- parser: every error class --------------------- */

describe('cursor · parse refusals (every error class)', () => {
  it('empty class: blank and whitespace-only lines', () => {
    expect(refusal('')).toBe('empty')
    expect(refusal('   ')).toBe('empty')
    expect(refusal('\t \n')).toBe('empty')
  })

  it('unexpected-token class: the grammar breaks', () => {
    expect(refusal('2 3')).toBe('unexpected-token') // juxtaposition is not multiplication
    expect(refusal('2(3)')).toBe('unexpected-token')
    expect(refusal('()')).toBe('unexpected-token')
    expect(refusal('*3')).toBe('unexpected-token')
    expect(refusal('2+')).toBe('unexpected-token')
    expect(refusal('2+3)')).toBe('unexpected-token') // trailing junk
    expect(refusal('2 & 3')).toBe('bad-character')
    expect(refusal('sqrt 4')).toBe('unexpected-token') // parens required — no bare words
    expect(refusal('sqrt(4')).toBe('unclosed-paren')
    expect(refusal('sqrt4')).toBe('unexpected-token') // word then operand: parens still required
  })

  it('unclosed-paren class', () => {
    expect(refusal('(2+3')).toBe('unclosed-paren')
    expect(refusal('((1)')).toBe('unclosed-paren')
    expect(refusal('abs(-1')).toBe('unclosed-paren')
  })

  it('unknown-word class: the vocabulary is closed (case-sensitive)', () => {
    expect(refusal('foo')).toBe('unknown-word')
    expect(refusal('PI')).toBe('unknown-word')
    expect(refusal('E')).toBe('unknown-word')
    expect(refusal('SQRT(4)')).toBe('unknown-word')
    expect(refusal('sin(0)')).toBe('unknown-word')
    expect(refusal('x=1')).toBe('bad-character') // '=' is not a machine glyph — no assignment
  })
})

/* -------------------------- evaluator refusals ---------------------------- */

describe('cursor · evaluation refusals', () => {
  it('division by zero refuses (both / and %, computed zeros included)', () => {
    expect(refusal('1/0')).toBe('division-by-zero')
    expect(refusal('1/-0')).toBe('division-by-zero')
    expect(refusal('5%(3-3)')).toBe('division-by-zero')
    expect(refusal('1/(2-2)')).toBe('division-by-zero')
  })

  it('sqrt of a negative refuses as out-of-domain (no complex dial)', () => {
    expect(refusal('sqrt(-1)')).toBe('out-of-domain')
    expect(refusal('sqrt(0-2)')).toBe('out-of-domain')
    expect(refusal('sqrt(abs(-1)-2)')).toBe('out-of-domain')
    expect(value('sqrt(0)')).toBe(0) // the boundary itself computes
  })

  it('non-finite results refuse as out-of-range (the honest dial)', () => {
    expect(refusal('10^10^10')).toBe('out-of-range')
    expect(refusal('0^-1')).toBe('out-of-range')
    // a literal longer than the dial (320 nines overflows a double) refuses
    expect(refusal('9'.repeat(320))).toBe('out-of-range')
  })

  it('an intermediate refusal propagates without computing further', () => {
    expect(refusal('1/0+sqrt(-1)')).toBe('division-by-zero') // left-first evaluation
    expect(refusal('sqrt(-1)+1/0')).toBe('out-of-domain')
  })
})

/* -------------------------- eval-shaped input → REFUSAL -------------------- */

describe('cursor · eval-shaped input meets a refusal, never execution', () => {
  it('JS code payloads are malformed expressions, not programs', () => {
    // NOTE: the tokenizer runs to completion first, so payload strings meet
    // the quote/backtick/dot guards (bad-character/bad-number) before the
    // parser ever judges their words (unknown-word) — any of the three is a
    // refusal; execution is not on the menu.
    const refused = /bad-character|unknown-word|bad-number|unexpected-token/
    expect(refusal('eval("alert(1)")')).toMatch(refused)
    expect(refusal('new Function("return 1")()')).toMatch(refused)
    expect(refusal('javascript:1+1')).toBe('bad-character')
    expect(refusal('import("./evil")')).toMatch(refused)
    expect(refusal('await import(specifier)')).toMatch(refused)
    expect(refusal('`process`')).toBe('bad-character')
    expect(refusal('constructor.constructor("return 1")()')).toMatch(refused)
    expect(refusal('globalThis')).toBe('unknown-word')
    expect(refusal('window.location=1')).toMatch(refused)
  })

  it('nothing in the page was touched by trying', () => {
    // The structural proof: calculate() ran these through a tokenizer whose
    // vocabulary is arithmetic — there is no path to execution. Assert the
    // canary property a payload would have set stays unset.
    calculate('eval("globalThis.__cursorPwned = true")')
    expect((globalThis as Record<string, unknown>)['__cursorPwned']).toBeUndefined()
  })
})

/* -------------------------- no-eval hard rule (grep) ----------------------- */

describe('cursor · NO EVAL in the shipped sources (the hard rule, grepped)', () => {
  const folder = fileURLToPath(new URL('.', import.meta.url))
  // The grep walks the SHIPPED module graph — everything the app ships. Test
  // files are excluded BY NAME because they quote the forbidden shapes as
  // hostile fixtures (this suite's own payloads); the shipped sources must
  // carry none of them.
  const files = readdirSync(folder).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))

  it('found the shipped sources (the grep has teeth)', () => {
    expect(files.sort()).toEqual(['CursorIcon.tsx', 'CursorSurface.tsx', 'cursor-model.ts', 'index.ts'])
  })

  it('no eval( / new Function / Function( calls in any shipped source', () => {
    for (const file of files) {
      const src = readFileSync(`${folder}${file}`, 'utf8')
      expect(src.match(/\beval\s*\(/), file).toBeNull()
      expect(src.match(/\bnew\s+Function\b/), file).toBeNull()
      expect(src.match(/\bFunction\s*\(/), file).toBeNull()
    }
  })

  it('no dynamic import except the ONE sanctioned lazy surface mount in index.ts', () => {
    for (const file of files) {
      const src = readFileSync(`${folder}${file}`, 'utf8')
      const uses = src.match(/\bimport\s*\(/g) ?? []
      if (file === 'index.ts') {
        // the contract's lazy-mount shape, verbatim, with a literal specifier
        expect(uses.length, file).toBe(1)
        expect(src).toContain(`import('./CursorSurface')`)
      } else {
        expect(uses.length, `${file} must not dynamically import`).toBe(0)
      }
    }
  })

  it('the model file names the rule in prose but never the call shape', () => {
    const src = readFileSync(`${folder}cursor-model.ts`, 'utf8')
    // comments may NAME the forbidden forms (backticked words, never calls):
    // the word alone is law-describing; the call shape would be the thing
    // itself. Assert the stricter bare form stays absent everywhere.
    expect(src.match(/eval\s*\(/)).toBeNull()
  })
})

/* -------------------------- result formatting ------------------------------ */

describe('cursor · the dial formats honestly', () => {
  it('integers print bare; float noise trims to 12 significant digits', () => {
    expect(formatResult(512)).toBe('512')
    expect(formatResult(-4)).toBe('-4')
    expect(formatResult(0.1 + 0.2)).toBe('0.3')
    expect(formatResult(1 / 3)).toBe('0.333333333333')
    expect(formatResult(Math.SQRT2)).toBe('1.41421356237')
    expect(formatResult(Math.pow(2, 53))).toBe('9007199254740992')
  })

  it('negative zero and extremes print sanely', () => {
    expect(formatResult(-0)).toBe('0')
    expect(formatResult(2 ** -100)).toBe('7.88860905221e-31')
    expect(formatResult(Number.POSITIVE_INFINITY)).toBe('OUT OF RANGE') // direct-use belt
  })

  it('a full round trip prints the dial the e2e will assert', () => {
    const outcome = calculate('2^3^2')
    expect(outcome.kind === 'value' && formatResult(outcome.value)).toBe('512')
  })
})

/* -------------------------- the tape ring ---------------------------------- */

describe('cursor · the tape (pure ring, newest first, cap 50)', () => {
  const line = (id: number, expr: string, result: string, refused = false): TapeEntry => ({
    id,
    expr,
    line: result,
    refused,
  })

  it('prints newest first and tears off the oldest at the cap', () => {
    let tape: readonly TapeEntry[] = []
    for (let id = 1; id <= TAPE_CAP + 5; id += 1) {
      tape = appendEntry(tape, line(id, `${id}`, `${id}`))
    }
    expect(tape).toHaveLength(TAPE_CAP)
    expect(tape[0]).toEqual(line(TAPE_CAP + 5, `${TAPE_CAP + 5}`, `${TAPE_CAP + 5}`))
    // the first five prints fell off the roller
    expect(tape.find((e) => e.id === 1)).toBeUndefined()
    expect(tape.find((e) => e.id === 6)).toBeDefined()
    expect(tape[tape.length - 1]?.id).toBe(6)
  })

  it('entryFor prints values formatted and refusals as their in-world line', () => {
    const valueEntry = entryFor(1, '2^3^2', calculate('2^3^2'))
    expect(valueEntry).toEqual({ id: 1, expr: '2^3^2', line: '512', refused: false })

    const refusalEntry = entryFor(2, '1/0', calculate('1/0'))
    expect(refusalEntry).toEqual({ id: 2, expr: '1/0', line: 'DIVISION BY ZERO', refused: true })

    const parseEntry = entryFor(3, 'foo', calculate('foo'))
    expect(parseEntry.line).toBe('MALFORMED EXPRESSION')
    expect(parseEntry.refused).toBe(true)

    const domainEntry = entryFor(4, 'sqrt(-1)', calculate('sqrt(-1)'))
    expect(domainEntry.line).toBe('OUT OF DOMAIN')
  })

  it('ids sequence monotonically from the live tape', () => {
    expect(nextEntryId([])).toBe(1)
    expect(nextEntryId([line(4, 'a', '1'), line(2, 'b', '2')])).toBe(5)
  })

  it('clearTape tears the tape clean', () => {
    const printed = appendEntry(appendEntry([], line(1, '1+1', '2')), line(2, '2+2', '4'))
    expect(printed).toHaveLength(2)
    expect(clearTape()).toEqual([])
  })
})

/* -------------------------- hostile appState payloads ---------------------- */

describe('cursor · restored tape state is validated against hostile payloads', () => {
  const good = [
    { id: 1, expr: '2^3^2', line: '512', refused: false },
    { id: 2, expr: '1/0', line: 'DIVISION BY ZERO', refused: true },
  ]

  it('a well-formed payload restores verbatim', () => {
    expect(readTapeState({ version: 1, tape: good })).toEqual(good)
  })

  it('absent / wrong-shape / wrong-version payloads refuse whole', () => {
    expect(readTapeState(undefined)).toBeNull()
    expect(readTapeState(null)).toBeNull()
    expect(readTapeState('not an object')).toBeNull()
    expect(readTapeState({})).toBeNull()
    expect(readTapeState({ version: 2, tape: good })).toBeNull()
    expect(readTapeState({ version: '1', tape: good })).toBeNull()
    expect(readTapeState({ version: 1 })).toBeNull()
    expect(readTapeState({ version: 1, tape: 'nope' })).toBeNull()
  })

  it('one hostile entry refuses the WHOLE payload — never a partial load', () => {
    const badEntries: unknown[] = [
      { id: 1, expr: '2+2', line: '4', refused: 'false' }, // refused not boolean
      { id: 1.5, expr: '2+2', line: '4', refused: false }, // fractional id
      { id: 0, expr: '2+2', line: '4', refused: false }, // id below 1
      { id: 1, expr: 42, line: '4', refused: false }, // expr not string
      { id: 1, expr: '', line: '4', refused: false }, // empty expr
      { id: 1, expr: 'x'.repeat(201), line: '4', refused: false }, // absurd length
      { id: 1, expr: '2+2', line: 4, refused: false }, // line not string
      { id: 1, expr: '2+2', line: '', refused: false }, // empty line
      { id: 1, expr: '2+2', line: 'x'.repeat(33), refused: false }, // absurd line
      { id: 1, expr: '2+2', line: 'DIVISION BY ZERO', refused: false }, // refusal line marked as value
      { id: 1, expr: '1/0', line: 'DIVISION BY ZERO', refused: false }, // refused flag missing the ink
      { id: 1, expr: '2+2', line: '4', refused: true }, // value line marked refused
      'not an entry',
      null,
    ]
    for (const bad of badEntries) {
      expect(readTapeState({ version: 1, tape: [bad] }), JSON.stringify(bad)).toBeNull()
    }
    // and a good tape with ONE bad entry still refuses whole
    expect(readTapeState({ version: 1, tape: [...good, badEntries[0]] })).toBeNull()
  })

  it('duplicate ids and absurd counts refuse whole', () => {
    expect(readTapeState({ version: 1, tape: [good[0], good[0]] })).toBeNull()
    const flood = Array.from({ length: TAPE_CAP + 1 }, (_, i) => ({
      id: i + 1,
      expr: '1',
      line: '1',
      refused: false,
    }))
    expect(readTapeState({ version: 1, tape: flood })).toBeNull()
  })

  it('unknown extra fields are tolerated (forward-kind payloads)', () => {
    expect(readTapeState({ version: 1, tape: good, future: 'field' })).toEqual(good)
  })
})
