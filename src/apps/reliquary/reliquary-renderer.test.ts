// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  CAMERA_LIMITS,
  DEFAULT_CAMERA,
  KEY_ORBIT_STEP,
  ORBIT_RATE,
  VitrineRenderer,
  cameraHookValue,
  clampCamera,
  formatCamera,
  orbitCamera,
  parseColor,
  zoomCamera,
} from './reliquary-renderer'
import { facetedCrystal } from './reliquary-geometry'
import type { Vec3 } from './reliquary-math'

/**
 * Reliquary renderer (batch 2, worker 8, acceptance 3 + zoom clamp) — the
 * guarded context seam and the pure camera law. jsdom ships no WebGL
 * (`getContext('webgl')` is null), so the absent-context path is exercised
 * FOR REAL here; a hostile GL stub covers the throwing-context path.
 */

describe('reliquary · pure camera law (the stops)', () => {
  it('clamps pitch and distance but never wraps yaw', () => {
    const clamped = clampCamera({ yaw: 99, pitch: 5, distance: 0.1 })
    expect(clamped.pitch).toBe(CAMERA_LIMITS.maxPitch)
    expect(clamped.distance).toBe(CAMERA_LIMITS.minDistance)
    expect(clamped.yaw).toBe(99)
    const floored = clampCamera({ yaw: -1, pitch: -5, distance: 100 })
    expect(floored.pitch).toBe(CAMERA_LIMITS.minPitch)
    expect(floored.distance).toBe(CAMERA_LIMITS.maxDistance)
  })

  it('recovers a non-finite yaw to the default (hostile input, no NaN escapes)', () => {
    const recovered = clampCamera({ yaw: Number.NaN, pitch: 0, distance: 3 })
    expect(Number.isFinite(recovered.yaw)).toBe(true)
    expect(recovered.yaw).toBe(DEFAULT_CAMERA.yaw)
  })

  it('orbits by pixels at the authored rate and clamps through the same stop', () => {
    const oneHundredPixelsRight = orbitCamera(DEFAULT_CAMERA, 100, 0)
    expect(oneHundredPixelsRight.yaw).toBeCloseTo(DEFAULT_CAMERA.yaw + 100 * ORBIT_RATE)
    expect(orbitCamera(DEFAULT_CAMERA, 0, 1e6).pitch).toBe(CAMERA_LIMITS.maxPitch)
  })

  it('zooms geometrically and cannot leave the case', () => {
    const oneNotch = zoomCamera(DEFAULT_CAMERA, 1)
    expect(oneNotch.distance).toBeCloseTo(DEFAULT_CAMERA.distance * 1.09)
    const far = zoomCamera(DEFAULT_CAMERA, 1000)
    expect(far.distance).toBe(CAMERA_LIMITS.maxDistance)
    const close = zoomCamera(DEFAULT_CAMERA, -1000)
    expect(close.distance).toBe(CAMERA_LIMITS.minDistance)
  })

  it('pins the interaction constants the surface rides', () => {
    expect(ORBIT_RATE).toBeGreaterThan(0)
    expect(KEY_ORBIT_STEP).toBeGreaterThan(0)
    expect(DEFAULT_CAMERA.distance).toBeGreaterThanOrEqual(CAMERA_LIMITS.minDistance)
    expect(DEFAULT_CAMERA.distance).toBeLessThanOrEqual(CAMERA_LIMITS.maxDistance)
  })
})

describe('reliquary · readout formatting (the e2e hook\'s shape)', () => {
  it('formats the instrument line — B612 digits, zero-padded sectors', () => {
    // yaw 0.62 rad = 35.496°; pitch 0.34 rad = 19.483°
    expect(formatCamera(DEFAULT_CAMERA)).toBe('AZ 035.5 EL +19.5 R 2.90')
  })

  it('wraps azimuth into [0, 360) and signs elevation', () => {
    const wrapped = formatCamera({ yaw: -0.1, pitch: -0.1, distance: 4.2 })
    expect(wrapped).toMatch(/^AZ 354\.\d EL -05\.\d R 4\.20$/)
  })

  it('serializes the machine hook the e2e asserts on', () => {
    expect(cameraHookValue({ yaw: 0, pitch: 0, distance: 2 })).toBe('az:0.0;el:0.0;r:2.00')
    expect(cameraHookValue(DEFAULT_CAMERA)).toMatch(/^az:35\.5;el:19\.5;r:2\.90$/)
  })
})

