// src/main/infrastructure/sound-asset-paths.test.ts
// What: Unit tests for resolving sound asset directories in dev and packaged modes.
// Why:  Ensures the path resolver stays stable across packaging changes.

import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveSoundsDir, SOUND_ASSET_PATHS } from './sound-asset-paths'

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

describe('resolveSoundsDir', () => {
  it('uses project resources/sounds in dev mode', () => {
    const resolved = resolveSoundsDir({
      isPackaged: false,
      cwd: '/project/root',
      resourcesPath: '/app/Resources'
    })

    expect(resolved).toBe(join('/project/root', 'resources', 'sounds'))
  })

  it('uses process resourcesPath/sounds in packaged mode', () => {
    const resolved = resolveSoundsDir({
      isPackaged: true,
      cwd: '/project/root',
      resourcesPath: '/app/Resources'
    })

    expect(resolved).toBe(join('/app/Resources', 'sounds'))
  })
})

describe('SOUND_ASSET_PATHS', () => {
  const expectedFiles = {
    recordingStarted: 'zapsplat_household_alarm_clock_button_press_12967.mp3',
    recordingStopped: 'sound_ex_machina_Button_Blip.mp3',
    recordingCancelled: 'zapsplat_multimedia_click_button_short_sharp_73510.mp3',
    transformationSucceeded: 'zapsplat_multimedia_notification_alert_ping_bright_chime_001_93276.mp3',
    transformationFailed: 'zapsplat_multimedia_ui_notification_classic_bell_synth_success_107505.mp3'
  }

  it('maps each event to the expected file name', () => {
    for (const [key, expected] of Object.entries(expectedFiles)) {
      const resolved = SOUND_ASSET_PATHS[key as keyof typeof SOUND_ASSET_PATHS]
      expect(basename(resolved)).toBe(expected)
    }
  })

  it('resolves to existing files in the repo', () => {
    for (const key of Object.keys(expectedFiles)) {
      const resolved = SOUND_ASSET_PATHS[key as keyof typeof SOUND_ASSET_PATHS]
      expect(existsSync(resolved)).toBe(true)
    }
  })
})
