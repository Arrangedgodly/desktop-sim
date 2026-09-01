import { useEffect, useState } from 'react'
import type { ViewportSize } from './geometry'

function measure(): ViewportSize {
  return { w: window.innerWidth, h: window.innerHeight }
}

/**
 * Viewport size with a resize subscription. One instance lives in WindowHost
 * and is passed down as a prop, so a resize re-renders through a single seam
 * (and tests can inject a fixed viewport). IM-4b's clamp-on-commit reuses the
 * same measurement shape.
 */
export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(measure)

  useEffect(() => {
    const onResize = () => setSize(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}
