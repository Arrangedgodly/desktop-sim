// @vitest-environment jsdom
// MenuShell (UI-5) — the a11y hotspot unit pass: roles/semantics, the full
// keyboard path (arrows wrap, Home/End, Enter/Space activation, Escape,
// Tab-stow), focus landing + return, outside-close, and the two-step
// guarded-confirm state — all against the shell directly, item lists
// standing in for any future client (the desktop, AP-1's explorer).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { MenuProvider } from './MenuProvider'
import { MenuShell } from './MenuShell'
import type { MenuSession } from './MenuShell'
import { useConsoleMenu } from './use-console-menu'
import type { MenuItem } from './menu-items'

afterEach(() => {
  cleanup()
  scratch.forEach((el) => el.remove())
  scratch.length = 0
})

/** Manually-appended invokers (not React-owned) — removed between tests. */
const scratch: HTMLElement[] = []

/* ------------------------------ helpers --------------------------------- */

const shellMenu = (): HTMLElement => {
  const el = document.querySelector('[data-menu-root]')
  if (!(el instanceof HTMLElement)) throw new Error('menu not open')
  return el
}

const item = (id: string): HTMLButtonElement => {
  const el = document.querySelector(`[data-menu-item="${id}"]`)
  if (!(el instanceof HTMLButtonElement)) throw new Error(`menu row "${id}" not rendered`)
  return el
}

const focused = (): Element | null => document.activeElement

/** An invoker button + the open shell, focus resting on the invoker. */
function renderShell(items: readonly MenuItem[], overrides: Partial<MenuSession> = {}): {
  onClose: ReturnType<typeof vi.fn>
} {
  const onClose = vi.fn()
  const invoker = document.createElement('button')
  invoker.textContent = 'invoker'
  document.body.appendChild(invoker)
  scratch.push(invoker)
  invoker.focus()
  const session: MenuSession = {
    items,
    anchor: { kind: 'point', x: 100, y: 100 },
    ariaLabel: 'Probe menu',
    invoker,
    ...overrides,
  }
  render(<MenuShell session={session} onClose={onClose} />)
  return { onClose }
}

const sampleItems = (onSelect = vi.fn()): MenuItem[] => [
  { kind: 'action', id: 'one', label: 'One', onSelect },
  { kind: 'separator', id: 'sep' },
  { kind: 'action', id: 'two', label: 'Two', onSelect },
  { kind: 'action', id: 'three', label: 'Three', disabled: true },
]

/* ------------------------------ semantics -------------------------------- */

describe('MenuShell · roles and semantics', () => {
  it('renders role=menu with its accessible name, menuitem rows, and a separator groove', () => {
    renderShell(sampleItems())
    expect(shellMenu().getAttribute('role')).toBe('menu')
    expect(shellMenu().getAttribute('aria-label')).toBe('Probe menu')
    expect(item('one').getAttribute('role')).toBe('menuitem')
    expect(item('two').getAttribute('role')).toBe('menuitem')
    expect(document.querySelector('[data-menu-root] [role="separator"]')).not.toBeNull()
  })

  it('renders radio rows as menuitemradio with aria-checked', () => {
    renderShell([
      { kind: 'radio', id: 'grid', label: 'Grid', checked: true },
      { kind: 'radio', id: 'list', label: 'List', checked: false },
    ])
    expect(item('grid').getAttribute('role')).toBe('menuitemradio')
    expect(item('grid').getAttribute('aria-checked')).toBe('true')
    expect(item('list').getAttribute('aria-checked')).toBe('false')
  })

  it('carries the destructive marker only on destructive rows', () => {
    renderShell([
      { kind: 'action', id: 'safe', label: 'Safe' },
      { kind: 'action', id: 'burn', label: 'Burn', destructive: true },
    ])
    expect(item('safe').getAttribute('data-destructive')).toBeNull()
    expect(item('burn').getAttribute('data-destructive')).toBe('true')
  })

  it('renders disabled rows as disabled buttons', () => {
    renderShell(sampleItems())
    expect(item('three').disabled).toBe(true)
  })
})

