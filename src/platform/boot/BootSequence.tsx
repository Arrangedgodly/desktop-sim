import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { listApps } from '../app-registry'
import { useFSStore } from '../stores/fs-store'
import type { BootResult } from '../../lib/storage/persistence'
import { useStorageStatusStore } from '../../lib/storage/status'
import { seedStoredState } from '../../lib/storage/stored-state'
import {
  FULL_POST_TIMING,
  POST_PROBE_SNAPSHOT,
  PostController,
  RESUME_POST_TIMING,
  STATIC_POST_TIMING,
  type PostLine,
  type PostSnapshot,
} from './post-machine'
import { buildPostLines, buildResumeLine, type PostSubsystemReport } from './post-lines'
import { POST_COMPLETE, markBootOnce } from './boot-milestones'
import { DesktopSurface } from '../desktop'
import './boot.css'

/**
 * Boot orchestrator (UI-2) — the first thing the app graph renders. Contract:
 * persistence loads and the stores hydrate BEFORE the desktop appears; the
 * POST screen is what the visitor watches meanwhile (≤2s, skippable, honest —
 * every line reports a real subsystem reading).
 *
 * Four modes, decided ONCE from two synchronous facts (the boot flag, read in
 * main.tsx before render, and the media query):
 *
 *   first visit + motion        'full'    typed POST, ≤2s, click/any-key skip
 *   first visit + reduced       'static'  final POST state ~300ms, no motion
 *   return visit + motion       'resume'  single RESUME line, ≤200ms flash
 *   return visit + reduced      'none'    straight to the desktop
 *
 * `post-complete` is marked for full/static only — on a return visit no POST
 * ran, so the milestone is absent and e2e asserts exactly that.
 */

export interface BootSequenceProps {
  /** The bootPersistence() promise main.tsx started (hydration + boot flag). */
  readonly boot: Promise<BootResult>
  /** Boot-flag verdict (readBootFlag() === null). Pacing HINT, never proof. */
  readonly firstVisit: boolean
  /** Override the media-query probe (tests / embedding seams). */
  readonly reducedMotion?: boolean
}

type BootMode = 'full' | 'static' | 'resume' | 'none'

function bootMode(firstVisit: boolean, reducedMotion: boolean): BootMode {
  if (!firstVisit) return reducedMotion ? 'none' : 'resume'
  return reducedMotion ? 'static' : 'full'
}

function prefersReducedMotion(): boolean {
  try {
    const mm = typeof window === 'undefined' ? undefined : window.matchMedia
    return Boolean(mm?.('(prefers-reduced-motion: reduce)').matches)
  } catch {
    return false
  }
}

/** Reads the REAL subsystems the POST lines report (stores + registry + status). */
function reportFromBoot(result: BootResult): PostSubsystemReport {
  const { fs } = useFSStore.getState()
  const nodeCount = Math.max(0, Object.keys(fs.nodes).length - 1) // minus the root hold
  return {
    bootOrigin: result.origin,
    schemaVersion: result.state.version,
    nodeCount,
    moduleCount: listApps().length,
    recovery: useStorageStatusStore.getState().recovery,
  }
}

/**
 * bootPersistence resolves every classified failure — a rejection here is an
 * unclassified fault. The desktop still renders (boot never blocks on
 * persistence UX); the stores hold their seeded defaults in that case.
 */
function fallbackBootResult(firstVisit: boolean): BootResult {
  return { firstVisit, origin: 'seed', state: seedStoredState() }
}

