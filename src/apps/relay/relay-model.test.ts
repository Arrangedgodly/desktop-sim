/**
 * Relay model tests (batch 2, brief 3) — the pure drip schedule, the
 * instrument readouts, the watch's hostile-payload-safe appState, and filing
 * (drawer bootstrap + real text specimens through lib/fs's pure ops).
 * DOM-free, store-free, timer-free: due() is PURE OVER TIMESTAMPS, so plain
 * numbers prove everything the fake-timer surface tests re-verify in situ
 * (brief acceptance 1 — order, no duplicates, hidden-pause by construction).
 */

import { describe, expect, it } from 'vitest'
import { createNode, emptyFSState, FSError, type FSTextNode } from '../../lib/fs'
import { RELAY_LETTERS } from './relay-letters'
import {
  arrivedLetters,
  due,
  fileLetter,
  filedSpecimen,
  formatDelay,
  formatWatch,
  freshWatch,
  mailCountReadout,
  nextArrivalDelayMs,
  readRelayState,
  relayDrawerId,
  specimenText,
  RELAY_CLOCK_ORIGIN,
  RELAY_CORPUS,
  RELAY_CORPUS_COUNT,
  RELAY_DRAWER_NAME,
  type RelayWindowState,
} from './relay-model'

/* --------------------------------------------------------------------------
 * The drip schedule — pure over timestamps
 * ------------------------------------------------------------------------ */

describe('relay model · the drip schedule', () => {
  it('the corpus is arrival-ordered: offsets strictly increasing, ids unique', () => {
    const offsets = RELAY_CORPUS.map((letter) => letter.offsetMs)
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!)
    }
    expect(new Set(RELAY_CORPUS.map((letter) => letter.id)).size).toBe(RELAY_CORPUS_COUNT)
  })

  it('arrivedLetters: arrival order, each letter EXACTLY once, exact at the boundary', () => {
    // Boundary honesty: a letter whose offset equals elapsed time HAS arrived.
    expect(arrivedLetters(RELAY_CORPUS[0]!.offsetMs - 1, RELAY_CLOCK_ORIGIN)).toHaveLength(0)
    expect(arrivedLetters(RELAY_CORPUS[0]!.offsetMs, RELAY_CLOCK_ORIGIN)).toHaveLength(1)
    expect(arrivedLetters(RELAY_CORPUS[0]!.offsetMs + 1, RELAY_CLOCK_ORIGIN)).toHaveLength(1)

    // One tick before / after each post: counts step by exactly one.
    let previous = 0
    for (const letter of RELAY_CORPUS) {
      expect(arrivedLetters(letter.offsetMs - 1, RELAY_CLOCK_ORIGIN)).toHaveLength(previous)
      expect(arrivedLetters(letter.offsetMs, RELAY_CLOCK_ORIGIN)).toHaveLength(previous + 1)
      previous += 1
    }

    // The far future: the WHOLE corpus, in arrival order, no duplicates.
    const all = arrivedLetters(Number.MAX_SAFE_INTEGER, RELAY_CLOCK_ORIGIN)
    expect(all.map((letter) => letter.id)).toEqual(RELAY_CORPUS.map((letter) => letter.id))
    expect(all).toHaveLength(RELAY_CORPUS_COUNT)
  })

  it('due(): the unread queue — arrival order minus the read set', () => {
    const first = RELAY_CORPUS[0]!
    const second = RELAY_CORPUS[1]!
    const atSecond = second.offsetMs // two letters on the wire

    expect(due(atSecond, RELAY_CLOCK_ORIGIN, new Set()).map((l) => l.id)).toEqual([
      first.id,
      second.id,
    ])
    // Reading the first removes only the first — order holds.
    expect(due(atSecond, RELAY_CLOCK_ORIGIN, new Set([first.id])).map((l) => l.id)).toEqual([
      second.id,
    ])
    // All read: the wire owes nothing (the lamp's whole truth).
    expect(due(atSecond, RELAY_CLOCK_ORIGIN, new Set([first.id, second.id]))).toEqual([])
  })

  it('due() is pure over timestamps: any timeline, same elapsed, same answer', () => {
    const readSet = new Set([RELAY_CORPUS[0]!.id])
    expect(due(120_000, 20_000, readSet)).toEqual(due(100_000, 0, readSet))
    expect(due(1_000_000, 880_000, new Set())).toEqual(due(120_000, 0, new Set()))
  })

  it('nextArrivalDelayMs: counts down to the next post, null when the wire is spent', () => {
    expect(nextArrivalDelayMs(0, RELAY_CLOCK_ORIGIN)).toBe(RELAY_CORPUS[0]!.offsetMs)
    expect(nextArrivalDelayMs(RELAY_CORPUS[0]!.offsetMs, RELAY_CLOCK_ORIGIN)).toBe(
      RELAY_CORPUS[1]!.offsetMs - RELAY_CORPUS[0]!.offsetMs,
    )
    // Never negative — the letter at exactly `elapsed` has already arrived.
    expect(nextArrivalDelayMs(RELAY_CORPUS[1]!.offsetMs, RELAY_CLOCK_ORIGIN)).toBe(
      RELAY_CORPUS[2]!.offsetMs - RELAY_CORPUS[1]!.offsetMs,
    )
    expect(nextArrivalDelayMs(Number.MAX_SAFE_INTEGER, RELAY_CLOCK_ORIGIN)).toBeNull()
  })
})

