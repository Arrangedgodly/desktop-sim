/**
 * Cursor model — the pure, React-free, DOM-free math behind the CURSOR, the
 * hold's brass calculating machine (batch 2, brief 4). Everything testable
 * without a browser lives here:
 *
 *   tokenize   expression text → tokens (numbers, operators, parens, words)
 *   parse      tokens → AST via recursive descent (precedence/associativity
 *              encoded in the grammar, not in evaluation order)
 *   evaluate   AST → number, with every refusal as TYPED DATA
 *   calculate  the one composed entry point the surface drives
 *   formatResult / entryFor / REFUSAL_LINES   the tape's printed line
 *   appendEntry / nextEntryId / clearTape     the tape ring (newest first)
 *   readTapeState                             defensive appState validation
 *
 * NO EVAL — the HARD RULE is structural (brief 4, non-goal): the tokenizer
 * accepts exactly numbers, `+ - * / % ^`, parentheses, the words `sqrt` /
 * `abs` (parens REQUIRED — no bare words beyond the constants `pi` and `e`),
 * and whitespace. There is no code path from input text to JS evaluation —
 * the eval, Function-constructor, and dynamic-import payload forms all meet
 * the same MALFORMED EXPRESSION refusal as `flurb`. cursor-model.test.ts
 * greps the shipped sources for the forbidden forms on top of the unit
 * proofs.
 *
 * Semantics this module commits (documented in the session log):
 *   · `^` binds tightest and is RIGHT-associative: 2^3^2 = 2^(3^2) = 512.
 *   · Unary minus binds LOOSER than `^` (the math convention): -2^2 = -(2^2)
 *     = -4; but an exponent may carry its own sign: 2^-3 = 0.125. Unary
 *     chains collapse: --5 = 5.
 *   · `%` is the machine's honest remainder (JS semantics — sign of the
 *     dividend): -10%3 = -1. Both `/ 0` and `% 0` refuse.
 *   · No scientific-notation literals (`1e3`): the constant `e` owns that
 *     letter, so exponent syntax would be ambiguous — a deliberate cut.
 *   · Constants are lowercase, exactly `pi` and `e` (case-sensitive).
 *   · Results display at 12 significant digits, trailing noise trimmed
 *     (0.1+0.2 prints 0.3) — an instrument's honest dial, not a raw double.
 */

/* --------------------------------------------------------------------------
 * Errors — typed data, never thrown past the boundary
 * ------------------------------------------------------------------------ */

/** A parse-stage refusal. `detail` is for tests/log only; the tape prints the
 *  uniform MALFORMED EXPRESSION line (brief 4's named refusal). */
export interface ParseError {
  readonly kind: 'parse'
  readonly code:
    | 'empty' // blank or whitespace-only input
    | 'bad-character' // a glyph the machine does not know: "2 @ 3", quotes, backticks
    | 'bad-number' // a malformed numeric literal: "." / "1..2" first dot
    | 'unknown-word' // a word that is not pi/e/sqrt/abs: "foo", "eval", "PI"
    | 'unexpected-token' // grammar break: "2 3", "()", "sqrt 4", "2+3)"
    | 'unclosed-paren' // "(2+3" ran out of line
  readonly detail: string
}

/** An evaluation-stage refusal — the expression parsed, the machine will not
 *  (or cannot) compute it. */
export interface EvalError {
  readonly kind: 'eval'
  readonly code:
    | 'division-by-zero' // x/0, x%0 — brief 4's named refusal
    | 'out-of-domain' // sqrt of a negative — no complex output on this dial
    | 'out-of-range' // a non-finite intermediate or result (overflow)
  readonly detail: string
}

export type CalcError = ParseError | EvalError

/** One calculation's full outcome — value or refusal, never both. */
export type CalcOutcome =
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'refusal'; readonly refusal: CalcError }

/** The in-world printed line for each refusal (brief names the first two). */
export const REFUSAL_LINES: Readonly<Record<CalcError['code'], string>> = {
  empty: 'MALFORMED EXPRESSION',
  'bad-character': 'MALFORMED EXPRESSION',
  'bad-number': 'MALFORMED EXPRESSION',
  'unknown-word': 'MALFORMED EXPRESSION',
  'unexpected-token': 'MALFORMED EXPRESSION',
  'unclosed-paren': 'MALFORMED EXPRESSION',
  'division-by-zero': 'DIVISION BY ZERO',
  'out-of-domain': 'OUT OF DOMAIN',
  'out-of-range': 'OUT OF RANGE',
}

