// @vitest-environment jsdom
// Archive Backup surface tests (batch-2 brief 10, acceptances 2 + 3) — the
// flows through their REAL seams: export composes the live stores into a
// downloadable JSON envelope (round-tripped through the platform reader),
// import PREVIEWS without mutating a single store, and the guarded restore
// is a two-step oxide commit through the public hydrateStores seam.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  buildStoredState,
  hydrateStores,
  readStoredState,
  seedStoredState,
} from '../../lib/storage'
import { useFSStore } from '../../platform/stores/fs-store'
import { useWMStore } from '../../platform/stores/wm-store'
import { useSettingsStore } from '../../platform/stores/settings-store'
import BackupSurface from './BackupSurface'

/* ------------------------------- hygiene ---------------------------------- */

const initialFS = useFSStore.getState()
const initialWM = useWMStore.getState()
const initialSettings = useSettingsStore.getState()

// jsdom ships neither object URLs nor navigable anchor clicks — stub both at
// the exact seams the painter's export pattern uses (file-local, like the
// platform's own tests).
const createdBlobs: Blob[] = []
const downloadNames: string[] = []
URL.createObjectURL = vi.fn((blob: Blob): string => {
  createdBlobs.push(blob)
  return 'blob:mock'
})
URL.revokeObjectURL = vi.fn()

beforeEach(() => {
  createdBlobs.length = 0
  downloadNames.length = 0
  useFSStore.setState(initialFS, true)
  useWMStore.setState(initialWM, true)
  useSettingsStore.setState(initialSettings, true)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/* ------------------------------- fixtures ---------------------------------- */

const countKind = (nodes: Record<string, unknown>, folder: boolean): number =>
  Object.values(nodes).filter((n) => (n as { kind: string }).kind === 'folder' === folder).length

/**
 * A REAL foreign archive: the deterministic seed with a renamed root hold
 * and one extra drawer — valid per the platform reader, visibly distinct
 * from the live store after restore.
 */
const foreignEnvelopeText = (): string => {
  const state = seedStoredState()
  const nodes: Record<string, unknown> = { ...state.fs.nodes }
  nodes[state.fs.rootId] = { ...nodes[state.fs.rootId]!, name: 'Restored Hold' }
  nodes['restored-drawer'] = {
    id: 'restored-drawer',
    parentId: state.fs.rootId,
    name: 'Restored Drawer',
    kind: 'folder',
    accession: 'DRW-9001',
    accessionedAt: 0,
  }
  return JSON.stringify(
    { ...state, savedAt: 1_756_800_000_000, fs: { ...state.fs, nodes }, windows: [] },
    null,
    2,
  )
}

const mount = () => render(<BackupSurface />)

const input = (): HTMLInputElement => {
  const el = document.querySelector('[data-backup-file-input]')
  if (!(el instanceof HTMLInputElement)) throw new Error('file input not rendered')
  return el
}

/** Hand a file to the hidden input and fire its change (the pick button's route). */
const pickFile = (text: string, name = 'foreign.json'): void => {
  const file = new File([text], name, { type: 'application/json' })
  Object.defineProperty(input(), 'files', { value: [file], configurable: true })
  fireEvent.change(input())
}

/* ------------------------------- export (2) --------------------------------- */

describe('backup surface · export composes the REAL current state', () => {
  it('downloads a well-formed JSON envelope of the live stores, name honest', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadNames.push(this.download)
      })
    const before = buildStoredState()

    const view = mount()
    fireEvent.click(view.getByRole('button', { name: 'Download archive' }))

    expect(createdBlobs).toHaveLength(1)
    expect(createdBlobs[0]!.type).toBe('application/json')
    expect(downloadNames[0]).toMatch(/^holdos-archive-v1-\d{8}-\d{6}\.json$/)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')

    // Round trip: the downloaded bytes parse back through the platform reader
    // into EXACTLY the live envelope (catalog, positions, windows, settings).
    const text = await createdBlobs[0]!.text()
    const parsed = readStoredState(JSON.parse(text))
    expect(parsed.fs.nodes).toEqual(before.fs.nodes)
    expect(parsed.iconPositions).toEqual(before.iconPositions)
    expect(parsed.windows).toEqual(before.windows)
    expect(parsed.settings).toEqual(before.settings)
    expect(parsed.version).toBe(before.version)

    // The receipt line is in the well, honest about what was written.
    await waitFor(() => expect(view.getByText(/WROTE holdos-archive-v1-/)).toBeTruthy())
    clickSpy.mockRestore()
  })

  it('counts the live hold in the toolbar well', () => {
    mount()
    const live = document.querySelector('[data-backup-live]')!
    const nodeCount = Object.keys(useFSStore.getState().fs.nodes).length
    expect(live.textContent).toMatch(/^SPECIMENS \d+ · DRAWERS \d+$/)
    expect(nodeCount).toBeGreaterThan(3)
  })
})

/* ------------------------------- import (3) --------------------------------- */