describe('reliquary · color parsing (tokens → tube ink)', () => {
  it('parses 6-digit hex, 3-digit hex, and rgb() strings', () => {
    expect(parseColor('#ffb340')).toEqual<Vec3>([1, 179 / 255, 64 / 255])
    expect(parseColor('#abc')).toEqual<Vec3>([170 / 255, 187 / 255, 204 / 255])
    expect(parseColor('rgb(18, 13, 7)')).toEqual<Vec3>([18 / 255, 13 / 255, 7 / 255])
    expect(parseColor('rgba(255, 210, 138, 0.5)')).toEqual<Vec3>([1, 210 / 255, 138 / 255])
  })

  it('refuses foreign input with null (never a throw, never a guessed color)', () => {
    expect(parseColor('amber')).toBeNull()
    expect(parseColor('')).toBeNull()
    expect(parseColor('#ff')).toBeNull()
  })
})

describe('reliquary · guarded context creation (acceptance 3)', () => {
  it('returns null when WebGL is ABSENT — jsdom\'s honest answer', () => {
    const canvas = document.createElement('canvas')
    expect(canvas.getContext('webgl')).toBeNull() // the premise, proven
    expect(VitrineRenderer.create(canvas, { ground: [0, 0, 0], tone: [1, 1, 1], bright: [1, 1, 1] }, DEFAULT_CAMERA)).toBeNull()
  })

  it('returns null when context creation THROWS (a hostile GL stub)', () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockImplementation(() => {
      throw new Error('context lost at birth')
    })
    expect(VitrineRenderer.create(canvas, { ground: [0, 0, 0], tone: [1, 1, 1], bright: [1, 1, 1] }, DEFAULT_CAMERA)).toBeNull()
  })

  it('returns null when the GL stub cannot compile shaders', () => {
    const canvas = document.createElement('canvas')
    const hostileGl = {
      createShader: () => null, // the stub's whole vocabulary: nothing works
    }
    vi.spyOn(canvas, 'getContext').mockReturnValue(hostileGl as unknown as WebGLRenderingContext)
    expect(VitrineRenderer.create(canvas, { ground: [0, 0, 0], tone: [1, 1, 1], bright: [1, 1, 1] }, DEFAULT_CAMERA)).toBeNull()
  })

  it('never touches the host beyond getContext on the failure path', () => {
    const canvas = document.createElement('canvas')
    const getContext = vi.spyOn(canvas, 'getContext')
    VitrineRenderer.create(canvas, { ground: [0, 0, 0], tone: [1, 1, 1], bright: [1, 1, 1] }, DEFAULT_CAMERA, {
      onFrame: () => {
        throw new Error('no frame may ever draw from a dead tube')
      },
    })
    expect(getContext).toHaveBeenCalled()
  })
})

