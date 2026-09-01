import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { openApp, useAppRegistryStore } from '../app-registry'

/**
 * Module launcher (IM-4c) — the rail's drawer pull and the module menu it
 * opens. The list is the REGISTRY (`s.order` + per-item manifests), never a
 * hardcoded roster: registering an app lights an entry, unregistering removes
 * it, and the empty registry states its emptiness honestly.
 *
 * Behavior floor (DD-1 owns the deep keyboard pass):
 * - launch = `openApp(id)` (the sanctioned open path; launcher context rides
 *   the window record) and the drawer closes;
 * - Escape / Tab / pointerdown outside close the drawer, Escape returning
 *   focus to the pull;
 * - ArrowDown/ArrowUp/Home/End rove focus across the items; Enter/Space are
 *   native button activation.
 *
 * The pull is the rail's brass hardware touchpoint (design-brief law: brass
 * at drawer pulls); the menu itself is raised chrome — phosphor never appears.
 */
export function ModuleLauncher() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const pullRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const order = useAppRegistryStore((s) => s.order)

  // Click-outside closes: a pointerdown landing anywhere outside the anchor
  // (pull + menu both live inside it) stows the drawer.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Opening lands focus on the first item — arrow/Enter/Esc work from there.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  const closeDrawer = (returnFocus: boolean): void => {
    setOpen(false)
    if (returnFocus) pullRef.current?.focus()
  }

  const launch = (appId: string): void => {
    openApp(appId) // soft-fails (warn + null) on unknown ids — never a throw
    setOpen(false)
  }

  const focusItem = (index: number): void => {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null)
    if (items.length === 0) return
    const wrapped = ((index % items.length) + items.length) % items.length
    items[wrapped]!.focus()
  }

  const focusedItemIndex = (): number =>
    itemRefs.current.findIndex((el) => el !== null && el === document.activeElement)

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDrawer(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusItem(focusedItemIndex() + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusItem(focusedItemIndex() - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusItem(itemRefs.current.length - 1)
    } else if (event.key === 'Tab') {
      // A menu swallows tab-order traversal; stowing returns the user to the
      // rail's natural order (DD-1 may revisit).
      event.preventDefault()
      closeDrawer(true)
    }
  }

  return (
    <div className="tb-launcher-anchor" ref={rootRef}>
      <button
        ref={pullRef}
        type="button"
        className="tb-pull"
        data-launcher-pull
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Module drawer — launch a module"
        title="Module drawer"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="tb-pull-label">Modules</span>
        <span className="tb-pull-grip" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="tb-launcher"
          data-launcher-menu
          role="menu"
          aria-label="Module drawer"
          onKeyDown={onMenuKeyDown}
        >
          <p className="engraved tb-launcher-head">Module drawer</p>
          {order.length === 0 ? (
            <p className="tb-launcher-empty">No modules registered with the archive.</p>
          ) : (
            order.map((appId, index) => (
              <LauncherItem
                key={appId}
                appId={appId}
                onLaunch={launch}
                itemRef={(el) => {
                  itemRefs.current[index] = el
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** One registry entry: live manifest lookup + icon glyph + module name. */
function LauncherItem({
  appId,
  onLaunch,
  itemRef,
}: {
  readonly appId: string
  readonly onLaunch: (appId: string) => void
  readonly itemRef: (el: HTMLButtonElement | null) => void
}) {
  const manifest = useAppRegistryStore((s) => s.apps[appId])
  // Unregistered between order-change and this render: the list re-renders
  // without it; rendering nothing for one commit is the honest gap.
  if (!manifest) return null
  const Icon = manifest.icon
  return (
    <button
      type="button"
      role="menuitem"
      className="tb-launch-item"
      data-launch-app={appId}
      onClick={() => onLaunch(appId)}
      ref={itemRef}
    >
      <span className="tb-launch-glyph" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="tb-launch-name">{manifest.name}</span>
    </button>
  )
}