/* --------------------------------------------------------------------------
 * Instrument readouts (B612 strings)
 * ------------------------------------------------------------------------ */

describe('relay model · instrument readouts', () => {
  it('formatWatch renders the hold clock HH:MM:SS, clamped at zero', () => {
    expect(formatWatch(0)).toBe('00:00:00')
    expect(formatWatch(20_000)).toBe('00:00:20')
    expect(formatWatch(3_723_000)).toBe('01:02:03')
    expect(formatWatch(86_400_000 * 2)).toBe('48:00:00') // hours ride unclamped
    expect(formatWatch(-5_000)).toBe('00:00:00') // hostile input clamps, never NaN
  })

  it('formatDelay renders MM:SS and saturates past ninety-nine minutes', () => {
    expect(formatDelay(0)).toBe('00:00')
    expect(formatDelay(100_000)).toBe('01:40')
    expect(formatDelay(59_900)).toBe('00:59')
    expect(formatDelay(99 * 60_000 + 59_000)).toBe('99:59')
    expect(formatDelay(100 * 60_000)).toBe('99:59+')
    expect(formatDelay(-1)).toBe('00:00')
  })

  it('mailCountReadout pads both sides to the total width', () => {
    expect(mailCountReadout(0, 6)).toBe('00/06')
    expect(mailCountReadout(1, 6)).toBe('01/06')
    expect(mailCountReadout(6, 6)).toBe('06/06')
    expect(mailCountReadout(0, 10)).toBe('00/10')
    expect(mailCountReadout(10, 10)).toBe('10/10')
  })
})

/* --------------------------------------------------------------------------
 * The watch's appState — validated on read, hostile-payload safe
 * ------------------------------------------------------------------------ */

