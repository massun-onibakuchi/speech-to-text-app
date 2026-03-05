// src/main/routing/processing-mode-source.ts
// Adapter that resolves the current ProcessingMode.
// Today: always returns 'default'. Future: reads from canonical settings.
// This indirection isolates ModeRouter from settings schema evolution.

import type { ProcessingMode } from './processing-mode'

export interface ProcessingModeSource {
  resolve(): ProcessingMode
}

export class DefaultProcessingModeSource implements ProcessingModeSource {
  resolve(): ProcessingMode {
    return 'default'
  }
}

// Transitional alias while callers migrate from legacy class naming.
export class DefaultProcessingModeSource extends LegacyProcessingModeSource {}
