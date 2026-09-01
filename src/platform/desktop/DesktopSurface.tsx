/**
 * Desktop surface (UI-3) — THE HOLD: the stage the POST screen gives way to.
 *
 * Layers, back → front:
 *   1. wallpaper layer — the archive plate (settings `wallpaper` id through
 *      the plate registry; provisional plate until UI-4 registers the set)
 *   2. icon field — the catalog root's children as pinned specimen cards,
 *      absolutely placed on the grid (`iconPositions`, grid-snapped), with
 *      single-click selection and the double-click open seam
 *   3. docent callouts — first visit only, dismissed on any interaction
 *   4. window host — the WM's windows (IM-4a; pointer-events none but windows)
 *   5. taskbar — the drawer rail (IM-4c): fixed furniture above every window,
 *      carrying the open-window LEDs, the module launcher and the timecode
 *   6. context menus (UI-5) — portal chrome above everything, owned by the
 *      shared MenuProvider (main.tsx); this surface opens the ground menu
 *      (bare plate) and each specimen's menu, and carries the inline-rename
 *      editing state the specimen menu's Rename command starts.
 *
 * Selection: single-select via icon click; clicking the bare plate (anywhere
 * that is not a specimen) clears it. Local state by design — selection is a
 * view concern, not persisted truth. Icon drag (IM-5) lives inside each
 * SpecimenIcon (use-specimen-drag.ts): transient transform + ONE commit at
 * pointerup; this surface only supplies the measured viewport (one resize
 * subscription for the whole field).
 *
 * Marquee multi-select was CUT at IM-5 dispatch (recorded deviation):
 * single-select only, per the plan's "marquee optional (cut if needed)".
 *
 * Roving tabindex floor (DD-1 does the full keyboard map): exactly one icon
 * is tabbable — the selected one, else the first — the rest are -1.
 *
 * `requestPersistentStorage` (deferred from UI-2): fired once after the first
 * meaningful interaction on the desktop (a click anywhere on the stage or a
 * keypress) — non-blocking, failure silent (adapter.ts returns false, never
 * throws). Docent dismissal rides the same one-shot listener.
 */

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { FSError, listChildren, renameNode, type FSNode } from '../../lib/fs'
import { requestPersistentStorage } from '../../lib/storage/adapter'
import { useFSStore } from '../stores/fs-store'
import { useSettingsStore } from '../stores/settings-store'
import { appContentFor } from '../app-registry'
import { WindowHost } from '../wm'
import { useViewportSize } from '../wm/use-viewport-size'
import { TaskbarRail } from '../taskbar'
import { buildGroundMenuItems, buildSpecimenMenuItems, MenuProvider, useConsoleMenu } from '../menus'
import type { MenuAnchor } from '../menus'
import { DESKTOP_READY, markBootOnce } from '../boot/boot-milestones'
import { resolveDesktopSlots } from './grid'
import { WallpaperLayer } from './wallpaper'
import { SpecimenIcon } from './SpecimenIcon'
import { DocentCallouts } from './DocentCallouts'
import { openSpecimen } from './open-specimen'
import './desktop.css'

export interface DesktopSurfaceProps {
  /**
   * The boot verdict (BootResult.firstVisit), passed by the boot orchestrator.
   * Docent hints show ONLY on a first visit AND while undismissed.
   */
  readonly firstVisit?: boolean
}

/** Context-menu surfaces that own their own chrome (never the ground menu). */
const GROUND_MENU_EXCLUDED = '[data-specimen-id], [data-wm-host], [data-taskbar]'

/**
 * The surface mounts its OWN menu host (UI-5): the ground/specimen menus and
 * any menu a window's content opens (AP-1's explorer renders inside this
 * subtree, and React context flows through portals) all share the one
 * `openMenu(items, anchor)` seam. Self-contained so every mount — app, tests,
 * stories — is a complete console.
 */
export function DesktopSurface(props: DesktopSurfaceProps) {
  return (
    <MenuProvider>
      <DesktopStage {...props} />
    </MenuProvider>
  )
}

