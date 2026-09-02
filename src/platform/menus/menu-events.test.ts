import { describe, expect, it } from 'vitest'
import { emitMenuEvent, onMenuEvent } from './menu-events'

/** UI-6 menu bus — the minimal pub-sub the audio wiring listens on. Zero
 * listeners must cost zero; a throwing observer must never break a menu. */

describe('UI-6 · menu event bus', () => {
  it('delivers events to every listener', () => {
    const heard: string[] = []
    const off = onMenuEvent((event) => heard.push(event))
    const offToo = onMenuEvent((event) => heard.push(`${event}!`))

    emitMenuEvent('open')
    emitMenuEvent('select')

    expect(heard).toEqual(['open', 'open!', 'select', 'select!'])
    off()
    offToo()
  })

  it('swallows a throwing observer — the other listeners still hear the menu', () => {
    const heard: string[] = []
    onMenuEvent(() => {
      throw new Error('observer bug')
    })
    const off = onMenuEvent((event) => heard.push(event))

    expect(() => emitMenuEvent('select')).not.toThrow()
    expect(heard).toEqual(['select'])
    off()
  })

  it('unsubscribes cleanly; an empty bus is a no-op', () => {
    const heard: string[] = []
    const off = onMenuEvent((event) => heard.push(event))
    off()
    off() // idempotent

    emitMenuEvent('open')
    expect(heard).toEqual([])
  })

  it('keeps listeners across many events (no once-semantics by accident)', () => {
    const heard: string[] = []
    const off = onMenuEvent((event) => heard.push(event))
    emitMenuEvent('open')
    emitMenuEvent('open')
    emitMenuEvent('select')
    expect(heard).toEqual(['open', 'open', 'select'])
    off()
  })
})