export function BootSequence({ boot, firstVisit, reducedMotion }: BootSequenceProps) {
  const mode = bootMode(firstVisit, reducedMotion ?? prefersReducedMotion())
  const [result, setResult] = useState<BootResult | null>(null)
  const [postDone, setPostDone] = useState(mode === 'none')
  const skipRequested = useRef(false)

  // Hydration gate: the desktop may only render once this resolves.
  useEffect(() => {
    let alive = true
    boot.then(
      (resolved) => {
        if (alive) setResult(resolved)
      },
      (error: unknown) => {
        console.error('[boot] persistence boot rejected', error)
        if (alive) setResult(fallbackBootResult(firstVisit))
      },
    )
    return () => {
      alive = false
    }
  }, [boot, firstVisit])

  // The controller is constructed once (ref-guarded — StrictMode-safe). The
  // RESUME line needs no boot data, so it starts typing during hydration; the
  // full/static POST waits for the ARCHIVE INTEGRITY verdict and is therefore
  // built only once `result` exists (the probe caret fills the gap — IDB
  // resolves in single-digit ms).
  const controllerRef = useRef<PostController | null>(null)
  if (controllerRef.current === null) {
    if (mode === 'resume') {
      controllerRef.current = new PostController({
        lines: [buildResumeLine()],
        timing: RESUME_POST_TIMING,
        // No POST_COMPLETE mark on a return visit — no POST ran.
        onComplete: () => setPostDone(true),
      })
    } else if (mode !== 'none' && result !== null) {
      controllerRef.current = new PostController({
        lines: buildPostLines(reportFromBoot(result)),
        timing: mode === 'static' ? STATIC_POST_TIMING : FULL_POST_TIMING,
        onComplete: () => {
          setPostDone(true)
          if (mode === 'full' || mode === 'static') markBootOnce(POST_COMPLETE)
        },
      })
    }
  }
  const controller = controllerRef.current

  useEffect(() => {
    if (!controller || controller.started) return
    controller.start()
    if (skipRequested.current) controller.skip() // skip arrived during the probe
  }, [controller])

  const skip = useCallback(() => {
    if (controller) controller.skip()
    else skipRequested.current = true
  }, [controller])

  if (result !== null && postDone) return <DesktopSurface firstVisit={result.firstVisit} />
  if (mode === 'none') return <div className="boot-ground" data-boot-ground />
  return <PostScreen controller={controller} onSkip={skip} />
}

/* --------------------------------------------------------------------------
 * POST screen — amber lines typing inside the recessed well (FIRST VIEWPORT).
 * ------------------------------------------------------------------------ */

interface PostScreenProps {
  /** Null during the probe phase (full/static, boot result pending). */
  readonly controller: PostController | null
  readonly onSkip: () => void
}

const NO_LINES: readonly PostLine[] = []
const noopSubscribe = (): (() => void) => () => {}
const probeSnapshot = (): PostSnapshot => POST_PROBE_SNAPSHOT

function PostScreen({ controller, onSkip }: PostScreenProps) {
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getSnapshot ?? probeSnapshot,
  )

  useEffect(() => {
    const onKey = () => onSkip()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  const lines = controller?.lines ?? NO_LINES
  const chars = snapshot.chars

  // The caret rides the newest visible line (line 0 while probing).
  let caretIndex = 0
  for (let i = 0; i < chars.length; i++) {
    if ((chars[i] ?? 0) > 0) caretIndex = i
  }

  return (
    <div className="boot-screen" data-boot-screen onClick={onSkip}>
      <div className="boot-module">
        <p className="engraved boot-caption">Power-on self test</p>
        <div
          className="well boot-well"
          data-post-well
          role="log"
          aria-label="Power-on self test"
          aria-live="off"
        >
          {lines.length === 0 && (
            <div className="post-line" data-state="typing">
              <span className="post-caret" aria-hidden="true" />
            </div>
          )}
          {lines.map((line, i) => (
            <PostLineRow
              key={line.id}
              line={line}
              visible={Math.min(chars[i] ?? 0, line.text.length)}
              caret={i === caretIndex}
            />
          ))}
          <div className="scanlines" aria-hidden="true" />
        </div>
        <p className="boot-skip">Press any key or click to skip</p>
      </div>
    </div>
  )
}

function lineState(visible: number, text: string): 'pending' | 'typing' | 'done' {
  if (visible <= 0) return 'pending'
  return visible < text.length ? 'typing' : 'done'
}

function PostLineRow({
  line,
  visible,
  caret,
}: {
  readonly line: PostLine
  readonly visible: number
  readonly caret: boolean
}) {
  const state = lineState(visible, line.text)
  return (
    <div
      className={line.role === 'banner' ? 'post-line post-banner' : 'post-line'}
      data-post-line={line.id}
      data-state={state}
    >
      {line.text.slice(0, visible)}
      {caret && <span className="post-caret" aria-hidden="true" />}
    </div>
  )
}

/* --------------------------------------------------------------------------
 * Desktop surface — owned by UI-3 (`src/platform/desktop`): wallpaper plate
 * layer, pinned specimen icon grid, docent hints, and the WM host above.
 * The boot verdict rides in as a prop so first-visit-only features (the
 * docent) key off the real boot result, not the pacing hint.
 * ------------------------------------------------------------------------ */
