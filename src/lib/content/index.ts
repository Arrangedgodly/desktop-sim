/**
 * Author content pack (MF-3) — the science officer's manifest.
 *
 * - schema.ts   typed pack shape + validation (pure, untrusted input in)
 * - default.ts  the placeholder pack (marked, zero fabricated facts)
 * - loader.ts   getContent() — the single read seam (embed + fallback)
 *
 * Consumers import from HERE (AP-5 About nameplate, AP-6 Project Browser,
 * UI-7 phone notice card, COM-1 README). lib/fs/seed.ts also reads
 * getContent() to join exhibit specimens to pack project ids.
 */

export * from './schema'
export * from './default'
export * from './loader'
