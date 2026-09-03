/**
 * Archive Backup model tests (batch-2 brief 10, acceptance 1) — the pure
 * validator behind the import door, DOM-free. The law under test: hostile
 * input is REFUSED with a typed code and never throws past the boundary —
 * and the refusals that name prototype-pollution shapes actually leave
 * Object.prototype untouched.
 */

import { describe, expect, it } from 'vitest'
import { readStoredState, seedStoredState, STORED_SCHEMA_VERSION } from '../../lib/storage'
import type { StoredState } from '../../lib/storage'
import {
  MAX_CATALOG_NODES,
  REFUSAL_LABELS,
  exportFileName,
  formatBytes,
  formatStamp,
  readImportText,
  serializeBackup,
  summarize,
  validateImportedEnvelope,
  type BackupRefusalCode,
} from './backup-model'

/* ------------------------------- fixtures --------------------------------- */

/** A REAL valid v1 envelope (the deterministic first-visit seed), as file text. */
const seedText = (): string => serializeBackup(seedStoredState())

/** The seed parsed back through the platform reader — the trusted reference. */
const seedState = (): StoredState => readStoredState(JSON.parse(seedText()))

/**
 * A hostile JSON string claiming an own `__proto__` key inside fs.nodes.
 * The key must be COMPUTED — a literal `__proto__:` would set the fixture's
 * own prototype and never reach the serialized JSON.
 */
const protoInsideNodes = (): string =>
  JSON.stringify({
    version: 1,
    savedAt: 0,
    iconPositions: {},
    fs: {
      rootId: 'root',
      nodes: {
        root: {
          id: 'root',
          parentId: null,
          name: 'Hold',
          kind: 'folder',
          accession: 'ARC-0000',
          accessionedAt: 0,
        },
        ['__proto__']: { polluted: 'yes' },
      },
    },
    windows: [],
    settings: {},
  })

/** Every shape the door must refuse — [label, text or value]. */
const hostileFiles: ReadonlyArray<readonly [string, string]> = [
  ['empty string', ''],
  ['whitespace only', '   \n\t  '],
  ['not JSON', 'the archive, but as prose'],
  ['truncated JSON', '{"version":1,"fs":'],
  ['a JSON array', '[]'],
  ['a JSON number', '42000'],
  ['a JSON null', 'null'],
  ['a JSON string', '"holdos-archive-v1"'],
  ['versionless object', '{}'],
  ['future version', '{"version":9999}'],
  ['negative version', '{"version":-1}'],
  ['fractional version', '{"version":1.5}'],
  ['string version', '{"version":"1"}'],
  ['v1 missing fs', '{"version":1,"savedAt":0,"iconPositions":{}}'],
  ['v1 fs is a string', '{"version":1,"savedAt":0,"iconPositions":{},"fs":"missing"}'],
  ['nodes not a record', '{"version":1,"savedAt":0,"iconPositions":{},"fs":{"rootId":"root","nodes":7}}'],
  ['root not a drawer', '{"version":1,"savedAt":0,"iconPositions":{},"fs":{"rootId":"root","nodes":{"root":{"id":"root","parentId":null,"name":"H","kind":"text","accession":"SPC-0001","accessionedAt":0,"content":""}}}}'],
  ['node id/key mismatch', '{"version":1,"savedAt":0,"iconPositions":{},"fs":{"rootId":"root","nodes":{"root":{"id":"other","parentId":null,"name":"H","kind":"folder","accession":"ARC-0000","accessionedAt":0}}}}'],
  ['dangling parentId', '{"version":1,"savedAt":0,"iconPositions":{},"fs":{"rootId":"root","nodes":{"root":{"id":"root","parentId":null,"name":"H","kind":"folder","accession":"ARC-0000","accessionedAt":0},"a":{"id":"a","parentId":"ghost","name":"A","kind":"text","accession":"SPC-0001","accessionedAt":0,"content":""}}}}'],
  ['missing savedAt', '{"version":1,"fs":{"rootId":"root","nodes":{"root":{"id":"root","parentId":null,"name":"H","kind":"folder","accession":"ARC-0000","accessionedAt":0}}},"iconPositions":{}}'],
  ['__proto__ inside fs.nodes', protoInsideNodes()],
  ['constructor inside iconPositions', '{"version":1,"savedAt":0,"iconPositions":{"constructor":{"x":1,"y":2}},"fs":{"rootId":"root","nodes":{"root":{"id":"root","parentId":null,"name":"H","kind":"folder","accession":"ARC-0000","accessionedAt":0}}}}'],
  ['prototype as a window id', JSON.stringify({
    version: 1,
    savedAt: 0,
    iconPositions: {},
    fs: {
      rootId: 'root',
      nodes: { root: { id: 'root', parentId: null, name: 'H', kind: 'folder', accession: 'ARC-0000', accessionedAt: 0 } },
    },
    windows: [{ id: 'prototype', appId: 'notepad', geometry: { x: 0, y: 0, w: 300, h: 200 } }],
  })],
]

