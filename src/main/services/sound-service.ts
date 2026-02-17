// src/main/services/sound-service.ts
// Interface for sound notifications in response to app events.
// No-op implementation for Phase 0B; concrete playback in Phase 6.
// Events defined per spec 4.3: recording started/stopped/cancelled,
// transformation success/failure.

export type SoundEvent =
  | 'recording_started'
  | 'recording_stopped'
  | 'recording_cancelled'
  | 'transformation_succeeded'
  | 'transformation_failed'

export interface SoundService {
  play(event: SoundEvent): void
}

/** No-op implementation — does not produce any audio. */
export class NoopSoundService implements SoundService {
  play(_event: SoundEvent): void {
    // No-op. Concrete implementation in Phase 6.
  }
}
