/**
 * Module-fault model (HU-1) — the pure machinery behind the MODULE FAULT card:
 * fault classification (network-vs-code), the one-line non-technical
 * explanation, the copyable diagnostics report, and the clipboard-with-
 * graceful-fallback writer. Pure and DOM-isolated so every branch is testable.
 */

import { OS_VERSION } from '../boot/os'
import type { BootOrigin, StoragePhase } from '../../lib/storage/status'

/** Which of the two worlds a module fault lives in. */
export type ModuleFaultKind = 'network' | 'code'

/** A classified module fault (already stringified — never carries the Error). */
export interface ModuleFault {
  readonly kind: ModuleFaultKind
  /** `error.name` — e.g. "TypeError" (browsers throw TypeError for chunk loads). */
  readonly errorName: string
  /** First line of `error.message`. */
  readonly message: string
  /** The FULL message — browsers name the module URL in chunk-failure errors. */
  readonly sourceMessage: string
  /** First stack frame line, when the engine provided one. */
  readonly stackLine: string | null
}

/**
 * Chunk-load failures every shipping engine reports as a TypeError carrying
 * one of these phrases (Chrome/Edge "Failed to fetch dynamically imported
 * module", Firefox "error loading dynamically imported module", Safari
 * "Importing a module script failed"). Everything else is a code fault.
 */
const CHUNK_LOAD_PATTERNS: readonly RegExp[] = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /dynamically imported module/i,
]

/** Does this error look like a failed module TRANSFER rather than a code fault? */
export function isChunkLoadError(message: string): boolean {
  return CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(message))
}

function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? ''
  return line.trim()
}

/** Classify a thrown/rejected module error into the card's two-world model. */
export function classifyModuleFault(error: unknown): ModuleFault {
  const name =
    error !== null && typeof error === 'object' && 'name' in error
      ? String((error as { name: unknown }).name)
      : typeof error === 'string'
        ? 'Error'
        : 'Unknown'
  const rawMessage =
    error !== null && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  const stack =
    error !== null && typeof error === 'object' && 'stack' in error
      ? String((error as { stack: unknown }).stack)
      : ''
  const stackLines = stack.split('\n').map((line) => line.trim())
  // Stack line 0 is "Name: message"; line 1 is the first frame we report.
  const stackLine = stackLines[1] && stackLines[1] !== '' ? stackLines[1] : null
  return {
    kind: isChunkLoadError(rawMessage) ? 'network' : 'code',
    errorName: name,
    message: firstLine(rawMessage) || 'the module reported no further detail',
    sourceMessage: rawMessage,
    stackLine: stackLine && stackLine !== '' ? stackLine : null,
  }
}

/**
 * The failed module's URL, when the engine named it in the error (Chrome and
 * Firefox do; Safari's "Importing a module script failed" does not). Used by
 * the boundary's Reload module for the cache-busted re-import — same-origin
 * URLs only, decided by the caller.
 */
export function extractModuleUrl(fault: ModuleFault): string | null {
  const match = fault.sourceMessage.match(/https?:\/\/[^\s'"]+/)
  return match !== null ? match[0] : null
}

/** The one-line, non-technical explanation the card leads with. */
export function moduleFaultExplanation(kind: ModuleFaultKind): string {
  if (kind === 'network') {
    return 'This module’s code could not be fetched from the archive — a connection or transfer fault. The rest of the console is unaffected.'
  }
  return 'This module hit an internal fault and was taken offline. The rest of the console is unaffected.'
}

/** The diagnostics headline distinguishing the two worlds (shown + copied). */
export function moduleFaultKindLine(kind: ModuleFaultKind): string {
  return kind === 'network'
    ? 'MODULE TRANSFER FAILED (network) — the module’s code could not be fetched'
    : 'MODULE FAULT (code) — the module threw while running'
}

export interface ModuleDiagnosticsInput {
  readonly appId: string
  readonly moduleName: string
  readonly fault: ModuleFault
  readonly storage: {
    readonly phase: StoragePhase
    readonly boot: BootOrigin | null
    readonly writes: number
  }
  readonly at: Date
  readonly userAgent: string
}

/** The copyable bug-report block (plain text; one fact per line). */
export function buildModuleDiagnostics(input: ModuleDiagnosticsInput): string {
  const lines = [
    `HOLD/OS ${OS_VERSION} — module fault report`,
    `module: ${input.moduleName} (${input.appId})`,
    moduleFaultKindLine(input.fault.kind),
    `error: ${input.fault.errorName}: ${input.fault.message}`,
  ]
  if (input.fault.stackLine !== null) lines.push(`  at ${input.fault.stackLine}`)
  lines.push(
    `storage: phase=${input.storage.phase} boot=${input.storage.boot ?? '—'} writes=${input.storage.writes}`,
    `time: ${input.at.toISOString()}`,
    `agent: ${input.userAgent}`,
  )
  return lines.join('\n')
}

/** How the last Copy diagnostics attempt landed (drives the card's own state). */
export type CopyOutcome = 'clipboard' | 'fallback' | 'manual'

/**
 * Copy text with a graceful fallback chain: async Clipboard API → the legacy
 * selection+execCommand path → 'manual' (the caller reveals the text for
 * hand-copying). Never throws — a clipboard refusal is UX, not a fault.
 */
export async function copyTextWithFallback(text: string): Promise<CopyOutcome> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'clipboard'
    }
  } catch {
    // fall through to the legacy path
  }
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    const holder = document.createElement('textarea')
    holder.value = text
    holder.setAttribute('readonly', '')
    holder.style.position = 'fixed'
    holder.style.opacity = '0'
    document.body.appendChild(holder)
    holder.select()
    let copied: boolean
    try {
      copied = document.execCommand('copy')
    } catch {
      copied = false
    }
    holder.remove()
    if (copied) return 'fallback'
  }
  return 'manual'
}
