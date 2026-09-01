/**
 * Storage-layer typed errors (MF-2), per the committed RQ-1 decision
 * (docs/ultron/research/rq1-storage.md "Implementation consequences").
 *
 * Every failure that crosses the persistence boundary is a `StorageError`
 * carrying a `kind` — never a bare `Error` and never a raw `DOMException` —
 * so HU-1 (quota toast / recovery screen) and AP-4 (storage readout) can
 * branch on `error.kind` instead of string-matching. This mirrors the
 * `FSError` pattern from the MF-1 domain model.
 *
 * Kinds and their blast radius (Hulk lens — everything fails eventually):
 * - `quota`           IDB write rejected for space. In-memory state is INTACT;
 *                     surfaced as a failure; one CoW-trim retry (drop `windows`)
 *                     happens inside the autosave writer before surfacing.
 * - `corrupt`         Loaded blob failed structural validation. Recovery path:
 *                     backup → fresh seed → recovery notice (HU-1 renders it).
 * - `unknown-version` Blob's schema version is unreadable/negative/from a
 *                     newer console (or the migration chain has a gap).
 *                     Recovered like `corrupt`, with its own notice kind.
 * - `unavailable`     Storage itself is unusable (SecurityError, IDB blocked,
 *                     private-mode edge). Session continues fully in memory;
 *                     every save will fail and surface; nothing is persisted.
 */

export type StorageErrorKind = 'quota' | 'corrupt' | 'unknown-version' | 'unavailable'

export class StorageError extends Error {
  readonly kind: StorageErrorKind
  /** The underlying DOMException / FSError / rejection, when there was one. */
  readonly cause?: unknown

  constructor(kind: StorageErrorKind, message: string, cause?: unknown) {
    super(`[${kind}] ${message}`)
    this.name = 'StorageError'
    this.kind = kind
    this.cause = cause
  }
}

export function isStorageError(value: unknown): value is StorageError {
  return value instanceof StorageError
}

/** Serializable failure summary for the status store (HU-1 toast / AP-4 readout). */
export interface StorageFailure {
  readonly kind: StorageErrorKind
  readonly message: string
  readonly at: number
}

/**
 * Classify a raw adapter rejection into a typed `StorageError`. Pass-through
 * for errors that are already typed; quota detection covers the standard
 * `QuotaExceededError` name and the legacy code 22; everything else from the
 * IDB machinery (SecurityError, InvalidStateError, UnknownError, blocked
 * private-mode opens, …) degrades to `unavailable` — the safe, in-memory path.
 */
export function classifyStorageError(error: unknown): StorageError {
  if (isStorageError(error)) return error
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'QuotaExceeded' ||
      ('code' in error && error.code === 22))
  ) {
    return new StorageError('quota', 'storage quota exceeded', error)
  }
  return new StorageError('unavailable', 'storage is unusable in this context', error)
}

/** Build the serializable summary the status store carries. */
export function toFailureSummary(error: StorageError, at: number): StorageFailure {
  return { kind: error.kind, message: error.message.replace(/^\[\w[\w-]*\]\s*/, ''), at }
}