/* --------------------------------------------------------------------------
 * Tokenizer
 * ------------------------------------------------------------------------ */

/** The machine's whole vocabulary. */
export type Token =
  | { readonly t: 'num'; readonly v: number; readonly raw: string }
  | { readonly t: 'op'; readonly v: '+' | '-' | '*' | '/' | '%' | '^' }
  | { readonly t: 'lp' }
  | { readonly t: 'rp' }
  | { readonly t: 'word'; readonly v: string }

const OPERATORS = ['+', '-', '*', '/', '%', '^'] as const
type OperatorChar = (typeof OPERATORS)[number]

// NOTE: comparison, not String.includes — ''.includes semantics would call
// the end-of-string probe a digit and let a stray “.” start a “number”.
const isDigit = (ch: string): boolean => ch !== '' && ch >= '0' && ch <= '9'
const isLetter = (ch: string): boolean => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
const isOperator = (ch: string): ch is OperatorChar => (OPERATORS as readonly string[]).includes(ch)

/**
 * Expression text → tokens, or a typed parse error. Whitespace (spaces, tabs,
 * newlines) is skipped freely. Numbers are digits with at most one decimal
 * point (`123`, `123.45`, `123.`, `.45`); letters group into words resolved
 * by the parser (`sqrt`, `abs`, `pi`, `e` — anything else is unknown).
 */
export function tokenize(source: string): { readonly tokens: readonly Token[] } | { readonly error: ParseError } {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1
      continue
    }
    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1] ?? ''))) {
      const start = i
      let sawPoint = false
      while (i < source.length) {
        const c = source[i]!
        if (isDigit(c)) {
          i += 1
        } else if (c === '.' && !sawPoint) {
          sawPoint = true
          i += 1
        } else {
          break
        }
      }
      const raw = source.slice(start, i)
      const v = Number(raw)
      if (Number.isNaN(v)) {
        // unreachable by construction (raw always starts with a digit, or a
        // dot followed by one) — but a malformed literal must never smuggle
        // NaN onto the dial.
        return {
          error: { kind: 'parse', code: 'bad-number', detail: `malformed numeric literal “${raw}”` },
        }
      }
      // Infinity (hundreds of digits wandered off the dial) tokenizes
      // honestly; evaluation refuses it as OUT OF RANGE.
      tokens.push({ t: 'num', v, raw })
      continue
    }
    if (isLetter(ch)) {
      const start = i
      while (i < source.length && isLetter(source[i]!)) i += 1
      tokens.push({ t: 'word', v: source.slice(start, i) })
      continue
    }
    if (isOperator(ch)) {
      tokens.push({ t: 'op', v: ch })
      i += 1
      continue
    }
    if (ch === '(') {
      tokens.push({ t: 'lp' })
      i += 1
      continue
    }
    if (ch === ')') {
      tokens.push({ t: 'rp' })
      i += 1
      continue
    }
    if (ch === '.') {
      return {
        error: { kind: 'parse', code: 'bad-number', detail: `stray decimal point at ${i}: “${source}”` },
      }
    }
    return {
      error: { kind: 'parse', code: 'bad-character', detail: `unknown glyph “${ch}” at ${i}: “${source}”` },
    }
  }
  return { tokens }
}

/* --------------------------------------------------------------------------
 * Parser — recursive descent
 * ------------------------------------------------------------------------ */

/** The expression AST as plain data (pure, serializable, testable). */
export type Expr =
  | { readonly k: 'num'; readonly v: number }
  | { readonly k: 'const'; readonly name: 'pi' | 'e' }
  | { readonly k: 'unary'; readonly arg: Expr } // unary minus only
  | { readonly k: 'bin'; readonly op: '+' | '-' | '*' | '/' | '%' | '^'; readonly lhs: Expr; readonly rhs: Expr }
  | { readonly k: 'call'; readonly fn: 'sqrt' | 'abs'; readonly arg: Expr }

/** Words the machine knows as constants (case-sensitive, lowercase only). */
export const CONSTANTS: Readonly<Record<'pi' | 'e', number>> = { pi: Math.PI, e: Math.E }
/** Words the machine knows as functions — parens REQUIRED (no bare words). */
export const FUNCTIONS: readonly ['sqrt', 'abs'] = ['sqrt', 'abs']

