/**
 * Menu placement math (UI-5) — pure. The single place a menu's anchor plus
 * its measured size becomes a clamped fixed-position origin, with the
 * edge-flip the a11y floor demands: a menu must never open off-screen,
 * because focus inside it would be invisible.
 *
 * Rules (in order):
 * 1. preferred origin = the anchor point;
 * 2. if the menu would cross the RIGHT edge, slide it left to the margin;
 * 3. if it would cross the BOTTOM edge, flip it up (bottom edge at the
 *    viewport margin, i.e. above the anchor);
 * 4. clamp to ≥ 0 — on a viewport smaller than the menu the panel pins to
 *    the top-left and overflows gracefully rather than chasing its tail.
 *
 * No React, no DOM — the shell feeds it live measurements (jsdom gets the
 * estimating fallback), unit tests feed it numbers.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export interface MenuPlacement {
  readonly left: number
  readonly top: number
}

/** Gap kept between the menu and every viewport edge. */
export const MENU_VIEWPORT_MARGIN = 8

export function computeMenuPlacement(
  anchor: Point,
  menuSize: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  margin: number = MENU_VIEWPORT_MARGIN,
): MenuPlacement {
  let left = anchor.x
  let top = anchor.y

  if (left + menuSize.width > viewport.width - margin) {
    left = Math.max(margin, viewport.width - margin - menuSize.width)
  }
  if (top + menuSize.height > viewport.height - margin) {
    top = Math.max(margin, viewport.height - margin - menuSize.height)
  }

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
  }
}
