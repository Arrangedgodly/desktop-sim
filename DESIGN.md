---
name: "HOLD/OS — The Survey Archive"
description: "A survey vessel's specimen-archive console: warm near-black instrument chrome, amber phosphor in recessed wells, parchment catalog labels — a portfolio you operate."
colors:
  # phosphor — the lit accent (Primary)
  phosphor: "#ffb340"
  phosphor-bright: "#ffd28a"
  phosphor-dim: "#b97e24"
  phosphor-glow: "rgb(255 179 64 / 50%)"
  well-ground: "#120d07"
  # brass — hardware touchpoints (Secondary)
  brass: "#b08d3f"
  brass-hi: "#d8b25e"
  brass-lo: "#6b5524"
  # oxide — warnings / destructive only (Tertiary)
  oxide: "#a63d2a"
  oxide-deep: "#7c2b1c"
  oxide-bright: "#e06a4f"
  # console chrome — the neutral dark world
  chrome-ground: "#201a13"
  chrome-raised: "#2b241a"
  chrome-sunken: "#171209"
  chrome-edge-hi: "#514433"
  chrome-edge-lo: "#0c0906"
  chrome-ink: "#e6dcc6"
  chrome-ink-dim: "#a3937a"
  engraved-ink: "#c7b590"
  # parchment — the light reading world
  parchment: "#ece2c9"
  parchment-shade: "#e0d3b4"
  parchment-ink: "#33291c"
  parchment-ink-dim: "#65573f"
typography:
  label:
    fontFamily: "'Chakra Petch', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.1em"
  label-xl:
    fontFamily: "'Chakra Petch', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.1em"
  content:
    fontFamily: "'Lora', Georgia, 'Times New Roman', serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.8
  mono:
    fontFamily: "'B612 Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    letterSpacing: "0.08em"
components:
  control-plate:
    backgroundColor: "{colors.chrome-raised}"
    textColor: "{colors.chrome-ink}"
    typography: "{typography.label}"
    height: "22px"
    width: "26px"
    padding: "0"
  control-plate-hover:
    backgroundColor: "{colors.chrome-ground}"
    textColor: "{colors.chrome-ink}"
  action-brass:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.chrome-ground}"
    typography: "{typography.label}"
    height: "30px"
    padding: "4px 16px"
  action-brass-hover:
    backgroundColor: "{colors.brass-hi}"
    textColor: "{colors.chrome-ground}"
  action-destructive:
    backgroundColor: "{colors.oxide-deep}"
    textColor: "{colors.parchment}"
    typography: "{typography.label}"
    height: "22px"
    padding: "2px 12px"
  well-readout:
    backgroundColor: "{colors.well-ground}"
    textColor: "{colors.phosphor}"
    typography: "{typography.mono}"
    padding: "3px 9px"
  engraved-legend:
    textColor: "{colors.engraved-ink}"
    typography: "{typography.label}"
  title-bar:
    backgroundColor: "{colors.chrome-raised}"
    textColor: "{colors.engraved-ink}"
    height: "32px"
  taskbar-rail:
    backgroundColor: "{colors.chrome-raised}"
    textColor: "{colors.chrome-ink}"
    height: "44px"
  catalog-card:
    backgroundColor: "{colors.parchment-shade}"
    textColor: "{colors.parchment-ink}"
    typography: "{typography.content}"
    padding: "9px 10px 11px"
---

# Design System: HOLD/OS — The Survey Archive

## Overview

**Creative North Star: "The Survey Archive"**

The console owns the machine; the archive owns the material. The interface is the science officer's archive console aboard a deep-space survey vessel, decades into a long mission: windows are beveled instrument modules on a warm near-black ground, the filesystem is a specimen catalog with parchment labels and accession codes, and every display that "lights up" is a recessed amber-phosphor well. The world is readable with all content removed — drawer-modules, wells, brackets, and labels are the brand.