describe('reliquary · the draw gate (a recording GL stub + a manual frame clock)', () => {
  /** A minimal honest GL: every call the vitrine makes, recorded. */
  function fakeGl(recorder: string[]): WebGLRenderingContext {
    const constants = {
      ARRAY_BUFFER: 1, ELEMENT_ARRAY_BUFFER: 2, STATIC_DRAW: 3, FLOAT: 4,
      TRIANGLES: 5, UNSIGNED_SHORT: 6, VERTEX_SHADER: 7, FRAGMENT_SHADER: 8,
      COMPILE_STATUS: 9, LINK_STATUS: 10, DEPTH_TEST: 11, CULL_FACE: 12,
      COLOR_BUFFER_BIT: 13, DEPTH_BUFFER_BIT: 14,
    } as const
    return {
      ...constants,
      createShader: () => ({}),
      shaderSource: () => {},
      compileShader: () => {},
      getShaderParameter: () => true,
      createProgram: () => ({}),
      attachShader: () => {},
      linkProgram: () => {},
      getProgramParameter: () => true,
      deleteShader: () => {},
      getAttribLocation: () => 0,
      getUniformLocation: () => ({}),
      enable: () => {},
      disable: () => {},
      clearColor: () => {},
      createBuffer: () => ({}),
      bindBuffer: () => {},
      bufferData: () => {},
      deleteBuffer: () => {},
      useProgram: () => {},
      enableVertexAttribArray: () => {},
      vertexAttribPointer: () => {},
      uniformMatrix4fv: () => {},
      uniform3f: () => {},
      viewport: () => {},
      clear: () => {},
      deleteProgram: () => {},
      getExtension: () => null,
      drawElements: () => recorder.push('draw'),
    } as unknown as WebGLRenderingContext
  }

  /** Deterministic frame clock: collect callbacks, flush them by hand. */
  function manualRaf(): { flush: () => void; cancel: (id: number) => void } {
    const queue = new Map<number, () => void>()
    let nextId = 1
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      const id = nextId++
      queue.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      queue.delete(id)
    })
    return {
      flush: () => {
        const pending = [...queue.values()]
        queue.clear()
        for (const callback of pending) callback()
      },
      cancel: () => queue.clear(),
    }
  }

  it('builds against a working GL stub, draws once per flush, dedupes requests', async () => {
    const draws: string[] = []
    const gl = fakeGl(draws)
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(gl)
    const frames: number[] = []
    const renderer = VitrineRenderer.create(
      canvas,
      { ground: [0.07, 0.05, 0.03], tone: [1, 0.7, 0.25], bright: [1, 0.82, 0.54] },
      DEFAULT_CAMERA,
      { onFrame: (camera) => frames.push(camera.distance) },
    )
    expect(renderer).not.toBeNull()
    const raf = manualRaf()
    try {
      renderer!.setSpecimen(facetedCrystal(), 0.4, 0.1) // seats + requests one draw
      raf.flush()
      expect(draws).toHaveLength(1)
      expect(frames).toEqual([DEFAULT_CAMERA.distance]) // the hook rode the frame

      renderer!.requestDraw()
      renderer!.requestDraw()
      renderer!.requestDraw() // three asks, one frame — the dedupe gate
      raf.flush()
      expect(draws).toHaveLength(2)

      raf.flush() // nothing pending → nothing draws
      expect(draws).toHaveLength(2)
    } finally {
      renderer?.dispose() // while the stubbed frame clock still exists
      vi.unstubAllGlobals()
    }
  })

  it('cannot schedule a frame after dispose (the surface unmount path)', () => {
    const draws: string[] = []
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeGl(draws))
    const renderer = VitrineRenderer.create(
      canvas,
      { ground: [0, 0, 0], tone: [1, 1, 1], bright: [1, 1, 1] },
      DEFAULT_CAMERA,
    )
    expect(renderer).not.toBeNull()
    const raf = manualRaf()
    try {
      renderer!.setSpecimen(facetedCrystal(), 0, 0)
      raf.flush()
      expect(draws).toHaveLength(1)

      renderer!.dispose()
      renderer!.requestDraw()
      raf.flush()
      expect(draws).toHaveLength(1) // the gate stayed shut past the grave
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('clamps every camera the surface hands it (setCamera is a stop, not a hint)', () => {
    const draws: string[] = []
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeGl(draws))
    const frames: number[] = []
    const renderer = VitrineRenderer.create(
      canvas,
      { ground: [0, 0, 0], tone: [1, 1, 1], bright: [1, 1, 1] },
      DEFAULT_CAMERA,
      { onFrame: (camera) => frames.push(camera.distance) },
    )
    const raf = manualRaf()
    try {
      renderer!.setCamera({ yaw: 0, pitch: 99, distance: 0 })
      renderer!.setSpecimen(facetedCrystal(), 0, 0)
      raf.flush()
      expect(frames).toEqual([CAMERA_LIMITS.minDistance])
      expect(renderer!.getCamera().pitch).toBe(CAMERA_LIMITS.maxPitch)
    } finally {
      renderer?.dispose() // while the stubbed frame clock still exists
      vi.unstubAllGlobals()
    }
  })

  it('keeps the specimen mesh contract the renderer uploads', () => {
    const crystal = facetedCrystal()
    expect(crystal.positions).toBeInstanceOf(Float32Array)
    expect(crystal.indices).toBeInstanceOf(Uint16Array)
  })
})
