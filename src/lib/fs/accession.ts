/**
 * Accession codes (MF-1) — the catalog numbering on every parchment label.
 *
 * Series (one monotonic counter per prefix):
 *   DRW-####  drawers        (folders)
 *   SPC-####  specimens      (text files)
 *   PLT-####  plates         (image files)
 *   MOD-####  module refs    (app links)
 * The root is outside every series: ARC-0000 (types.ts).
 *
 * Allocation is PURE: `nextAccessionCode` scans the tree and returns
 * max(serial)+1 for the kind's series. No counter state, so codes stay
 * unique and monotonic no matter what order ops run in — and restoring an
 * old snapshot cannot re-issue a live code.
 */

import type { FSNode, FSNodeKind } from './types'

/** Prefix per node kind — the catalog's series vocabulary. */
export const ACCESSION_PREFIXES: Readonly<Record<FSNodeKind, string>> = {
  folder: 'DRW',
  text: 'SPC',
  image: 'PLT',
  'app-link': 'MOD',
}

/** `PREFIX-serial` with the serial zero-padded to at least 4 digits. */
export function formatAccession(prefix: string, serial: number): string {
  return `${prefix}-${String(serial).padStart(4, '0')}`
}

export interface ParsedAccession {
  readonly prefix: string
  readonly serial: number
}

/** Parse `PREFIX-serial`; null when the code is not an accession code at all. */
export function parseAccession(code: string): ParsedAccession | null {
  const match = /^([A-Z]+)-(\d+)$/.exec(code)
  if (!match) return null
  return { prefix: match[1]!, serial: Number.parseInt(match[2]!, 10) }
}

/**
 * Next free code for a kind's series, given the whole node map.
 * Malformed codes (hand-edited data) are ignored by the scan, never crash it.
 */
export function nextAccessionCode(
  nodes: Readonly<Record<string, FSNode>>,
  kind: FSNodeKind,
): string {
  const prefix = ACCESSION_PREFIXES[kind]
  let max = 0
  for (const node of Object.values(nodes)) {
    const parsed = parseAccession(node.accession)
    if (parsed && parsed.prefix === prefix && parsed.serial > max) {
      max = parsed.serial
    }
  }
  return formatAccession(prefix, max + 1)
}

/** Catalog sort: by series prefix, then serial. Unparseable codes sort by raw string. */
export function compareAccessions(a: string, b: string): number {
  const pa = parseAccession(a)
  const pb = parseAccession(b)
  if (pa && pb) {
    if (pa.prefix !== pb.prefix) return pa.prefix < pb.prefix ? -1 : 1
    return pa.serial - pb.serial
  }
  return a < b ? -1 : a > b ? 1 : 0
}
