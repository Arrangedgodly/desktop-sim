/**
 * Per-window app error boundary (HU-1) — one boundary per window content, at
 * the AppSlot level. A thrown render error in ANY app, and a lazy-chunk load
 * failure (which React rethrows from the lazy payload during render), are
 * isolated to that one window as an in-world MODULE FAULT console card: the
 * OS, every other window, and persistence keep running.
 *
 * Fallback stability (the Hulk floor): the fallback card renders NO children,
 * subscribes to NOTHING from the faulting subtree, and can never throw into
 * its own catch — a repeat fault after Reload module simply lands on the card
 * again. The card carries:
 *   - the module's name + a one-line, non-technical explanation
 *   - Reload module — resets a retryableLazy mount (fresh import for chunk
 *     faults) and remounts the app fresh via a subtree key change
 *   - Copy diagnostics — the network-vs-code distinction + module id, error
 *     line and storage/boot facts for a bug report, via the async clipboard
 *     with a legacy-execCommand fallback and a final "reveal for hand-copy"
 *     state. Never a browser dialog, never a raw React dump.
 */

import { Component, Fragment, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type { AppMountComponent } from './contract'
import { resetLazyMount } from './lazy-mount'
import {
  buildModuleDiagnostics,
  classifyModuleFault,
  copyTextWithFallback,
  extractModuleUrl,
  moduleFaultExplanation,
  moduleFaultKindLine,
  type CopyOutcome,
  type ModuleFault,
} from './module-fault-model'
import { useStorageStatusStore } from '../../lib/storage/status'

export interface AppBoundaryProps {
  readonly appId: string
  readonly moduleName: string
  /** The manifest mount — re-armed by Reload module when it is retryableLazy. */
  readonly mount: AppMountComponent
  readonly children: ReactNode
}

interface AppBoundaryState {
  readonly fault: ModuleFault | null
  /** Reload-module nonce: a change unmounts + remounts the whole subtree. */
  readonly nonce: number
}

export class AppBoundary extends Component<AppBoundaryProps, AppBoundaryState> {
  state: AppBoundaryState = { fault: null, nonce: 0 }

  static getDerivedStateFromError(error: unknown): Partial<AppBoundaryState> {
    return { fault: classifyModuleFault(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The console's own log keeps the full story (stack + component stack);
    // the visitor only ever sees the card.
    console.error(
      '[module-fault] %s (%s) failed — %s',
      this.props.moduleName,
      this.props.appId,
      String((error as Error | undefined)?.message ?? error),
      info.componentStack,
    )
  }

  /** Reload module: re-arm a failed lazy chunk, then remount the app fresh. */
  reloadModule = (): void => {
    resetLazyMount(this.props.mount, this.bustedModuleUrl())
    this.setState((s) => ({ fault: null, nonce: s.nonce + 1 }))
  }

  /**
   * Same-origin module URL for the cache-busted re-import, when the engine
   * named one in a chunk-failure error. The browser's module map caches a
   * failed dynamic import for the page's lifetime — re-importing the SAME url
   * re-fails instantly, so the retry must land on a fresh key (see
   * lazy-mount.ts). Foreign origins are refused; Safari's URL-less message
   * degrades to the plain loader reset.
   */
  private bustedModuleUrl(): string | undefined {
    const fault = this.state.fault
    if (fault === null || fault.kind !== 'network') return undefined
    const url = extractModuleUrl(fault)
    if (url === null || typeof window === 'undefined') return undefined
    try {
      return new URL(url, window.location.href).origin === window.location.origin ? url : undefined
    } catch {
      return undefined
    }
  }

  render() {
    if (this.state.fault !== null) {
      return (
        <ModuleFaultCard
          appId={this.props.appId}
          moduleName={this.props.moduleName}
          fault={this.state.fault}
          onReload={this.reloadModule}
        />
      )
    }
    // Keyed by the reload nonce: a reload is a REAL remount (fresh component
    // state, fresh lazy payload), not a re-render of the faulted tree.
    return <Fragment key={this.state.nonce}>{this.props.children}</Fragment>
  }
}

/* --------------------------------------------------------------------------
 * The MODULE FAULT console card — a phosphor well inside the window frame.
 * ------------------------------------------------------------------------ */

function ModuleFaultCard({
  appId,
  moduleName,
  fault,
  onReload,
}: {
  readonly appId: string
  readonly moduleName: string
  readonly fault: ModuleFault
  readonly onReload: () => void
}) {
  const [copyState, setCopyState] = useState<'idle' | CopyOutcome>('idle')
  const phase = useStorageStatusStore((s) => s.phase)
  const boot = useStorageStatusStore((s) => s.bootOrigin)
  const writes = useStorageStatusStore((s) => s.saveCount)

  const diagnostics = buildModuleDiagnostics({
    appId,
    moduleName,
    fault,
    storage: { phase, boot, writes },
    at: new Date(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  })

  const copyDiagnostics = (): void => {
    void copyTextWithFallback(diagnostics).then(setCopyState)
  }

  const copyLabel =
    copyState === 'clipboard' || copyState === 'fallback'
      ? 'Diagnostics copied'
      : copyState === 'manual'
        ? 'Copy unavailable — select below'
        : 'Copy diagnostics'

  return (
    <div
      className="module-fault"
      data-module-fault
      data-fault-kind={fault.kind}
      role="alert"
      aria-label={`Module fault — ${moduleName}`}
    >
      <p className="module-fault-head">MODULE FAULT</p>
      <p className="module-fault-name">
        {moduleName} <code>{appId}</code>
      </p>
      <p className="module-fault-explain">{moduleFaultExplanation(fault.kind)}</p>
      <p className="module-fault-kind">{moduleFaultKindLine(fault.kind)}</p>
      <div className="module-fault-actions">
        <button
          type="button"
          className="module-fault-reload"
          data-module-fault-reload
          onClick={onReload}
        >
          Reload module
        </button>
        <button
          type="button"
          className="module-fault-copy"
          data-module-fault-copy={copyState !== 'idle' ? copyState : undefined}
          onClick={copyDiagnostics}
        >
          {copyLabel}
        </button>
      </div>
      {copyState === 'manual' && (
        <pre className="module-fault-report" data-module-fault-report>
          {diagnostics}
        </pre>
      )}
    </div>
  )
}