describe('relay model · watch appState validation', () => {
  it('a fresh watch round-trips, and known-id read/filed sets load', () => {
    const fresh = freshWatch(1_000)
    expect(readRelayState(fresh)).toEqual(fresh)

    const state: RelayWindowState = {
      version: 1,
      openedAt: 1_000,
      elapsedMs: 321_000,
      read: [RELAY_LETTERS[0]!.id, RELAY_LETTERS[1]!.id],
      filed: [RELAY_LETTERS[0]!.id],
    }
    expect(readRelayState(state)).toEqual(state)
  })

  it('absent read/filed fields default to empty (an early payload still loads)', () => {
    expect(readRelayState({ version: 1, openedAt: 5, elapsedMs: 0 })).toEqual({
      version: 1,
      openedAt: 5,
      elapsedMs: 0,
      read: [],
      filed: [],
    })
  })

  it('refuses EVERY hostile shape with null — never a partial load', () => {
    const hostile: readonly unknown[] = [
      undefined,
      null,
      'wire',
      42,
      true,
      ['version', 1],
      {}, // no version
      { version: 2, openedAt: 1, elapsedMs: 0 }, // future version
      { version: '1', openedAt: 1, elapsedMs: 0 },
      { version: 1, openedAt: 'yesterday', elapsedMs: 0 }, // openedAt is provenance:
      { version: 1, openedAt: -1, elapsedMs: 0 }, // a negative or non-finite
      { version: 1, openedAt: Number.NaN, elapsedMs: 0 }, // anchor is hostile
      { version: 1, openedAt: 1, elapsedMs: -1 },
      { version: 1, openedAt: 1, elapsedMs: Number.POSITIVE_INFINITY },
      { version: 1, openedAt: 1, elapsedMs: 401 * 24 * 3_600_000 }, // absurd count of time
      { version: 1, openedAt: 1, elapsedMs: 0, read: 'l-channel-check' }, // not an array
      { version: 1, openedAt: 1, elapsedMs: 0, read: ['not-a-letter'] }, // unknown id
      { version: 1, openedAt: 1, elapsedMs: 0, read: [RELAY_LETTERS[0]!.id, RELAY_LETTERS[0]!.id] }, // duplicates
      { version: 1, openedAt: 1, elapsedMs: 0, filed: [42] },
      { version: 1, openedAt: 1, elapsedMs: 0, filed: [{ id: RELAY_LETTERS[0]!.id }] },
      {
        version: 1,
        openedAt: 1,
        elapsedMs: 0,
        read: new Array(RELAY_CORPUS_COUNT + 1).fill(RELAY_LETTERS[0]!.id), // absurd count
      },
    ]
    for (const payload of hostile) {
      expect(readRelayState(payload), JSON.stringify(payload)).toBeNull()
    }
  })

  it('a __proto__-shaped payload carries NOTHING across — the result is a clean plain object', () => {
    // JSON.parse keeps `__proto__` as an own data property (no pollution at
    // parse); the reader ignores unknown keys and constructs fresh, so the
    // loaded watch owns exactly its four fields and Object.prototype.
    const payload = JSON.parse(
      '{"version":1,"openedAt":9,"elapsedMs":1000,"read":[],"filed":[],"__proto__":{"polluted":true}}',
    )
    const loaded = readRelayState(payload)
    expect(loaded).not.toBeNull()
    if (loaded === null) throw new Error('the __proto__ payload should have loaded')
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype)
    expect(Object.keys(loaded).sort()).toEqual(['elapsedMs', 'filed', 'openedAt', 'read', 'version'].sort())
    expect((loaded as unknown as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})

/* --------------------------------------------------------------------------
 * Filing — drawer bootstrap + real text specimens
 * ------------------------------------------------------------------------ */

describe('relay model · filing to the archive', () => {
  const letter = RELAY_LETTERS[0]!

  it('first file BOOTSTRAPS the Relay drawer, then accessions a real text specimen', () => {
    const fs = emptyFSState(0)
    const result = fileLetter(fs, letter, { id: 'n1', drawerId: 'd1', now: 1_000 })

    expect(result.status).toBe('filed')
    expect(result.drawerId).toBe('d1')

    const drawer = result.fs.nodes['d1']!
    expect(drawer.kind).toBe('folder')
    expect(drawer.name).toBe(RELAY_DRAWER_NAME)
    expect(drawer.parentId).toBe(fs.rootId) // on the hold's ground

    const specimen = result.fs.nodes['n1'] as FSTextNode
    expect(specimen.kind).toBe('text')
    expect(specimen.parentId).toBe('d1')
    expect(specimen.name).toBe(letter.filedName)
    expect(specimen.accession).toBe('SPC-0001')
    expect(specimen.accessionedAt).toBe(1_000)
    expect(specimen.content).toBe(specimenText(letter))
    expect(specimen.content).toContain(letter.subject)
    expect(specimen.content).toContain(letter.paragraphs[0]!)
  })

  it('later files reuse the SAME drawer and count the SPC series honestly', () => {
    const first = fileLetter(emptyFSState(0), RELAY_LETTERS[0]!, { id: 'n1', drawerId: 'd1', now: 1_000 })
    const second = fileLetter(first.fs, RELAY_LETTERS[1]!, { id: 'n2', now: 2_000 }) // no drawerId needed

    expect(second.status).toBe('filed')
    expect(second.drawerId).toBe('d1') // bootstrapped ONCE
    expect(second.fs.nodes['d1']!.kind).toBe('folder')
    expect((second.fs.nodes['n2'] as FSTextNode).accession).toBe('SPC-0002')
    expect(relayDrawerId(second.fs)).toBe('d1')
  })

  it("an operator's EXISTING Relay drawer (renamed case and all) is honored, not duplicated", () => {
    let fs = emptyFSState(0)
    fs = createNode(fs, { id: 'my-relay', parentId: fs.rootId, name: 'relay', kind: 'folder', now: 0 })
    const before = Object.keys(fs.nodes).length

    const result = fileLetter(fs, letter, { id: 'n1', now: 1_000 })
    expect(result.drawerId).toBe('my-relay')
    expect(result.fs.nodes['n1']!.parentId).toBe('my-relay')
    expect(Object.keys(result.fs.nodes).length).toBe(before + 1) // the specimen only
  })

  it('filing is idempotent by label: an already-catalogued transcript is NOT duplicated', () => {
    const first = fileLetter(emptyFSState(0), letter, { id: 'n1', drawerId: 'd1', now: 1_000 })
    const again = fileLetter(first.fs, letter, { id: 'n2', now: 2_000 })

    expect(again.status).toBe('already-catalogued')
    expect(again.fs).toBe(first.fs) // the SAME tree — nothing to commit
    expect(again.accession).toBe('SPC-0001')
    expect(again.fs.nodes['n2']).toBeUndefined()
  })

  it('a name-squatting node refuses with the FSError — nothing half-committed', () => {
    let fs = emptyFSState(0)
    fs = createNode(fs, { id: 'd1', parentId: fs.rootId, name: RELAY_DRAWER_NAME, kind: 'folder', now: 0 })
    fs = createNode(fs, {
      id: 'squatter',
      parentId: 'd1',
      name: letter.filedName.toUpperCase(), // case-insensitive sibling rule
      kind: 'folder',
      now: 0,
    })

    expect(() => fileLetter(fs, letter, { id: 'n1', now: 1_000 })).toThrow(FSError)
    try {
      fileLetter(fs, letter, { id: 'n1', now: 1_000 })
    } catch (error) {
      expect((error as FSError).code).toBe('name-collision')
    }
  })

  it('specimenText rules off a full transcript header', () => {
    const text = specimenText(letter)
    const lines = text.split('\n')
    expect(lines[0]).toBe('FILED CORRESPONDENCE — SURVEY RELAY')
    expect(text).toContain(`FROM:    ${letter.from} (${letter.fromCode})`)
    expect(text).toContain(`SUBJECT: ${letter.subject}`)
    expect(text).toContain(`SENT:    ${letter.stamp}`)
    expect(text).toContain('— TRANSCRIPT ENDS —')
  })

  it('filedSpecimen finds the live specimen (case-insensitive) or reports none', () => {
    const fs = emptyFSState(0)
    expect(filedSpecimen(fs, letter)).toBeNull()
    const filed = fileLetter(fs, letter, { id: 'n1', drawerId: 'd1', now: 1_000 })
    expect(filedSpecimen(filed.fs, letter)?.id).toBe('n1')
    expect(filedSpecimen(filed.fs, RELAY_LETTERS[1]!)).toBeNull()
  })
})
