// src/main/services/sound-service.test.ts
// Verifies NoopSoundService contract: all events accepted without throwing.

import { describe, expect, it } from 'vitest'
import { NoopSoundService, type SoundEvent } from './sound-service'

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
