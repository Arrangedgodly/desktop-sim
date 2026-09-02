/**
 * Paint model (federated session 2, docs/FEDERATED-SESSIONS.md) — the pure,
 * React-free, DOM-free math behind the Plate Painter: plate caps (STORAGE
 * HONESTY — data URIs ride the IndexedDB envelope, so the working plate is
 * ONE fixed modest canvas), the tool/size/palette definitions, the src
 * transform for saving an opened plate (the notepad's `withTextContent`
 * pattern, for image src), defensive appState validation (the dirty mirror),
 * the catalog-order plate listing for the in-app picker, the bounded undo
 * ring, the per-window close-guard registry (notepad's pattern), and
 * `savePlate` — the accession ORCHESTRATOR with injected ports so the whole
 * save path, including its EXACTLY-ONE filing cue, is unit-testable without
 * a DOM. The surface commits the transforms through the FS store's single
 * atomic seam; this module never touches a store.
 *
 * Import discipline (docs/APP-CONTRACT.md — notepad-model's, verbatim): node
 * TYPES ride the app-registry contract (`FSNodeRef`, `AppLaunchContext`); the
 * only structural assumption is the catalog tree shape `{rootId, nodes}`. The
 * REAL pure op (`createNode`) is driven by `savePlate` — the sanctioned
 * lib/fs surface every app uses.
 */

import { createNode, FSError, listChildren } from '../../lib/fs'
import type { FSState } from '../../lib/fs'
import type { AppLaunchContext, FSNodeRef } from '../../platform/app-registry'

/* --------------------------------------------------------------------------
 * The plate (STORAGE HONESTY — the fixed working canvas)
 * ------------------------------------------------------------------------ */

/**
 * The ONE working plate size. A plate's PNG data URI rides the IndexedDB
 * persistence envelope (FS src AND the window's appState mirror); the
 * platform's quota fallback sacrifices window records, never the catalog —
 * so an oversized plate is an honest hazard. 960×600 is the committed cap:
 * a real drawing surface at a data-URI weight the envelope carries easily.
 * Rendered crisp via a devicePixelRatio-scaled backing store; displayed
 * aspect-fit (pointer math normalizes through the CSS rect).
 */
export const PLATE_WIDTH = 960
export const PLATE_HEIGHT = 600

/** How many strokes the undo ring remembers (PNG snapshots of the capped plate). */
export const UNDO_CAP = 20

/** Debounce for the dirty mirror onto the window record (notepad's delay). */
export const PAINT_MIRROR_DELAY_MS = 400

/* --------------------------------------------------------------------------
 * Tools · sizes · palette
 * ------------------------------------------------------------------------ */

export type PaintTool = 'brush' | 'eraser' | 'fill'

/** Discrete brush diameters (CSS px in plate space) — the size stepper's stops. */
export const BRUSH_SIZES = [2, 4, 8, 16, 32] as const
export type BrushSize = (typeof BRUSH_SIZES)[number]

export const DEFAULT_BRUSH_SIZE: BrushSize = 8

/** One step along the size ladder, clamped at the ends. */
export function stepSize(size: BrushSize, direction: -1 | 1): BrushSize {
  const index = BRUSH_SIZES.indexOf(size)
  const next = Math.min(BRUSH_SIZES.length - 1, Math.max(0, index + direction))
  return BRUSH_SIZES[next]!
}

/**
 * A palette swatch — a TOKEN NAME, never a raw value: the surface resolves
 * `token` through getComputedStyle at mount (ALL ink from tokens; the app
 * sheet carries zero raw hex). Pigment is pigment: these are flat paints on
 * parchment (the archive's own colors — parchment inks, oxide tones, brass
 * tones), never lit ink.
 */
export interface SwatchDef {
  readonly id: string
  readonly label: string
  readonly token: string
}

export const PALETTE: readonly SwatchDef[] = [
  { id: 'ink', label: 'Ink', token: '--parchment-ink' },
  { id: 'umber', label: 'Umber', token: '--parchment-ink-dim' },
  { id: 'rust', label: 'Rust', token: '--oxide' },
  { id: 'ember', label: 'Ember', token: '--oxide-bright' },
  { id: 'brass', label: 'Brass', token: '--brass' },
  { id: 'polished', label: 'Polished', token: '--brass-hi' },
  { id: 'shadow', label: 'Shadow', token: '--brass-lo' },
  { id: 'paper', label: 'Paper', token: '--parchment' },
]

export const DEFAULT_SWATCH_ID = 'ink'

/** The plate's ground token — what the plate is primed with (and the eraser paints). */
export const GROUND_TOKEN = '--parchment'

