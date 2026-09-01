/**
 * useSpecimenDrag — IM-5 desktop icon drag, the committed RQ-3 pattern applied
 * to the icon field (deliberately the SAME shape as IM-4b's
 * `useWindowGestures`, whose primitives this reuses):
 *
 * - Pointer Events + setPointerCapture (best-effort for synthetic/jsdom
 *   pointers — the bubble path drives the rest, exactly like IM-4b).
 * - 4px click-vs-drag threshold via the SHARED `movedBeyondThreshold`
 *   (wm/interactions/gesture-math): sub-threshold release is a plain click
 *   (select) — no transform, no commit, nothing to undo.
 * - THE RULE (RQ-2 two-phase): ZERO store writes mid-gesture. The icon rides
 *   `style.transform` only (React-owned left/top frozen for the whole
 *   gesture); ONE atomic commit lands at pointerup — `setIconPosition`
 *   (grid-snapped) for a bare-plate drop, `moveNode` for a drop-on-folder —
 *   and React renders once. Store subscriptions fire exactly once per
 *   gesture, never mid-gesture.
 * - rAF batching: ≤1 paint per frame regardless of input rate; the frame
 *   callback reads the LATEST pointer.
 * - Drop hit-testing (RQ-3): the armed ghost is `pointer-events: none`, so
 *   `document.elementFromPoint` sees THROUGH it; the specimen found under the
 *   pointer goes to `resolveDropTarget` (pure) — a valid drawer wears the
 *   drawer-pull highlight, an invalid one is simply not highlighted.
 * - Full end-matrix, every end idempotent: pointerup commits; Escape /
 *   pointercancel cancel and bounce back; lostpointercapture is a defensive
 *   END that commits (an abnormal capture loss must not eat the user's drag).
 * - Invalid drops (non-folder, own subtree, same location, name collision in
 *   the destination drawer) fail SOFT: the specimen bounces back to its slot
 *   with the in-world shake (`data-drop-rejected`) and NOTHING is committed.
 *
 * jsdom note: `elementFromPoint` does not exist there — feature-detected; the
 * gesture still works, hit-testing simply finds nothing (tests stub the
 * function when they need drops).
 */

import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { FSError, moveNode, setIconPosition, type FSNode, type GridPosition } from '../../lib/fs'
import { useFSStore } from '../stores/fs-store'
import type { ViewportSize } from '../wm/geometry'
import { movedBeyondThreshold } from '../wm/interactions/gesture-math'
import { WM_GESTURE_LIVE_CLASS } from '../wm/interactions/use-window-gestures'
import { cellOrigin, clampIconOrigin, slotForPoint, slotLimitsFor } from './grid'
import { resolveDropTarget } from './drop-target'

/** How long the drop-rejected shake attribute rides the icon (CSS: 320ms). */
const DROP_REJECT_ATTR_MS = 400

/** jsdom measures 0×0 — the committed CSS box as the clamp fallback. */
const ICON_FALLBACK_SIZE = { w: 92, h: 132 } as const

const ESCAPE_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true }

interface Point {
  readonly x: number
  readonly y: number
}

interface DragSession {
  readonly nodeId: string
  readonly pointerId: number
  /** Element that owns pointer capture for the gesture (the icon button). */
  readonly captureElement: HTMLElement
  readonly startPointer: Point
  latestPointer: Point
  /**
   * Single captured start snapshot (RQ-3): slot origin + measured box size.
   * Every paint and the commit derive from THIS, never from accumulated
   * deltas — the origin comes from `cellOrigin(slot)` (the same pure math
   * React used for `left`/`top`), not from getBoundingClientRect, so jsdom
   * (0×0 rects) and the browser agree.
   */
  readonly startLeft: number
  readonly startTop: number
  readonly size: { readonly w: number; readonly h: number }
  /** Stored position at gesture start; null = unpinned (auto-slotted) node. */
  readonly storedSlot: GridPosition | null
  /** False until travel exceeds the click-vs-drag threshold. */
  armed: boolean
  /** Cancels the pending rAF paint; null when none is scheduled. */
  cancelFrame: (() => void) | null
  /** Folder id currently wearing the drop-target highlight, if any. */
  hoverTargetId: string | null
}

