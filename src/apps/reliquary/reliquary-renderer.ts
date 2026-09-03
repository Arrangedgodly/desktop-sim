/**
 * Reliquary renderer (batch 2, worker 8) — ONE WebGL vitrine, zero
 * dependencies: hand-rolled shaders, hand-rolled mat4 pipeline (reliquary-
 * math), one draw path. Context creation is GUARDED — `create` returns null
 * for a missing context AND for any compile/link/upload failure, and the
 * surface answers null with the engraved-plate degrade (the honest
 * fallback, never a broken canvas).
 *
 * Draw discipline (the fleet's gesture law): NO continuous loop — draws are
 * INVALIDATION-driven. `requestDraw` schedules at most one animation frame
 * (deduped by a pending flag); pointer moves mutate the camera ref and
 * invalidate, so the GPU touches nothing while the case sits still, and a
 * hidden tab stops drawing entirely (rAF parks). The same single path serves
 * orbit drags, wheel/slider zoom, arrow-key orbit, and specimen swaps.
 *
 * Camera law: pitch and distance are CLAMPED (the vitrine's stops) — the
 * pure {@link clampCamera} is exported and unit-tested; every mutation
 * funnels through it, so no input path can exceed the stops.
 */

import type { Geometry } from './reliquary-geometry'
import {
  frameMatrix,
  invertRigid,
  mat4Identity,
  mat4Multiply,
  mat4Perspective,
  mat4RotateX,
  mat4RotateY,
  orbitView,
  transformPoint,
  type Mat4,
  type Vec3,
} from './reliquary-math'

/* ------------------------------- camera ---------------------------------- */

/** The vitrine's camera: yaw/pitch orbit about the origin + clamped stand-off distance. */
export interface CameraState {
  readonly yaw: number
  readonly pitch: number
  readonly distance: number
}

/** The machined stops — picket pins, not suggestions (clamped on every path). */
export const CAMERA_LIMITS = {
  minPitch: -1.25,
  maxPitch: 1.25,
  minDistance: 1.7,
  maxDistance: 4.2,
} as const

/** Where every fresh case starts: three-quarter yaw, reading from just above. */
export const DEFAULT_CAMERA: CameraState = { yaw: 0.62, pitch: 0.34, distance: 2.9 }

/** Clamp a camera to the vitrine's stops (pure — the tests' whole subject). */
export function clampCamera(camera: CameraState): CameraState {
  const pitch = Math.min(CAMERA_LIMITS.maxPitch, Math.max(CAMERA_LIMITS.minPitch, camera.pitch))
  const distance = Math.min(CAMERA_LIMITS.maxDistance, Math.max(CAMERA_LIMITS.minDistance, camera.distance))
  // yaw is unbounded (the post spins freely) but kept finite.
  const yaw = Number.isFinite(camera.yaw) ? camera.yaw : DEFAULT_CAMERA.yaw
  return { yaw, pitch, distance }
}

/** Radians of orbit per pixel of drag (authored feel — one full drag width ≈ a half turn). */
export const ORBIT_RATE = 0.008

/** Radians per arrow-key press. */
export const KEY_ORBIT_STEP = 0.12

/** Multiplicative zoom per wheel notch / zoom-key press. */
export const ZOOM_FACTOR = 1.09

/** Orbit by pixel deltas (drag or key), then clamp. Pure. */
export function orbitCamera(camera: CameraState, dxPixels: number, dyPixels: number): CameraState {
  return clampCamera({
    yaw: camera.yaw + dxPixels * ORBIT_RATE,
    pitch: camera.pitch + dyPixels * ORBIT_RATE,
    distance: camera.distance,
  })
}

/** Zoom by notches (positive = out), then clamp. Pure. */
export function zoomCamera(camera: CameraState, notches: number): CameraState {
  return clampCamera({
    yaw: camera.yaw,
    pitch: camera.pitch,
    distance: camera.distance * Math.pow(ZOOM_FACTOR, notches),
  })
}

/* ------------------------------- readouts -------------------------------- */

