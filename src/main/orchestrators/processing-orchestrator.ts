import type { TerminalJobStatus } from '../../shared/domain'
import type { Settings, TransformationPreset } from '../../shared/domain'
import { resolveLlmBaseUrlOverride, resolveSttBaseUrlOverride } from '../../shared/domain'
import { logStructured } from '../../shared/error-logging'
import type { QueueJobRecord } from '../services/job-queue-service'
import { HistoryService } from '../services/history-service'
import { OutputService } from '../services/output-service'
import { SecretStore } from '../services/secret-store'
import { SettingsService } from '../services/settings-service'
import { NetworkCompatibilityService } from '../services/network-compatibility-service'
import { TranscriptionService } from '../services/transcription-service'
import { TransformationService } from '../services/transformation-service'

interface ProcessingDependencies {
  settingsService: Pick<SettingsService, 'getSettings'> & Partial<Pick<SettingsService, 'setSettings'>>
  secretStore: Pick<SecretStore, 'getApiKey'>
  transcriptionService: Pick<TranscriptionService, 'transcribe'>
  transformationService: Pick<TransformationService, 'transform'>
  outputService: Pick<OutputService, 'applyOutput'> & Partial<Pick<OutputService, 'getLastOutputMessage'>>
  historyService: Pick<HistoryService, 'appendRecord'>
  networkCompatibilityService: Pick<NetworkCompatibilityService, 'diagnoseGroqConnectivity'>
}

export class ProcessingOrchestrator {
  private readonly settingsService: Pick<SettingsService, 'getSettings'> & Partial<Pick<SettingsService, 'setSettings'>>
  private readonly secretStore: Pick<SecretStore, 'getApiKey'>
  private readonly transcriptionService: Pick<TranscriptionService, 'transcribe'>
  private readonly transformationService: Pick<TransformationService, 'transform'>
  private readonly outputService: Pick<OutputService, 'applyOutput'> & Partial<Pick<OutputService, 'getLastOutputMessage'>>
  private readonly historyService: Pick<HistoryService, 'appendRecord'>
  private readonly networkCompatibilityService: Pick<NetworkCompatibilityService, 'diagnoseGroqConnectivity'>

  constructor(dependencies?: Partial<ProcessingDependencies>) {
    this.settingsService = dependencies?.settingsService ?? new SettingsService()
    this.secretStore = dependencies?.secretStore ?? new SecretStore()
    this.transcriptionService = dependencies?.transcriptionService ?? new TranscriptionService()
    this.transformationService = dependencies?.transformationService ?? new TransformationService()
    this.outputService = dependencies?.outputService ?? new OutputService()
    this.historyService = dependencies?.historyService ?? new HistoryService()
    this.networkCompatibilityService = dependencies?.networkCompatibilityService ?? new NetworkCompatibilityService()
  }

  private resolveDefaultPreset(settings: Settings): TransformationPreset {
    const preset =
      settings.transformation.presets.find((item) => item.id === settings.transformation.defaultPresetId) ??
      settings.transformation.presets[0]
    if (!preset) {
      throw new Error('No transformation preset configured.')
    }
    return preset
  }

  private async resolveTranscriptionFailureDetail(settings: Settings, error: unknown): Promise<string> {
    const baseMessage = error instanceof Error ? error.message : 'Unknown transcription error'
    if (settings.transcription.provider !== 'groq') {
      return baseMessage
    }

    const hasNetworkSignature =
      /(fetch failed|network|enotfound|econnrefused|econnreset|timed out|tls|certificate|socket hang up)/i.test(baseMessage)
    if (!hasNetworkSignature) {
      return baseMessage
    }

    try {
      const diagnostic = await this.networkCompatibilityService.diagnoseGroqConnectivity()
      if (!diagnostic.reachable && diagnostic.guidance) {
        return `${baseMessage} ${diagnostic.message} ${diagnostic.guidance}`.trim()
      }
    } catch {
      // Keep original failure detail when diagnostics fail.
    }

    return baseMessage
  }