/** Raw pointer delta of a session's latest point from its captured start. */
function deltaOf(session: DragSession): { dx: number; dy: number } {
  return {
    dx: session.latestPointer.x - session.startPointer.x,
    dy: session.latestPointer.y - session.startPointer.y,
  }
}

/** rAF with a ~60fps timeout fallback for environments without rAF. */
function scheduleFrame(callback: () => void): () => void {
  const raf = (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame })
    .requestAnimationFrame
  if (typeof raf === 'function') {
    const id = raf.call(globalThis, callback)
    return () => globalThis.cancelAnimationFrame(id)
  }
  const id = globalThis.setTimeout(callback, 16)
  return () => globalThis.clearTimeout(id)
}

/**
 * Specimen under a viewport point, or null. RQ-3 hit-test: the armed ghost is
 * pointer-transparent, so this sees through the dragged icon to whatever sits
 * beneath. Feature-detected (jsdom has no elementFromPoint).
 */
export function specimenIdAtPoint(x: number, y: number): string | null {
  const hit =
    typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null
  const specimen = hit?.closest('[data-specimen-id]')
  return specimen?.getAttribute('data-specimen-id') ?? null
}

export interface SpecimenDragOptions {
  readonly node: FSNode
  /** The node's RESOLVED desktop slot (positioned, or auto-assigned by grid.ts). */
  readonly slot: GridPosition
  readonly viewport: ViewportSize
  /** The icon button element (transient styles land there). Owner: the icon. */
  readonly iconRef: { readonly current: HTMLElement | null }
}

export interface SpecimenDrag {
  /** Spread onto the icon button. */
  readonly pointerProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
    onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void
  }
  /**
   * True exactly once after an ARMED gesture ended on this icon — click and
   * double-click handlers consume it so a drag-then-click can never select+open
   * in one motion (the browser still fires the compatibility click after a
   * captured drag).
   */
  readonly consumeDragged: () => boolean
}

