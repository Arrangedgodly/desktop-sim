import { lazy } from 'react'
import type { AppManifest } from '../../platform/app-registry'
import { DemoIcon } from './DemoIcon'

/**
 * Demo app manifest (IM-3 reference example — the living copy-paste example in
 * docs/APP-CONTRACT.md). `mount` is lazy: the surface ships as its own chunk
 * and the platform mounts it inside a Suspense boundary.
 */
const DemoSurface = lazy(() => import('./DemoSurface'))

export const demoApp: AppManifest = {
  id: 'demo',
  name: 'Demo Module',
  icon: DemoIcon,
  mount: DemoSurface,
  // multi-instance (singleton omitted → false): one window per open/file
  acceptedFileTypes: ['text'],
  defaultGeometry: { w: 420, h: 340 },
}