describe('backup surface · import previews and never mutates', () => {
  it('renders the manifest summary for a valid foreign file — stores untouched', async () => {
    const fsBefore = useFSStore.getState().fs
    const wmBefore = useWMStore.getState().windows
    const settingsBefore = useSettingsStore.getState()

    mount()
    pickFile(foreignEnvelopeText())

    const summary = await waitFor(() => {
      const el = document.querySelector('[data-backup-summary]')
      expect(el).toBeTruthy()
      return el!
    })
    const foreign = readStoredState(JSON.parse(foreignEnvelopeText()))
    expect(summary.querySelector('[data-backup-specimens]')!.textContent).toBe(
      String(countKind(foreign.fs.nodes as Record<string, unknown>, false)),
    )
    expect(summary.querySelector('[data-backup-windows]')!.textContent).toBe('0')
    expect(summary.querySelector('[data-backup-version]')!.textContent).toBe('v1')

    // PREVIEW ONLY: no store object was replaced by the read.
    expect(useFSStore.getState().fs).toBe(fsBefore)
    expect(useWMStore.getState().windows).toBe(wmBefore)
    expect(useSettingsStore.getState()).toBe(settingsBefore)
  })

  it('refuses hostile files in-world with the typed code — and mutates nothing', async () => {
    const fsBefore = useFSStore.getState().fs
    mount()
    pickFile('{"version":9999}', 'future.json')

    const refusal = await waitFor(() => {
      const el = document.querySelector('[data-backup-refusal]')
      expect(el).toBeTruthy()
      return el!
    })
    expect(refusal.getAttribute('data-code')).toBe('unknown-version')
    expect(document.querySelector('[data-backup-summary]')).toBeNull()
    expect(useFSStore.getState().fs).toBe(fsBefore)
  })

  it('re-picking a file re-seats the guard and clears the refusal', async () => {
    mount()
    pickFile('not json at all', 'garbage.json')
    await waitFor(() => expect(document.querySelector('[data-backup-refusal]')).toBeTruthy())

    pickFile(foreignEnvelopeText(), 'good.json')
    await waitFor(() => expect(document.querySelector('[data-backup-summary]')).toBeTruthy())
    expect(document.querySelector('[data-backup-refusal]')).toBeNull()
  })
})

/* --------------------------- the guarded restore (3) ------------------------- */

describe('backup surface · restore is the oxide two-step through the seam', () => {
  it('arming alone never mutates; Esc disarms; the SECOND press commits', async () => {
    const fsBefore = useFSStore.getState().fs
    const wmBefore = useWMStore.getState().windows
    const view = mount()
    pickFile(foreignEnvelopeText())
    await waitFor(() => expect(document.querySelector('[data-backup-summary]')).toBeTruthy())

    // Step one: arm. The button re-labels; the archive is untouched.
    fireEvent.click(view.getByRole('button', { name: 'Restore archive' }))
    const armed = view.getByRole('button', { name: 'Confirm restore' })
    expect(armed.getAttribute('data-armed')).toBe('true')
    expect(useFSStore.getState().fs).toBe(fsBefore)

    // Esc claims the key and disarms (the guard-strip law).
    fireEvent.keyDown(view.container.querySelector('.backup')!, { key: 'Escape' })
    expect(
      view.getByRole('button', { name: 'Restore archive' }).getAttribute('data-armed'),
    ).toBe('false')
    expect(useFSStore.getState().fs).toBe(fsBefore)

    // Arm again, then commit: the public seam seats the foreign envelope.
    fireEvent.click(view.getByRole('button', { name: 'Restore archive' }))
    fireEvent.click(view.getByRole('button', { name: 'Confirm restore' }))

    const after = useFSStore.getState().fs
    expect(after).not.toBe(fsBefore)
    expect(after.nodes['restored-drawer']!.name).toBe('Restored Drawer')
    expect(after.nodes[after.rootId]!.name).toBe('Restored Hold')
    expect(useWMStore.getState().windows).not.toBe(wmBefore) // the foreign session ([] → {})
    expect(Object.keys(useWMStore.getState().windows)).toHaveLength(0)
    expect(view.getByText(/ARCHIVE RESTORED /)).toBeTruthy()

    // The live well re-counted from the restored store (the extra drawer).
    expect(document.querySelector('[data-backup-live]')!.textContent).toContain(
      String(countKind(after.nodes as Record<string, unknown>, true)),
    )
  })

  it('hydrateStores (the seam the guarded path rides) restores what export composed', () => {
    // Acceptance 2's other half, proven at the seam itself: build from the
    // live stores, validate through the reader, unfold back — identical tree.
    const composed = buildStoredState()
    const roundTripped = readStoredState(JSON.parse(JSON.stringify(composed)))
    hydrateStores(roundTripped)
    expect(useFSStore.getState().fs.nodes).toEqual(composed.fs.nodes)
    expect(useFSStore.getState().fs.rootId).toBe(composed.fs.rootId)
  })
})
