/**
 * Platform keyboard (DD-1) — the OS keyboard interaction map. Pure math in
 * nav-grid.ts (2D arrow walks), the document-level chords + shared guards in
 * os-keys.ts. docs/KEYBOARD.md is the user-facing map this implements.
 */
export { arrowNavigate, type NavDirection, type NavSlot } from './nav-grid'
export {
  attachOSKeyboard,
  isInsideMenu,
  isTextEntryTarget,
  resolveFocusZone,
  type FocusZone,
} from './os-keys'