export function swatchById(id: string): SwatchDef | null {
  return PALETTE.find((swatch) => swatch.id === id) ?? null
}

/**
 * The selected pigment: a palette swatch, or the operator's own mix from the
 * custom picker (a `#rrggbb` value by the input's own contract).
 */
export type Pigment =
  | { readonly kind: 'swatch'; readonly id: string }
  | { readonly kind: 'custom'; readonly value: string }

export const DEFAULT_PIGMENT: Pigment = { kind: 'swatch', id: DEFAULT_SWATCH_ID }

/* --------------------------------------------------------------------------
 * Catalog access (notepad/viewer pattern, verbatim discipline)
 * ------------------------------------------------------------------------ */

/** The catalog tree shape this module reads (structurally the FS domain state). */
export interface CatalogSheet {
  readonly rootId: string
  readonly nodes: Readonly<Record<string, FSNodeRef>>
}

/** An image plate through the contract's node union (src-carrying kind). */
export type ImagePlateRef = Extract<FSNodeRef, { kind: 'image' }>

/** Label shown for a window that holds no catalogued plate yet. */
export const UNTITLED_PLATE_LABEL = 'Untitled plate'

/** Readout shown in the accession well while the plate is unfiled. */
export const UNFILED_ACCESSION = 'UNFILED'

/**
 * The node this window is bound to: the launch context's plate for a file
 * open (the picker's openApp route or a federated file launch); `null` for a
 * launcher open (a fresh blank plate — the notepad's untitled-draft shape).
 */
export function plateId(launch: AppLaunchContext): string | null {
  return launch.source === 'file' ? launch.file.id : null
}

/**
 * The live image plate bound to this window, or null — the node is gone
 * (decommissioned elsewhere) or is not an image specimen (a routing bug).
 * The surface renders its PLATE REMOVED notice on the gone case.
 */
export function imageSpecimen(sheet: CatalogSheet, id: string | null): ImagePlateRef | null {
  if (id === null) return null
  const node = sheet.nodes[id]
  return node && node.kind === 'image' ? node : null
}

/**
 * Commit a new src into an image plate — the pure state transform the
 * surface applies through the FS store's single `commit` seam (the notepad's
 * `withTextContent` pattern, for image src). Returns null when the id is not
 * a live image specimen (deleted mid-flight) — the caller no-ops; the
 * REMOVED notice owns that truth. Generic in `S` so a full FSState commits
 * back as an FSState.
 */
export function withImageSrc<S extends CatalogSheet>(
  sheet: S,
  id: string,
  src: string,
): S | null {
  const node = sheet.nodes[id]
  if (!node || node.kind !== 'image') return null
  return { ...sheet, nodes: { ...sheet.nodes, [id]: { ...node, src } } }
}

/**
 * Every image specimen in the catalog, in the catalog's own reading order
 * (depth-first, `listChildren` order per drawer — the terminal's
 * `accession` walk): the picker's listing, accession code first.
 */
export function listPlates(sheet: CatalogSheet): readonly ImagePlateRef[] {
  const plates: ImagePlateRef[] = []
  const walk = (id: string): void => {
    for (const node of listChildren(sheet, id)) {
      if (node.kind === 'image') plates.push(node)
      if (node.kind === 'folder') walk(node.id)
    }
  }
  walk(sheet.rootId)
  return plates
}

/* --------------------------------------------------------------------------
 * The dirty mirror (rides the WM window record's opaque appState)
 * ------------------------------------------------------------------------ */

/** The painter's persisted window payload (structured-clone-safe by shape). */
export interface PlateMirrorState {
  readonly png: string | null
}

const PNG_DATA_URI_PREFIX = 'data:image/png;base64,'

/**
 * Defensively read the dirty mirror off an UNTRUSTED `appState` (it crossed
 * the persistence boundary; validate.ts carries it verbatim). `null` =
 * absent, malformed, not the painter's payload, or not a PNG data URI —
 * callers fall back to the bound plate's committed src. The mirror only
 * ever exists while the plate is dirty, so a present mirror IS the newer
 * truth on restore.
 */
export function readPlateMirror(appState: unknown): string | null {
  if (typeof appState !== 'object' || appState === null) return null
  const png = (appState as Record<string, unknown>)['png']
  if (typeof png !== 'string') return null
  if (!png.startsWith(PNG_DATA_URI_PREFIX)) return null
  return png
}

/* --------------------------------------------------------------------------
 * The undo ring (bounded — see UNDO_CAP)
 * ------------------------------------------------------------------------ */

