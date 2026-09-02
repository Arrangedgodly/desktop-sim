// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ConsoleFaultBoundary } from './ConsoleFaultBoundary'
import { resetDesktop } from '../../lib/storage/persistence'

/**
 * HU-1 unit gates — the OS-level boundary: a shell throw surfaces the
 * full-page CONSOLE FAULT plate (never a white screen, never a React error
 * dump), reload is the recovery advice, and the Reset archive nuclear option
 * hides behind a confirm strip. resetDesktop is mocked (its own recovery
 * paths are MF-2's tested domain); location.reload is stubbed per test.
 */

vi.mock('../../lib/storage/persistence', () => ({
  resetDesktop: vi.fn().mockResolvedValue({ ok: true, failure: null }),
}))

const reloadSpy = vi.fn()
// jsdom's location.reload is non-configurable; the whole location object is
// swappable, so tests substitute a shallow copy carrying the spy.
const originalLocation = window.location

beforeEach(() => {
  reloadSpy.mockClear()
  vi.mocked(resetDesktop).mockClear()
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadSpy },
    writable: true,
    configurable: true,
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
  vi.restoreAllMocks()
  cleanup()
})

function Healthy(): ReactNode {
  return <div data-testid="shell-standing">the hold stands</div>
}

/** Throws on a post-mount update (the React-19-honest fault path). */
function FaultingShell(): ReactNode {
  const [boom, setBoom] = useState(false)
  useEffect(() => {
    setBoom(true)
  }, [])
  if (boom) throw new Error('OS shell detonated catastrophically')
  return <div data-testid="shell-standing">the hold stands</div>
}

describe('ConsoleFaultBoundary · the never-a-white-screen floor', () => {
  it('renders its children while the shell is healthy', () => {
    render(
      <ConsoleFaultBoundary>
        <Healthy />
      </ConsoleFaultBoundary>,
    )
    expect(screen.getByTestId('shell-standing')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a shell throw surfaces the CONSOLE FAULT plate — not the error, not a white screen', async () => {
    render(
      <ConsoleFaultBoundary session="desktop">
        <FaultingShell />
      </ConsoleFaultBoundary>,
    )
    const plate = await screen.findByRole('alert')
    expect(plate.hasAttribute('data-console-fault')).toBe(true)
    expect(screen.getByText('CONSOLE FAULT')).toBeTruthy()
    expect(screen.getByText('HOLD/OS', { exact: false })).toBeTruthy()
    expect(screen.getByText('0.1.0')).toBeTruthy() // version digits ride B612
    expect(screen.getByText(/archive on this vessel is intact/i)).toBeTruthy()
    expect(screen.getByText(/desktop side/)).toBeTruthy() // the session tag
    // The raw React story never reaches the visitor.
    expect(document.body.textContent).not.toContain('OS shell detonated catastrophically')
    // The faulted shell is gone — replaced, not half-rendered.
    expect(screen.queryByTestId('shell-standing')).toBeNull()
  })

  it('Reload console reloads the page', async () => {
    render(
      <ConsoleFaultBoundary>
        <FaultingShell />
      </ConsoleFaultBoundary>,
    )
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reload console' }))
    expect(reloadSpy).toHaveBeenCalledOnce()
    expect(resetDesktop).not.toHaveBeenCalled()
  })
})

describe('ConsoleFaultBoundary · the guarded reset', () => {
  it('the confirm strip is hidden until asked for, and cancels without a reset', async () => {
    render(
      <ConsoleFaultBoundary>
        <FaultingShell />
      </ConsoleFaultBoundary>,
    )
    await screen.findByRole('alert')
    expect(screen.queryByText('Reset the archive?')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reset archive…' }))
    expect(screen.getByText('Reset the archive?')).toBeTruthy()
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Keep archive' }))
    expect(screen.queryByText('Reset the archive?')).toBeNull()
    expect(resetDesktop).not.toHaveBeenCalled()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('confirming runs resetDesktop then reloads — the nuclear option, in order', async () => {
    render(
      <ConsoleFaultBoundary>
        <FaultingShell />
      </ConsoleFaultBoundary>,
    )
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reset archive…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear archive and reload' }))

    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledOnce())
    expect(resetDesktop).toHaveBeenCalledOnce()
    // The reset finished BEFORE the reload began (the archive is cleared first).
    expect(
      (resetDesktop as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]! <
        reloadSpy.mock.invocationCallOrder[0]!,
    ).toBe(true)
  })

  it('a resetDesktop rejection still reloads (the page is faulted either way)', async () => {
    vi.mocked(resetDesktop).mockRejectedValueOnce(new Error('storage gone dark'))
    render(
      <ConsoleFaultBoundary>
        <FaultingShell />
      </ConsoleFaultBoundary>,
    )
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reset archive…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear archive and reload' }))
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledOnce())
  })
})
