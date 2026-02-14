import { ClipboardClient } from '../infrastructure/clipboard-client'
import { OutputService } from '../services/output-service'
import { SecretStore } from '../services/secret-store'
import { SettingsService } from '../services/settings-service'
import { TransformationService } from '../services/transformation-service'

interface CompositeResult {
  status: 'ok' | 'error'
  message: string
}

interface TransformDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
  clipboardClient: Pick<ClipboardClient, 'readText'>
  secretStore: Pick<SecretStore, 'getApiKey'>
  transformationService: Pick<TransformationService, 'transform'>
  outputService: Pick<OutputService, 'applyOutput'>
}

export class TransformationOrchestrator {
  private readonly settingsService: Pick<SettingsService, 'getSettings'>
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

  async runCompositeFromClipboard(): Promise<CompositeResult> {
    const settings = this.settingsService.getSettings()
    const clipboardText = this.clipboardClient.readText().trim()
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
        model: settings.transformation.model
      })

      const outputStatus = await this.outputService.applyOutput(transformed.text, settings.output.transformed)
      if (outputStatus === 'output_failed_partial') {
        return { status: 'error', message: 'Transformation succeeded but output application partially failed.' }
      }

      return { status: 'ok', message: transformed.text }
    } catch {
      return { status: 'error', message: 'Transformation failed.' }
    }
  }
}
