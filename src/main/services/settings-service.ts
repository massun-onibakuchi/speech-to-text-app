import { DEFAULT_SETTINGS, type Settings, validateSettings } from '../../shared/domain'

export class SettingsService {
  private static settings: Settings = structuredClone(DEFAULT_SETTINGS)

  getSettings(): Settings {
    return structuredClone(SettingsService.settings)
  }

  setSettings(nextSettings: Settings): Settings {
    const errors = validateSettings(nextSettings)
    if (errors.length > 0) {
      throw new Error(`Invalid settings: ${errors.map((error) => `${error.field}: ${error.message}`).join('; ')}`)
    }

    SettingsService.settings = structuredClone(nextSettings)
    return this.getSettings()
  }
}
