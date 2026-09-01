import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_WALLPAPER, useSettingsStore } from './settings-store'

const initialSettings = useSettingsStore.getState()

beforeEach(() => {
  useSettingsStore.setState(initialSettings, true)
})

describe('settings-store · defaults', () => {
  it('ships the committed defaults: wallpaper plate, sounds muted, reduced-motion follow on', () => {
    const state = useSettingsStore.getState()
    expect(state.wallpaper).toBe(DEFAULT_WALLPAPER)
    expect(DEFAULT_WALLPAPER).toBe('star-chart')
    expect(state.soundsEnabled).toBe(false) // town-hall: muted by default
    expect(state.reducedMotionFollow).toBe(true) // honor prefers-reduced-motion out of the box
  })
})

describe('settings-store · setters', () => {
  it('setWallpaper updates the plate id', () => {
    useSettingsStore.getState().setWallpaper('graticule')
    expect(useSettingsStore.getState().wallpaper).toBe('graticule')
  })

  it('setSoundsEnabled updates the mute state', () => {
    useSettingsStore.getState().setSoundsEnabled(true)
    expect(useSettingsStore.getState().soundsEnabled).toBe(true)
  })

  it('setReducedMotionFollow updates the follow flag', () => {
    useSettingsStore.getState().setReducedMotionFollow(false)
    expect(useSettingsStore.getState().reducedMotionFollow).toBe(false)
  })
})

describe('settings-store · persistence seam (MF-2 subscription surface)', () => {
  it('slice-level subscriptions fire only for the slice they select', () => {
    const wallpaperCalls: string[] = []
    const soundCalls: boolean[] = []
    const unsubscribeWallpaper = useSettingsStore.subscribe(
      (s) => s.wallpaper,
      (wallpaper) => {
        wallpaperCalls.push(wallpaper)
      },
    )
    const unsubscribeSounds = useSettingsStore.subscribe(
      (s) => s.soundsEnabled,
      (enabled) => {
        soundCalls.push(enabled)
      },
    )

    useSettingsStore.getState().setWallpaper('phytograph') // wallpaper listener only
    useSettingsStore.getState().setSoundsEnabled(true) // sounds listener only
    useSettingsStore.getState().setReducedMotionFollow(false) // neither listener

    unsubscribeWallpaper()
    unsubscribeSounds()

    expect(wallpaperCalls).toEqual(['phytograph'])
    expect(soundCalls).toEqual([true])
  })
})
