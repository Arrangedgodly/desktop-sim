/**
 * Paint model tests (federated session 2) — the pure plate math without a
 * DOM: caps pinned (STORAGE HONESTY), palette/token discipline, the src
 * transform, hostile appState payloads, the undo ring's bound, the
 * catalog-order picker listing, and `savePlate`'s whole accession path —
 * create/update/refused — against the REAL seed state and the REAL createNode
 * op, with the filing cue's EXACTLY-ONCE law driven through the REAL audio
 * engine seam (fake context injected, the settings store's armed/muted
 * switch deciding), the same shape as lib/audio's own wiring tests.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createNode, FSError, type FSImageNode } from '../../lib/fs'
import { audioStats, configureAudioEngine, playCue, resetAudioEngineForTests } from '../../lib/audio'
import { useSettingsStore } from '../../platform/stores/settings-store'
import { SEED_INITIAL_FS_STATE, useFSStore } from '../../platform/stores/fs-store'
import type { AppLaunchContext } from '../../platform/app-registry'
import {
  BRUSH_SIZES,
  DEFAULT_PIGMENT,
  PALETTE,
  PLATE_HEIGHT,
  PLATE_WIDTH,
  UNDO_CAP,
  imageSpecimen,
  listPlates,
  plateId,
  pushSnapshot,
  readPlateMirror,
  registerCloseGuard,
  savePlate,
  stepSize,
  swatchById,
  vetoCloseFor,
  withImageSrc,
  type ImagePlateRef,
  type PaintSavePorts,
} from './paint-model'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

/* --------------------------- seed + store hygiene -------------------------- */

const initialFS = useFSStore.getState()
const initialSettings = useSettingsStore.getState()

beforeEach(() => {
  useFSStore.setState({ fs: SEED_INITIAL_FS_STATE })
  useSettingsStore.setState(initialSettings, true)
})

afterEach(() => {
  useFSStore.setState(initialFS)
  useSettingsStore.setState(initialSettings, true)
})

/* --------------------------- caps + vocabulary ----------------------------- */

describe('paint · storage honesty + tool vocabulary', () => {
  it('pins the ONE fixed plate size — the IndexedDB-envelope cap', () => {
    expect(PLATE_WIDTH).toBe(960)
    expect(PLATE_HEIGHT).toBe(600)
  })

  it('pins the undo ring bound and the discrete brush sizes', () => {
    expect(UNDO_CAP).toBe(20)
    expect(BRUSH_SIZES).toEqual([2, 4, 8, 16, 32])
    expect(stepSize(2, -1)).toBe(2) // clamped at the floor
    expect(stepSize(32, 1)).toBe(32) // clamped at the ceiling
    expect(stepSize(8, -1)).toBe(4)
    expect(stepSize(8, 1)).toBe(16)
  })

  it('defines the palette as TOKEN NAMES only — every id resolves, no raw values', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(8)
    for (const swatch of PALETTE) {
      expect(swatch.token, swatch.id).toMatch(/^--[a-z-]+$/)
      expect(swatch.label.length).toBeGreaterThan(0)
    }
    // The committed swatch list (id → token), pinned.
    expect(PALETTE.map((s) => [s.id, s.token])).toEqual([
      ['ink', '--parchment-ink'],
      ['umber', '--parchment-ink-dim'],
      ['rust', '--oxide'],
      ['ember', '--oxide-bright'],
      ['brass', '--brass'],
      ['polished', '--brass-hi'],
      ['shadow', '--brass-lo'],
      ['paper', '--parchment'],
    ])
    expect(swatchById('ink')?.token).toBe('--parchment-ink')
    expect(swatchById('nope')).toBeNull()
    expect(DEFAULT_PIGMENT).toEqual({ kind: 'swatch', id: 'ink' })
  })
})

/* --------------------------- catalog access -------------------------------- */

