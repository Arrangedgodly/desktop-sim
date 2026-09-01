/**
 * Scripted pointer-gesture simulator (TH-1) — drives pointerdown / pointermove
 * / pointerup (or pointercancel) sequences against a DOM element so drag
 * acceptance (IM-4b window drag, IM-5 desktop icons) can be exercised from
 * unit tests and, later, real-browser probes.
 *
 * jsdom-compatible by construction, real-browser-correct by preference:
 * `createPointerEvent` uses the platform `PointerEvent` when it exists (real
 * browsers; jsdom ≥ 22) and otherwise synthesizes a MouseEvent/Event carrying
 * the same pointer fields as own properties — listeners read one shape either
 * way. Dispatch is synchronous and instant: the CALLER paces steps (e.g. one
 * gesture point per `measureFps` onFrame tick) so gestures can be tied to the
 * frame clock deterministically.
 *
 * This simulator never fakes what it cannot know: setPointerCapture,
 * elementFromPoint and :hover state remain the host's job — exactly the seams
 * the committed RQ-3 drag pattern owns.
 */

/** Pointer event types the simulator can emit. */
export type PointerEventType = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'

/** One gesture waypoint in viewport (client) coordinates. */
export interface PointerPoint {
  readonly x: number
  readonly y: number
}

export interface GestureOptions {
  /** Pointer id; default 1 (single active pointer per RQ-3). */
  readonly pointerId?: number
  /** Default 'mouse' — the committed interaction model. */
  readonly pointerType?: string
  /** Default true (the only pointer of its type). */
  readonly isPrimary?: boolean
  /** How the sequence ends: 'up' (default) or 'cancel' (RQ-3 end-matrix). */
  readonly end?: 'up' | 'cancel'
  /**
   * Observes every dispatched event, in order — the seam tests use to
   * correlate gestures with frame ticks from measureFps.
   */
  readonly onDispatch?: (event: PointerEvent, type: PointerEventType) => void
}

/** A scheduler-paced gesture: points to visit, in order. */
export type PointerSequence = readonly PointerPoint[]

const DEFAULT_POINTER_ID = 1
const DEFAULT_POINTER_TYPE = 'mouse'

function asPointerEventLike(event: Event): PointerEvent {
  return event as PointerEvent
}

/**
 * Build one pointer event. Exposed separately so tests/probes can fire
 * one-off events (e.g. a stray 'pointermove' with no buttons) by hand.
 */
export function createPointerEvent(
  type: PointerEventType,
  point: PointerPoint,
  options: GestureOptions = {},
): PointerEvent {
  const pointerId = options.pointerId ?? DEFAULT_POINTER_ID
  const pointerType = options.pointerType ?? DEFAULT_POINTER_TYPE
  const isPrimary = options.isPrimary ?? true
  const buttons = type === 'pointerup' || type === 'pointercancel' ? 0 : 1

  const PointerEventCtor = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent
  if (typeof PointerEventCtor === 'function') {
    return new PointerEventCtor(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      button: 0,
      buttons,
      pointerId,
      pointerType,
      isPrimary,
    })
  }

  // Fallback (old jsdom / exotic hosts): MouseEvent carries the coordinates,
  // then the pointer-only fields ride as own properties. Listeners read the
  // same shape as a real PointerEvent.
  const MouseEventCtor = (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent
  const base: Event =
    typeof MouseEventCtor === 'function'
      ? new MouseEventCtor(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: point.x,
          clientY: point.y,
          screenX: point.x,
          screenY: point.y,
          button: 0,
          buttons,
        })
      : new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(base, {
    pointerId: { value: pointerId, enumerable: true },
    pointerType: { value: pointerType, enumerable: true },
    isPrimary: { value: isPrimary, enumerable: true },
    pressure: { value: buttons > 0 ? 0.5 : 0, enumerable: true },
  })
  return asPointerEventLike(base)
}

/**
 * Dispatch a full pointer gesture against `target`: pointerdown at the first
 * point, pointermove through the rest, then pointerup (or pointercancel) at
 * the last. A single point is a tap (down+up). Returns the event types
 * dispatched, in order. No-op (empty array) for an empty sequence.
 */
export function simulatePointerGesture(
  target: Element,
  points: PointerSequence,
  options: GestureOptions = {},
): PointerEventType[] {
  if (points.length === 0) return []

  const first = points[0]!
  const last = points[points.length - 1]!
  const steps: readonly (readonly [PointerEventType, PointerPoint])[] = [
    ['pointerdown', first],
    ...points.slice(1).map((point) => ['pointermove', point] as const),
    [options.end === 'cancel' ? 'pointercancel' : 'pointerup', last],
  ]

  const dispatched: PointerEventType[] = []
  for (const [type, point] of steps) {
    const event = createPointerEvent(type, point, options)
    target.dispatchEvent(event)
    options.onDispatch?.(event, type)
    dispatched.push(type)
  }
  return dispatched
}
