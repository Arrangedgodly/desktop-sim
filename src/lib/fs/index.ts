/**
 * FS domain model (MF-1) — the specimen catalog.
 *
 * Platform-independent (no React, no zustand, no DOM): the stores layer
 * (platform/stores/fs-store.ts) holds an FSState and commits pure op results
 * through its single `commit` seam; MF-2 persists the envelope (schema.ts).
 *
 * - types.ts      nodes, kinds, tree/state shapes, world constants
 * - accession.ts  accession-code series + allocation + catalog sort
 * - ops.ts        pure create/rename/move/delete/position + find/list/path
 * - schema.ts     envelope, CURRENT_SCHEMA_VERSION, migrate/validate
 * - seed.ts       the placeholder specimen tree awaiting MF-3
 * - errors.ts     FSError codes thrown by ops + the migration harness
 */

export * from './types'
export * from './errors'
export * from './accession'
export * from './ops'
export * from './schema'
export * from './seed'