/** Wrap an angle to [0, 360) degrees. */
function deg360(rad: number): number {
  const deg = (rad * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

/** The instrument readout line — B612 digits, azimuth/elevation/range (pure). */
export function formatCamera(camera: CameraState): string {
  const az = deg360(camera.yaw)
  const el = (camera.pitch * 180) / Math.PI
  return `AZ ${az.toFixed(1).padStart(5, '0')} EL ${el >= 0 ? '+' : '-'}${Math.abs(el).toFixed(1).padStart(4, '0')} R ${camera.distance.toFixed(2)}`
}

/** The machine-readable camera hook (e2e asserts on this — see the session log). */
export function cameraHookValue(camera: CameraState): string {
  return `az:${deg360(camera.yaw).toFixed(1)};el:${((camera.pitch * 180) / Math.PI).toFixed(1)};r:${camera.distance.toFixed(2)}`
}

/* -------------------------------- colors --------------------------------- */

/** Parse a CSS color (`#rrggbb`, `#rgb`, `rgb()`/`rgba()`) into linear-ish 0..1 rgb. Pure. */
export function parseColor(css: string): Vec3 | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim())
  if (hex) {
    const value = Number.parseInt(hex[1]!, 16)
    return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255]
  }
  const short = /^#([0-9a-f]{3})$/i.exec(css.trim())
  if (short) {
    const digits = short[1]!
    return [
      Number.parseInt(digits[0]! + digits[0]!, 16) / 255,
      Number.parseInt(digits[1]! + digits[1]!, 16) / 255,
      Number.parseInt(digits[2]! + digits[2]!, 16) / 255,
    ]
  }
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(css.trim())
  if (rgb) {
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]
  }
  return null
}

/** The vitrine's resolved ink: clear ground, specimen tone, specular catch (all from tokens upstream). */
export interface VitrineInk {
  readonly ground: Vec3
  readonly tone: Vec3
  readonly bright: Vec3
}

/* -------------------------------- shaders -------------------------------- */

const VERTEX_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  mat3 rot = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz);
  vNormal = rot * aNormal;
  vWorld = (uModel * vec4(aPosition, 1.0)).xyz;
  gl_Position = uMVP * vec4(aPosition, 1.0);
}
`

/**
 * Monochrome-amber lighting, authored: a warm key from above-left, a dim
 * fill from below-right, ambient floor, and one specular catch in the hot
 * tone. The tone is SCALED by light, never re-hued — the well's amber
 * discipline applies inside the tube too.
 */
const FRAGMENT_SOURCE = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uTone;
uniform vec3 uBright;
void main() {
  vec3 n = normalize(vNormal);
  vec3 keyDir = normalize(vec3(-0.45, 0.8, 0.55));
  vec3 fillDir = normalize(vec3(0.6, -0.25, 0.4));
  float key = max(dot(n, keyDir), 0.0);
  float fill = max(dot(n, fillDir), 0.0);
  vec3 color = uTone * (0.22 + key * 0.85 + fill * 0.18);
  vec3 viewDir = normalize(uEye - vWorld);
  float spec = pow(max(dot(n, normalize(keyDir + viewDir)), 0.0), 24.0);
  color += uBright * spec * 0.5;
  gl_FragColor = vec4(color, 1.0);
}
`

/* ------------------------------- renderer -------------------------------- */

export interface RendererHooks {
  /** Called after every successfully drawn frame with the camera that drew. */
  readonly onFrame?: (camera: CameraState) => void
  /** Called once if the canvas resizes between draws (the surface keeps its layout honest). */
}

/**
 * The vitrine. Construct through {@link VitrineRenderer.create} — never
 * directly; `create` is the guarded seam that returns null for ANY failure
 * (no context, shader fault, buffer fault), which the surface renders as
 * the engraved plate.
 */