/* ------------------------------- the door --------------------------------- */

describe('backup-model · the import door (acceptance 1)', () => {
  it('admits the real v1 seed — verdict ok, summary counts the catalog honestly', () => {
    const verdict = readImportText(seedText())
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return

    const expected = summarize(seedState(), seedText().length)
    expect(verdict.summary).toEqual(expected)
    // The seed's own arithmetic: every node is a drawer or a specimen, the
    // root hold among the drawers, and a first-visit session holds no windows.
    expect(verdict.summary.version).toBe(STORED_SCHEMA_VERSION)
    expect(verdict.summary.drawers).toBeGreaterThan(1)
    expect(verdict.summary.specimens).toBeGreaterThan(1)
    expect(verdict.summary.windows).toBe(0)
    expect(verdict.summary.bytes).toBe(seedText().length)
  })

  it('admits a v0 envelope — the migration chain brings it forward honestly', () => {
    const v0 = JSON.stringify({
      version: 0,
      rootId: 'root',
      iconPositions: {},
      nodes: {
        root: { id: 'root', parentId: null, name: 'Hold', kind: 'folder' },
      },
    })
    const verdict = readImportText(v0)
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.state.version).toBe(STORED_SCHEMA_VERSION)
    expect(verdict.summary.drawers).toBe(1)
    expect(verdict.summary.specimens).toBe(0)
  })

  it('round-trips the export serialization through the door unchanged', () => {
    const text = serializeBackup(seedState())
    const verdict = readImportText(text)
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    // Byte-for-byte: the console's own export is always its own import.
    expect(verdict.summary.bytes).toBe(text.length)
    expect(JSON.parse(serializeBackup(verdict.state))).toEqual(JSON.parse(text))
  })

  it('summarize counts drawers vs specimens vs windows from the state itself', () => {
    const state = seedState()
    const withWindows: StoredState = {
      ...state,
      windows: [
        {
          id: 'w1',
          appId: 'notepad',
          instanceId: 'auto:w1',
          geometry: { x: 8, y: 8, w: 400, h: 300 },
          z: 1,
          minimized: false,
          maximized: false,
          title: 'Note',
          openedAt: 0,
        },
      ],
    }
    const summary = summarize(withWindows, 1234)
    const kinds = Object.values(withWindows.fs.nodes).map((n) => n.kind)
    expect(summary.drawers).toBe(kinds.filter((k) => k === 'folder').length)
    expect(summary.specimens).toBe(kinds.filter((k) => k !== 'folder').length)
    expect(summary.windows).toBe(1)
    expect(summary.bytes).toBe(1234)
  })
})