describe('paint · plate binding + the src transform', () => {
  it('plateId reads the launch context; null for a launcher open', () => {
    const fileLaunch = {
      source: 'file',
      file: SEED_INITIAL_FS_STATE.nodes['reference-plate']!,
    } as AppLaunchContext
    expect(plateId(fileLaunch)).toBe('reference-plate')
    expect(plateId({ source: 'launcher' } as AppLaunchContext)).toBeNull()
  })

  it('imageSpecimen finds live plates and refuses gone/foreign nodes', () => {
    expect(imageSpecimen(SEED_INITIAL_FS_STATE, 'reference-plate')?.kind).toBe('image')
    expect(imageSpecimen(SEED_INITIAL_FS_STATE, 'charter')).toBeNull() // text specimen
    expect(imageSpecimen(SEED_INITIAL_FS_STATE, 'deleted-mid-flight')).toBeNull()
    expect(imageSpecimen(SEED_INITIAL_FS_STATE, null)).toBeNull()
  })

  it('withImageSrc updates ONLY a live image node src (withTextContent pattern)', () => {
    const next = withImageSrc(SEED_INITIAL_FS_STATE, 'reference-plate', PNG)
    expect(next).not.toBeNull()
    expect((next!.nodes['reference-plate']! as FSImageNode).src).toBe(PNG)
    // structural sharing: untouched nodes keep identity
    expect(next!.nodes['charter']).toBe(SEED_INITIAL_FS_STATE.nodes['charter'])
    expect(withImageSrc(SEED_INITIAL_FS_STATE, 'charter', PNG)).toBeNull() // not a plate
    expect(withImageSrc(SEED_INITIAL_FS_STATE, 'gone', PNG)).toBeNull()
  })

  it('listPlates walks the catalog in catalog order — the picker listing', () => {
    const plates = listPlates(SEED_INITIAL_FS_STATE)
    expect(plates.map((p) => p.id)).toEqual(['reference-plate', 'observation-plate'])
    for (const plate of plates) {
      expect(plate.kind).toBe('image')
      expect(plate.accession).toMatch(/^PLT-/)
    }
    // A plate filed deep in a drawer still lists (DFS recursion).
    const withDeep = createNode(SEED_INITIAL_FS_STATE, {
      id: 'deep-plate',
      parentId: 'archive',
      name: 'deep-plate.png',
      kind: 'image',
      src: PNG,
    })
    expect(listPlates(withDeep).map((p) => p.id)).toEqual([
      'reference-plate',
      'observation-plate',
      'deep-plate',
    ])
  })
})

/* --------------------------- the dirty mirror ------------------------------- */

describe('paint · appState mirror validation (hostile payloads)', () => {
  it('accepts a PNG data URI string and nothing else', () => {
    expect(readPlateMirror({ png: PNG })).toBe(PNG)
    expect(readPlateMirror(null)).toBeNull()
    expect(readPlateMirror(undefined)).toBeNull()
    expect(readPlateMirror('string')).toBeNull()
    expect(readPlateMirror({})).toBeNull()
    expect(readPlateMirror({ png: null })).toBeNull()
    expect(readPlateMirror({ png: 42 })).toBeNull()
    expect(readPlateMirror({ png: 'data:image/jpeg;base64,evil' })).toBeNull() // not PNG
    expect(readPlateMirror({ png: 'javascript:alert(1)' })).toBeNull()
    expect(readPlateMirror({ png: '<svg onload=alert(1)>' })).toBeNull()
  })
})

/* --------------------------- the undo ring ---------------------------------- */

describe('paint · the bounded undo ring', () => {
  it('caps at UNDO_CAP by dropping the OLDEST snapshot', () => {
    let stack: readonly string[] = []
    for (let i = 0; i < UNDO_CAP + 7; i++) stack = pushSnapshot(stack, `snap-${i}`)
    expect(stack.length).toBe(UNDO_CAP)
    expect(stack[0]).toBe(`snap-${7}`) // the first 7 were dropped
    expect(stack[stack.length - 1]).toBe(`snap-${UNDO_CAP + 6}`)
  })
})

/* --------------------------- the close guard -------------------------------- */