/** Record one stroke's BEFORE state; the ring drops the OLDEST past UNDO_CAP. */
export function pushSnapshot(stack: readonly string[], png: string): readonly string[] {
  const next = [...stack, png]
  return next.length > UNDO_CAP ? next.slice(next.length - UNDO_CAP) : next
}

/* --------------------------------------------------------------------------
 * The close-request guard's per-window half (notepad's pattern, verbatim)
 * ------------------------------------------------------------------------ */

/** Answer "may the platform close this window now?" — true = veto. */
export type PaintCloseGuard = () => boolean

const closeGuards = new Map<string, PaintCloseGuard>()

/** Register a window's guard; returns its unregister (unmount cleanup). */
export function registerCloseGuard(windowId: string, guard: PaintCloseGuard): () => void {
  closeGuards.set(windowId, guard)
  return () => {
    if (closeGuards.get(windowId) === guard) closeGuards.delete(windowId)
  }
}

/** The manifest's `onCloseRequest` body: true = veto (dirty — the strip interposes). */
export function vetoCloseFor(windowId: string): boolean {
  return closeGuards.get(windowId)?.() ?? false
}

/* --------------------------------------------------------------------------
 * savePlate — the accession orchestrator (ports-injected, unit-testable)
 * ------------------------------------------------------------------------ */

/** The outside-world effects `savePlate` needs, injected by the surface. */
export interface PaintSavePorts {
  /** The FS store's single atomic seam: `commit(nextFs)`. */
  readonly commit: (fs: FSState) => void
  /** Rebind the window onto the plate it just accessioned (HU-2 launch-rebind). */
  readonly rebind: (windowId: string, plate: ImagePlateRef) => boolean
  /** The filing cue — the surface passes `() => playCue('drop-on-folder')`. */
  readonly cue: () => void
}

export type PaintSaveRefusal = 'invalid-name' | 'collision' | 'not-a-plate'

export type PaintSaveResult =
  | { readonly status: 'saved'; readonly boundId: string }
  | { readonly status: 'refused'; readonly reason: PaintSaveRefusal }

/**
 * Accession (first save of an untitled draft) or update (save of a bound
 * plate) — ONE commit through the real ops, then the window rebind and the
 * filing cue, each EXACTLY ONCE, and only on success:
 *
 * - untitled: `createNode(root, {kind: 'image', src})` (the notepad's
 *   first-save shape), then `rebind(windowId, plate)` so dedupe/reload/
 *   delete-handling treat this window as the plate's window from now on.
 * - bound: `withImageSrc` — the src transform, name untouched.
 *
 * Refusals (empty/collision/not-a-plate) commit NOTHING and cue NOTHING;
 * the surface renders the refusal in-world (the shake, the notice).
 */
export function savePlate(
  args: {
    readonly fs: FSState
    readonly windowId: string
    readonly boundId: string | null
    readonly name: string
    readonly png: string
    readonly now?: number
  },
  ports: PaintSavePorts,
): PaintSaveResult {
  const name = args.name.trim()
  if (name.length === 0) return { status: 'refused', reason: 'invalid-name' }
  if (!args.png.startsWith(PNG_DATA_URI_PREFIX)) {
    return { status: 'refused', reason: 'not-a-plate' } // nothing honest to file
  }

  if (args.boundId === null) {
    let next: FSState
    try {
      next = createNode(args.fs, {
        id: crypto.randomUUID(),
        parentId: args.fs.rootId,
        name,
        kind: 'image',
        src: args.png,
        ...(args.now === undefined ? {} : { now: args.now }),
      })
    } catch (error) {
      if (!(error instanceof FSError)) throw error
      return {
        status: 'refused',
        reason: error.code === 'name-collision' ? 'collision' : 'invalid-name',
      }
    }
    ports.commit(next)
    const created = findCreated(args.fs, next)
    if (created) ports.rebind(args.windowId, created)
    ports.cue() // the filing cue — exactly once per successful accession
    return { status: 'saved', boundId: created?.id ?? '' }
  }

  const next = withImageSrc(args.fs, args.boundId, args.png)
  if (next === null) return { status: 'refused', reason: 'not-a-plate' }
  ports.commit(next)
  ports.cue() // exactly once per successful update
  return { status: 'saved', boundId: args.boundId }
}

/** The image node a just-created accession landed under (diff of the maps). */
function findCreated(before: CatalogSheet, after: CatalogSheet): ImagePlateRef | null {
  for (const node of Object.values(after.nodes)) {
    if (before.nodes[node.id]) continue
    return node.kind === 'image' ? node : null
  }
  return null
}