/* ------------------------------ keyboard path ---------------------------- */

describe('MenuShell · keyboard path', () => {
  it('focus opens on the first ENABLED row', () => {
    renderShell([{ kind: 'action', id: 'dead', label: 'Dead', disabled: true }, ...sampleItems()])
    expect(focused()).toBe(item('one'))
  })

  it('ArrowDown moves down, skipping the groove and disabled rows', () => {
    renderShell(sampleItems())
    fireEvent.keyDown(shellMenu(), { key: 'ArrowDown' })
    expect(focused()).toBe(item('two'))
    fireEvent.keyDown(shellMenu(), { key: 'ArrowDown' }) // skips disabled 'three', wraps
    expect(focused()).toBe(item('one'))
  })

  it('ArrowUp wraps from the first row to the last enabled row', () => {
    renderShell(sampleItems())
    fireEvent.keyDown(shellMenu(), { key: 'ArrowUp' })
    expect(focused()).toBe(item('two')) // 'three' is disabled — never focusable
  })

  it('Home and End jump to the first and last enabled rows', () => {
    renderShell(sampleItems())
    fireEvent.keyDown(shellMenu(), { key: 'End' })
    expect(focused()).toBe(item('two'))
    fireEvent.keyDown(shellMenu(), { key: 'Home' })
    expect(focused()).toBe(item('one'))
  })

  it('selecting a row runs its command and requests close with invoker restore', () => {
    const onSelect = vi.fn()
    const { onClose } = renderShell(sampleItems(onSelect))
    const row = item('one')
    row.focus()
    // Buttons activate natively on Enter/Space; the click IS the select path
    // both take. Focus was inside the menu → restore is requested.
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('Escape closes with focus restore requested', () => {
    const { onClose } = renderShell(sampleItems())
    fireEvent.keyDown(shellMenu(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('Tab walks the rows WITHIN the menu (a menu keeps its focus; Esc closes)', () => {
    const { onClose } = renderShell(sampleItems())
    const focused = () => document.activeElement
    expect(focused()).toBe(item('one')) // open lands on the first row

    fireEvent.keyDown(shellMenu(), { key: 'Tab' })
    expect(focused()).toBe(item('two'))
    expect(onClose).not.toHaveBeenCalled() // still open — Tab is traversal now

    fireEvent.keyDown(shellMenu(), { key: 'Tab', shiftKey: true })
    expect(focused()).toBe(item('one'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('outside pointerdown closes WITHOUT forcing focus back', () => {
    const { onClose } = renderShell(sampleItems())
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('viewport resize closes the menu', () => {
    const { onClose } = renderShell(sampleItems())
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(onClose).toHaveBeenCalledWith(false)
  })
})

/* ------------------------------ guarded confirm --------------------------- */

describe('MenuShell · two-step guarded confirm', () => {
  const guarded = (onSelect = vi.fn()): MenuItem[] => [
    { kind: 'action', id: 'burn', label: 'Delete', destructive: true, onSelect, confirm: {
      prompt: 'Delete it?',
      detail: 'It is gone for good.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    } },
    { kind: 'action', id: 'plain', label: 'Plain' },
  ]

  it('activating a guarded row swaps the SAME menu to the confirm step (no new dialog)', () => {
    renderShell(guarded())
    fireEvent.click(item('burn'))
    const menu = shellMenu()
    expect(menu).toBe(document.querySelector('[data-menu-root]')) // same panel
    expect(document.querySelector('[data-menu-confirm]')).not.toBeNull()
    expect(menu.textContent).toContain('Delete it?')
    expect(menu.textContent).toContain('It is gone for good.')
    expect(item('burn__cancel')).toBeDefined()
    expect(item('burn__go').getAttribute('data-commit')).toBe('true')
    expect(item('burn__go').getAttribute('data-destructive')).toBe('true')
    // the command itself has NOT run yet
  })

  it('the confirm step focuses its first row (Cancel)', () => {
    renderShell(guarded())
    fireEvent.click(item('burn'))
    expect(focused()).toBe(item('burn__cancel'))
  })

  it('Cancel steps back to the full item list, command not run', () => {
    const onSelect = vi.fn()
    renderShell(guarded(onSelect))
    fireEvent.click(item('burn'))
    fireEvent.click(item('burn__cancel'))
    expect(document.querySelector('[data-menu-confirm]')).toBeNull()
    expect(item('burn')).toBeDefined()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Escape inside the confirm steps back to the items first, then closes on a second Escape', () => {
    const { onClose } = renderShell(guarded())
    fireEvent.click(item('burn'))
    fireEvent.keyDown(shellMenu(), { key: 'Escape' })
    expect(document.querySelector('[data-menu-confirm]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(shellMenu(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('Confirm runs the command and requests close', () => {
    const onSelect = vi.fn()
    const { onClose } = renderShell(guarded(onSelect))
    fireEvent.click(item('burn'))
    fireEvent.click(item('burn__go'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('keyboard navigation works inside the confirm step', () => {
    renderShell(guarded())
    fireEvent.click(item('burn'))
    fireEvent.keyDown(shellMenu(), { key: 'ArrowDown' })
    expect(focused()).toBe(item('burn__go'))
    fireEvent.keyDown(shellMenu(), { key: 'Home' })
    expect(focused()).toBe(item('burn__cancel'))
  })
})

/* ------------------------------ provider focus law ------------------------ */

describe('MenuProvider · focus law through the composable openMenu seam', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** Probe that opens the console menu from a button click. */
  function Probe({ items }: { readonly items: readonly MenuItem[] }) {
    const { openMenu } = useConsoleMenu()
    return (
      <button type="button" onClick={() => openMenu(items, { kind: 'point', x: 10, y: 10 }, { ariaLabel: 'Probe menu' })}>
        open
      </button>
    )
  }

  it('openMenu renders the shell; Escape returns focus to the invoker', () => {
    const items: MenuItem[] = [{ kind: 'action', id: 'one', label: 'One' }]
    render(
      <MenuProvider>
        <Probe items={items} />
      </MenuProvider>,
    )
    const opener = document.querySelector('button')!
    opener.focus()
    fireEvent.click(opener)
    expect(document.querySelector('[data-menu-root]')).not.toBeNull()
    expect(focused()).toBe(item('one'))

    fireEvent.keyDown(shellMenu(), { key: 'Escape' })
    expect(document.querySelector('[data-menu-root]')).toBeNull()
    expect(focused()).toBe(opener) // the invoker got focus back
  })

  it('selecting a row that leaves focus in the menu restores the invoker', () => {
    const items: MenuItem[] = [{ kind: 'action', id: 'one', label: 'One' }]
    render(
      <MenuProvider>
        <Probe items={items} />
      </MenuProvider>,
    )
    const opener = document.querySelector('button')!
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(item('one'))
    expect(document.querySelector('[data-menu-root]')).toBeNull()
    expect(focused()).toBe(opener)
  })

  it('a row that moves focus itself keeps it (e.g. an inline rename input)', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const items: MenuItem[] = [
      {
        kind: 'action',
        id: 'rename',
        label: 'Rename',
        onSelect: () => field.focus(), // the command grabs focus, as rename does
      },
    ]
    render(
      <MenuProvider>
        <Probe items={items} />
      </MenuProvider>,
    )
    const opener = document.querySelector('button')!
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(item('rename'))
    expect(document.querySelector('[data-menu-root]')).toBeNull()
    expect(focused()).toBe(field)
    field.remove()
  })

  it('useConsoleMenu throws outside a provider (a missing host is a wiring bug)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<BadProbe />)).toThrow(/MenuProvider/)
    spy.mockRestore()
  })
})

function BadProbe() {
  useConsoleMenu()
  return <p>bad</p>
}
