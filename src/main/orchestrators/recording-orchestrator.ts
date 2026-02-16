import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { app } from 'electron'
import type { AudioInputSource, RecordingCommand, RecordingCommandDispatch } from '../../shared/ipc'
import type { CaptureResult } from '../services/capture-types'
import { JobQueueService } from '../services/job-queue-service'
import { ProcessingOrchestrator } from './processing-orchestrator'
import { SettingsService } from '../services/settings-service'

interface RecordingDependencies {
  jobQueueService: Pick<JobQueueService, 'enqueueCapture'>
  settingsService: Pick<SettingsService, 'getSettings'>
}

export class RecordingOrchestrator {
  private readonly jobQueueService: Pick<JobQueueService, 'enqueueCapture'>
  private readonly settingsService: Pick<SettingsService, 'getSettings'>

  constructor(dependencies?: Partial<RecordingDependencies>) {
    this.settingsService = dependencies?.settingsService ?? new SettingsService()
    if (dependencies?.jobQueueService) {
      this.jobQueueService = dependencies.jobQueueService
    } else {
      const processingOrchestrator = new ProcessingOrchestrator()
      this.jobQueueService = new JobQueueService({
        processor: (job) => processingOrchestrator.process(job)
      })
    }
  }

  getAudioInputSources(): AudioInputSource[] {
    return [{ id: 'system_default', label: 'System Default Microphone' }]
  }

  private resolvePreferredDeviceId(): string | undefined {
    const settings = this.settingsService.getSettings()
    const selected = settings.recording.device?.trim()
    if (!selected || selected === 'system_default') {
      return undefined
    }
    return selected
  }

  runCommand(command: RecordingCommand): RecordingCommandDispatch {
    const dispatch: RecordingCommandDispatch = { command }
    if (command === 'startRecording' || command === 'toggleRecording') {
      dispatch.preferredDeviceId = this.resolvePreferredDeviceId()
    }
    return dispatch
  }

  submitRecordedAudio(payload: { data: Uint8Array; mimeType: string; capturedAt: string }): CaptureResult {
    const outputDir = join(app.getPath('userData'), 'captures')
    mkdirSync(outputDir, { recursive: true })

    const extension = this.resolveAudioExtension(payload.mimeType)
    const outputPath = join(outputDir, `${Date.now()}-${randomUUID()}.${extension}`)

    writeFileSync(outputPath, Buffer.from(payload.data))

    const capture: CaptureResult = {
      jobId: randomUUID(),
      audioFilePath: outputPath,
      capturedAt: payload.capturedAt
    }
    this.jobQueueService.enqueueCapture(capture)
    return capture
  }

  private resolveAudioExtension(mimeType: string): string {
    const normalized = mimeType.trim().toLowerCase()
    if (normalized.includes('wav')) {
      return 'wav'
    }
    if (normalized.includes('ogg')) {
      return 'ogg'
    }
    if (normalized.includes('mp4') || normalized.includes('m4a')) {
      return 'm4a'
    }
    if (normalized.includes('mpeg') || normalized.includes('mp3')) {
      return 'mp3'
    }
    if (normalized.includes('webm')) {
      return 'webm'
    }

    const fallback = extname(normalized).replace('.', '')
    return fallback.length > 0 ? fallback : 'webm'
  }
}
