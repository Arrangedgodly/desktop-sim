/**
 * FS domain model (MF-1) — THE SPECIMEN CATALOG.
 *
 * World vocabulary, modeled in the DATA (not the UI):
 * - The filesystem is a natural-history catalog: folders are DRAWERS,
 *   files are SPECIMENS with parchment catalog labels.
 * - Every node carries an immutable accession code on its label:
 *   drawers `DRW-####`, text specimens `SPC-####`, image plates `PLT-####`,
 *   module references (app links) `MOD-####`. The catalog root itself is the
 *   hold: `ARC-0000`.
 * - `accessionedAt` is the accession timestamp printed on the label
 *   (design-brief "signature interaction": accession timestamps on labels).
 *
 * Engineering notes:
 * - The tree is stored FLAT: `Record<id, FSNode>` + `parentId` links, with
 *   `rootId` naming the root. Structural sharing makes pure ops cheap; the
 *   flat map is also the persisted/migrated wire shape (schema.ts).
 * - Nodes are discriminated on `kind`; every field is readonly. Ops never
 *   mutate — they produce new state (see ops.ts).
 */

/** Node kinds. Mirrors the app-registry contract union exactly (contract.ts aliases it). */
export type FSNodeKind = 'folder' | 'text' | 'image' | 'app-link'

/** Every kind in the union, for runtime validation of untrusted data. */
export const FS_NODE_KINDS: readonly FSNodeKind[] = ['folder', 'text', 'image', 'app-link']

/** Fields shared by every catalog node (the parchment label). */
export interface FSNodeBase {
  readonly id: string
  /** Parent node id; null ONLY on the root. */
  readonly parentId: string | null
  /** Catalog label text (unique among siblings, case-insensitive). */
  readonly name: string
  readonly kind: FSNodeKind
  /** Immutable accession code, allocated at creation (see accession.ts). */
  readonly accession: string
  /** Epoch-ms when the node was accessioned into the catalog. */
  readonly accessionedAt: number
}

/** A drawer: holds other nodes. Desktop "open folder" = drawer module pulls out. */
export interface FSFolderNode extends FSNodeBase {
  readonly kind: 'folder'
}

/** A text specimen (Notepad territory). Content is the specimen itself. */
export interface FSTextNode extends FSNodeBase {
  readonly kind: 'text'
  readonly content: string
}

/** An image specimen — a plate. `src` is a URL or data URI the viewer renders. */
export interface FSImageNode extends FSNodeBase {
  readonly kind: 'image'
  readonly src: string
}

/** A module reference: catalog label that opens a registered app (by manifest id). */
export interface FSAppLinkNode extends FSNodeBase {
  readonly kind: 'app-link'
  /** Target AppManifest id (APP_ID_PATTERN in the app-registry contract). */
  readonly appId: string
}

export type FSNode = FSFolderNode | FSTextNode | FSImageNode | FSAppLinkNode

export function isFolderNode(node: FSNode): node is FSFolderNode {
  return node.kind === 'folder'
}

/** The flat catalog: all nodes by id, plus the root's id. */
export interface FSTree {
  readonly rootId: string
  readonly nodes: Readonly<Record<string, FSNode>>
}

/**
 * Desktop icon position — GRID coordinates on the desktop surface
 * (x = column, y = row), not pixels. Positions are only meaningful for the
 * root's children (what sits on the desktop); ops maintain the invariant
 * that moving/deleting a subtree prunes its positions.
 */
export interface GridPosition {
  readonly x: number
  readonly y: number
}

/** nodeId → desktop grid slot. */
export type IconPositionMap = Readonly<Record<string, GridPosition>>

/**
 * Runtime FS state — the envelope (schema.ts) minus persistence metadata.
 * Runtime state is ALWAYS at the current schema version; `version`/`savedAt`
 * exist only on the wire (envelope). Ops in ops.ts take and return this.
 */
export interface FSState extends FSTree {
  readonly iconPositions: IconPositionMap
}

/** id of the catalog root (the hold). */
export const ROOT_ID = 'root'

/** Catalog label of the root node — the science hold itself. */
export const ROOT_NAME = 'Hold'

/** Accession prefix reserved for the catalog root. */
export const ROOT_ACCESSION = 'ARC-0000'