describe('paint · the per-window close guard registry', () => {
  it("answers the manifest's veto from the LIVE guard; absent = no veto", () => {
    expect(vetoCloseFor('w-nope')).toBe(false) // the safe default
    let dirty = false
    const unregister = registerCloseGuard('w-1', () => dirty)
    expect(vetoCloseFor('w-1')).toBe(false)
    dirty = true
    expect(vetoCloseFor('w-1')).toBe(true)
    unregister()
    expect(vetoCloseFor('w-1')).toBe(false) // cleaned up
  })
})

/* --------------------------- savePlate -------------------------------------- */

/** Recording ports — the surface's seams, spied. */
function recordingPorts(): PaintSavePorts & {
  commits: unknown[]
  rebinds: { windowId: string; plate: ImagePlateRef }[]
  cueCount: number
} {
  const spy = {
    commits: [] as unknown[],
    rebinds: [] as { windowId: string; plate: ImagePlateRef }[],
    cueCount: 0,
  }
  return {
    commits: spy.commits,
    rebinds: spy.rebinds,
    get cueCount() {
      return spy.cueCount
    },
    commit: (fs) => void spy.commits.push(fs),
    rebind: (windowId, plate) => (spy.rebinds.push({ windowId, plate }), true),
    cue: () => {
      spy.cueCount++
    },
  }
}

describe('paint · savePlate — the accession orchestrator', () => {
  it('accessions an untitled draft: createNode + rebind + cue, each EXACTLY ONCE', () => {
    const ports = recordingPorts()
    const result = savePlate(
      { fs: SEED_INITIAL_FS_STATE, windowId: 'w-1', boundId: null, name: 'survey-sketch.png', png: PNG },
      ports,
    )

    expect(result.status).toBe('saved')
    if (result.status !== 'saved') return
    expect(ports.commits.length).toBe(1)
    expect(ports.rebinds.length).toBe(1)
    expect(ports.cueCount).toBe(1) // EXACTLY once

    // The committed state is the REAL op's output: a PLT accession at the hold.
    const committed = ports.commits[0] as typeof SEED_INITIAL_FS_STATE
    const plate = committed.nodes[result.boundId] as FSImageNode
    expect(plate.kind).toBe('image')
    expect(plate.src).toBe(PNG)
    expect(plate.parentId).toBe(SEED_INITIAL_FS_STATE.rootId)
    expect(plate.accession).toMatch(/^PLT-\d{4}$/)
    expect(plate.name).toBe('survey-sketch.png')
    // The rebind carries the CREATED node (the window becomes the plate's window).
    expect(ports.rebinds[0]!.windowId).toBe('w-1')
    expect(ports.rebinds[0]!.plate.id).toBe(result.boundId)
  })

  it('updates a bound plate through withImageSrc — no rebind, cue once', () => {
    const ports = recordingPorts()
    const result = savePlate(
      {
        fs: SEED_INITIAL_FS_STATE,
        windowId: 'w-1',
        boundId: 'reference-plate',
        name: 'irrelevant-on-update',
        png: PNG,
      },
      ports,
    )

    expect(result).toEqual({ status: 'saved', boundId: 'reference-plate' })
    expect(ports.commits.length).toBe(1)
    expect(ports.rebinds.length).toBe(0) // already bound — nothing to rebind
    expect(ports.cueCount).toBe(1)
    const committed = ports.commits[0] as typeof SEED_INITIAL_FS_STATE
    expect((committed.nodes['reference-plate']! as FSImageNode).src).toBe(PNG)
  })

  it('refuses an empty name with NOTHING committed and NO cue', () => {
    const ports = recordingPorts()
    for (const empty of ['', '   ', '\t']) {
      expect(
        savePlate({ fs: SEED_INITIAL_FS_STATE, windowId: 'w', boundId: null, name: empty, png: PNG }, ports),
      ).toEqual({ status: 'refused', reason: 'invalid-name' })
    }
    expect(ports.commits.length).toBe(0)
    expect(ports.cueCount).toBe(0)
  })

  it("refuses a name collision (the REAL op's FSError) with no commit and no cue", () => {
    const ports = recordingPorts()
    // accession-charter.txt already sits at the hold root (the notepad's
    // seeded specimen) — a plate may not take its label.
    const result = savePlate(
      { fs: SEED_INITIAL_FS_STATE, windowId: 'w', boundId: null, name: 'accession-charter.txt', png: PNG },
      ports,
    )
    expect(result).toEqual({ status: 'refused', reason: 'collision' })
    expect(ports.commits.length).toBe(0)
    expect(ports.rebinds.length).toBe(0)
    expect(ports.cueCount).toBe(0)
  })

  it('refuses honestly when the bound plate died mid-flight (not-a-plate)', () => {
    const ports = recordingPorts()
    expect(
      savePlate({ fs: SEED_INITIAL_FS_STATE, windowId: 'w', boundId: 'gone', name: 'x.png', png: PNG }, ports),
    ).toEqual({ status: 'refused', reason: 'not-a-plate' })
    expect(
      savePlate({ fs: SEED_INITIAL_FS_STATE, windowId: 'w', boundId: null, name: 'x.png', png: 'not-a-data-uri' }, ports),
    ).toEqual({ status: 'refused', reason: 'not-a-plate' })
    expect(ports.commits.length).toBe(0)
    expect(ports.cueCount).toBe(0)
  })

  it('sanity: the real op still throws typed FSError on collision (model maps, never swallows)', () => {
    expect(() =>
      createNode(SEED_INITIAL_FS_STATE, {
        id: 'dup',
        parentId: SEED_INITIAL_FS_STATE.rootId,
        name: 'accession-charter.txt',
        kind: 'image',
        src: PNG,
      }),
    ).toThrow(FSError)
  })
})

