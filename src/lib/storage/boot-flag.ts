/**
 * The localStorage boot flag (MF-2, RQ-1 note 5) — the synchronous seam UI-2
 * reads to shorten the boot animation on return visits.
 *
 * Value: the schema version string this console last persisted (e.g. "1").
 * PRESENCE is the "seen" bit; the version digits exist so a future schema bump
 * can choose to replay the full boot. Kept to a couple of bytes — this is a
 * hint, never a source of truth:
 *
 * - Absent/null ⇒ treat as a FIRST VISIT for boot pacing (full POST, ≤2s,
 *   skippable) — but NOT proof that no state exists. localStorage and IDB can
 *   diverge (SecurityError/private mode, user clearing one but not the other);
 *   the data path in persistence.ts always asks IDB and never destroys a good
 *   state just because the flag was missing.
 * - Safari ITP's 7-day no-interaction purge clears flag AND state together —
 *   which is exactly the "looks like a first visit again" outcome.
 *
 * Every access is defensive: localStorage can throw (SecurityError when the
 * user blocks site data, Safari private-mode edges) — a throwing or poisoned
 * flag must never take the boot down with it.
 */

import { CURRENT_SCHEMA_VERSION } from '../fs'

export const BOOT_FLAG_KEY = 'ds:boot'

/** Read the flag. `null` = absent, unreadable, or storage throwing. */
export function readBootFlag(): { seen: boolean; version: number } | null {
  try {
    const raw = globalThis.localStorage?.getItem(BOOT_FLAG_KEY)
    if (raw === null || raw === undefined) return null
    const version = Number.parseInt(raw, 10)
    if (!Number.isInteger(version) || version < 0) return null // poisoned → first visit
    return { seen: true, version }
  } catch {
    return null // SecurityError / private mode — non-fatal by contract
  }
}

/** Stamp "this console has visited at schema v<version>". Best-effort. */
export function writeBootFlag(version: number = CURRENT_SCHEMA_VERSION): void {
  try {
    globalThis.localStorage?.setItem(BOOT_FLAG_KEY, String(version))
  } catch {
    // Non-fatal: the flag only paces the boot animation (UI-2).
  }
}

/** Remove the flag so the next boot paces as a first visit (AP-4 Reset). */
export function clearBootFlag(): void {
  try {
    globalThis.localStorage?.removeItem(BOOT_FLAG_KEY)
  } catch {
    // Non-fatal.
  }
}
