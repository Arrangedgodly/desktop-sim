/**
 * useWindowGestures — IM-4b window move/resize, the committed RQ-3 pattern:
 * Pointer Events + setPointerCapture, rAF-batched, transform-only movement,
 * and the full end-matrix (pointerup commits; Escape / pointercancel cancel
 * and restore; lostpointercapture is a defensive end).
 *
 * THE RULE (RQ-2 two-phase, restated from the wm-store header): during a
 * gesture this hook performs ZERO store writes — not even to the transient
 * `dragging` slice (nothing observes it yet; the drag shimmer is pure CSS).
 * Position rides `style.transform` (move) / `style.width|height` (resize) on
 * the frame element; ONE atomic `commitWindowGeometry` lands at pointerup,
 * which React renders once. Store subscriptions therefore fire exactly once
 * per gesture, never mid-gesture.
 *
 * jsdom note: pointer-capture APIs are feature-detected and best-effort —
 * synthetic events describe inactive pointers, so `setPointerCapture` may be
 * missing (jsdom) or throw NotFoundError; either way the gesture proceeds on
 * bubble dispatch, which is exactly how the scripted gesture helper drives it.
 */

import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useWMStore, type WindowGeometry, type WindowId } from '../../stores'
import { type ViewportSize } from '../geometry'
import {
  movedBeyondThreshold,
  resolveMoveGeometry,
  resolveResizeGeometry,
  type ResizeHandle,
} from './gesture-math'

/** Body class while a gesture is armed — kills text selection mid-drag. */
export const WM_GESTURE_LIVE_CLASS = 'wm-gesture-live'

/** Frame attribute while a gesture is armed: 'drag' (phosphor shimmer) | 'resize'. */
export type GestureKind = 'move' | 'resize'

const ESCAPE_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true }

interface Point {
  readonly x: number
  readonly y: number
}

interface GestureSession {
  readonly kind: GestureKind
  readonly handle?: ResizeHandle
  readonly pointerId: number
  /** Element that owns pointer capture for the gesture (the surface). */
  readonly captureElement: HTMLElement
  readonly startPointer: Point
  latestPointer: Point
  /** Single captured start snapshot (RQ-3) — all math derives from this. */
  readonly startGeometry: WindowGeometry
  /** False until travel exceeds the click-vs-drag threshold. */
  armed: boolean
  /** Cancels the pending rAF paint; null when none is scheduled. */
  cancelFrame: (() => void) | null
}

/** Raw pointer delta of a session's latest point from its captured start. */
function deltaOf(session: GestureSession): { dx: number; dy: number } {
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

/** Props spread onto one gesture surface (title bar or a resize handle). */
export interface GestureSurfaceProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void
}

export interface WindowGesturesOptions {
  readonly id: WindowId
  /** The frame element transient styles are applied to. */
  readonly frameRef: { readonly current: HTMLElement | null }
  readonly viewport: ViewportSize
}

export interface WindowGestures {
  /** Spread onto the title bar (the move surface; chrome controls excluded). */
  readonly titleBar: GestureSurfaceProps
  /** Props for one resize handle surface. */
  readonly resizeHandle: (handle: ResizeHandle) => GestureSurfaceProps
}

