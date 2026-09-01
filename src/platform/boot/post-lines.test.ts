import { describe, expect, it } from 'vitest'
import { OS_NAME, OS_VERSION } from './os'
import { buildPostLines, buildResumeLine, type PostSubsystemReport } from './post-lines'

/** Lines are pure functions of real subsystem readings — no DOM, no timers. */

const BASE: PostSubsystemReport = {
  bootOrigin: 'stored',
  schemaVersion: 1,
  nodeCount: 14,
  moduleCount: 6,
  recovery: null,
}

function lineText(lines: ReturnType<typeof buildPostLines>, id: string): string {
  const line = lines.find((it) => it.id === id)
  if (!line) throw new Error(`no POST line ${id}`)
  return line.text
}

describe('buildPostLines · check order + labels', () => {
  it('emits the four subsystem checks then the HOLD/OS banner, in order', () => {
    const lines = buildPostLines(BASE)
    expect(lines.map((line) => line.id)).toEqual([
      'archive-integrity',
      'module-registry',
      'plugin-bus',
      'console',
      'os-banner',
    ])
    for (const id of ['archive-integrity', 'module-registry', 'plugin-bus', 'console']) {
      expect(lineText(lines, id)).toContain(id.toUpperCase().replace('-', ' '))
    }
    expect(lineText(lines, 'plugin-bus')).toContain('READY')
    expect(lineText(lines, 'console')).toContain('ONLINE')
  })

  it('all status lines share one dot-leader gutter (aligned status column)', () => {
    const lines = buildPostLines(BASE).filter((line) => line.id !== 'os-banner')
    const bus = lineText(lines, 'plugin-bus')
    const consoleLine = lineText(lines, 'console')
    const archive = lineText(lines, 'archive-integrity')
    expect(bus.indexOf('READY')).toBe(consoleLine.indexOf('ONLINE'))
    expect(bus.indexOf('READY')).toBe(archive.indexOf('VERIFIED'))
    for (const line of lines) {
      expect(
        line.text.slice(line.text.indexOf('.'), line.text.indexOf(' ', line.text.indexOf('.'))),
      ).toMatch(/^\.+$/)
    }
  })

  it('the banner carries the OS name and version (mono-set digits in the well)', () => {
    const banner = buildPostLines(BASE).find((line) => line.id === 'os-banner')
    expect(banner?.role).toBe('banner')
    expect(banner?.text).toContain(OS_NAME)
    expect(banner?.text).toContain(OS_VERSION)
  })
})

describe('buildPostLines · ARCHIVE INTEGRITY reports the real boot result', () => {
  it('origin stored → VERIFIED with item count and schema version', () => {
    const text = lineText(buildPostLines(BASE), 'archive-integrity')
    expect(text).toContain('VERIFIED')
    expect(text).toContain('14 ITEMS')
    expect(text).toContain('V1')
  })

  it('origins migrated / seed / backup each get their honest word', () => {
    expect(
      lineText(buildPostLines({ ...BASE, bootOrigin: 'migrated' }), 'archive-integrity'),
    ).toContain('MIGRATED')
    expect(
      lineText(buildPostLines({ ...BASE, bootOrigin: 'seed' }), 'archive-integrity'),
    ).toContain('SEEDED')
    expect(
      lineText(buildPostLines({ ...BASE, bootOrigin: 'backup' }), 'archive-integrity'),
    ).toContain('RESTORED')
  })

  it('a recovery notice OVERRIDES the origin word — it is the more specific truth', () => {
    const cases: readonly [PostSubsystemReport['recovery'], RegExp][] = [
      [{ kind: 'storage-unavailable', message: 'x', at: 0 }, /MEMORY ONLY/],
      [{ kind: 'restored-from-backup', message: 'x', at: 0 }, /RESTORED FROM BACKUP/],
      [{ kind: 'reseeded', message: 'x', at: 0 }, /RESEEDED/],
      [{ kind: 'unknown-version', message: 'x', at: 0 }, /RECOVERED · RESEEDED/],
    ]
    for (const [recovery, pattern] of cases) {
      // origin 'stored' would say VERIFIED — the recovery word must win
      const text = lineText(buildPostLines({ ...BASE, recovery }), 'archive-integrity')
      expect(text).toMatch(pattern)
      expect(text).not.toContain('VERIFIED')
    }
  })
})

describe('buildPostLines · MODULE REGISTRY reports the registry length', () => {
  it('singular and plural module counts', () => {
    expect(lineText(buildPostLines({ ...BASE, moduleCount: 1 }), 'module-registry')).toContain(
      '1 MODULE REGISTERED',
    )
    expect(lineText(buildPostLines({ ...BASE, moduleCount: 3 }), 'module-registry')).toContain(
      '3 MODULES REGISTERED',
    )
  })
})

describe('buildResumeLine', () => {
  it('is the single ≤200ms return-visit flash line', () => {
    expect(buildResumeLine()).toEqual({ id: 'resume', text: 'RESUME' })
  })
})
