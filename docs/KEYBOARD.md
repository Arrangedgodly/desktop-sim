# HOLD/OS — The Keyboard Map

How the console is operated without a pointer. Every surface of the desktop is
reachable, operable, and closable from the keyboard alone (DD-1; the scripted
non-visual pass lives in `tests/e2e/keyboard.spec.ts`).

## The three focus zones

The console is organized as three zones. **F6** walks the ring
desktop → taskbar → window (and wraps); **Shift+F6** walks it backwards. A zone
with nothing in it (no open window) is skipped, not a dead stop. When the last
window closes, focus is re-seated on the hold's ground — it never strands on
the document body.

| Zone | F6 lands on |
| --- | --- |
| Desktop | the hold's ground (the specimen field) — arrows then walk the icons |
| Taskbar | the rail's roving stop (the module pull, or the LED you last arrowed to) |
| Window | the focused window's frame |

**Tab order** within the page: ground → the tabbable icon → window controls
(title-bar buttons of open windows, in stacking order) → the taskbar rail.
Exactly one icon is tabbable at a time (the selected one, else the first) —
roving tabindex.

## Desktop — the hold

| Key | Action |
| --- | --- |
| `Tab` | reach the ground (the specimen field), then the tabbable icon |
| Arrows | walk the icon grid in 2D — up/down/left/right to the neighboring specimen (selection and focus follow; edges stop) |
| `Enter` | open the focused specimen (drawer → explorer, text → notepad, image → plate viewer, module → its app) |
| `Space` | select without opening |
| `Menu` / `Shift+F10` on an icon | that specimen's menu (Rename, Delete) |
| `Menu` / `Shift+F10` on the ground | the hold menu (New Drawer, New Specimen, Arrange by Accession) |
| Right-click | same two menus, by pointer |

## Windows

| Key | Action |
| --- | --- |
| `Alt+Esc` | focus the next window down the stack (raises it; a stowed window it lands on is restored) |
| `Alt+Shift+Esc` | focus the next window up the stack |
| `Esc` | close the window focus is inside — **once unclaimed** (see below) |
| `F6` / `Shift+F6` | leave for the next / previous zone |

Focus moves into a window when it opens (the window frame takes it; an app
with a content seat — the notepad's sheet, the viewer's stage, the atlas —
pulls it deeper). The frame is a `role="dialog"` labelled by its title.

**Esc precedence (who owns Escape).** Apps get the first claim on Escape
inside their window; only an *unclaimed* Esc closes it:

1. A text field (input / textarea / contentEditable) always keeps its keys.
2. An app surface that handles Escape wins — e.g. the notepad's dirty guard
   (Esc with unsaved changes opens the "Catalog unsaved changes?" strip, Esc
   in that strip keeps editing), the viewer's Esc bounce-back during a pan.
3. Only then does the OS close the window.

There is not yet a close-request/veto seam on the title-bar **✕** (a
pointer-clicked ✕ bypasses app guards entirely); that seam is recorded as
HU-2's. Until it exists, the notepad's guard owns the Esc path, which is the
keyboard story around close.

## Taskbar — the drawer rail

The rail is one toolbar stop (roving tabindex across the module pull and the
open-window LEDs; the pull is the stop until an arrow lands on an LED).

| Key | Action |
| --- | --- |
| Arrows ←/→ | walk pull ↔ LEDs |
| `Home` / `End` | jump to the pull / the last LED |
| `Enter` / `Space` | activate: pull opens the module drawer; a focused LED stows its window, any other LED restores + raises + focuses it (a minimized window comes back) |

**Module drawer** (opened from the pull):

| Key | Action |
| --- | --- |
| Arrows ↑/↓ | walk the module list |
| `Home` / `End` | first / last module |
| `Tab` / `Shift+Tab` | walk the list rows (the drawer keeps focus within itself — it does **not** close on Tab) |
| `Enter` / `Space` | launch the module |
| `Esc` | close the drawer, focus back on the pull |

Context menus (the hold menu, specimen menus, explorer menus) follow the same
law: arrows walk rows, Tab walks rows too, Esc closes, Enter activates, a
guarded step (Delete) steps back on Esc before closing.

## Inside apps (existing floors, kept)

| Where | Keys |
| --- | --- |
| Notepad | `Ctrl/Cmd+S` save (Esc per the precedence above) |
| Plate viewer | `F` fit ↔ 1:1, `+` / `−` zoom steps, Esc bounces a live pan |
| Field atlas | `ArrowLeft` / `ArrowRight` page plates, `Backspace` back to the ledger |
| Settings | arrows move the wallpaper radiogroup, `Space` throws switches |
| Explorer | arrows walk the specimen listbox, Enter opens |

## Laws

- **Typing keys are the field's.** Arrows, Enter, and Esc inside an input,
  textarea, or contentEditable never trigger OS behavior. The OS's global
  chords (`F6`, `Alt+Esc`) are non-typing keys — they fire from anywhere, a
  sheet included, like a real OS's global shortcuts.
- **Menus own their keys.** While focus is inside an open menu, the OS chords
  stand down.
- **Focus-visible everywhere.** The global amber focus beam (brass frame on
  parchment surfaces) rides every new control; the engaged ground draws as an
  inset beam framing the plate.
- **No motion.** The keyboard map adds no animations — focus states only.