export function useWindowGestures({
  id,
  frameRef,
  viewport,
}: WindowGesturesOptions): WindowGestures {
  // Handlers stay render-stable and read live values through refs — no gesture
  // state ever rides React state (that would re-render mid-gesture).
  const sessionRef = useRef<GestureSession | null>(null)
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  // Indirection that lets the stable Escape listener call the current finish.
  const finishRef = useRef<(commit: boolean) => void>(() => {})

  const paint = useCallback(
    (session: GestureSession): void => {
      const el = frameRef.current
      if (!el || !session.armed) return
      const { dx, dy } = deltaOf(session)
      if (session.kind === 'move') {
        // Transform carries ONLY the clamped delta: left/top (React-owned)
        // stay put for the whole gesture — compositor-only, zero layout.
        const next = resolveMoveGeometry(session.startGeometry, dx, dy, viewportRef.current)
        el.style.transform = `translate3d(${next.x - session.startGeometry.x}px, ${
          next.y - session.startGeometry.y
        }px, 0)`
      } else {
        // Resize cannot ride transform (content would scale, not reflow): the
        // transient write is width/height on the element — still React-free
        // and store-free, one rAF-batched write per frame. left/top are also
        // written (usually unchanged): a resize that hits the viewport cap can
        // shift the clamped origin, and transient visuals must equal what the
        // commit will produce.
        const next = resolveResizeGeometry(
          session.startGeometry,
          session.handle ?? 'se',
          dx,
          dy,
          viewportRef.current,
        )
        el.style.left = `${next.x}px`
        el.style.top = `${next.y}px`
        el.style.width = `${next.w}px`
        el.style.height = `${next.h}px`
      }
    },
    [frameRef],
  )

  // Window-level CAPTURE-phase listener (RQ-3): focus may sit on the handle,
  // so Escape must be heard regardless of where keydown lands.
  const onEscapeKey = useCallback((event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    finishRef.current(false)
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
      frameRef.current?.removeAttribute('data-gesture')

      // Sub-threshold release = a click: pointerdown already focused the
      // window; there is deliberately nothing to undo or commit.
      if (!session.armed) return

      const el = frameRef.current
      const { dx, dy } = deltaOf(session)

      if (!commit) {
        // Cancel (Escape / pointercancel): restore the pre-gesture visuals —
        // the transform (move) and/or size+origin (resize) exactly as captured
        // at gesture start.
        if (el) {
          el.style.transform = ''
          el.style.left = `${session.startGeometry.x}px`
          el.style.top = `${session.startGeometry.y}px`
          el.style.width = `${session.startGeometry.w}px`
          el.style.height = `${session.startGeometry.h}px`
        }
        return
      }

      // Commit: final geometry from the LAST pointer position (even if the
      // pending rAF never fired), painted directly so the frame never flashes
      // the pre-gesture position — then the ONE store write of the gesture.
      const next =
        session.kind === 'move'
          ? resolveMoveGeometry(session.startGeometry, dx, dy, viewportRef.current)
          : resolveResizeGeometry(
              session.startGeometry,
              session.handle ?? 'se',
              dx,
              dy,
              viewportRef.current,
            )
      if (el) {
        el.style.transform = ''
        el.style.left = `${next.x}px`
        el.style.top = `${next.y}px`
        el.style.width = `${next.w}px`
        el.style.height = `${next.h}px`
      }
      useWMStore.getState().commitWindowGeometry(id, next)
    },
    [frameRef, id, onEscapeKey],
  )
  finishRef.current = finish

  const arm = useCallback(
    (session: GestureSession): void => {
      session.armed = true
      document.body.classList.add(WM_GESTURE_LIVE_CLASS)
      frameRef.current?.setAttribute('data-gesture', session.kind === 'move' ? 'drag' : 'resize')
      window.addEventListener('keydown', onEscapeKey, ESCAPE_LISTENER_OPTIONS)
    },
    [frameRef, onEscapeKey],
  )

  const begin = useCallback(
    (event: ReactPointerEvent<HTMLElement>, kind: GestureKind, handle?: ResizeHandle): void => {
      if (event.button !== 0) return // primary button/touch/pen only
      if (sessionRef.current) return // one live gesture per window (single-pointer RQ-3)
      if (kind === 'move' && (event.target as Element | null)?.closest('.wm-controls')) {
        return // chrome controls are clicks, never drag anchors
      }
      const win = useWMStore.getState().windows[id]
      if (!win || win.maximized) return // maximized modules are fixed furniture

      event.preventDefault() // no text-selection / image-drag start on the surface

      // Best-effort capture (module note): a real pointer makes every later
      // event target this surface even outside its bounds.
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // inactive/synthetic pointer (tests, exotic hosts) — bubble path
      }

      sessionRef.current = {
        kind,
        ...(handle !== undefined ? { handle } : {}),
        pointerId: event.pointerId,
        captureElement: event.currentTarget,
        startPointer: { x: event.clientX, y: event.clientY },
        latestPointer: { x: event.clientX, y: event.clientY },
        startGeometry: win.geometry,
        armed: false,
        cancelFrame: null,
      }
    },
    [id],
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

  const makeSurface = useCallback(
    (kind: GestureKind, handle?: ResizeHandle): GestureSurfaceProps => ({
      onPointerDown: (event) => begin(event, kind, handle),
      onPointerMove: move,
      onPointerUp: (event) => {
        if (sessionRef.current?.pointerId !== event.pointerId) return
        finish(true)
      },
      onPointerCancel: (event) => {
        if (sessionRef.current?.pointerId !== event.pointerId) return
        finish(false) // browser took over (pan/zoom) — cancel, restore
      },
      onLostPointerCapture: (event) => {
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

  const titleBar = useMemo(() => makeSurface('move'), [makeSurface])
  const resizeHandle = useCallback(
    (handle: ResizeHandle) => makeSurface('resize', handle),
    [makeSurface],
  )

  return { titleBar, resizeHandle }
}
