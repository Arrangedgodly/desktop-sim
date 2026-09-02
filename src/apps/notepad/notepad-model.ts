/**
 * Notepad model (AP-2) — the pure, React-free math behind the specimen
 * editor: launch-context → bound specimen id, the live text-specimen lookup,
 * and the content commit that rides the FS store's single atomic seam. The
 * dirty/autosave/guard STATE MACHINE lives in the surface (it is timing, not
 * math); everything testable without a DOM lives here.
 *
 * Import discipline (docs/APP-CONTRACT.md — explorer/ is the reference):
 * TYPES ride the app-registry contract (`FSNodeRef`, `AppLaunchContext`);
 * the only structural assumption is the catalog tree shape `{ rootId, nodes }`
 * (the FS store's state satisfies it by construction). No store access, no
 * DOM, no timers in this module.
 */

import type { AppLaunchContext, FSNodeRef } from '../../platform/app-registry'

/**
 * The catalog tree shape this module reads — structurally the FS domain state
 * (`FSTree`/`FSState`), typed through the contract's node so the app never
 * names a lib/fs type directly (explorer-model's discipline, verbatim).
 */
export interface CatalogSheet {
  readonly rootId: string
  readonly nodes: Readonly<Record<string, FSNodeRef>>
}

/** A text specimen through the contract's node union (content-carrying kind). */
export type TextSpecimenRef = Extract<FSNodeRef, { kind: 'text' }>

/** Label shown for a window that holds no catalogued specimen yet. */
export const UNTITLED_LABEL = 'Untitled'

/** Readout shown in the accession well while the specimen is unfiled. */
export const UNFILED_ACCESSION = 'UNFILED'

/**
 * Trailing debounce for the content autosave: each keystroke resets it; the
 * commit lands this many ms after the LAST edit (mirrors MF-2's own 500ms
 * writer below it — notepad commits to the store, persistence then writes the
 * envelope). While the close guard is open the autosave is SUSPENDED: the
 * console asked a question, the archive waits for the answer.
 */
export const NOTEPAD_AUTOSAVE_DELAY_MS = 400

/**
 * The node this window is bound to: the launch context's specimen for a file
 * open; `null` for a launcher open (an UNTITLED draft until its first save
 * accessions it — the surface tracks that later binding itself, because the
 * window record's launch context is immutable platform state).
 */
export function specimenId(launch: AppLaunchContext): string | null {
  return launch.source === 'file' ? launch.file.id : null
}

/**
 * The live text specimen bound to this window, or null — the node is gone
 * (decommissioned elsewhere) or is not a text specimen (a routing bug). The
 * surface renders its SPECIMEN REMOVED notice on the gone case.
 */
export function textSpecimen(sheet: CatalogSheet, id: string | null): TextSpecimenRef | null {
  if (id === null) return null
  const node = sheet.nodes[id]
  return node && node.kind === 'text' ? node : null
}

/**
 * Commit new body text into a text specimen — the pure state transform the
 * surface applies through the FS store's single `commit` seam, exactly like
 * every other op (so MF-2 persistence picks it up with zero notepad-specific
 * wiring). Returns null when the id is not a live text specimen (deleted
 * mid-debounce) — the caller no-ops; the REMOVED notice owns that truth.
 * Generic in `S` so a full FSState commits back as an FSState.
 */
export function withTextContent<S extends CatalogSheet>(
  sheet: S,
  id: string,
  content: string,
): S | null {
  const node = sheet.nodes[id]
  if (!node || node.kind !== 'text') return null
  return { ...sheet, nodes: { ...sheet.nodes, [id]: { ...node, content } } }
}

/* -------------------------------------------------------------------------
 * HU-2 (b) · draft persistence on the window record.
 *
 * An untitled draft has NO catalog node to autosave into, so its body lived
 * only in React state — a reload blanked it, and a saved-then-reloaded draft
 * window came back "untitled" next to the specimen it had accessioned (the
 * orphan-duplicate hazard behind the recorded launch-rebind follow-up). The
 * minimal correct design: the draft body rides the WM window record as the
 * app's opaque `appState` payload (`{ draft }`, debounced like the content
 * autosave), and the FIRST SAVE rebinds the window onto the accessioned node
 * (`rebindWindow`: instanceId `file:<id>` + a file launch context) so the
 * window is a file window in every respect — dedupe, reload, removed-notice —
 * from that moment on. After a reload the restored window either still edits
 * the SAME persisted draft (never saved) or binds its specimen (saved).
 * ---------------------------------------------------------------------- */

/** The notepad's persisted window payload (structured-clone-safe by shape). */
export interface NotepadDraftState {
  readonly draft: string
}

/**
 * Defensively read the draft off an UNTRUSTED `appState` (it crossed the
 * persistence boundary; validate.ts carries it verbatim). `null` = absent,
 * malformed, or not the notepad's payload — callers fall back to the bound
 * specimen's content.
 */
export function readDraftState(appState: unknown): string | null {
  if (typeof appState !== 'object' || appState === null) return null
  const draft = (appState as Record<string, unknown>)['draft']
  return typeof draft === 'string' ? draft : null
}

/* -------------------------------------------------------------------------
 * HU-2 (a) · the close-request veto's per-window half.
 *
 * The manifest is static but dirtiness lives in mounted surfaces, so the
 * surface registers a per-window guard here (on mount, re-registered when the
 * dirty verdict flips) and the manifest's `onCloseRequest` consults it. No
 * guard registered (surface not mounted yet, or the chunk never loaded) → no
 * veto → the platform closes — the safe default.
 * ---------------------------------------------------------------------- */

/** Answer "may the platform close this window now?" — true = veto. */
export type NotepadCloseGuard = () => boolean

const closeGuards = new Map<string, NotepadCloseGuard>()

/** Register a window's guard; returns its unregister (unmount cleanup). */
export function registerCloseGuard(windowId: string, guard: NotepadCloseGuard): () => void {
  closeGuards.set(windowId, guard)
  return () => {
    if (closeGuards.get(windowId) === guard) closeGuards.delete(windowId)
  }
}

/** The manifest's `onCloseRequest` body: true = veto (dirty — the strip interposes). */
export function vetoCloseFor(windowId: string): boolean {
  return closeGuards.get(windowId)?.() ?? false
}
