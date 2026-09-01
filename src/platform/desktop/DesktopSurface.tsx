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
import { listChildren, type FSNode } from '../../lib/fs'
import { requestPersistentStorage } from '../../lib/storage/adapter'
import { useFSStore } from '../stores/fs-store'
import { useSettingsStore } from '../stores/settings-store'
import { appContentFor } from '../app-registry'
import { WindowHost } from '../wm'
import { useViewportSize } from '../wm/use-viewport-size'
import { TaskbarRail } from '../taskbar'
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

export function DesktopSurface({ firstVisit = false }: DesktopSurfaceProps) {
  const fs = useFSStore((s) => s.fs)
  const docentDismissed = useSettingsStore((s) => s.docentDismissed)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  const handleDismissDocent = () => {
    useSettingsStore.getState().dismissDocent()
  }

  return (
    <div className="desktop-stage" data-desktop-stage ref={stageRef} onClick={handleStageClick}>
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
          />
        ))}
      </div>
      {docentVisible && <DocentCallouts slots={slots} onDismiss={handleDismissDocent} />}
      <WindowHost contentFor={appContentFor} />
      <TaskbarRail />
    </div>
  )
}