/**
 * The grammar (precedence low → high; associativity in the prose):
 *
 *   expression := term (('+' | '-') term)*          left-assoc
 *   term       := unary (('*' | '/' | '%') unary)*  left-assoc
 *   unary      := '-' unary | power                 unary chains collapse
 *   power      := primary ('^' unary)?              RIGHT-assoc; the exponent
 *                                                 may carry its own sign
 *   primary    := NUMBER | 'pi' | 'e' | '(' expression ')'
 *               | ('sqrt' | 'abs') '(' expression ')'
 *
 * Unary minus sits between term and power, so -2^2 = -(2^2) while 2^-3
 * parses (the exponent recurses into unary).
 */
export function parse(source: string): { readonly ast: Expr } | { readonly error: ParseError } {
  const tokenized = tokenize(source)
  if ('error' in tokenized) return { error: tokenized.error }
  const tokens = tokenized.tokens
  if (tokens.length === 0) {
    return { error: { kind: 'parse', code: 'empty', detail: `blank line: “${source}”` } }
  }

  let pos = 0

  const peek = (): Token | undefined => tokens[pos]
  const take = (): Token | undefined => tokens[pos++]

  const unexpected = (what: string): { error: ParseError } => ({
    error: {
      kind: 'parse',
      code: 'unexpected-token',
      detail: `${what} at token ${Math.min(pos, tokens.length)} of “${source}”`,
    },
  })

  const parseExpression = (): Expr | { error: ParseError } => {
    let lhs = parseTerm()
    if ('error' in lhs) return lhs
    for (;;) {
      const next = peek()
      if (next?.t === 'op' && (next.v === '+' || next.v === '-')) {
        take()
        const rhs = parseTerm()
        if ('error' in rhs) return rhs
        lhs = { k: 'bin', op: next.v, lhs, rhs }
        continue
      }
      return lhs
    }
  }

  const parseTerm = (): Expr | { error: ParseError } => {
    let lhs = parseUnary()
    if ('error' in lhs) return lhs
    for (;;) {
      const next = peek()
      if (next?.t === 'op' && (next.v === '*' || next.v === '/' || next.v === '%')) {
        take()
        const rhs = parseUnary()
        if ('error' in rhs) return rhs
        lhs = { k: 'bin', op: next.v, lhs, rhs }
        continue
      }
      return lhs
    }
  }

  const parseUnary = (): Expr | { error: ParseError } => {
    const next = peek()
    if (next?.t === 'op' && next.v === '-') {
      take()
      const inner = parseUnary()
      if ('error' in inner) return inner
      return { k: 'unary', arg: inner }
    }
    return parsePower()
  }

  const parsePower = (): Expr | { error: ParseError } => {
    const base = parsePrimary()
    if ('error' in base) return base
    const next = peek()
    if (next?.t === 'op' && next.v === '^') {
      take()
      // right-assoc: the exponent recurses through UNARY (not power), so
      // 2^3^2 groups as 2^(3^2) and 2^-3 carries the exponent's sign.
      const exponent = parseUnary()
      if ('error' in exponent) return exponent
      return { k: 'bin', op: '^', lhs: base, rhs: exponent }
    }
    return base
  }

  const parsePrimary = (): Expr | { error: ParseError } => {
    const next = take()
    if (next === undefined) return unexpected('line ended where an operand was required')
    if (next.t === 'num') return { k: 'num', v: next.v }
    if (next.t === 'word') {
      if (next.v in CONSTANTS) {
        return { k: 'const', name: next.v as 'pi' | 'e' }
      }
      if ((FUNCTIONS as readonly string[]).includes(next.v)) {
        const open = take()
        if (open?.t !== 'lp') {
          return {
            error: {
              kind: 'parse',
              code: 'unexpected-token',
              detail: `“${next.v}” requires parentheses — “${next.v}(…)”: “${source}”`,
            },
          }
        }
        const arg = parseExpression()
        if ('error' in arg) return arg
        const close = take()
        if (close?.t !== 'rp') {
          return { error: { kind: 'parse', code: 'unclosed-paren', detail: `unclosed “${next.v}(” in “${source}”` } }
        }
        return { k: 'call', fn: next.v as 'sqrt' | 'abs', arg }
      }
      return {
        error: { kind: 'parse', code: 'unknown-word', detail: `unknown word “${next.v}” in “${source}”` },
      }
    }
    if (next.t === 'lp') {
      const inner = parseExpression()
      if ('error' in inner) return inner
      const close = take()
      if (close?.t !== 'rp') {
        return { error: { kind: 'parse', code: 'unclosed-paren', detail: `unclosed “(” in “${source}”` } }
      }
      return inner
    }
    return unexpected(`“${next.t === 'op' ? next.v : next.t === 'rp' ? ')' : String(next)}” cannot start an operand`)
  }

  const result = parseExpression()
  if ('error' in result) return result
  if (pos < tokens.length) {
    const trailing = tokens[pos]!
    return unexpected(`trailing “${trailing.t === 'op' ? trailing.v : trailing.t === 'rp' ? ')' : trailing.t === 'lp' ? '(' : trailing.t === 'word' ? trailing.v : trailing.raw}”`)
  }
  return { ast: result }
}

