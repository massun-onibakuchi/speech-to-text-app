import type { TerminalJobStatus } from '../../shared/domain'
import type { Settings } from '../../shared/domain'
import type { QueueJobRecord } from '../services/job-queue-service'
import { HistoryService } from '../services/history-service'
import { OutputService } from '../services/output-service'
import { SecretStore } from '../services/secret-store'
import { SettingsService } from '../services/settings-service'
import { TranscriptionService } from '../services/transcription-service'
import { TransformationService } from '../services/transformation-service'

interface ProcessingDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
  secretStore: Pick<SecretStore, 'getApiKey'>
  transcriptionService: Pick<TranscriptionService, 'transcribe'>
  transformationService: Pick<TransformationService, 'transform'>
  outputService: Pick<OutputService, 'applyOutput'>
  historyService: Pick<HistoryService, 'appendRecord'>
}

export class ProcessingOrchestrator {
  private readonly settingsService: Pick<SettingsService, 'getSettings'>
  private readonly secretStore: Pick<SecretStore, 'getApiKey'>
  private readonly transcriptionService: Pick<TranscriptionService, 'transcribe'>
  private readonly transformationService: Pick<TransformationService, 'transform'>
  private readonly outputService: Pick<OutputService, 'applyOutput'>
  private readonly historyService: Pick<HistoryService, 'appendRecord'>

  constructor(dependencies?: Partial<ProcessingDependencies>) {
    this.settingsService = dependencies?.settingsService ?? new SettingsService()
    this.secretStore = dependencies?.secretStore ?? new SecretStore()
    this.transcriptionService = dependencies?.transcriptionService ?? new TranscriptionService()
    this.transformationService = dependencies?.transformationService ?? new TransformationService()
    this.outputService = dependencies?.outputService ?? new OutputService()
    this.historyService = dependencies?.historyService ?? new HistoryService()
  }

  async process(job: QueueJobRecord): Promise<TerminalJobStatus> {
    const settings: Settings = this.settingsService.getSettings()
    let transcriptText: string | null = null
    let transformedText: string | null = null

    let terminalStatus: TerminalJobStatus = 'succeeded'

    try {
      const transcriptionApiKey = this.secretStore.getApiKey(settings.transcription.provider)
      if (!transcriptionApiKey) {
        terminalStatus = 'transcription_failed'
      } else {
        const transcriptionResult = await this.transcriptionService.transcribe({
          provider: settings.transcription.provider,
          model: settings.transcription.model,
          apiKey: transcriptionApiKey,
          audioFilePath: job.audioFilePath,
          language: settings.transcription.outputLanguage,
          temperature: settings.transcription.temperature
        })
        transcriptText = transcriptionResult.text
      }
    } catch {
      terminalStatus = 'transcription_failed'
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
            model: settings.transformation.model
          })
          transformedText = transformed.text
        }
      } catch {
        terminalStatus = 'transformation_failed'
      }
    }

    if (terminalStatus === 'succeeded' && transcriptText !== null) {
      const transcriptStatus = await this.outputService.applyOutput(transcriptText, settings.output.transcript)
      const transformedStatus =
        transformedText === null
          ? 'succeeded'
          : await this.outputService.applyOutput(transformedText, settings.output.transformed)

      if (transcriptStatus === 'output_failed_partial' || transformedStatus === 'output_failed_partial') {
        terminalStatus = 'output_failed_partial'
      }
    }

    this.historyService.appendRecord({
      jobId: job.jobId,
      capturedAt: job.capturedAt,
      transcriptText,
      transformedText,
      terminalStatus,
      createdAt: new Date().toISOString()
    })

    return terminalStatus
  }
}
