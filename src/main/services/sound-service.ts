// src/main/services/sound-service.ts
// What: Interface and concrete implementations for sound event notifications.
// Why:  Each recording/transformation event plays a dedicated MP3 asset so users
//       get distinct audio feedback (issue #96).  The concrete implementation
//       delegates to `afplay` (macOS built-in, no extra dependency) via
//       child_process.spawn so audio is non-blocking and never crashes the pipeline.
//       filePaths and playFile are injectable for hermetic unit tests — callers
//       (register-handlers.ts) supply SOUND_ASSET_PATHS at the wiring point.

import { spawn } from 'node:child_process'
import type { SoundEvent } from '../../shared/ipc'

export interface SoundService {
  play(event: SoundEvent): void
}

/** No-op implementation — does not produce any audio. Used in stubs and tests. */
export class NoopSoundService implements SoundService {
  play(_event: SoundEvent): void {
    // intentional no-op
  }
}

// Mapping from SoundEvent to the resolved absolute file path.
// Supplied by the caller so this module stays free of `electron` imports.
export type SoundEventFilePaths = Record<SoundEvent, string>

/**
 * Play a file path using macOS `afplay`.
 * Spawns detached + unref'd so it does not block the Electron event loop.
 * Any launch failure is swallowed — audio is best-effort.
 */
const afplay = (filePath: string): void => {
  try {
    const child = spawn('afplay', [filePath], { detached: true, stdio: 'ignore' })
    child.unref()
  } catch {
    // Do not let audio issues break command/queue processing.
  }
}

/**
 * Concrete sound service that plays the designated MP3 for each SoundEvent.
 *
 * Constructor arguments are injectable for testing:
 *   - `filePaths`: explicit event→path map (provided by register-handlers via SOUND_ASSET_PATHS)
 *   - `playFile`:  audio backend (defaults to `afplay` via child_process.spawn)
 */
export class ElectronSoundService implements SoundService {
  private readonly filePaths: SoundEventFilePaths
  private readonly playFile: (path: string) => void

  constructor(filePaths: SoundEventFilePaths, playFile?: (path: string) => void) {
    this.filePaths = filePaths
    this.playFile = playFile ?? afplay
  }

  play(event: SoundEvent): void {
    const path = this.filePaths[event]
    if (!path) return
    try {
      this.playFile(path)
    } catch {
      // Do not let audio issues break command/queue processing.
    }
  }
}
