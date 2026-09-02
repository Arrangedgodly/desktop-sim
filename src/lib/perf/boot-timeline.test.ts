// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  markBootMilestone,
  onBootMilestone,
  readBootTimeline,
  resetBootTimeline,
} from './boot-timeline'

/** TH-1 unit tests: the boot-timing seam fills window.__BOOT_TIMELINE exactly
 * as UI-2 (and the e2e timing assertion) will consume it. */

afterEach(() => {
  resetBootTimeline()
  vi.restoreAllMocks()
})

describe('TH-1 · boot timeline seam', () => {
  it('marks milestones with performance.now() into window.__BOOT_TIMELINE', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1234.5)
    const marked = markBootMilestone('first-paint')
    expect(marked).toEqual({ name: 'first-paint', t: 1234.5, order: 0 })
    expect(window.__BOOT_TIMELINE).toEqual([{ name: 'first-paint', t: 1234.5, order: 0 }])
  })

  it('appends in call order across multiple milestones', () => {
    const clock = vi.spyOn(performance, 'now')
    clock.mockReturnValueOnce(10)
    clock.mockReturnValueOnce(250)
    clock.mockReturnValueOnce(1800)

    markBootMilestone('first-paint')
    markBootMilestone('module-registry')
    markBootMilestone('interactive')

    expect(readBootTimeline()).toEqual([
      { name: 'first-paint', t: 10, order: 0 },
      { name: 'module-registry', t: 250, order: 1 },
      { name: 'interactive', t: 1800, order: 2 },
    ])
  })

  it('reads back the live window array (what e2e will assert against)', () => {
    markBootMilestone('first-paint')
    markBootMilestone('interactive')
    expect(window.__BOOT_TIMELINE?.length).toBe(2)
    expect(window.__BOOT_TIMELINE?.map((m) => m.name)).toEqual(['first-paint', 'interactive'])
  })

  it('readBootTimeline returns a defensive copy', () => {
    markBootMilestone('first-paint')
    const snapshot = readBootTimeline()
    ;(snapshot as { pop?: () => unknown }).pop?.() // typed readonly; try mutating anyway
    expect(readBootTimeline()).toHaveLength(1)
  })

  it('resetBootTimeline empties the seam for the next scenario', () => {
    markBootMilestone('first-paint')
    resetBootTimeline()
    expect(readBootTimeline()).toEqual([])
    expect(window.__BOOT_TIMELINE).toEqual([])
    expect(markBootMilestone('interactive')?.order).toBe(0) // order restarts
  })

  it('survives a broken performance.now (returns null, no throw)', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => {
      throw new Error('clock unavailable')
    })
    expect(markBootMilestone('first-paint')).toBeNull()
    expect(readBootTimeline()).toEqual([]) // nothing recorded, nothing crashed
  })
})

describe('TH-1 · boot milestone listeners (UI-6 seam)', () => {
  it('onBootMilestone hears marks the moment they land, in order', () => {
    const heard: string[] = []
    const off = onBootMilestone((milestone) => heard.push(milestone.name))

    markBootMilestone('boot-start')
    markBootMilestone('desktop-ready')

    expect(heard).toEqual(['boot-start', 'desktop-ready'])
    off()
  })

  it('a throwing listener is swallowed — the mark still lands, others still hear', () => {
    const heard: string[] = []
    onBootMilestone(() => {
      throw new Error('observer bug')
    })
    const off = onBootMilestone((milestone) => heard.push(milestone.name))

    expect(() => markBootMilestone('post-complete')).not.toThrow()
    expect(readBootTimeline().map((m) => m.name)).toEqual(['post-complete'])
    expect(heard).toEqual(['post-complete'])
    off()
  })

  it('unsubscribes cleanly; resetBootTimeline keeps observers subscribed', () => {
    const heard: string[] = []
    const off = onBootMilestone((milestone) => heard.push(milestone.name))

    resetBootTimeline() // resets the RECORD, never the observers
    markBootMilestone('taskbar-ready')
    expect(heard).toEqual(['taskbar-ready'])

    off()
    markBootMilestone('desktop-ready')
    expect(heard).toEqual(['taskbar-ready']) // gone for good
  })
})

