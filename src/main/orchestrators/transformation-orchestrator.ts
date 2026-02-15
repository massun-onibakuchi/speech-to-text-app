import { ClipboardClient } from '../infrastructure/clipboard-client'
import { OutputService } from '../services/output-service'
import { SecretStore } from '../services/secret-store'
import { SettingsService } from '../services/settings-service'
import { TransformationService } from '../services/transformation-service'
import type { Settings, TransformationPreset } from '../../shared/domain'

interface CompositeResult {
  status: 'ok' | 'error'
  message: string
}

interface TransformDependencies {
  settingsService: Pick<SettingsService, 'getSettings'> & Partial<Pick<SettingsService, 'setSettings'>>
  clipboardClient: Pick<ClipboardClient, 'readText'>
  secretStore: Pick<SecretStore, 'getApiKey'>
  transformationService: Pick<TransformationService, 'transform'>
  outputService: Pick<OutputService, 'applyOutput'>
}

export class TransformationOrchestrator {
  private readonly settingsService: Pick<SettingsService, 'getSettings'> & Partial<Pick<SettingsService, 'setSettings'>>
  private readonly clipboardClient: Pick<ClipboardClient, 'readText'>
  private readonly secretStore: Pick<SecretStore, 'getApiKey'>
  private readonly transformationService: Pick<TransformationService, 'transform'>
  private readonly outputService: Pick<OutputService, 'applyOutput'>

  constructor(dependencies?: Partial<TransformDependencies>) {
    this.settingsService = dependencies?.settingsService ?? new SettingsService()
    this.clipboardClient = dependencies?.clipboardClient ?? new ClipboardClient()
    this.secretStore = dependencies?.secretStore ?? new SecretStore()
    this.transformationService = dependencies?.transformationService ?? new TransformationService()
    this.outputService = dependencies?.outputService ?? new OutputService()
  }

  private readTopmostClipboardText(): string {
    const raw = this.clipboardClient.readText()
    const firstLine = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)
    return (firstLine ?? '').trim()
  }

  private resolveActivePreset(settings: Settings): TransformationPreset {
    const preset =
      settings.transformation.presets.find((item) => item.id === settings.transformation.activePresetId) ??
      settings.transformation.presets[0]
    if (!preset) {
      throw new Error('No transformation preset configured.')
    }
    return preset
  }

  async runCompositeFromClipboard(): Promise<CompositeResult> {
    const settings = this.settingsService.getSettings()
    if (!settings.transformation.enabled) {
      return { status: 'error', message: 'Transformation is disabled in Settings.' }
    }
    const preset = this.resolveActivePreset(settings)
    const clipboardText = this.readTopmostClipboardText()
    if (!clipboardText) {
      return { status: 'error', message: 'Clipboard is empty.' }
    }

    const apiKey = this.secretStore.getApiKey('google')
    if (!apiKey) {
      return { status: 'error', message: 'Missing Google API key.' }
    }

    try {
      const transformed = await this.transformationService.transform({
        text: clipboardText,
        apiKey,
        model: preset.model,
        prompt: {
          systemPrompt: preset.systemPrompt,
          userPrompt: preset.userPrompt
        }
      })
      if (transformed.model !== preset.model && this.settingsService.setSettings) {
        const migrated = settings.transformation.presets.map((item) =>
          item.id === preset.id ? { ...item, model: transformed.model } : item
        )
        this.settingsService.setSettings({
          ...settings,
          transformation: {
            ...settings.transformation,
            presets: migrated
          }
        })
      }

      const outputStatus = await this.outputService.applyOutput(transformed.text, settings.output.transformed)
      if (outputStatus === 'output_failed_partial') {
        return { status: 'error', message: 'Transformation succeeded but output application partially failed.' }
      }

      return { status: 'ok', message: transformed.text }
    } catch (error) {
      const detail = error instanceof Error && error.message.trim().length > 0 ? error.message.trim() : 'Unknown error'
      return { status: 'error', message: `Transformation failed: ${detail}` }
    }
  }
}
