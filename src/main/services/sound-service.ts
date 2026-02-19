// src/main/services/sound-service.ts
// Interface and concrete implementation for sound notifications.
// Phase 6: use Electron shell.beep() with event-specific beep patterns.

import { shell } from 'electron'
import type { SoundEvent } from '../../shared/ipc'

export interface SoundService {
  play(event: SoundEvent): void
}

/** No-op implementation — does not produce any audio. */
export class NoopSoundService implements SoundService {
  play(_event: SoundEvent): void {
    // No-op. Concrete implementation in Phase 6.
  }
}

const SOUND_EVENT_DELAYS_MS: Record<SoundEvent, readonly number[]> = {
  recording_started: [0],
  recording_stopped: [0, 120],
  recording_cancelled: [0, 90, 180],
  transformation_succeeded: [0],
  transformation_failed: [0, 110, 220]
}

/**
 * Concrete sound service backed by Electron's system beep.
 * Patterns are intentionally short to avoid blocking input handling.
 */
export class ElectronSoundService implements SoundService {
  private readonly beep: () => void

  constructor(beep?: () => void) {
    this.beep = beep ?? (() => shell.beep())
  }

  play(event: SoundEvent): void {
    const pattern = SOUND_EVENT_DELAYS_MS[event] ?? [0]
    for (const delayMs of pattern) {
      setTimeout(() => {
        try {
          this.beep()
        } catch {
          // Do not let audio issues break command/queue processing.
        }
      }, delayMs)
    }
  }
}