/* --------------------------------------------------------------------------
 * Evaluator
 * ------------------------------------------------------------------------ */

/** A number, or a typed refusal — evaluation never throws. */
type EvalResult = number | CalcError

const isError = (r: EvalResult): r is CalcError => typeof r !== 'number'

/** The finite-dial guard: any non-finite value off an operation is a range
 *  refusal — the machine does not print what it cannot represent. */
const guardRange = (v: number, what: string): EvalResult =>
  Number.isFinite(v) ? v : { kind: 'eval', code: 'out-of-range', detail: `${what} left the finite dial` }

/**
 * AST → number | CalcError. Pure: no stores, no DOM, no Math.random, no
 * code evaluation — arithmetic only (`+ - * / % ^`, Math.sqrt, Math.abs).
 */
export function evaluate(ast: Expr): EvalResult {
  switch (ast.k) {
    case 'num':
      return guardRange(ast.v, `literal ${ast.v}`)
    case 'const':
      return CONSTANTS[ast.name]
    case 'unary': {
      const arg = evaluate(ast.arg)
      if (isError(arg)) return arg
      return guardRange(-arg, `negation of ${arg}`)
    }
    case 'call': {
      const arg = evaluate(ast.arg)
      if (isError(arg)) return arg
      if (ast.fn === 'sqrt') {
        if (arg < 0) {
          return { kind: 'eval', code: 'out-of-domain', detail: `sqrt of ${arg} — no complex dial fitted` }
        }
        return guardRange(Math.sqrt(arg), `sqrt(${arg})`)
      }
      return guardRange(Math.abs(arg), `abs(${arg})`)
    }
    case 'bin': {
      const lhs = evaluate(ast.lhs)
      if (isError(lhs)) return lhs
      const rhs = evaluate(ast.rhs)
      if (isError(rhs)) return rhs
      switch (ast.op) {
        case '+':
          return guardRange(lhs + rhs, `${lhs} + ${rhs}`)
        case '-':
          return guardRange(lhs - rhs, `${lhs} - ${rhs}`)
        case '*':
          return guardRange(lhs * rhs, `${lhs} * ${rhs}`)
        case '/':
          if (rhs === 0) {
            // catches 0 and -0: the machine refuses both, honestly
            return { kind: 'eval', code: 'division-by-zero', detail: `${lhs} / ${rhs}` }
          }
          return guardRange(lhs / rhs, `${lhs} / ${rhs}`)
        case '%':
          if (rhs === 0) {
            return { kind: 'eval', code: 'division-by-zero', detail: `${lhs} % ${rhs}` }
          }
          return guardRange(lhs % rhs, `${lhs} % ${rhs}`)
        case '^':
          return guardRange(Math.pow(lhs, rhs), `${lhs} ^ ${rhs}`)
      }
    }
  }
}

/**
 * The composed entry point the surface drives: expression text → value or
 * typed refusal. This is the ONLY function the UI needs.
 */
export function calculate(input: string): CalcOutcome {
  const parsed = parse(input)
  if ('error' in parsed) return { kind: 'refusal', refusal: parsed.error }
  const result = evaluate(parsed.ast)
  if (isError(result)) return { kind: 'refusal', refusal: result }
  return { kind: 'value', value: result }
}

/* --------------------------------------------------------------------------
 * Result formatting — the instrument's dial
 * ------------------------------------------------------------------------ */

