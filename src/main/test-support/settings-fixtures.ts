// src/main/test-support/settings-fixtures.ts
// Named settings fixtures for common test scenarios.
// Builds on the generic buildSettings factory.

import { buildSettings } from './factories'
import type { Settings } from '../../shared/domain'

/** Minimal valid settings using all defaults. */
export const SETTINGS_MINIMAL: Settings = buildSettings()

/** Auto-run transformation disabled — processing skips LLM step. */
export const SETTINGS_TRANSFORM_AUTO_RUN_DISABLED: Settings = buildSettings({
  transformation: {
    ...buildSettings().transformation,
    autoRunDefaultTransform: false
  }
})

/** Two transformation presets with 'a' as both active and default. */
export const SETTINGS_MULTI_PRESET: Settings = buildSettings({
  transformation: {
    ...buildSettings().transformation,
    activePresetId: 'a',
    defaultPresetId: 'a',
    presets: [
      { ...buildSettings().transformation.presets[0], id: 'a', name: 'Preset A' },
      { ...buildSettings().transformation.presets[0], id: 'b', name: 'Preset B' }
    ]
  }
})