export function useSpecimenDrag({
  node,
  slot,
  viewport,
  iconRef,
}: SpecimenDragOptions): SpecimenDrag {
  // Handlers stay render-stable and read live values through refs — no gesture
  // state ever rides React state (that would re-render mid-gesture).
  const sessionRef = useRef<DragSession | null>(null)
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const justDraggedRef = useRef(false)
  // Indirection that lets the stable Escape listener call the current finish.
  const finishRef = useRef<(commit: boolean) => void>(() => {})

  const consumeDragged = useCallback((): boolean => {
    const wasDragged = justDraggedRef.current
    justDraggedRef.current = false
    return wasDragged
  }, [])

  /** Highlight bookkeeping: swap the drawer-pull affordance only on CHANGE. */
  const updateHoverTarget = useCallback((session: DragSession): void => {
    const fs = useFSStore.getState().fs
    const resolution = resolveDropTarget(
      fs,
      session.nodeId,
      specimenIdAtPoint(session.latestPointer.x, session.latestPointer.y),
    )
    const nextId = resolution.status === 'folder' ? resolution.targetId : null
    if (nextId === session.hoverTargetId) return

    if (session.hoverTargetId !== null) {
      document
        .querySelector(`[data-specimen-id="${cssEscape(session.hoverTargetId)}"]`)
        ?.removeAttribute('data-drop-target')
    }
    if (nextId !== null) {
      document
        .querySelector(`[data-specimen-id="${cssEscape(nextId)}"]`)
        ?.setAttribute('data-drop-target', 'true')
    }
    session.hoverTargetId = nextId
  }, [])

  const paint = useCallback(
    (session: DragSession): void => {
      const el = iconRef.current
      if (!el || !session.armed) return
      const { dx, dy } = deltaOf(session)
      // Transform carries ONLY the clamped delta: left/top (React-owned) stay
      // put for the whole gesture — compositor-only, zero layout.
      const next = clampIconOrigin(
        session.startLeft + dx,
        session.startTop + dy,
        session.size,
        viewportRef.current,
      )
      el.style.transform = `translate3d(${next.left - session.startLeft}px, ${
        next.top - session.startTop
      }px, 0)`
      updateHoverTarget(session)
    },
    [iconRef, updateHoverTarget],
  )

  // Window-level CAPTURE-phase listener (RQ-3): focus may sit anywhere by the
  // time Escape lands; the cancel must be heard regardless.
  const onEscapeKey = useCallback((event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    finishRef.current(false)
  }, [])

  /** Soft-fail an invalid drop: bounce back to the slot + the in-world shake. */
  const rejectDrop = useCallback((el: HTMLElement | null): void => {
    if (!el) return
    el.style.transform = '' // bounce back to the React-owned grid slot
    el.setAttribute('data-drop-rejected', 'true')
    // Timeout (not animationend): the reduced-motion kill-switch stops the
    // animation, and the attribute must retire either way.
    window.setTimeout(() => el.removeAttribute('data-drop-rejected'), DROP_REJECT_ATTR_MS)
  }, [])

  const finish = useCallback(
    (commit: boolean): void => {
      const session = sessionRef.current
      if (!session) return // idempotent end-matrix: the first end wins
      sessionRef.current = null

      if (session.cancelFrame) {
        session.cancelFrame()
        session.cancelFrame = null
      }

      // Hit-test BEFORE the ghost regains pointer-events (RQ-3 ordering) — but
      // only when this end actually commits; a click or a cancel drops nothing.
      const endDrop =
        session.armed && commit
          ? resolveDropTarget(
              useFSStore.getState().fs,
              session.nodeId,
              specimenIdAtPoint(session.latestPointer.x, session.latestPointer.y),
            )
          : null

      // Release capture defensively — hasPointerCapture guard + try/catch
      // swallow stale ids (releasePointerCapture throws NotFoundError).
      try {
        if (
          typeof session.captureElement.releasePointerCapture === 'function' &&
          typeof session.captureElement.hasPointerCapture === 'function' &&
          session.captureElement.hasPointerCapture(session.pointerId)
        ) {
          session.captureElement.releasePointerCapture(session.pointerId)
        }
      } catch {
        // pointer already inactive — nothing to release
      }

      window.removeEventListener('keydown', onEscapeKey, ESCAPE_LISTENER_OPTIONS)
      document.body.classList.remove(WM_GESTURE_LIVE_CLASS)
      const el = iconRef.current
      if (el) {
        el.style.pointerEvents = '' // the ghost reverts to an interactive icon
        el.removeAttribute('data-gesture')
      }
      if (session.hoverTargetId !== null) {
        document
          .querySelector(`[data-specimen-id="${cssEscape(session.hoverTargetId)}"]`)
          ?.removeAttribute('data-drop-target')
      }

      // Sub-threshold release = a click: selection/focus already happened in
      // begin(); there is deliberately nothing to undo or commit.
      if (!session.armed) return
      justDraggedRef.current = true

      if (!commit) {
        // Cancel (Escape / pointercancel): bounce back to the slot, silently.
        if (el) el.style.transform = ''
        return
      }

      // --- commit paths: exactly ONE atomic store write each ---

      if (endDrop?.status === 'folder') {
        try {
          useFSStore
            .getState()
            .commit(moveNode(useFSStore.getState().fs, session.nodeId, endDrop.targetId))
          // The node left the desktop — React unmounts the icon. Done.
          return
        } catch (error) {
          if (!(error instanceof FSError)) throw error
          // e.g. a name collision in the destination drawer — soft fail.
          rejectDrop(el)
          return
        }
      }

      if (endDrop?.status === 'rejected') {
        rejectDrop(el) // non-folder / own subtree / same location: bounce + shake
        return
      }

      // Bare plate: grid-snap the committed origin and pin the slot.
      const { dx, dy } = deltaOf(session)
      const next = clampIconOrigin(
        session.startLeft + dx,
        session.startTop + dy,
        session.size,
        viewportRef.current,
      )
      const pinnedSlot = slotForPoint(next.left, next.top, slotLimitsFor(viewportRef.current))
      if (
        session.storedSlot !== null &&
        session.storedSlot.x === pinnedSlot.x &&
        session.storedSlot.y === pinnedSlot.y
      ) {
        if (el) el.style.transform = '' // settled where it already lives — no-op
        return
      }
      if (el) {
        // Paint the committed placement directly (IM-4b discipline): clear the
        // transform and move left/top to the SNAPPED slot's origin BEFORE the
        // store write — the single visible jump is the snap itself, and React's
        // re-render then writes byte-identical values (no second flash).
        const snapped = cellOrigin(pinnedSlot)
        el.style.transform = ''
        el.style.left = `${snapped.left}px`
        el.style.top = `${snapped.top}px`
      }
      try {
        useFSStore
          .getState()
          .commit(setIconPosition(useFSStore.getState().fs, session.nodeId, pinnedSlot))
      } catch (error) {
        if (!(error instanceof FSError)) throw error
        // node vanished mid-gesture (deleted elsewhere) — nothing to pin
        if (el) el.style.transform = ''
      }
    },
    [iconRef, onEscapeKey, rejectDrop],
  )
  finishRef.current = finish

  const arm = useCallback(
    (session: DragSession): void => {
      session.armed = true
      document.body.classList.add(WM_GESTURE_LIVE_CLASS)
      const el = iconRef.current
      if (el) {
        // The ghost: pointer-transparent so elementFromPoint sees through it
        // (RQ-3); pointer capture keeps the events flowing to us regardless.
        el.style.pointerEvents = 'none'
        el.setAttribute('data-gesture', 'drag')
      }
      window.addEventListener('keydown', onEscapeKey, ESCAPE_LISTENER_OPTIONS)
    },
    [iconRef, onEscapeKey],
  )

  const begin = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (event.button !== 0) return // primary button/touch/pen only
      if (sessionRef.current) return // one live gesture per surface (single-pointer RQ-3)
      const el = iconRef.current
      if (!el) return

      // No text-selection / native image-drag start on the surface. The
      // compatibility CLICK still fires (click is not a compatibility mouse
      // event), so selection-on-click keeps working; preventDefault also
      // suppresses native focus — restore parity for the keyboard floor.
      event.preventDefault()
      el.focus()

      // Best-effort capture (module note): a real pointer makes every later
      // event target this surface even outside its bounds.
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // inactive/synthetic pointer (tests, exotic hosts) — bubble path
      }

      const origin = cellOrigin(slot)
      const rect = el.getBoundingClientRect()
      sessionRef.current = {
        nodeId: node.id,
        pointerId: event.pointerId,
        captureElement: event.currentTarget,
        startPointer: { x: event.clientX, y: event.clientY },
        latestPointer: { x: event.clientX, y: event.clientY },
        startLeft: origin.left,
        startTop: origin.top,
        size: {
          w: rect.width || ICON_FALLBACK_SIZE.w,
          h: rect.height || ICON_FALLBACK_SIZE.h,
        },
        storedSlot: useFSStore.getState().fs.iconPositions[node.id] ?? null,
        armed: false,
        cancelFrame: null,
        hoverTargetId: null,
      }
    },
    [iconRef, node.id, slot],
  )

  const move = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const session = sessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      session.latestPointer = { x: event.clientX, y: event.clientY }

      if (!session.armed) {
        const dx = session.latestPointer.x - session.startPointer.x
        const dy = session.latestPointer.y - session.startPointer.y
        if (!movedBeyondThreshold(dx, dy)) return // still a click so far
        arm(session)
      }

      // rAF batching: ≤1 paint per frame regardless of input rate — coords
      // ride the session; the frame callback reads the LATEST ones.
      if (!session.cancelFrame) {
        session.cancelFrame = scheduleFrame(() => {
          session.cancelFrame = null
          paint(session)
        })
      }
    },
    [arm, paint],
  )

  const pointerProps = useMemo(
    () => ({
      onPointerDown: begin,
      onPointerMove: move,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        if (sessionRef.current?.pointerId !== event.pointerId) return
        finish(true)
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
        if (sessionRef.current?.pointerId !== event.pointerId) return
        finish(false) // browser took over (pan/zoom) — cancel, bounce back
      },
      onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => {
        const session = sessionRef.current
        if (!session || event.pointerId !== session.pointerId) return
        // Defensive end (RQ-3): after pointerup the implicit release finds the
        // session already consumed (no-op); an ABNORMAL loss ends the gesture
        // by committing — the user's drag should not vanish.
        finish(true)
      },
    }),
    [begin, move, finish],
  )

  return { pointerProps, consumeDragged }
}

/** Attribute-selector-safe id (seeded ids are slugs; this is the seatbelt). */
function cssEscape(value: string): string {
  const escape = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape
  return typeof escape === 'function' ? escape(value) : value
}