  async process(job: QueueJobRecord): Promise<TerminalJobStatus> {
    const settings: Settings = this.settingsService.getSettings()
    const defaultPreset = this.resolveDefaultPreset(settings)
    let transcriptText: string | null = null
    let transformedText: string | null = null
    let failureDetail: string | null = null

    let terminalStatus: TerminalJobStatus = 'succeeded'

    try {
      const transcriptionApiKey = this.secretStore.getApiKey(settings.transcription.provider)
      if (!transcriptionApiKey) {
        terminalStatus = 'transcription_failed'
        failureDetail = `Missing ${settings.transcription.provider} API key.`
      } else {
        const transcriptionResult = await this.transcriptionService.transcribe({
          provider: settings.transcription.provider,
          model: settings.transcription.model,
          apiKey: transcriptionApiKey,
          baseUrlOverride: resolveSttBaseUrlOverride(settings, settings.transcription.provider),
          audioFilePath: job.audioFilePath,
          language: settings.transcription.outputLanguage,
          temperature: settings.transcription.temperature
        })
        transcriptText = transcriptionResult.text
      }
    } catch (error) {
      terminalStatus = 'transcription_failed'
      logStructured({
        level: 'error',
        scope: 'main',
        event: 'processing_orchestrator.transcription_failed',
        error,
        context: {
          provider: settings.transcription.provider,
          model: settings.transcription.model
        }
      })
      failureDetail = await this.resolveTranscriptionFailureDetail(settings, error)
    }

    if (terminalStatus === 'succeeded' && settings.transformation.enabled && transcriptText !== null) {
      try {
        const transformationApiKey = this.secretStore.getApiKey('google')
        if (!transformationApiKey) {
          terminalStatus = 'transformation_failed'
        } else {
          const transformed = await this.transformationService.transform({
            text: transcriptText,
            apiKey: transformationApiKey,
            model: defaultPreset.model,
            baseUrlOverride: resolveLlmBaseUrlOverride(settings, defaultPreset.provider),
            prompt: {
              systemPrompt: defaultPreset.systemPrompt,
              userPrompt: defaultPreset.userPrompt
            }
          })
          transformedText = transformed.text
        }
      } catch (error) {
        logStructured({
          level: 'error',
          scope: 'main',
          event: 'processing_orchestrator.transformation_failed',
          error,
          context: {
            provider: defaultPreset.provider,
            model: defaultPreset.model
          }
        })
        terminalStatus = 'transformation_failed'
      }
    }

    if (terminalStatus === 'succeeded' && transcriptText !== null) {
      const transcriptStatus = await this.outputService.applyOutput(transcriptText, settings.output.transcript)
      const transcriptOutputFailureDetail =
        transcriptStatus === 'output_failed_partial' ? this.readLastOutputFailureDetail() : null
      const transformedStatus =
        transformedText === null
          ? 'succeeded'
          : await this.outputService.applyOutput(transformedText, settings.output.transformed)
      const transformedOutputFailureDetail =
        transformedStatus === 'output_failed_partial' ? this.readLastOutputFailureDetail() : null

      if (transcriptStatus === 'output_failed_partial' || transformedStatus === 'output_failed_partial') {
        terminalStatus = 'output_failed_partial'
        failureDetail = transformedOutputFailureDetail ?? transcriptOutputFailureDetail
      }
    }

    this.historyService.appendRecord({
      jobId: job.jobId,
      capturedAt: job.capturedAt,
      transcriptText,
      transformedText,
      terminalStatus,
      failureDetail,
      failureCategory: null,
      createdAt: new Date().toISOString()
    })

    return terminalStatus
  }

  private readLastOutputFailureDetail(): string | null {
    const raw = this.outputService.getLastOutputMessage?.()
    if (typeof raw !== 'string') {
      return null
    }
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
  }
}