function DesktopStage({ firstVisit = false }: DesktopSurfaceProps) {
  const fs = useFSStore((s) => s.fs)
  const docentDismissed = useSettingsStore((s) => s.docentDismissed)
  const { openMenu } = useConsoleMenu()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Inline rename (UI-5): the root child whose label is being edited in place. */
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // One resize subscription for the whole icon field (drag clamp + snap caps).
  const viewport = useViewportSize()

  // Field layout: root children in catalog order; positioned nodes keep their
  // slot, unpositioned ones fill the first free slots (grid.ts).
  const rootChildren = listChildren(fs, fs.rootId)
  const slots = resolveDesktopSlots(rootChildren, fs.iconPositions)
  const tabbableId =
    selectedId !== null && slots[selectedId] !== undefined
      ? selectedId
      : (rootChildren[0]?.id ?? null)
  const docentVisible = firstVisit && !docentDismissed && rootChildren.length > 0

  // Live refs so the one-shot interaction listeners never re-bind.
  const docentVisibleRef = useRef(docentVisible)
  docentVisibleRef.current = docentVisible

  useEffect(() => {
    markBootOnce(DESKTOP_READY)
  }, [])

  // First meaningful interaction (UI-2 deviation 2's owner): ask the browser
  // to keep the archive (once, fire-and-forget) and retire the docent.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let persisted = false
    const onFirstInteraction = (): void => {
      if (!persisted) {
        persisted = true
        void requestPersistentStorage().catch(() => {}) // failure silent by contract
      }
      if (docentVisibleRef.current) {
        const settings = useSettingsStore.getState()
        if (!settings.docentDismissed) settings.dismissDocent()
      }
    }
    stage.addEventListener('pointerdown', onFirstInteraction, { capture: true })
    stage.addEventListener('keydown', onFirstInteraction, { capture: true })
    return () => {
      stage.removeEventListener('pointerdown', onFirstInteraction, { capture: true })
      stage.removeEventListener('keydown', onFirstInteraction, { capture: true })
    }
  }, [])

  // Clicking the bare plate (anything that is not a specimen) clears selection.
  const handleStageClick = (event: MouseEvent) => {
    const target = event.target as Element
    if (target.closest('[data-specimen-id]')) return
    setSelectedId(null)
  }

  const handleSelect = (id: string) => {
    setSelectedId(id)
  }

  const handleOpen = (node: FSNode) => {
    openSpecimen(node) // IM-5: the routing table (folder/text/image/app-link)
  }

  // -- context menus (UI-5) ----------------------------------------------------
  // Ground: right-click the bare hold (windows/taskbar/menus keep their own
  // chrome; a specimen's icon handles its own menu and stops propagation).
  const handleStageContextMenu = (event: MouseEvent) => {
    const target = event.target as Element
    if (target.closest(GROUND_MENU_EXCLUDED)) return
    event.preventDefault() // the console replaces the native menu
    openMenu(buildGroundMenuItems(), { kind: 'point', x: event.clientX, y: event.clientY }, {
      ariaLabel: 'Hold menu',
    })
  }

  // Specimen/drawer menu: the icon engages, any live edit ends (a menu open
  // while another icon edits would fight the input for focus).
  const handleSpecimenMenu = (node: FSNode, anchor: MenuAnchor) => {
    setSelectedId(node.id)
    setRenamingId(null)
    openMenu(
      buildSpecimenMenuItems(node, {
        rename: () => {
          setSelectedId(node.id)
          setRenamingId(node.id)
        },
      }),
      anchor,
      { ariaLabel: `Specimen menu — ${node.name}` },
    )
  }

  /** Commit an inline relabel; false = FSError (the icon shakes, keeps editing). */
  const commitRename = (id: string, name: string): boolean => {
    try {
      const { fs: current, commit } = useFSStore.getState()
      commit(renameNode(current, id, name))
      setRenamingId(null)
      return true
    } catch (error) {
      if (!(error instanceof FSError)) throw error
      return false // name-collision / invalid-name: in-world refusal
    }
  }

  const handleDismissDocent = () => {
    useSettingsStore.getState().dismissDocent()
  }

  return (
    <div
      className="desktop-stage"
      data-desktop-stage
      ref={stageRef}
      onClick={handleStageClick}
      onContextMenu={handleStageContextMenu}
    >
      <WallpaperLayer />
      <div className="icon-field" data-icon-field>
        {rootChildren.map((node) => (
          <SpecimenIcon
            key={node.id}
            node={node}
            slot={slots[node.id] ?? { x: 0, y: 0 }}
            selected={selectedId === node.id}
            tabbable={tabbableId === node.id}
            viewport={viewport}
            onSelect={handleSelect}
            onOpen={handleOpen}
            onMenu={handleSpecimenMenu}
            editing={renamingId === node.id}
            onCommitRename={(name) => commitRename(node.id, name)}
            onCancelRename={() => setRenamingId(null)}
          />
        ))}
      </div>
      {docentVisible && <DocentCallouts slots={slots} onDismiss={handleDismissDocent} />}
      <WindowHost contentFor={appContentFor} />
      <TaskbarRail />
    </div>
  )
}