describe('backup-model · hostile shapes are refused, never thrown (acceptance 1)', () => {
  for (const [label, text] of hostileFiles) {
    it(`refuses ${label} with a typed code`, () => {
      let thrown: unknown = null
      const verdict = (() => {
        try {
          return readImportText(text)
        } catch (error) {
          thrown = error
          return undefined
        }
      })()
      expect(thrown).toBeNull() // NEVER a throw past the boundary
      expect(verdict).toBeDefined()
      if (!verdict || verdict.ok) throw new Error(`expected a typed refusal for: ${label}`)
      const labelForCode: BackupRefusalCode = verdict.code
      expect(REFUSAL_LABELS[labelForCode]).toBeTruthy()
      expect(verdict.message.length).toBeGreaterThan(0)
    })
  }

  it('maps the failure families to the right codes', () => {
    const code = (text: string): BackupRefusalCode => {
      const verdict = readImportText(text)
      if (verdict.ok) throw new Error(`expected refusal, got ok for: ${text.slice(0, 40)}`)
      return verdict.code
    }
    expect(code('')).toBe('empty')
    expect(code('prose')).toBe('not-json')
    expect(code('[]')).toBe('not-an-archive')
    expect(code('{"version":9999}')).toBe('unknown-version')
    expect(code('{"version":1}')).toBe('corrupt')
    expect(code(protoInsideNodes())).toBe('hostile-envelope')
  })

  it('refuses absurd node counts before the harness ever runs (DoS door)', () => {
    const nodes: Record<string, unknown> = {
      root: { id: 'root', parentId: null, name: 'H', kind: 'folder', accession: 'ARC-0000', accessionedAt: 0 },
    }
    for (let i = 0; i < MAX_CATALOG_NODES + 1; i += 1) {
      nodes[`n${i}`] = { id: `n${i}`, parentId: 'root', name: `n${i}`, kind: 'text', accession: 'SPC-0001', accessionedAt: 0, content: '' }
    }
    const verdict = validateImportedEnvelope(
      { version: 1, savedAt: 0, iconPositions: {}, fs: { rootId: 'root', nodes }, windows: [], settings: {} },
      1024,
    )
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.code).toBe('hostile-envelope')
    // root + the loop's MAX_CATALOG_NODES + 1 hostile entries
    expect(verdict.message).toContain(String(MAX_CATALOG_NODES + 2))
  })

  it('survives an in-memory Proxy that throws during the scan — refusal, not a throw', () => {
    const bomb = new Proxy(
      {},
      {
        ownKeys(): string[] {
          throw new Error('hostile trap')
        },
      },
    )
    let thrown: unknown = null
    const verdict = (() => {
      try {
        return validateImportedEnvelope(bomb, 10)
      } catch (error) {
        thrown = error
        return undefined
      }
    })()
    expect(thrown).toBeNull()
    expect(verdict).toBeDefined()
    if (!verdict || verdict.ok) throw new Error('expected a typed refusal for the Proxy bomb')
    expect(verdict.code).toBe('hostile-envelope')
  })

  it('leaves Object.prototype untouched after the whole hostile battery', () => {
    for (const [, text] of hostileFiles) readImportText(text)
    readImportText('{"__proto__":{"polluted":"yes"}}')
    readImportText(protoInsideNodes())
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
    expect(Object.hasOwn(Object.getPrototypeOf({}), 'polluted')).toBe(false)
    expect(Object.keys(JSON.parse(seedText())).includes('__proto__')).toBe(false)
  })
})

describe('backup-model · the readouts honest formats', () => {
  it('names the export for its version and UTC stamp', () => {
    expect(exportFileName(1, Date.UTC(2026, 8, 2, 4, 17, 55))).toBe(
      'holdos-archive-v1-20260902-041755.json',
    )
  })

  it('formats UTC stamps and byte sizes for the well', () => {
    expect(formatStamp(Date.UTC(2026, 0, 7, 9, 8, 5))).toBe('2026-01-07 09:08:05')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(14_050)).toBe('13.7 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
