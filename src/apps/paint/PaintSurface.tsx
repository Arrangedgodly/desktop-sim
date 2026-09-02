/**
 * Paint surface (federated session 2) — the PLATE PAINTER, mounted lazy in
 * its own chunk. The design brief's duality, drawing side: console chrome
 * outside (two engraved toolbars — identity + studio), the PARCHMENT PLATE
 * inside. One window PER PLATE (the registry's file-instance dedupe; a
 * launcher open is a fresh UNTITLED plate — the notepad's draft shape).
 *
 *   ┌ identity row (console chrome) ──────────────────────────────────────┐
 *   │ UNTITLED PLATE   [UNFILED] ●lamp        OPEN · EXPORT · SAVE       │
 *   ├ studio row (console chrome) ───────────────────────────────────────┤
 *   │ BRUSH ERASER FILL  − 08 +  ▓▓▓▓▓▓▓▓ MIX  UNDO  CLEAR               │
 *   └ content (the parchment plate — the tab/click focus seat) ───────────┘
 *
 * - The plate is ONE fixed 960×600 canvas (STORAGE HONESTY — data URIs ride
 *   the IndexedDB envelope), devicePixelRatio-aware, displayed aspect-fit;
 *   pointer math normalizes through the CSS rect (paint-canvas.mapToPlate).
 * - Pointer discipline (the committed repo pattern): Pointer Events +
 *   setPointerCapture, rAF-batched segments, touch-action none, NO store
 *   writes while drawing — the FS is touched only on SAVE (the model's
 *   savePlate orchestrator through the store's single atomic seam); the
 *   dirty mirror rides the window record debounced.
 * - First save offers the name INLINE (the notepad's label-edit-as-save);
 *   Enter accessions the plate AND REBINDS the window onto it (HU-2); an
 *   FSError refusal shakes in-world and keeps editing.
 * - The picker lists the catalog's plates (accession + name) and routes
 *   through openApp('paint', {source:'file'}) — the registry dedupes to one
 *   painter window per plate; this window is never hijacked.
 * - Dirty guard (✕ / unclaimed Esc): the in-world strip (Keep editing /
 *   Discard — oxide), the notepad's exact pattern; a dirty plate's PNG
 *   survives reload via the window's appState mirror.
 * - PLATE REMOVED notice when the bound specimen is decommissioned
 *   elsewhere; the title follows live renames (setWindowTitle).
 * - Export: canvas.toBlob → object URL → anchor download → revoke. Local
 *   by construction, CSP-clean.
 */

import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { playCue } from '../../lib/audio'
import { useFSStore, useWMStore } from '../../platform/stores'
import {
  fileInstanceKey,
  getApp,
  openApp,
  type AppSurfaceProps,
  type FileLaunch,
} from '../../platform/app-registry'
import {
  BRUSH_SIZES,
  DEFAULT_BRUSH_SIZE,
  DEFAULT_PIGMENT,
  DEFAULT_SWATCH_ID,
  GROUND_TOKEN,
  PAINT_MIRROR_DELAY_MS,
  PALETTE,
  PLATE_HEIGHT,
  PLATE_WIDTH,
  UNDO_CAP,
  UNFILED_ACCESSION,
  UNTITLED_PLATE_LABEL,
  imageSpecimen,
  listPlates,
  plateId,
  pushSnapshot,
  readPlateMirror,
  registerCloseGuard,
  savePlate,
  stepSize,
  type BrushSize,
  type ImagePlateRef,
  type PaintTool,
  type Pigment,
} from './paint-model'
import { floodFill, mapToPlate, parseHex, strokeStyleFor, toolPaint } from './paint-canvas'
import { PaintIcon } from './PaintIcon'
import './paint.css'

/** How long a rejected label shakes (the fleet's law: 320ms animation). */
const NAME_REJECT_ATTR_MS = 400

