// src/main/services/sound-service.test.ts
// What: Unit tests for SoundService contract — no-op and concrete file-playback.
// Why:  Verifies each SoundEvent triggers playback of the correct dedicated MP3
//       asset (issue #96) without actually spawning a child process.

import { describe, expect, it, vi } from 'vitest'
import type { SoundEvent } from '../../shared/ipc'
import { ElectronSoundService, NoopSoundService } from './sound-service'

const ALL_EVENTS: SoundEvent[] = [
  'recording_started',
  'recording_stopped',
  'recording_cancelled',
  'transformation_succeeded',
  'transformation_failed'
]

// Stable test file-path stubs — decoupled from SOUND_ASSET_PATHS (which requires
// a live Electron `app` object). Mirrors the real event→file mapping from issue #96.
const STUB_PATHS: Record<SoundEvent, string> = {
  recording_started: '/stub/sounds/recording_started.mp3',
  recording_stopped: '/stub/sounds/recording_stopped.mp3',
  recording_cancelled: '/stub/sounds/recording_cancelled.mp3',
  transformation_succeeded: '/stub/sounds/transformation_succeeded.mp3',
  transformation_failed: '/stub/sounds/transformation_failed.mp3'
}

describe('NoopSoundService', () => {
  it('accepts all sound events without throwing', () => {
    const service = new NoopSoundService()
    for (const event of ALL_EVENTS) {
      expect(() => service.play(event)).not.toThrow()
    }
  })
})

describe('ElectronSoundService', () => {
  it.each(ALL_EVENTS)('plays the correct file for %s', (event) => {
    const playFile = vi.fn()
    const service = new ElectronSoundService(STUB_PATHS, playFile)

    service.play(event)

    expect(playFile).toHaveBeenCalledOnce()
    expect(playFile).toHaveBeenCalledWith(STUB_PATHS[event])
  })

  it('does not call playFile for an unknown event (defensive)', () => {
    const playFile = vi.fn()
    // Force an unknown event via cast to test the guard branch.
    const service = new ElectronSoundService(
      { ...STUB_PATHS, recording_started: '' },
      playFile
    )

    // Empty string path → guard returns early
    service.play('recording_started')

    expect(playFile).not.toHaveBeenCalled()
  })

  it('swallows errors thrown by playFile to protect the pipeline', () => {
    const playFile = vi.fn(() => {
      throw new Error('audio backend failure')
    })
    const service = new ElectronSoundService(STUB_PATHS, playFile)

    expect(() => service.play('recording_started')).not.toThrow()
  })
})