/**
 * A computed value → its printed line. Integers print bare (512, -4);
 * everything else rounds to 12 significant digits with float noise trimmed
 * (0.1+0.2 → 0.3, 1/3 → 0.333333333333). Extremely large/small magnitudes
 * ride JS exponent notation (2^-100 → 7.888609052e-31) — honest dial output.
 * `-0` prints as `0` (a machine's dial has no negative zero).
 */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return 'OUT OF RANGE' // callers refuse first; belt for direct use
  if (Object.is(value, -0)) return '0'
  if (Number.isInteger(value)) return value.toString()
  return Number(value.toPrecision(12)).toString()
}

/* --------------------------------------------------------------------------
 * The tape — a pure ring of printed lines, newest first
 * ------------------------------------------------------------------------ */

/** One printed line on the ledger tape. */
export interface TapeEntry {
  /** Monotonic sequence (React keys + id continuity across a restore). */
  readonly id: number
  /** The expression as typed (echoed verbatim, whitespace and all). */
  readonly expr: string
  /** The printed line: a formatted result, or the refusal line. */
  readonly line: string
  /** True when the line is a refusal (rendered as the tape's warning ink). */
  readonly refused: boolean
}

/** How many lines the tape keeps (brief 4's ~50 cap — storage honesty). */
export const TAPE_CAP = 50

/** Longest expression the tape will remember (a guard for restored payloads). */
export const EXPR_MAX = 200

/** Compose the entry an outcome prints. Pure; the surface supplies the id. */
export function entryFor(id: number, expr: string, outcome: CalcOutcome): TapeEntry {
  if (outcome.kind === 'value') {
    return { id, expr, line: formatResult(outcome.value), refused: false }
  }
  return { id, expr, line: REFUSAL_LINES[outcome.refusal.code], refused: true }
}

/** Print onto the tape: NEWEST FIRST (an adding machine feeds its paper up),
 *  oldest line falls off the roller at TAPE_CAP. Returns a new array. */
export function appendEntry(tape: readonly TapeEntry[], entry: TapeEntry): TapeEntry[] {
  return [entry, ...tape].slice(0, TAPE_CAP)
}

/** The next sequence number (max + 1; a fresh tape starts at 1). */
export function nextEntryId(tape: readonly TapeEntry[]): number {
  return tape.reduce((max, entry) => Math.max(max, entry.id), 0) + 1
}

/** Tear the tape off — the clear action's pure half. */
export function clearTape(): TapeEntry[] {
  return []
}

/* --------------------------------------------------------------------------
 * Session state (rides the WM window record's opaque appState)
 * ------------------------------------------------------------------------ */

/** The persisted window payload (structured-clone-safe by shape). */
export interface CursorState {
  readonly version: 1
  readonly tape: readonly TapeEntry[]
}

const isRefusalLine = (line: string): boolean =>
  (Object.values(REFUSAL_LINES) as readonly string[]).includes(line)

/**
 * Defensively read the tape off an UNTRUSTED `appState` (it crossed the
 * persistence boundary; validate.ts carries it verbatim). `null` = absent,
 * malformed, or not this machine's payload — callers fall back to a fresh
 * tape. Hostile input NEVER partially loads: one bad entry refuses the whole
 * payload. A `line` must be a known printed line (a formatted result or one
 * of the refusal lines) and must be `refused` only for refusal lines.
 */
export function readTapeState(appState: unknown): readonly TapeEntry[] | null {
  if (typeof appState !== 'object' || appState === null) return null
  const record = appState as Record<string, unknown>
  if (record['version'] !== 1) return null
  const tape = record['tape']
  if (!Array.isArray(tape)) return null
  if (tape.length > TAPE_CAP) return null // absurd count → hostile, refuse whole
  const clean: TapeEntry[] = []
  for (const raw of tape) {
    if (typeof raw !== 'object' || raw === null) return null
    const entry = raw as Record<string, unknown>
    const id = entry['id']
    const expr = entry['expr']
    const line = entry['line']
    const refused = entry['refused']
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return null
    if (typeof expr !== 'string' || expr.length === 0 || expr.length > EXPR_MAX) return null
    if (typeof line !== 'string' || line.length === 0 || line.length > 32) return null
    if (typeof refused !== 'boolean') return null
    if (refused !== isRefusalLine(line)) return null // a value line never refuses
    if (clean.some((existing) => existing.id === id)) return null // duplicate ids → hostile
    clean.push({ id, expr, line, refused })
  }
  return clean
}