/* --------------------------- the filing cue law ------------------------------ */

/**
 * The cue acceptance, driven through the REAL engine seam (the wiring-test
 * shape): fake context injected, sticky activation stubbed, the settings
 * store's own switch deciding — muted means ZERO, armed means EXACTLY ONE.
 */
describe('paint · the filing cue through the real audio engine seam', () => {
  /** The surface's exact port wiring — the real playCue boundary. */
  const realPlay = (): void => playCue('drop-on-folder')

  beforeEach(() => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } })
    configureAudioEngine({
      createContext: () =>
        ({
          currentTime: 0,
          state: 'running',
          destination: {},
          resume: vi.fn(() => Promise.resolve()),
          close: vi.fn(() => Promise.resolve()),
          createOscillator: vi.fn(() => ({
            type: '',
            frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          })),
          createGain: vi.fn(() => ({
            gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
          })),
        }) as unknown as AudioContext,
    })
    resetAudioEngineForTests()
  })

  afterEach(() => {
    resetAudioEngineForTests()
    vi.unstubAllGlobals()
  })

  it('muted (the shipping default): a save cues NOTHING', () => {
    expect(useSettingsStore.getState().soundsEnabled).toBe(false)
    const ports: PaintSavePorts = {
      commit: () => {},
      rebind: () => true,
      cue: realPlay, // the surface's exact port wiring
    }
    const result = savePlate(
      { fs: SEED_INITIAL_FS_STATE, windowId: 'w', boundId: null, name: 'quiet.png', png: PNG },
      ports,
    )
    expect(result.status).toBe('saved')
    expect(audioStats().cuesPlayed).toBe(0) // the mute law held — zero by construction
  })

  it('armed: a save cues drop-on-folder EXACTLY ONCE; a refusal cues nothing', () => {
    useSettingsStore.setState({ soundsEnabled: true })
    const ports: PaintSavePorts = {
      commit: () => {},
      rebind: () => true,
      cue: realPlay,
    }
    savePlate({ fs: SEED_INITIAL_FS_STATE, windowId: 'w', boundId: null, name: 'loud.png', png: PNG }, ports)
    expect(audioStats().cuesPlayed).toBe(1)
    expect(audioStats().lastCue).toBe('drop-on-folder')

    // A refused save (collision) never cues.
    savePlate({ fs: SEED_INITIAL_FS_STATE, windowId: 'w', boundId: null, name: 'loud.png', png: PNG }, ports)
    expect(audioStats().cuesPlayed).toBe(1) // unchanged
  })
})