The system runs on one duality: **dark console chrome for the machine, light parchment for the material**. Chrome carries controls, legends, and readouts (Chakra Petch tracked caps, engraved); parchment carries reading (Lora serif, generous leading). Amber phosphor is the single lit accent and it never leaves a recessed well; brass appears only where a hand touches hardware (pulls, label frames, screws, grips, brackets); oxide red appears only where something can be lost. Depth is machined — 1px bevel lips and one soft ground shadow, light falling from above — never blur stacks or glows in the open.

Motion is instrument-grade: the console is a machine at rest. Furniture (the taskbar rail, context menus) has zero transitions — state swaps instantly. Each app module carries exactly one authored moment (a drawer pull, a stamp press, a lamp flare), always an exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`) starting from a visible default — the tube warms up, it never starts blank. Dragged objects wear a slow phosphor-persistence shimmer; instrument readouts (zoom, scale) SNAP between states rather than tween. Under `prefers-reduced-motion`, every authored moment collapses to its visible end-state — never to blank.

**Key Characteristics:**

- Warm near-black console chrome — never pure black; every neutral holds warmth
- Amber phosphor only inside recessed display wells (subtle scanlines, tube bloom, monochrome amber discipline)
- Parchment content surfaces for text-heavy reading — the light side of the duality
- Brass only at hardware touchpoints — pulls, label frames, screws, grips, corner brackets
- Oxide red only for warnings and destructive actions
- Engraved legends: 600 uppercase Chakra Petch cut into the plate, tracked 0.08–0.12em (11px floor, 14px off-ramp ceiling)
- All digits and readouts ride B612 Mono, tabular by construction
- Machined depth: 1px bevel lips + one ground shadow; light falls from above
- Sharp corners everywhere; the only circles are hardware (lamps, screws, rivets)
- One authored motion moment per module; everything else holds still

## Colors

A warm, archival palette: near-black console neutrals with an amber-phosphor lit accent, parchment reading surfaces, brass hardware, and oxide reserved for loss.

### Primary

- **Amber Phosphor** (#ffb340): the lit accent — well text, status lamps, the caret, lit state indicators. It glows only inside a recessed well (see The Phosphor Wells Rule).
- **Hot Amber** (#ffd28a): the beam's fresh highlight — the POST line currently being typed, the caret, lamp flares, the hover state of an editable engraved label.
- **Aged Amber** (#b97e24): dimmed phosphor — secondary well text, scan shading, a stowed (minimized) module's lamp, well note text.
- **Phosphor Glow** (rgb(255 179 64 / 50%)): the shadow color of the tube bloom (`text-shadow`/`box-shadow` only — never a background).
- **Well Ground** (#120d07): the display-well interior, the deepest value in the world — what the phosphor is read against.

### Secondary

- **Brass** (#b08d3f): hardware touchpoints — the drawer pull, switch bats, label frames, rivets, the parchment-side focus ring.
- **Polished Brass** (#d8b25e): the catch-light on brass hardware — upper bevel lips, lit bracket ticks, brass hover.
- **Brass in Shadow** (#6b5524): brass bevel shadow, engraved frames on parchment labels, and the focus ring on parchment surfaces.

### Tertiary

- **Oxide Red** (#a63d2a): guarded toggle covers and destructive surfaces — never decoration, never a general accent.
- **Deep Oxide** (#7c2b1c): the oxide bevel shadow and the base of destructive commit surfaces (see The Oxide Only Destroys Rule).
- **Bright Oxide** (#e06a4f): destructive and warning TEXT on dark chrome (5.2:1 on ground).

### Neutral

- **Warm Near-Black Ground** (#201a13): module bodies and the page ground — the hold itself.
- **Raised Chrome** (#2b241a): title bars, toolbars, control plates, the taskbar rail.
- **Sunken Chrome** (#171209): pressed insets, rail grooves, recessed bays.
- **Bevel Light Lip** (#514433): the 1px light edge on every raised/cut surface (light falls from above).
- **Bevel Dark Lip** (#0c0906): the 1px dark edge and border of every bevel.
- **Painted Chrome Ink** (#e6dcc6): primary chrome text — title bars, controls.
- **Dim Chrome Ink** (#a3937a): secondary chrome text — hints, disabled states, version chips. Dims, never grays.
- **Engraved Ink** (#c7b590): etched legend ink, darker than painted ink — menu rows, names, toolbar legends.
- **Parchment** (#ece2c9): content surfaces — catalog labels, notepad sheets, exhibits, cards.
- **Parchment Shade** (#e0d3b4): recessed parchment — card fields, zebra ledger rows, specimen glyph seats.
- **Parchment Ink** (#33291c): primary text on parchment.
- **Dim Parchment Ink** (#65573f): secondary text on parchment — accessions, hints, italic notes.

### Named Rules

**The Phosphor Wells Rule.** Amber phosphor glows only inside a recessed display well (`.well`) or a lamp seated in its own drilled recess (status LEDs, radio dots, switch lamps). The well supplies the ground (#120d07), the mono face, the scanlines, and the bloom; nothing outside a well may glow, and the wallpaper's amber is flat plate ink — printed, never lit. Two sanctioned families exist besides wells: status lamps seated in their own drilled recesses, and the phosphor-persistence shimmer that rims an object while it is actively being dragged (the design brief's drag signature).

**The Brass Touchpoints Rule.** Brass appears only where a hand meets hardware: drawer pulls, switch bats and screws, label frames, corner brackets and rack-handle grips, and the focus ring on parchment. Never ornamental, never a large surface except the commissioning nameplate (a nameplate IS a label frame) and the primary brass action button (a button you press is hardware).

**The Oxide Only Destroys Rule.** Oxide red means loss. It colors guarded reset covers, destructive commit rows, Discard actions, and destructive text — nothing else. Destructive surfaces sit on the deep oxide base (#7c2b1c) and wear LIGHT parchment ink (#ece2c9); dark parchment ink on oxide fails contrast. Engagement lights the border, never the surface.

**The Warm Ground Rule.** The world is warm near-black, never pure black: the darkest value inside a module is the well ground (#120d07), and every "gray" is a warm dim (#a3937a / #65573f). Never cool a neutral toward blue; chroma collapses toward the shadows but the hue holds.

## Typography

**Display Font:** Lora (with Georgia, Times New Roman fallbacks)
**Body Font:** Lora (with Georgia, Times New Roman fallbacks)
**Label/Mono Font:** Chakra Petch for legends; B612 Mono for every digit and readout

**Character:** A technical-label face (Chakra Petch) cuts engraved uppercase legends into the hardware; a warm reading serif (Lora) carries everything meant to be read at length on parchment; an Airbus-cockpit mono (B612 Mono) typesets every number the machine produces. The pairing reads as instrument panel plus field notebook.

### Hierarchy

- **Display** (Lora 600, 1.75rem/1.15): the officer's name on the brass nameplate; exhibit page names (1.4rem/1.2). Serif — a plaque engraving is set in a serif.
- **Body** (Lora 400, 0.9375rem/1.8): all reading on parchment — the ledger note, field notes, exhibit descriptions, docent cards. Measure caps at 60–78ch (notepad sheet 78ch; notes 60–72ch).
- **Marginal note** (Lora italic 400, 0.8125rem/1.5–1.55): hints, placeholders, and awaiting-notices on parchment — always dim parchment ink.
- **Label** (Chakra Petch 600, 0.75rem uppercase, tracked 0.1em, line-height 1.35 when wrapped): the engraved legend — title bars, menu rows, controls, chips, toolbar legends, catalog names. Secondary legends may drop to the 11px floor (0.6875rem); tracking band 0.08–0.12em, all three stops addressable as tokens (`--track-legend-narrow` for wrapping/secondary legends, `--track-legend`, `--track-legend-wide` for awaiting/provisional shouts); wrapped catalog names clamp to 2–3 ruled lines. The 14px off-ramp (below) is the only size above 12px.
- **Readout** (B612 Mono 400, 0.8125–0.6875rem, tabular): timecode, accession codes, scale, version, POST lines. Always inside a well; 700 weight for banners.

### Named Rules

**The Measuring Law.** Every digit, code, and readout rides B612 Mono — Chakra Petch's digits are proportional and never appear in a readout. Tabular alignment is enforced by the well primitive (`font-variant-numeric: tabular-nums`).

**The Engraved Legend Law.** Labels are engraved, never embossed: the cut's dark shadow tucked under the stroke, one light lip below it (`text-shadow: 0 1px 0 rgb(0 0 0 / 70%), 0 2px 0 rgb(255 230 176 / 12%)`). On parchment the cut reverses (`0 1px 0 rgb(255 255 255 / 45%)`). Uppercase, 600, tracked inside the 0.08–0.12em band; 11px floor — nothing smaller.

**The 14px off-ramp (the law's one escape hatch).** The legend ramp is 11–12px. A legend may ride at 14px (0.875rem, token `--size-legend-xl`) — nothing between 12 and 14, nothing above — when 12px genuinely fails it, which happens in exactly two adjudicated cases: **(a) a glyph-mark plate** — a single drawn mark is the plate's whole content and a 12px cut collapses its strokes (the docent's × dismissal); **(b) an arm's-length selection list** — a list the operator reads to act, whose longest label runs past 14 characters, where tracked uppercase loses word-shape at 12px (the module drawer's rows: NAMEPLATE MANIFEST). The off-ramp applies per surface, never per row — one size for every row, chosen by the surface's longest label — and it never buys fit: a long name clamps (ellipsis, ruled lines), it never grows.

**Plate furniture is ink, not type (adjudicated).** Numerals, magnitude keys, and epoch blocks printed inside an authored wallpaper plate are plate ART: they scale with the plate's viewBox, are never focused, never read as chrome, and are exempt from this law's floor (star-chart edge numerals at 10px, the magnitude key at 10.5px). The exemption ends at the plate's frame — text the operator reads as console chrome (swatch labels, the MOUNTED flag) rides the law in full.

**The Serif Reads Law.** Prose on parchment is Lora, never the label face and never mono. The label face never sets sentences; the mono face never sets prose.

## Layout

The desktop is a fixed full-viewport stage: the warm near-black ground back-plates every layer. Wallpaper (an archive plate) fills it absolutely and slices to the viewport; above it, specimen icons place themselves on a grid; windows float freely; one drawer rail docks the bottom.

- **Icon grid:** cells of 104×132px from a 28,28px origin, filled column-major with a row cap of 8 (auto-placed icons stay above the rail). Positions persist as grid coordinates, so placements survive font/DPI changes.
- **Taskbar rail:** fixed to the bottom edge, 44px tall, layered above every window (z 9000). Contents in order: brass module-drawer pull → recessed LED channel (scrolls horizontally when the fleet outgrows it) → HOLD/OS engraved plate + B612 version chip → the timecode well.
- **Windows:** free-floating modules, minimum 320×200px, clamped to the viewport, focused by click (z-order follows user raises). The title bar is 32px; the content below it is the app's own.
- **App module anatomy (the duality):** a console-chrome toolbar (36px min-height) over a parchment content surface that scrolls inside itself. The toolbar carries the engraved name, one B612 accession well, and 26×22px control plates; everything readable lives on the parchment below.
- **Reading measure:** notepad sheet max-width 78ch centered; ledger notes 72ch; field notes 60ch.
- **Density:** explorer catalog grid `repeat(auto-fill, minmax(108px, 1fr))` with 10px gaps; atlas catalog cards `minmax(232px, 1fr)` with 14px gaps; ledger rows on a 88px / 1fr / 84px / 118px column grid.
- **Responsive behavior:** the full console requires ≥1024px of viewport width. Below it, the phone gate replaces everything with a single centered console plate (max 460px) — portrait-first, reading type ≥16px, every channel row ≥44px touch target. Inside app windows, layouts read their OWN width (the atlas page grids side-by-side past 280px columns and stacks below), not the viewport's.

## Elevation & Depth

Depth is machined, not painted: every surface states its position in the chassis through 1px bevel lips — a light lip above, a dark lip below (light falls from above) — plus at most one soft ground shadow per module. No blur stacks, no ambient glow in the open, no drop shadows on flat chrome.

### Shadow Vocabulary

- **Raised plate** (`border 1px #0c0906; inset 1px 1px 0 #514433, inset -1px -1px 0 rgb(0 0 0 / 45%)`): controls, title bars, raised cards — an instrument plate standing proud.
- **Module lift** (`2px 3px 12px rgb(0 0 0 / 45%)`): the one ground shadow under a window module or launcher panel — the module rides above the console bed.
- **Recessed seat** (`inset 1px 1px 0 rgb(0 0 0 / 60%), inset -1px -1px 0 #514433`): the inverse cut — LED channels, icon plates, menu panels, bays, grooves.
- **Pressed plate** (`inset 1px 1px 0 rgb(0 0 0 / 55%), inset -1px -1px 0 rgb(255 230 176 / 7%)`): a control held down — `:active` on every chrome control.
- **Display well** (`inset 2px 2px 0 rgb(0 0 0 / 60%), inset -1px -1px 0 #514433` + `text-shadow 0 0 6px rgb(255 179 64 / 50%)`): the phosphor well — the deepest cut in the world, and the only place ink blooms.
- **Parchment relief** (`inset 0 1px 0 rgb(255 255 255 / 35%), inset 0 2px 4px rgb(51 41 28 / 10–16%)` + `0 1px 2px rgb(51 41 28 / 12%)`): cards and mats on parchment — shadows are cast in warm INK tones (rgb(51 41 28 / …)), never black.
- **Plate on the mat** (`3px 4px 12px rgb(51 41 28 / 38%)`): an image or exhibit lying on parchment — offset with the light from above; its whole elevation.

