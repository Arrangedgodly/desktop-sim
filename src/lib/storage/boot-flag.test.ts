// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOOT_FLAG_KEY, clearBootFlag, readBootFlag, writeBootFlag } from './boot-flag'

afterEach(() => {
  vi.unstubAllGlobals() // restore the real localStorage BEFORE clearing it
  localStorage.clear()
})

describe('boot flag · first-visit vs return-visit verdict', () => {
  it('reads null on a clean slate (first visit)', () => {
    expect(readBootFlag()).toBeNull()
  })

  it('writeBootFlag stamps the schema version; readBootFlag sees the return visit', () => {
    writeBootFlag(1)
    expect(readBootFlag()).toEqual({ seen: true, version: 1 })
    expect(localStorage.getItem(BOOT_FLAG_KEY)).toBe('1')
  })

  it('defaults to the current schema version', () => {
    writeBootFlag()
    expect(readBootFlag()).toEqual({ seen: true, version: 1 })
  })

  it('clearBootFlag returns the console to first-visit pacing', () => {
    writeBootFlag(1)
    clearBootFlag()
    expect(readBootFlag()).toBeNull()
    expect(localStorage.getItem(BOOT_FLAG_KEY)).toBeNull()
  })

  it('a poisoned flag value reads as null (first visit), not as a number', () => {
    localStorage.setItem(BOOT_FLAG_KEY, 'not-a-version')
    expect(readBootFlag()).toBeNull()
    localStorage.setItem(BOOT_FLAG_KEY, '-3')
    expect(readBootFlag()).toBeNull()
  })

  it('a throwing localStorage (SecurityError / private mode) is non-fatal', () => {
    vi.stubGlobal(
      'localStorage',
      Object.freeze({
        getItem: () => {
          throw new DOMException('denied', 'SecurityError')
        },
        setItem: () => {
          throw new DOMException('denied', 'SecurityError')
        },
        removeItem: () => {
          throw new DOMException('denied', 'SecurityError')
        },
      }),
    )
    expect(readBootFlag()).toBeNull()
    expect(() => writeBootFlag(1)).not.toThrow()
    expect(() => clearBootFlag()).not.toThrow()
  })

  it('a missing localStorage global degrades to first visit', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readBootFlag()).toBeNull()
    expect(() => writeBootFlag(1)).not.toThrow()
  })
})
