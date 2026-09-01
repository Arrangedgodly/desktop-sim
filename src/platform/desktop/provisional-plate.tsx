/**
 * The provisional archive plate (UI-3) — a CSS-composed graticule with
 * registration marks (gradients only — no canvas, one paint, no runtime
 * cost) plus an honest engraved legend: authored plates arrive with the
 * Settings module (UI-4). Amber here is PLATE INK (printed amber-on-dark,
 * the brief's own plate vocabulary), never lit phosphor: no glow, no
 * scanlines, nothing that leaks the display-well treatment out of its well.
 */

export function ProvisionalGraticulePlate() {
  return (
    <div className="wallplate-provisional" data-provisional-plate>
      <p className="wallplate-legend engraved">
        Provisional plate — authored plates arrive with the settings module
      </p>
    </div>
  )
}