### Named Rules

**The Machined Edge Rule.** A surface's depth is carried by its 1px lips first; at most one soft ground shadow per module. Never stack blurs, never float a shadow without a bevel, never shadow chrome ink onto chrome. **The radius law (as-built):** edges are cut, never softened — sharp 90° corners on every module, plate, card, chip, menu, and control; there is no radius scale because nothing rounds. The single sanctioned radius is the hardware circle — `border-radius: 50%` on status lamps, switch lamps, radio dots, screws, and rivets, each seated in its own drilled recess (a round lamp is hardware, not a rounded plate). No exception exists for pixel-scale softness: a 2–4px radius on a fault card, notice, or control is drift, not softness — the check lane fails any non-`50%` `border-radius` in shipped CSS (`src/styles/tokens.test.ts`, refinement #3).

**The Ink Shadow Rule.** On parchment, shadows are warm ink tones over the paper — a black drop shadow on parchment is a foreign object.

## Shapes

The form language is the rack instrument: sharp 90° corners on every module, plate, card, menu, and control — there is no border-radius scale because nothing rounds (the Machined Edge Rule's radius law, enforced as a check-lane grep; the resilience chrome — fault cards, storage notices, the console-fault plate — was squared to it in refinement #3). The only circles in the world are hardware: status lamps, switch state lamps, radio dots, screws, and rivets (`border-radius: 50%`), each seated in its own drilled recess.

- **Corner brackets:** engagement and grasp are drawn as rack-handle corner ticks — brass corner marks (eight short gradient ticks) cut into a selected specimen's plate; a two-tick brass bracket in a window's southeast corner for resize (edges carry plain 6px pulls).
- **Engraving:** text is cut into surfaces (see The Engraved Legend Law); panels and seams repeat the cut — separators are a 1px dark seam with a light lip below.
- **Dashed frames mean provisional:** awaiting/placeholder notices and undeveloped plates wear a dashed brass-in-shadow frame; a faulted module's LED channel caption wears a dashed edge. Dashed is never decorative.
- **Frames:** parchment cards wear a hairline frame of their own ink (rgb(51 41 28 / 22–25%)); the commissioning stamp wears a double-ruled frame, pressed slightly askew (rotate −1.5deg).
- **Grips and pulls are drawn, not labeled:** the drawer pull carries two dark finger slots; the oxide guard cover carries machined ridge grip lines.

## Components

### Window module (WindowFrame)

The core container: a beveled instrument module with one soft ground shadow, sharp corners, content clipped to the chassis.

- **Title bar** (32px, raised chrome): status LED (8px lamp — lit amber for the focused module, unlit bevel-light otherwise) → engraved uppercase title (Chakra Petch 600, 12px, tracked, ellipsized) → control plates (26×20px, B612 Mono glyphs for minimize/maximize/close). Close hovers oxide with light parchment ink. The bar is the drag surface.
- **States:** focused = lit LED; a module being dragged wears the phosphor-persistence shimmer (a 1px aged-amber rim + soft glow pulsing 0.35→0.8 opacity, 1.1s, compositor-only); maximized = full-bleed, bevel and shadow removed; minimized = hidden from the stage, remembered by its rail LED.
- **Resize:** corner-bracket + edge pulls in brass. At rest only the southeast bracket shows, faint; taking a grip lights it.

### Taskbar drawer rail

Fixed furniture, zero transitions — hover and press swap state instantly.

- **Module-drawer pull:** the rail's brass hardware — a brass plate with two dark finger slots, engraved dark-on-brass ink. Opens the registry-driven module menu (recessed chrome panel, min 236px, engraved rows on the 14px off-ramp — the operator's primary selection list, its longest name past 14 characters — each module glyph seated in a small recess).
- **LED channel:** a recessed groove; one engraved LED chip per open window (lamp = 16px drilled well: lit phosphor = focused, aged amber = stowed/minimized, dark = open but unfocused; dashed edge = module unavailable — a fault, not a danger, so never oxide).
- **Timecode well:** the hold's one shared clock — a `.well` readout, B612 13px HH:MM:SS, tracked 0.08em, scanlined.
- **OS plate:** engraved HOLD/OS legend + a B612 version chip seated in a sunken plate.

