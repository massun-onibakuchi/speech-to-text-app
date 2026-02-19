// src/main/services/sound-service.test.ts
// Verifies SoundService contracts: no-op and concrete beep patterns.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SoundEvent } from '../../shared/ipc'
import { ElectronSoundService, NoopSoundService } from './sound-service'

const ALL_EVENTS: SoundEvent[] = [
  'recording_started',
  'recording_stopped',
  'recording_cancelled',
  'transformation_succeeded',
  'transformation_failed'
]

describe('NoopSoundService', () => {
  it('accepts all sound events without throwing', () => {
    const service = new NoopSoundService()
    for (const event of ALL_EVENTS) {
      expect(() => service.play(event)).not.toThrow()
    }
  })
})

describe('ElectronSoundService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(ALL_EVENTS)('plays exactly one beep for %s', (event) => {
    vi.useFakeTimers()
    const beep = vi.fn()
    const service = new ElectronSoundService(beep)

    service.play(event)
    vi.runAllTimers()

    expect(beep).toHaveBeenCalledTimes(1)
  })
})
