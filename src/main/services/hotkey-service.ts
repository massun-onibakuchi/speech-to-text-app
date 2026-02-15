import type { Settings } from '../../shared/domain'
import { SettingsService } from './settings-service'
import { TransformationOrchestrator } from '../orchestrators/transformation-orchestrator'
import type { CompositeTransformResult } from '../../shared/ipc'

interface GlobalShortcutLike {
  register: (accelerator: string, callback: () => void) => boolean
  unregisterAll: () => void
}

interface HotkeyDependencies {
  globalShortcut: GlobalShortcutLike
  settingsService: Pick<SettingsService, 'getSettings' | 'setSettings'>
  transformationOrchestrator: Pick<TransformationOrchestrator, 'runCompositeFromClipboard'>
  onCompositeResult?: (result: CompositeTransformResult) => void
}

const toElectronAccelerator = (combo: string): string | null => {
  const parts = combo
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 0) {
    return null
  }

  const mapped = parts.map((part, index) => {
    const normalized = part.toLowerCase()

    if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
      return 'CommandOrControl'
    }

    if (normalized === 'ctrl' || normalized === 'control') {
      return 'Control'
    }

    if (normalized === 'opt' || normalized === 'option' || normalized === 'alt') {
      return 'Alt'
    }

    if (normalized === 'shift') {
      return 'Shift'
    }

    if (index === parts.length - 1) {
      if (normalized.length === 1) {
        return normalized.toUpperCase()
      }
      return normalized[0].toUpperCase() + normalized.slice(1)
    }

    return null
  })

  if (mapped.some((part) => part === null)) {
    return null
  }

  return mapped.join('+')
}

export class HotkeyService {
  private readonly globalShortcut: GlobalShortcutLike
  private readonly settingsService: Pick<SettingsService, 'getSettings' | 'setSettings'>
  private readonly transformationOrchestrator: Pick<TransformationOrchestrator, 'runCompositeFromClipboard'>
  private readonly onCompositeResult?: (result: CompositeTransformResult) => void

  constructor(dependencies: HotkeyDependencies) {
    this.globalShortcut = dependencies.globalShortcut
    this.settingsService = dependencies.settingsService
    this.transformationOrchestrator = dependencies.transformationOrchestrator
    this.onCompositeResult = dependencies.onCompositeResult
  }

  registerFromSettings(): void {
    this.globalShortcut.unregisterAll()

    const settings = this.settingsService.getSettings()
    const bindings = [
      { combo: settings.shortcuts.runTransform, run: () => this.runTransform() },
      { combo: settings.shortcuts.pickTransformation, run: () => this.pickAndRunTransform() },
      { combo: settings.shortcuts.changeTransformationDefault, run: () => this.changeDefaultTransform() }
    ]

    for (const binding of bindings) {
      const accelerator = toElectronAccelerator(binding.combo)
      if (!accelerator) {
        continue
      }

      this.globalShortcut.register(accelerator, () => {
        void binding.run()
      })
    }
  }

  unregisterAll(): void {
    this.globalShortcut.unregisterAll()
  }

  private async runTransform(): Promise<void> {
    const result = await this.transformationOrchestrator.runCompositeFromClipboard()
    this.onCompositeResult?.(result)
  }

  private async pickAndRunTransform(): Promise<void> {
    const settings = this.settingsService.getSettings()
    const presets = settings.transformation.presets
    if (presets.length === 0) {
      return
    }

    const currentIndex = presets.findIndex((preset) => preset.id === settings.transformation.activePresetId)
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % presets.length : 0
    const nextPreset = presets[nextIndex]

    const nextSettings: Settings = {
      ...settings,
      transformation: {
        ...settings.transformation,
        activePresetId: nextPreset.id
      }
    }

    this.settingsService.setSettings(nextSettings)
    const result = await this.transformationOrchestrator.runCompositeFromClipboard()
    this.onCompositeResult?.(result)
  }

  private async changeDefaultTransform(): Promise<void> {
    const settings = this.settingsService.getSettings()
    const activePreset =
      settings.transformation.presets.find((preset) => preset.id === settings.transformation.activePresetId) ??
      settings.transformation.presets[0]

    if (!activePreset) {
      return
    }

    const nextSettings: Settings = {
      ...settings,
      transformation: {
        ...settings.transformation,
        defaultPresetId: activePreset.id
      }
    }

    this.settingsService.setSettings(nextSettings)
  }
}

export { toElectronAccelerator }