### Context menus

Recessed console panels (min 224px, max 300px) pressed into the console — never parchment cards. Rows are engraved legends; hover/focus presses the row INTO the panel (the inverse cut) and raises the ink to painted chrome; the focus beam rides inside the row. Destructive rows swap ink to bright oxide, keeping the press state. Radio rows carry a 12px drilled well with the amber dot. Destructive confirmation is a two-step in-panel strip: prompt + consequence + a guarded commit row (deep oxide surface, light parchment ink, border lights on engagement). Zero transitions.

### Specimen icon (desktop)

A pinned catalog card: an authored kind glyph seated in a 56px recessed plate above a parchment label (engraved name, 11px, up to three ruled lines; B612 accession code beneath) framed in brass-in-shadow. Selection = eight brass corner ticks cut into the plate + the brass frame joining; the glyph ink rises when engaged. Dragging lifts the card above its neighbors under the phosphor shimmer; a drawer receiving the drop engages its brass frame and leans up 3px toward the ghost (the drawer-pull affordance); an invalid drop bounces back with a short in-world shake (0.32s). Inline rename turns the label into a field: parchment-shade surface, brass frame, left-aligned.

### The phosphor well (primitive)

The signature surface — amber lives here and only here: a recessed seat on the deepest ground (#120d07), a faint radial tube bloom at the top, glowing amber ink, the B612 Mono face, tabular numerals, and the scanline overlay (1px of 24% black every 3px, pointer-transparent) clipped inside. Wells type POST lines, timecode, accession codes, vault readouts, and mounted-plate flags.

### Buttons

Chrome controls are plates you press — bevels swap, never colors alone.

- **Module control plate** (26×22px, square): raised chrome plate, painted chrome ink, B612 or glyph content. Hover darkens the plate a step (ground); `:active` presses it into the console (inverted bevel); focus = the amber beam (2px outline, 1px offset). The text-bearing widening (min-height 22px, padding 2px 12px) carries its engraved uppercase label.
- **Engaged/pressed state:** a held toggle reads as pressed-in with LIT legend ink (phosphor) on the sunken plate — e.g., the active density toggle.
- **Brass action** (min-height 30px, padding 4px 16px): the primary external action — a raised brass plate with an engraved dark-on-brass label; hover lifts it 1px on its setting; catch-light lip above, dark bevel at the foot.
- **Destructive commit** (min-height 22px, padding 2px 12px): deep oxide surface, LIGHT parchment ink, oxide border; hover lights the border (never the surface).
- **Brass drawer pull:** see Taskbar. The launcher pull pressed/expanded shows the inverted bevel.

### Hardware switch (Settings)

Settings controls are instruments, not checkboxes: a raised beveled housing (72×30px) with two brass screw heads, a recessed slot, a brass bat (18×20px) that THROWS on transform (120ms snap-fast), and a phosphor state lamp seated in its own tiny well at the right — dark when off, lit amber when thrown. It is a real `role="switch"` button; Space throws on keydown (a hardware switch throws the instant it is pressed).

### Guarded cover (destructive)

Destructive switches live under an oxide guard flap: a gradient oxide cover with an engraved light-ink legend and a machined ridge grip, riding rails over the bay. Lifting retracts it into its housing (240ms, exponential ease-out) leaving a retracted sliver; a confirm strip names the consequences and carries the release that re-seats it. Under reduced motion it snaps between seats.

### Cards / containers (parchment)

- **Catalog card** (explorer/atlas): recessed parchment-shade, hairline ink frame, light catch on the upper lip; hover lifts 1px; engagement = the brass rack-handle frame pressed one step into the drawer. Interior: glyph or matted 4:3 plate preview (6px paper mat), engraved name, B612 accession/plate number, italic Lora description, stamped chips.
- **Ledger note / exhibit sheet:** recessed parchment card with a ruled-off legend band; Lora body at generous leading (1.8).
- **Notepad sheet:** the archive's stationery — Lora 15px on exact 28px baselines (the rules scroll with the text), a brass margin rule at the left edge, max 78ch.

### Inputs / fields

- **Inline rename:** the label becomes a field in place — parchment(-shade) surface, brass frame, left-aligned (an edit field shows the START of a long label), caret brass; selection wash turns brass over parchment (the global amber wash vanishes there). On chrome, the field sunks into the plate with a brass frame and amber caret. A rejected relabel shakes in-world (0.32s).
- **Close guard strip:** a chrome strip rising from the bottom edge (240ms, transform+opacity) — warning title in bright oxide, Keep editing (chrome plate) vs Discard (oxide commit); the dirty lamp flares while it is open.

### Chips

Pressed paper stamps: parchment(-shade) surface, hairline ink frame, light inner lip, engraved 11px uppercase label. Used for tech stamps, apparatus/pursuits, and plate kinds (chrome variant: dim ink with a bevel-light border).

### Navigation

- **Breadcrumb (explorer):** engraved 11px crumbs with `/` separators in B612; the current crumb's ink is raised; a crumb is a jump, hover raises the ink.
- **Atlas navigation:** LEDGER return (text-bearing chrome plate + Backspace), wrapping prev/next plate tools; the departing card keeps focus.
- **Window/tab order:** F6 rings desktop → rail → window; arrows walk grids, LEDs, and menus (full map in docs/KEYBOARD.md).

### Boot module (POST)

Full-viewport tableau on the hold ground: an engraved caption above one min-620px phosphor well where POST lines type in amber (13px/1.95, B612), the fresh line and caret in hot amber, the banner heavier and brighter. The well warms up from 35% opacity (240ms) — the tube is already lit, never blank. The whole screen is the skip control; the skip legend is dim chrome ink outside the well. Under reduced motion the POST renders statically.

### Wallpaper plates

Authored inline-SVG archive plates (1600×900, slice-cropped): a curved star chart with invented constellations (the default), an anatomical dissection plate of a fictional specimen, an amber-on-dark phytographic contact sheet, a measuring survey sheet. Their ink comes from the tokens — amber on the dark plates is FLAT PLATE INK, never a lit well. Settings previews are 40px swatches seated in well-ground mats; the mounted plate's row carries a lit MOUNTED flag chip.

### Iconography vocabulary

Authored minimal vector marks, one consistent stroke (1.5px on a 24-unit grid), drawn with `currentColor` so the card's state recolors the whole glyph. NO emoji, no unicode stand-ins.

- **Drawer** (folder): cabinet front, face seam, brass pull slot.
- **Specimen sheet** (text): sheet with a folded corner, ruled lines.
- **Plate** (image): matted frame, inner window, specimen mark + baseline.
- **Module** (app-link): rack unit, vent slots, lit status dot.

App glyphs and switch-gear are drawn in the same discipline; module control glyphs ride the mono face.

### Docent callouts

Parchment annotation cards with drawn leader lines (dashed brass, 1.5px — a survey leader, never a hard rule), settling in with the console ease. First-visit onboarding only; dismissible and persistent.

### Notice card (phone gate)

One beveled console module (max 460px) centered on the hold ground: engraved title, a phosphor well carrying the message, and brass riveted channel rows for the real external links — the about nameplate's hardware, portrait-first.

## Do's and Don'ts

### Do:

- **Do** keep phosphor glow inside wells and seated lamps — the well primitive supplies ground, mono face, scanlines, and bloom together.
- **Do** draw depth with 1px bevel lips (light above, dark below) plus at most one ground shadow per module.
- **Do** ride every digit, code, and readout on B612 Mono (tabular); keep Chakra Petch out of readouts.
- **Do** give each module exactly one authored motion moment, easing `cubic-bezier(0.16, 1, 0.3, 1)` from a visible default (≥35% opacity start).
- **Do** animate transform/opacity only; snap instrument readouts (zoom, scale) between states instead of tweening.
- **Do** collapse every authored moment to its visible end-state under `prefers-reduced-motion` — never to blank.
- **Do** keep reading surfaces parchment + Lora at 1.7–1.8 leading, with a 60–78ch measure.
- **Do** wear light parchment ink on deep oxide for destructive surfaces; light the border on engagement.
- **Do** cast parchment shadows in warm ink tones (rgb(51 41 28 / …)).
- **Do** mark provisional states with dashed brass-in-shadow frames; state emptiness in-world, never with broken UI.
- **Do** give every interactive element the in-world focus beam: 2px amber outline on chrome, 2px brass-in-shadow outline on parchment.

### Don't:

- **Don't** use pure black (#000) or cool grays — the ground is warm near-black (#201a13); dims stay warm (#a3937a, #65573f).
- **Don't** let amber glow leave a well or a seated lamp; flat amber ink (wallpaper plates) is not glow.
- **Don't** use brass decoratively or as a large surface outside the nameplate and primary brass action.
- **Don't** use oxide for anything but warnings and destructive actions — and never as a fault state (faults are dashed, not oxide).
- **Don't** round a module, card, menu, or control — corners are sharp; circles are hardware only, and `50%` is the only `border-radius` value the world permits.
- **Don't** set labels below the 11px floor or above the 14px off-ramp ceiling, outside the 0.08–0.12em tracking band, or at any weight but 600; and never set sentences in the label face.
- **Don't** add transitions to furniture (rail, menus) or animate width/height (layout work breaks the 60fps floor).
- **Don't** use drop shadows, blur stacks, or ambient glows on flat chrome; no black shadows on parchment.
- **Don't** use emoji or unicode icon stand-ins — authored stroke glyphs only.
- **Don't** reach for browser dialogs (alert/confirm) — in-world strips, guards, and notices carry every question.
- **Don't** clone a real operating system's idioms — this is an invented console; when in doubt, ask what the vessel's science hold would do.
