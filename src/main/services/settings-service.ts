import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'

export class SettingsService {
  private settings: Settings = structuredClone(DEFAULT_SETTINGS)

  getSettings(): Settings {
    return structuredClone(this.settings)
  }
}
