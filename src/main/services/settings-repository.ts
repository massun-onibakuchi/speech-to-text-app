// src/main/services/settings-repository.ts
// Repository interface for settings persistence.
// Decouples SettingsService from storage mechanism.
// InMemorySettingsRepository is the initial adapter; file-backed added in Phase 1B.

import type { Settings } from '../../shared/domain'
import { DEFAULT_SETTINGS } from '../../shared/domain'

export interface SettingsRepository {
  load(): Settings
  save(settings: Settings): void
}

/** In-memory settings store with clone-on-read/write isolation. */
export class InMemorySettingsRepository implements SettingsRepository {
  private settings: Settings

  constructor(initial?: Settings) {
    this.settings = structuredClone(initial ?? DEFAULT_SETTINGS)
  }

  load(): Settings {
    return structuredClone(this.settings)
  }

  save(settings: Settings): void {
    this.settings = structuredClone(settings)
  }
}
