/**
 * Debounced autosave (MF-2) — the ONLY writer in normal operation.
 *
 * Wired to the three IM-2 stores' `subscribeWithSelector` seams (never
 * useEffect polling):
 *   fs       s => s.fs                      one commit per FS op / icon drag
 *   wm       s => s.windows                 every persisted WM mutation builds a
 *                                           new windows map; the transient
 *                                           `dragging` slice deliberately does
 *                                           NOT (RQ-2 discipline), so pointermove
 *                                           storms schedule zero saves
 *   settings [wallpaper, soundsEnabled, reducedMotionFollow] with shallow
 *                                           equality — precise to the persisted
 *                                           projection
 *
 * Debounce: trailing (~500 ms default) — rapid commits coalesce into ONE
 * write of the then-current state. `flush()` forces the pending write and is
 * fired on `visibilitychange → hidden` and `pagehide` (fire-and-forget) so a
 * reload mid-op (HU-2) and AP-2's edit→reload→intact step hold. A write is a
 * single atomic IDB put: an interruption leaves the previous envelope intact.
 *
 * Quota path (RQ-1 note 4): on a quota rejection the writer retries ONCE with
 * a copy-on-write trim (`windows: []` — session geometry is the most
 * expendable slice; the catalog is never trimmed). If that also fails the
 * failure is surfaced on the status store and THE IN-MEMORY SESSION IS KEPT —
 * a failed save never discards state; the next flush retries.
 */

import { shallow } from 'zustand/shallow'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { defaultIDBAdapter } from './adapter'
import { classifyStorageError, toFailureSummary } from './errors'
import { useStorageStatusStore } from './status'
import { buildStoredState } from './stored-state'
import type { StorageAdapter, StoredState } from './types'

export const DEFAULT_AUTOSAVE_DELAY_MS = 500

export interface AutosaveOptions {
  /** Trailing debounce window. Default 500 ms. */
  readonly delayMs?: number
  /** Default: the adapter the boot used (or the IDB default before boot). */
  readonly adapter?: StorageAdapter
  readonly now?: () => number
}

export interface AutosaveHandle {
  /** Detach subscriptions + cancel the pending timer (in-flight write finishes). */
  stop(): void
  /** Write now if a change is pending; resolves when the write settles. */
  flush(): Promise<void>
}

/** Quota trim + single retry, per RQ-1 note 4. Never throws. */
async function writeWithQuotaRetry(
  adapter: StorageAdapter,
  state: StoredState,
  now: () => number,
): Promise<void> {
  const status = useStorageStatusStore.getState()
  try {
    await adapter.save(state)
    status.noteSaved(state.savedAt)
  } catch (error) {
    const typed = classifyStorageError(error)
    if (typed.kind === 'quota' && state.windows.length > 0) {
      try {
        await adapter.save({ ...state, windows: [] })
        status.noteSaved(state.savedAt) // session geometry sacrificed, catalog safe
        return
      } catch {
        // fall through and surface the original quota failure
      }
    }
    status.noteFailure(toFailureSummary(typed, now()))
  }
}

export function createAutosave(options: AutosaveOptions = {}): AutosaveHandle {
  const delayMs = options.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS
  const now = options.now ?? Date.now
  const adapter = options.adapter ?? activeAdapter

  let timer: ReturnType<typeof setTimeout> | null = null
  let dirty = false
  let writing: Promise<void> = Promise.resolve()
  let stopped = false

  function schedule(): void {
    if (stopped) return
    dirty = true
    // Trailing debounce: restart the window on every change — rapid commits
    // coalesce into ONE write that fires `delayMs` after the LAST commit.
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, delayMs)
  }

  function flush(): Promise<void> {
    if (!dirty || stopped) return writing
    dirty = false
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    // write() never rejects; serialize writes so pagehide flushes can't interleave.
    writing = writing.then(() => writeWithQuotaRetry(adapter, buildStoredState(now()), now))
    return writing
  }

  const unsubs = [
    useFSStore.subscribe((s) => s.fs, schedule),
    useWMStore.subscribe((s) => s.windows, schedule),
    useSettingsStore.subscribe(
      (s) => [s.wallpaper, s.soundsEnabled, s.reducedMotionFollow],
      schedule,
      { equalityFn: shallow },
    ),
  ]

  // Reload/tab-hide safety net (RQ-1 note 2) — fire-and-forget, guarded for node.
  const onHidden = (): void => {
    void flush()
  }
  if (typeof globalThis.document !== 'undefined') {
    globalThis.document.addEventListener('visibilitychange', onHidden)
    globalThis.window.addEventListener('pagehide', onHidden)
  }

  function stop(): void {
    stopped = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    for (const unsub of unsubs) unsub()
    if (typeof globalThis.document !== 'undefined') {
      globalThis.document.removeEventListener('visibilitychange', onHidden)
      globalThis.window.removeEventListener('pagehide', onHidden)
    }
  }

  return { stop, flush }
}

/* -------------------------------------------------------------------------
 * Default-handle + active-adapter management: at most one autosave attached
 * at a time (bootPersistence re-attaching detaches the previous writer), and
 * the adapter the boot used is the default for later writers (resetDesktop,
 * tests). No import cycle: persistence → autosave → adapter.
 * ---------------------------------------------------------------------- */

let activeAutosave: AutosaveHandle | null = null
let activeAdapter: StorageAdapter = defaultIDBAdapter

/** persistence.ts registers the booted adapter so later writers default to it. */
export function registerActiveAdapter(adapter: StorageAdapter): void {
  activeAdapter = adapter
}

/** The adapter persistence last booted with (IDB default before any boot). */
export function getActiveAdapter(): StorageAdapter {
  return activeAdapter
}

/** Attach the (single) default autosave writer. Returns its handle. */
export function attachAutosave(options: AutosaveOptions = {}): AutosaveHandle {
  activeAutosave?.stop()
  activeAutosave = createAutosave(options)
  return activeAutosave
}

/** Detach the default writer, if attached (tests/HMR). */
export function stopAutosave(): void {
  activeAutosave?.stop()
  activeAutosave = null
}
