/**
 * FS domain errors (MF-1).
 *
 * The pure operations in `ops.ts` and the migration harness in `schema.ts`
 * throw `FSError` — never bare `Error` — so UI callers (UI-5 context menus,
 * AP-1 explorer) can branch on `error.code` for in-world messaging instead of
 * string-matching messages. Queries (`findNode`, `pathOf`) never throw: they
 * return null for missing ids.
 */

export type FSErrorCode =
  /** A node (or target parent) id does not exist in the tree. */
  | 'not-found'
  /** A name failed normalization (empty, whitespace-only, or contains '/'). */
  | 'invalid-name'
  /** A sibling with the same name (case-insensitive) already exists in the destination drawer. */
  | 'name-collision'
  /** The operation needs a drawer (folder) but the node is a specimen/file. */
  | 'not-a-folder'
  /** The move would place a drawer inside its own subtree. */
  | 'cycle'
  /** The operation would mutate or remove the root of the catalog. */
  | 'root-protected'
  /** Kind-specific payload problems (missing image src / app id, duplicate id, bad icon position). */
  | 'invalid-data'
  /** The persisted envelope is structurally corrupt (schema.ts harness). */
  | 'invalid-envelope'
  /** Envelope version is unreadable, negative, or newer than this console knows. */
  | 'unknown-schema-version'

export class FSError extends Error {
  readonly code: FSErrorCode

  constructor(code: FSErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'FSError'
    this.code = code
  }
}

export function isFSError(value: unknown): value is FSError {
  return value instanceof FSError
}
