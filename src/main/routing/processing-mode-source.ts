// src/main/routing/processing-mode-source.ts
// Adapter that resolves the current ProcessingMode.
// This indirection isolates ModeRouter from settings schema evolution and lets
// production code resolve mode from persisted settings without coupling tests
// to SettingsService directly.

import type { Settings } from '../../shared/domain'
import type { ProcessingMode } from './processing-mode'

export interface ProcessingModeSource {
  resolve(): ProcessingMode
}

export interface ProcessingModeSettingsSource {
  getSettings(): Pick<Settings, 'processing'>
}

export class DefaultProcessingModeSource implements ProcessingModeSource {
  resolve(): ProcessingMode {
    return 'default'
  }
}

export class SettingsBackedProcessingModeSource implements ProcessingModeSource {
  private readonly settingsSource: ProcessingModeSettingsSource

  constructor(settingsSource: ProcessingModeSettingsSource) {
    this.settingsSource = settingsSource
  }

  resolve(): ProcessingMode {
    return this.settingsSource.getSettings().processing.mode
  }
}

// Transitional alias while callers migrate from legacy class naming.
export class LegacyProcessingModeSource extends DefaultProcessingModeSource {}
