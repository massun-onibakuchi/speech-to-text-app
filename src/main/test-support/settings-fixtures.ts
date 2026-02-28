// src/main/test-support/settings-fixtures.ts
// Named settings fixtures for common test scenarios.
// Builds on the generic buildSettings factory.

import { buildSettings } from './factories'
import type { Settings } from '../../shared/domain'

/** Minimal valid settings using all defaults. */
export const SETTINGS_MINIMAL: Settings = buildSettings()

/** Transcript output selected — capture processing skips LLM step. */
export const SETTINGS_TRANSFORM_DERIVED_SKIP: Settings = buildSettings({
  output: {
    ...buildSettings().output,
    selectedTextSource: 'transcript'
  }
})

/** Two transformation presets with 'a' as default. */
export const SETTINGS_MULTI_PRESET: Settings = buildSettings({
  transformation: {
    ...buildSettings().transformation,
    defaultPresetId: 'a',
    lastPickedPresetId: null,
    presets: [
      { ...buildSettings().transformation.presets[0], id: 'a', name: 'Preset A' },
      { ...buildSettings().transformation.presets[0], id: 'b', name: 'Preset B' }
    ]
  }
})