const TOOL_LABELS: Readonly<Record<PaintTool, string>> = {
  brush: 'Brush',
  eraser: 'Eraser',
  fill: 'Fill',
}

/** The mixer's resting value if a token ever fails to resolve (paranoia). */
const customFallback = '#33291c'

/** Resolve one design token to its concrete value (ALL ink from tokens). */
function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export default function PaintSurface({ windowId, launch }: AppSurfaceProps) {
  const fs = useFSStore((s) => s.fs)

  /* ------------------------------ binding -------------------------------- */

  const launchFileId = plateId(launch)
  /** The plate this window CREATED (an untitled plate's first save). */
  const [createdId, setCreatedId] = useState<string | null>(null)
  const boundId = launchFileId ?? createdId
  const plate = imageSpecimen(fs, boundId)
  const displayName = plate?.name ?? UNTITLED_PLATE_LABEL
  const untitled = boundId === null

  /* ------------------------------ studio state ---------------------------- */

  const [tool, setTool] = useState<PaintTool>('brush')
  const [size, setSize] = useState<BrushSize>(DEFAULT_BRUSH_SIZE)
  const [pigment, setPigment] = useState<Pigment>(DEFAULT_PIGMENT)
  const [customHex, setCustomHex] = useState('#33291c') // resolved default ink
  const [dirty, setDirty] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  /** Bumped per completed edit (stroke/fill/clear/undo) — re-arms mirrors. */
  const [editEpoch, setEditEpoch] = useState(0)
  const [clearArmed, setClearArmed] = useState(false)

  /* --------------------------- editor chrome ------------------------------ */

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameRejected, setNameRejected] = useState(false)
  const [guardOpen, setGuardOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  /* ------------------------------ canvas engine --------------------------- */

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  /** The PNG as of the last save/open — the dirty comparison's baseline. */
  const savedPngRef = useRef<string | null>(null)
  /** The undo ring (PNG snapshots of the BEFORE states). */
  const undoStackRef = useRef<readonly string[]>([])
  /** Stroke plumbing: the last drawn point + the rAF-batched latest point. */
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const latestPointRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)
  /** Resolved token pigments (swatch id → color) + the ground. */
  const colorsRef = useRef<{ ground: string; bySwatch: Record<string, string> }>({
    ground: '#ece2c9',
    bySwatch: {},
  })
  const [bayFailed, setBayFailed] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const keepButtonRef = useRef<HTMLButtonElement | null>(null)
  const pickerRowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const nameCancelledRef = useRef(false)
  const mirrorWrittenRef = useRef(false)

  const closeWindow = (): void => {
    useWMStore.getState().closeWindow(windowId)
  }

  /** The pigment a stroke paints with, resolved from tokens at mount. */
  const currentColor = (): string => {
    if (pigment.kind === 'custom') return pigment.value
    return colorsRef.current.bySwatch[pigment.id] ?? colorsRef.current.ground
  }

  /** Encode the capped plate as a PNG data URI (STORAGE HONESTY: 960×600). */
  const encodePlate = (): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.toDataURL('image/png')
  }

  /** Draw a PNG (mirror, committed src, or undo snapshot) onto the plate. */
  const loadPngToPlate = (png: string): Promise<boolean> =>
    new Promise((resolve) => {
      const image = new Image()
      image.onload = () => {
        const ctx = ctxRef.current
        if (!ctx) return resolve(false)
        ctx.fillStyle = colorsRef.current.ground
        ctx.fillRect(0, 0, PLATE_WIDTH, PLATE_HEIGHT)
        ctx.drawImage(image, 0, 0, PLATE_WIDTH, PLATE_HEIGHT)
        resolve(true)
      }
      image.onerror = () => resolve(false) // hostile src: keep the blank plate
      image.src = png
    })

  /** Mark one edit complete: dirty verdict, mirror re-arm, undo state. */
  const finishEdit = (): void => {
    const png = encodePlate()
    setDirty(png !== null && png !== savedPngRef.current)
    setCanUndo(undoStackRef.current.length > 0)
    setEditEpoch((epoch) => epoch + 1)
  }

  /* ------------------------------ mount ----------------------------------- */

  // Build the plate ONCE: resolve tokens, scale the backing store by dpr,
  // prime the parchment ground, then seat the restored content — the dirty
  // mirror first (it only ever exists while dirty, so it IS the newer
  // truth), else the bound plate's committed src, else the blank ground.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setBayFailed(true) // honest in-world notice; the OS keeps running
      return
    }
    const dpr = window.devicePixelRatio || 1
    canvas.width = PLATE_WIDTH * dpr
    canvas.height = PLATE_HEIGHT * dpr
    ctx.scale(dpr, dpr)
    ctxRef.current = ctx

    const bySwatch: Record<string, string> = {}
    for (const swatch of PALETTE) bySwatch[swatch.id] = tokenValue(swatch.token)
    const ground = tokenValue(GROUND_TOKEN)
    colorsRef.current = { ground, bySwatch }
    setCustomHex(bySwatch[DEFAULT_SWATCH_ID] ?? bySwatch.ink ?? customFallback)

    ctx.fillStyle = ground
    ctx.fillRect(0, 0, PLATE_WIDTH, PLATE_HEIGHT)

    const mirror = readPlateMirror(useWMStore.getState().windows[windowId]?.appState)
    const src = plate?.src ?? null
    const boot = async (): Promise<void> => {
      if (mirror !== null) {
        // The mirror only ever exists while dirty — it IS the newer truth.
        await loadPngToPlate(mirror)
        const png = encodePlate()
        const committed = await committedBaseline(src)
        savedPngRef.current = committed
        setDirty(png !== committed)
        mirrorWrittenRef.current = true
      } else if (src !== null) {
        await loadPngToPlate(src)
        savedPngRef.current = await committedBaseline(src)
        setDirty(false)
      } else {
        savedPngRef.current = encodePlate()
      }
      setCanUndo(false)
    }
    void boot()
    canvasRef.current?.focus()
    // plate/src are read once at boot, deliberately not reactive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId])

  /** The committed baseline as THIS console encodes it (SVG plates re-encode). */
  const committedBaseline = async (src: string | null): Promise<string | null> => {
    if (src === null) return null
    if (src.startsWith('data:image/png')) return src
    // A seeded SVG plate (or foreign URL): the baseline is what the plate
    // encodes to right now — re-encoded through a scratch canvas.
    const scratch = document.createElement('canvas')
    const dpr = 1 // baselines compare encodes, not device pixels
    scratch.width = PLATE_WIDTH * dpr
    scratch.height = PLATE_HEIGHT * dpr
    const ctx = scratch.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = colorsRef.current.ground
    ctx.fillRect(0, 0, PLATE_WIDTH, PLATE_HEIGHT)
    await new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => {
        ctx.drawImage(image, 0, 0, PLATE_WIDTH, PLATE_HEIGHT)
        resolve()
      }
      image.onerror = () => resolve()
      image.src = src
    })
    return scratch.toDataURL('image/png')
  }

  /* ------------------------------ drawing --------------------------------- */

  const drawSegment = (): void => {
    rafRef.current = 0
    const ctx = ctxRef.current
    const from = lastPointRef.current
    const to = latestPointRef.current
    if (!ctx || !from || !to) return
    if (from.x === to.x && from.y === to.y) return
    const style = strokeStyleFor(toolPaint(tool, currentColor(), colorsRef.current.ground), size)
    ctx.strokeStyle = style.strokeStyle
    ctx.lineWidth = style.lineWidth
    ctx.lineCap = style.lineCap
    ctx.lineJoin = style.lineJoin
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    lastPointRef.current = to
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (bayFailed || !event.isPrimary || event.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)
    const point = mapToPlate(canvas.getBoundingClientRect(), event.clientX, event.clientY)

    const before = encodePlate()
    if (before !== null) undoStackRef.current = pushSnapshot(undoStackRef.current, before)
    setClearArmed(false)

    if (tool === 'fill') {
      const ctx = ctxRef.current
      if (ctx) {
        const rgb = parseHex(rgbHexOf(currentColor()))
        if (rgb) {
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
          floodFill(image, point.x, point.y, rgb)
          ctx.putImageData(image, 0, 0)
        }
      }
      finishEdit()
      return
    }

    drawingRef.current = true
    lastPointRef.current = point
    latestPointRef.current = point
    // A click is a dot: stamp it so taps leave a mark.
    const ctx = ctxRef.current
    if (ctx) {
      const paint = toolPaint(tool, currentColor(), colorsRef.current.ground)
      ctx.fillStyle = paint
      ctx.beginPath()
      ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current || !event.isPrimary) return
    const canvas = canvasRef.current
    if (!canvas) return
    latestPointRef.current = mapToPlate(canvas.getBoundingClientRect(), event.clientX, event.clientY)
    if (rafRef.current === 0) rafRef.current = requestAnimationFrame(drawSegment)
  }

  /** End the stroke cleanly (pointerup, pointercancel, Esc — the same law). */
  const endStroke = (): void => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    drawSegment()
    lastPointRef.current = null
    latestPointRef.current = null
    finishEdit()
  }

  /* ------------------------------ edits ----------------------------------- */

  const applyClear = (): void => {
    const ctx = ctxRef.current
    const before = encodePlate()
    if (!ctx || before === null) return
    undoStackRef.current = pushSnapshot(undoStackRef.current, before)
    ctx.fillStyle = colorsRef.current.ground
    ctx.fillRect(0, 0, PLATE_WIDTH, PLATE_HEIGHT)
    setClearArmed(false)
    finishEdit()
  }

  const applyUndo = (): void => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const snapshot = stack[stack.length - 1]!
    undoStackRef.current = stack.slice(0, -1)
    void loadPngToPlate(snapshot).then(() => {
      const png = encodePlate()
      setDirty(png !== null && png !== savedPngRef.current)
      setCanUndo(undoStackRef.current.length > 0)
      setEditEpoch((epoch) => epoch + 1)
    })
  }

  /* ------------------------------ save ------------------------------------ */

  /**
   * Save (button / Ctrl+S). A bound plate commits now; an untitled plate
   * gets its NAME offered first — the accession happens on that commit.
   */
  const save = (): void => {
    if (editingName || bayFailed) return
    if (untitled) {
      startNameEdit()
      return
    }
    commitSave(plate!.name)
  }

  /** Run the model's orchestrator against the live stores; true = saved. */
  const commitSave = (name: string): boolean => {
    const png = encodePlate()
    if (png === null) return false
    const result = savePlate(
      { fs: useFSStore.getState().fs, windowId, boundId, name, png },
      {
        commit: (next) => useFSStore.getState().commit(next),
        rebind: (targetWindow, specimen) => {
          setCreatedId(specimen.id)
          return useWMStore.getState().rebindWindow(targetWindow, {
            instanceId: fileInstanceKey(specimen.id),
            launch: { source: 'file', file: specimen },
          })
        },
        cue: () => playCue('drop-on-folder'), // the filing cue, exactly once
      },
    )
    if (result.status === 'saved') {
      savedPngRef.current = png
      setDirty(false)
      return true
    }
    return false // in-world refusal: shake, keep editing
  }

  /* --------------------------- name edit (the save flow) ------------------- */

  const startNameEdit = (): void => {
    setNameDraft(displayName)
    setNameRejected(false)
    nameCancelledRef.current = false
    setEditingName(true)
  }

  useEffect(() => {
    if (editingName) {
      const input = nameInputRef.current
      if (input) {
        input.focus()
        input.select()
        input.scrollLeft = 0
      }
    }
  }, [editingName])

  const rejectNameEdit = (): void => {
    setNameRejected(true)
    window.setTimeout(() => setNameRejected(false), NAME_REJECT_ATTR_MS)
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }

  const commitName = (): boolean => {
    const name = nameDraft.trim()
    if (name.length === 0) return false
    if (untitled) return commitSave(name) // the edit IS the save
    return true // a bound plate's label is the archive's business (rename lives in the explorer)
  }

  /* --------------------------- export -------------------------------------- */

  const exportPng = (): void => {
    const canvas = canvasRef.current
    if (!canvas || bayFailed) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${(plate?.name ?? 'untitled-plate').replace(/\.png$/i, '')}.png`
      anchor.rel = 'noopener'
      anchor.click()
      URL.revokeObjectURL(url) // the blob outlives the revoked URL in flight
    }, 'image/png')
  }

  /* --------------------------- the picker ----------------------------------- */

  const plates = listPlates(fs)

  const openPickerPlate = (specimen: ImagePlateRef): void => {
    setPickerOpen(false)
    const launchCtx: FileLaunch = { source: 'file', file: specimen }
    openApp('paint', launchCtx) // the registry dedupes: one painter per plate
  }

  /* --------------------------- persistence + title -------------------------- */

  // The dirty mirror rides the window record (opaque appState, debounced) so
  // an in-progress plate survives reload. Clean plates mirror nothing — the
  // FS commit IS their persistence (a stray WM write would only delay MF-2's
  // envelope write, the notepad's regression).
  useEffect(() => {
    if (!dirty) {
      if (mirrorWrittenRef.current) {
        mirrorWrittenRef.current = false
        useWMStore.getState().setWindowAppState(windowId, { png: null })
      }
      return
    }
    const timer = window.setTimeout(() => {
      const png = encodePlate()
      if (png === null) return
      useWMStore.getState().setWindowAppState(windowId, { png })
      mirrorWrittenRef.current = true
    }, PAINT_MIRROR_DELAY_MS)
    return () => window.clearTimeout(timer)
    // editEpoch re-arms the debounce after each completed edit
  }, [windowId, dirty, editEpoch])

  // The title bar reads the bound plate's LIVE name (renames elsewhere
  // follow in); untitled/removed windows fall back to the module's name.
  const moduleTitle = getApp('paint')?.name ?? 'Plate Painter'
  useEffect(() => {
    useWMStore.getState().setWindowTitle(windowId, plate?.name ?? moduleTitle)
    // the title follows the plate's live name only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId, plate?.name])

  /* --------------------------- close-request guard -------------------------- */

  useEffect(
    () =>
      registerCloseGuard(windowId, () => {
        if (!dirty) return false
        setGuardOpen(true) // lamp flare + the strip interposes
        return true // veto — this surface closes the window when answered
      }),
    [windowId, dirty],
  )

  // The guard withdraws the moment the plate is no longer dirty (a save
  // while it is open resolves the question).
  useEffect(() => {
    if (guardOpen && !dirty) setGuardOpen(false)
  }, [guardOpen, dirty])

  const requestClose = (): void => {
    if (dirty) {
      setGuardOpen(true)
      return
    }
    closeWindow()
  }

  /* --------------------------- guard strip focus ----------------------------- */

  useEffect(() => {
    if (guardOpen) keepButtonRef.current?.focus()
    else if (!editingName && !pickerOpen && !bayFailed) canvasRef.current?.focus()
  }, [guardOpen, editingName, pickerOpen, bayFailed])

  /* --------------------------- keyboard -------------------------------------- */

  const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
      event.preventDefault() // never the browser's save dialog
      save()
      return
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault()
      applyUndo()
      return
    }
    if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      // The painter's FIRST CLAIM on Esc, in precedence order: the strip
      // keeps editing, an armed clear disarms, the picker closes, a dirty
      // plate interposes the guard, a clean plate closes the window.
      event.preventDefault()
      event.stopPropagation()
      if (guardOpen) {
        setGuardOpen(false)
        return
      }
      if (clearArmed) {
        setClearArmed(false)
        return
      }
      if (pickerOpen) {
        setPickerOpen(false)
        return
      }
      endStroke() // a live stroke ends cleanly, never dangles
      requestClose()
      return
    }
    if (isTypingTarget(event.target)) return // typing keys are the field's
    if (event.key === 'b' || event.key === 'B') {
      setTool('brush')
      return
    }
    if (event.key === 'e' || event.key === 'E') {
      setTool('eraser')
      return
    }
    if (event.key === 'f' || event.key === 'F') {
      setTool('fill')
      return
    }
    if (event.key === '[') {
      setSize((current) => stepSize(current, -1))
      return
    }
    if (event.key === ']') {
      setSize((current) => stepSize(current, 1))
      return
    }
    if (event.key === 'z' || event.key === 'Z') {
      applyUndo()
    }
  }

  /** The guard strip is an alertdialog — Tab stays inside it (DD-2). */
  const handleStripTab = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return
    const focusables = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])'),
    )
    if (focusables.length === 0) return
    const active = document.activeElement
    const index = focusables.indexOf(active as HTMLElement)
    const next = event.shiftKey
      ? index <= 0
        ? focusables.length - 1
        : index - 1
      : index === -1 || index === focusables.length - 1
        ? 0
        : index + 1
    event.preventDefault()
    focusables[next]!.focus()
  }

  /** The picker keeps the menu law: arrows walk, Tab walks too, Esc closes. */
  const handlePickerKeys = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab') {
      event.preventDefault() // the panel keeps focus within itself (DD-2)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const ids = plates.map((entry) => entry.id)
    const active = document.activeElement as HTMLButtonElement | null
    const currentId = active?.dataset['paintPick']
    const index = currentId === undefined ? -1 : ids.indexOf(currentId)
    const nextIndex =
      event.key === 'ArrowDown'
        ? index === -1 || index === ids.length - 1
          ? 0
          : index + 1
        : index <= 0
          ? ids.length - 1
          : index - 1
    pickerRowRefs.current.get(ids[nextIndex]!)?.focus()
  }

  /* ------------------------------ render ----------------------------------- */

  const removed = boundId !== null && plate === null
  const selectedSwatch = pigment.kind === 'swatch' ? pigment.id : null

  return (
    <div className="paint" data-paint-surface onKeyDown={handleKeyDown}>
      <div className="paint-toolbar paint-toolbar--identity">
        {editingName ? (
          <input
            ref={nameInputRef}
            className="paint-name-field"
            data-paint-name-input
            data-rename-rejected={nameRejected || undefined}
            value={nameDraft}
            aria-label="Name this plate"
            spellCheck={false}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation() // the field's keys are the field's
              if (event.key === 'Enter') {
                event.preventDefault()
                if (!commitName()) rejectNameEdit()
                else setEditingName(false)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                nameCancelledRef.current = true
                setEditingName(false)
                canvasRef.current?.focus()
              }
            }}
            onBlur={() => {
              if (nameCancelledRef.current) return
              if (!commitName()) rejectNameEdit()
              else setEditingName(false)
            }}
          />
        ) : (
          <span className="paint-name engraved" data-paint-name title={displayName}>
            {displayName}
          </span>
        )}
        {/* The accession readout — digits ride B612 in a recessed well. */}
        <span className="paint-accession well">{plate?.accession ?? UNFILED_ACCESSION}</span>
        {/* The dirty lamp: lit = un-accessioned work; flares under the guard. */}
        <span className="paint-lamp" data-lit={dirty} data-flare={guardOpen && dirty} aria-hidden="true" />
        <div className="paint-actions">
          <button
            type="button"
            className="paint-control"
            data-paint-open
            disabled={removed}
            title="Open a catalogued plate — one painter window per plate"
            onClick={() => setPickerOpen((open) => !open)}
          >
            Open
          </button>
          <button
            type="button"
            className="paint-control"
            data-paint-export
            disabled={bayFailed}
            title="Export the plate as a PNG — take it home"
            onClick={exportPng}
          >
            Export
          </button>
          <button
            type="button"
            className="paint-control paint-control--save"
            data-paint-save
            disabled={(!dirty && !untitled) || bayFailed || removed}
            title={untitled ? 'Accession — name and file this plate' : 'File the plate into the catalog'}
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>

      <div className="paint-toolbar paint-toolbar--studio">
        <div className="paint-tools" role="group" aria-label="Tool">
          {(['brush', 'eraser', 'fill'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              className="paint-tool"
              data-paint-tool={entry}
              data-active={tool === entry || undefined}
              aria-pressed={tool === entry}
              title={`${TOOL_LABELS[entry]} tool`}
              onClick={() => setTool(entry)}
            >
              {TOOL_LABELS[entry]}
            </button>
          ))}
        </div>
        <div className="paint-size" role="group" aria-label="Brush size">
          <button
            type="button"
            className="paint-control paint-control--glyph"
            data-paint-size-down
            disabled={size === BRUSH_SIZES[0]}
            title="Finer stroke"
            onClick={() => setSize((current) => stepSize(current, -1))}
          >
            −
          </button>
          <span className="paint-size-readout well" data-paint-size-readout aria-label={`Brush size ${size} pixels`}>
            {size}
          </span>
          <button
            type="button"
            className="paint-control paint-control--glyph"
            data-paint-size-up
            disabled={size === BRUSH_SIZES[BRUSH_SIZES.length - 1]}
            title="Heavier stroke"
            onClick={() => setSize((current) => stepSize(current, 1))}
          >
            +
          </button>
        </div>
        <div className="paint-palette" role="group" aria-label="Pigments">
          {PALETTE.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              className="paint-swatch"
              data-paint-swatch={swatch.id}
              data-selected={selectedSwatch === swatch.id || undefined}
              aria-label={`${swatch.label} pigment`}
              aria-pressed={selectedSwatch === swatch.id}
              title={`${swatch.label} pigment`}
              onClick={() => setPigment({ kind: 'swatch', id: swatch.id })}
            >
              <span
                className="paint-swatch-pigment"
                style={{ backgroundColor: colorsRef.current.bySwatch[swatch.id] }}
              />
            </button>
          ))}
          <label className="paint-mix" title="Mix a custom pigment">
            <span className="paint-mix-legend">Mix</span>
            <input
              type="color"
              className="paint-mix-input"
              data-paint-custom
              aria-label="Mix a custom pigment"
              value={customHex}
              onChange={(event) => {
                setCustomHex(event.target.value)
                setPigment({ kind: 'custom', value: event.target.value })
              }}
              onKeyDown={(event) => event.stopPropagation()} // the mixer's keys are the mixer's
            />
          </label>
        </div>
        <div className="paint-edits">
          <button
            type="button"
            className="paint-control"
            data-paint-undo
            disabled={!canUndo || bayFailed}
            title={`Undo — the ring remembers the last ${UNDO_CAP} strokes`}
            onClick={applyUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="paint-control paint-control--clear"
            data-paint-clear
            data-armed={clearArmed || undefined}
            disabled={bayFailed || removed}
            title={clearArmed ? 'Press again to wash the plate' : 'Wash the plate (two-step)'}
            onClick={() => (clearArmed ? applyClear() : setClearArmed(true))}
          >
            {clearArmed ? 'Confirm' : 'Clear'}
          </button>
        </div>
      </div>

      <div className="paint-content parchment-surface" data-paint-content>
        {removed ? (
          <RemovedNotice onClose={closeWindow} />
        ) : (
          <>
            {bayFailed ? (
              <div className="paint-bay" role="alert">
                <p className="paint-bay-title">Plate bay unavailable</p>
                <p className="paint-bay-hint">
                  This console cannot mount the drawing surface. The window can only close.
                </p>
              </div>
            ) : (
              <div className="paint-platewrap">
                <canvas
                  ref={canvasRef}
                  className="paint-plate"
                  data-paint-plate
                  tabIndex={0}
                  role="img"
                  aria-label={`Drawing plate, 960 by 600 — ${displayName}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endStroke}
                  onPointerCancel={endStroke}
                />
                <p className="paint-plate-note">PLATE 960 × 600 — the archive files what leaves this bench</p>
              </div>
            )}
            {pickerOpen && (
              <div
                className="paint-picker"
                data-paint-picker
                role="dialog"
                aria-label="Open a catalogued plate"
                onKeyDown={handlePickerKeys}
              >
                <p className="paint-picker-head engraved">Catalogued plates</p>
                {plates.length === 0 ? (
                  <p className="paint-picker-empty">No plates in the catalog yet — save one first.</p>
                ) : (
                  <div className="paint-picker-list" role="listbox" aria-label="Plates">
                    {plates.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="paint-picker-row"
                        data-paint-pick={entry.id}
                        ref={(node) => {
                          if (node) pickerRowRefs.current.set(entry.id, node)
                          else pickerRowRefs.current.delete(entry.id)
                        }}
                        onClick={() => openPickerPlate(entry)}
                      >
                        <span className="paint-picker-accession">{entry.accession}</span>
                        <span className="paint-picker-name">{entry.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {guardOpen && (
              <div
                className="paint-strip"
                data-paint-strip
                role="alertdialog"
                aria-labelledby="paint-strip-title"
                aria-describedby="paint-strip-body"
                onKeyDown={handleStripTab}
              >
                <p className="paint-strip-title" id="paint-strip-title">
                  Plate work not accessioned?
                </p>
                <p className="paint-strip-body" id="paint-strip-body">
                  This plate has work not yet filed to the archive.
                </p>
                <div className="paint-strip-actions">
                  <button
                    ref={keepButtonRef}
                    type="button"
                    className="paint-strip-keep"
                    data-paint-keep
                    onClick={() => setGuardOpen(false)}
                  >
                    Keep painting
                  </button>
                  <button
                    type="button"
                    className="paint-strip-discard"
                    data-paint-discard
                    onClick={closeWindow}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {/* Lamp state for assistive tech (the lamp itself is decorative). */}
      <span className="paint-sr" role="status">
        {dirty ? 'Un-filed plate work' : 'Filed to the archive'}
      </span>
    </div>
  )
}

/** Convert a resolved color to the hex the parser reads (rgb() → #rrggbb). */
function rgbHexOf(color: string): string {
  const match = /#([0-9a-f]{6})/i.exec(color)
  if (match) return `#${match[1]!}`
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color)
  if (rgb) {
    const hex = (value: string) => Number(value).toString(16).padStart(2, '0')
    return `#${hex(rgb[1]!)}${hex(rgb[2]!)}${hex(rgb[3]!)}`
  }
  return color // already #rgb, or unresolvable — the parser refuses safely
}

/* --------------------------------------------------------------------------
 * The decommissioned-plate notice: the fs node was deleted elsewhere while
 * this window held it. Close is the only action — the archive decided.
 * ------------------------------------------------------------------------ */

function RemovedNotice({ onClose }: { readonly onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])
  return (
    <div className="paint-removed" data-paint-removed role="alert">
      <span className="paint-removed-glyph" aria-hidden="true">
        <PaintIcon size={30} />
      </span>
      <p className="paint-removed-title">Plate removed from catalog</p>
      <p className="paint-removed-hint">
        The specimen was decommissioned elsewhere in the archive. This module can only close.
      </p>
      <button
        ref={closeRef}
        type="button"
        className="paint-removed-close"
        data-paint-removed-close
        onClick={onClose}
      >
        Close module
      </button>
    </div>
  )
}
