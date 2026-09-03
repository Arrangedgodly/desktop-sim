/**
 * Type Cabinet manifest (batch 2 federated fleet) — the OS's own SPECIMEN
 * BOOK: three drawers, one per shipped role — Chakra Petch (the label face),
 * Lora (the content face), B612 Mono (the mono face) — each a specimen sheet
 * of waterfall sizes, real shipped weights, the tracking bands, pangrams, and
 * the role notes that cite the design laws in plain words. Nearly zero logic;
 * all craft. Built against the platform contract exactly as the terminal and
 * the painter were (docs/APP-CONTRACT.md; the integrator wires registration).
 *
 * Instance rule: SINGLETON — at most ONE cabinet window ever; every later open
 * (launcher, taskbar) raises + focuses the existing one via the registry's
 * `singleton` instance key. Nothing routes FILES into it (no
 * acceptedFileTypes — a specimen book is opened, never "opened onto"), so its
 * launcher position is free by the same law as the atlas and the console.
 *
 * The mount is LAZY: this module (manifest + icon, a few hundred bytes) rides
 * the eager bundle; the surface ships as its own chunk (the fleet's budget
 * law). The surface holds no store/FS/persistence seams at all — reference
 * material, authored in the pure data module, checked against fonts.css by
 * the colocated no-drift test.
 */

import { retryableLazy } from '../../platform/app-registry/lazy-mount'
import type { AppManifest } from '../../platform/app-registry'
import { TypeCabinetIcon } from './TypeCabinetIcon'

const TypeCabinetSurface = retryableLazy(() => import('./TypeCabinetSurface'))

export const typeCabinetApp: AppManifest = {
  id: 'type-cabinet',
  name: 'Type Cabinet',
  icon: TypeCabinetIcon,
  mount: TypeCabinetSurface,
  singleton: true, // ONE cabinet ever: re-open raises + focuses it
  defaultGeometry: { w: 680, h: 560 },
}