export class VitrineRenderer {
  private camera: CameraState
  private readonly ink: VitrineInk
  private tone: Vec3
  private readonly hooks: RendererHooks
  private readonly gl: WebGLRenderingContext
  private readonly canvas: HTMLCanvasElement
  private program: WebGLProgram | null = null
  private buffers: { position: WebGLBuffer; normal: WebGLBuffer; index: WebGLBuffer; count: number } | null = null
  private uniforms: {
    mvp: WebGLUniformLocation | null
    model: WebGLUniformLocation | null
    eye: WebGLUniformLocation | null
    tone: WebGLUniformLocation | null
    bright: WebGLUniformLocation | null
  } = { mvp: null, model: null, eye: null, tone: null, bright: null }
  private attributes: { position: number; normal: number } = { position: -1, normal: -1 }
  private model: Mat4 = mat4Identity()
  private rafId = 0
  private rafPending = false
  private disposed = false
  private readonly resizeObserver: ResizeObserver | null

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    ink: VitrineInk,
    camera: CameraState,
    hooks: RendererHooks,
    program: WebGLProgram,
    uniforms: VitrineRenderer['uniforms'],
    attributes: VitrineRenderer['attributes'],
  ) {
    this.canvas = canvas
    this.gl = gl
    this.ink = ink
    this.tone = ink.tone
    this.camera = clampCamera(camera)
    this.hooks = hooks
    this.program = program
    this.uniforms = uniforms
    this.attributes = attributes
    this.resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.requestDraw()) : null
    this.resizeObserver?.observe(canvas)
  }

  /**
   * Build the vitrine or return null (guarded — every GL step is inside the
   * try). `ink` and the specimen's `baseYaw`/`basePitch` set the resting
   * frame; the first draw is scheduled by the surface once it has geometry.
   */
  static create(
    canvas: HTMLCanvasElement,
    ink: VitrineInk,
    camera: CameraState,
    hooks: RendererHooks = {},
  ): VitrineRenderer | null {
    let gl: WebGLRenderingContext | null = null
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: false }) as WebGLRenderingContext | null
      if (!gl) return null

      const compile = (kind: number, source: string): WebGLShader | null => {
        const shader = gl!.createShader(kind)
        if (!shader) return null
        gl!.shaderSource(shader, source)
        gl!.compileShader(shader)
        if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) return null
        return shader
      }
      const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE)
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)
      if (!vertex || !fragment) return null

      const program = gl.createProgram()
      if (!program) return null
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)

      const attributes = {
        position: gl.getAttribLocation(program, 'aPosition'),
        normal: gl.getAttribLocation(program, 'aNormal'),
      }
      if (attributes.position < 0 || attributes.normal < 0) return null
      const uniforms = {
        mvp: gl.getUniformLocation(program, 'uMVP'),
        model: gl.getUniformLocation(program, 'uModel'),
        eye: gl.getUniformLocation(program, 'uEye'),
        tone: gl.getUniformLocation(program, 'uTone'),
        bright: gl.getUniformLocation(program, 'uBright'),
      }

      gl.enable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE) // the shell's mouth is open — its inner wall must show
      gl.clearColor(ink.ground[0], ink.ground[1], ink.ground[2], 1)

      return new VitrineRenderer(canvas, gl, ink, camera, hooks, program, uniforms, attributes)
    } catch {
      return null // a guarded fault is a degrade, never a crash
    }
  }

  /** Set the camera (clamped) and schedule a draw. */
  setCamera(camera: CameraState): void {
    this.camera = clampCamera(camera)
    this.requestDraw()
  }

  getCamera(): CameraState {
    return this.camera
  }

  /** Light a different specimen tone (brightness distinguishes specimens in the well). */
  setTone(tone: Vec3): void {
    this.tone = tone
    this.requestDraw()
  }

  /**
   * Seat a specimen: upload its buffers (replacing any prior specimen's) and
   * set its resting orientation. The old buffers are deleted — the case
   * holds one specimen at a time.
   */
  setSpecimen(geometry: Geometry, baseYaw: number, basePitch: number): void {
    const gl = this.gl
    this.releaseBuffers()
    try {
      const position = gl.createBuffer()
      const normal = gl.createBuffer()
      const index = gl.createBuffer()
      if (!position || !normal || !index) return
      gl.bindBuffer(gl.ARRAY_BUFFER, position)
      gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, normal)
      gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW)
      this.buffers = { position, normal, index, count: geometry.indices.length }
      this.model = mat4Multiply(mat4RotateX(basePitch), mat4RotateY(baseYaw))
      this.requestDraw()
    } catch {
      this.releaseBuffers() // a fault mid-seating leaves the case empty, not broken
    }
  }

  /** Schedule ONE frame if none is pending (the single draw path's gate). */
  requestDraw(): void {
    if (this.disposed || this.rafPending) return
    this.rafPending = true
    this.rafId = requestAnimationFrame(() => {
      this.rafPending = false
      if (!this.disposed) this.draw()
    })
  }

  /** The one draw: resize if the canvas moved, clear the well, light the specimen. */
  private draw(): void {
    const gl = this.gl
    const buffers = this.buffers
    if (!buffers || !this.program) return
    try {
      // dpr-true backing store, checked per frame (cheap, always right).
      const dpr = this.canvas.ownerDocument?.defaultView?.devicePixelRatio ?? 1
      const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width
        this.canvas.height = height
      }
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      const aspect = this.canvas.width / Math.max(1, this.canvas.height)
      const view = orbitView(this.camera.yaw, this.camera.pitch, this.camera.distance)
      const mvp = frameMatrix(
        /* projection */ perspectiveFieldOfView(aspect),
        view,
        this.model,
      )
      gl.useProgram(this.program)

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position)
      gl.enableVertexAttribArray(this.attributes.position)
      gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal)
      gl.enableVertexAttribArray(this.attributes.normal)
      gl.vertexAttribPointer(this.attributes.normal, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index)

      gl.uniformMatrix4fv(this.uniforms.mvp, false, new Float32Array(mvp))
      gl.uniformMatrix4fv(this.uniforms.model, false, new Float32Array(this.model))
      const eye = transformPoint(invertRigid(view), [0, 0, 0, 1])
      gl.uniform3f(this.uniforms.eye, eye[0], eye[1], eye[2])
      gl.uniform3f(this.uniforms.tone, this.tone[0], this.tone[1], this.tone[2])
      gl.uniform3f(this.uniforms.bright, this.ink.bright[0], this.ink.bright[1], this.ink.bright[2])

      gl.drawElements(gl.TRIANGLES, buffers.count, gl.UNSIGNED_SHORT, 0)
      this.hooks.onFrame?.(this.camera)
    } catch {
      // A fault mid-frame parks the case; the surface's degrade is the answer.
    }
  }

  /** Delete the seated specimen's buffers (idempotent). */
  private releaseBuffers(): void {
    if (!this.buffers) return
    try {
      this.gl.deleteBuffer(this.buffers.position)
      this.gl.deleteBuffer(this.buffers.normal)
      this.gl.deleteBuffer(this.buffers.index)
    } catch {
      // deletion faults are uninteresting — the context is going away
    }
    this.buffers = null
  }

  /**
   * Tear the vitrine down: cancel the frame, delete GL objects, release the
   * context's own resources. The context itself is NOT forced lost: a
   * `WEBGL_lose_context.loseContext()` kills the CANVAS's context permanently,
   * and React 19 dev StrictMode remounts the surface on the same canvas —
   * the remount's `create` would then read a dead context and degrade to the
   * engraved plate even on consoles with a live tube. The context dies with
   * the canvas when React truly unmounts the window (the element is dropped);
   * deleting this renderer's program/buffers is the honest teardown here.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.rafId !== 0) cancelAnimationFrame(this.rafId)
    this.rafPending = false
    this.resizeObserver?.disconnect()
    this.releaseBuffers()
    try {
      if (this.program) this.gl.deleteProgram(this.program)
    } catch {
      // context already gone — nothing to lose
    }
    this.program = null
  }
}

/** The vitrine's lens stops — a 42° vertical field over a case 0.1–12 units deep. */
export const FIELD_OF_VIEW = (42 * Math.PI) / 180
export const NEAR_PLANE = 0.1
export const FAR_PLANE = 12

/** The vitrine's projection for the current aspect (the draw's lens). */
function perspectiveFieldOfView(aspect: number): Mat4 {
  return mat4Perspective(FIELD_OF_VIEW, aspect, NEAR_PLANE, FAR_PLANE)
}
