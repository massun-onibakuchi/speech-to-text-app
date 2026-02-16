import type { RecordingCommand } from '../../shared/ipc'
import type { AudioInputSource } from '../../shared/ipc'
import { CaptureService, type CaptureResult } from '../services/capture-service'
import { JobQueueService } from '../services/job-queue-service'
import { ProcessingOrchestrator } from './processing-orchestrator'
import { SettingsService } from '../services/settings-service'

interface RecordingDependencies {
  captureService: Pick<CaptureService, 'listAudioSources' | 'startRecording' | 'stopRecording' | 'cancelRecording' | 'isRecording'>
  jobQueueService: Pick<JobQueueService, 'enqueueCapture'>
  settingsService: Pick<SettingsService, 'getSettings'>
}

export class RecordingOrchestrator {
  private readonly captureService: Pick<CaptureService, 'listAudioSources' | 'startRecording' | 'stopRecording' | 'cancelRecording' | 'isRecording'>
  private readonly jobQueueService: Pick<JobQueueService, 'enqueueCapture'>
  private readonly settingsService: Pick<SettingsService, 'getSettings'>

  constructor(dependencies?: Partial<RecordingDependencies>) {
    this.captureService = dependencies?.captureService ?? new CaptureService()
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
    return this.captureService.listAudioSources()
  }

  private resolvePreferredDeviceId(): string | undefined {
    const settings = this.settingsService.getSettings()
    const selected = settings.recording.device?.trim()
    if (!selected || selected === 'system_default') {
      return undefined
    }
    return selected
  }

  async runCommand(command: RecordingCommand): Promise<CaptureResult | void> {
    if (command === 'startRecording') {
      await this.captureService.startRecording(this.resolvePreferredDeviceId())
      return
    }

    if (command === 'stopRecording') {
      if (!this.captureService.isRecording()) {
        return
      }
      const capture = await this.captureService.stopRecording()
      this.jobQueueService.enqueueCapture(capture)
      return capture
    }

    if (command === 'toggleRecording') {
      if (this.captureService.isRecording()) {
        const capture = await this.captureService.stopRecording()
        this.jobQueueService.enqueueCapture(capture)
        return capture
      }
      await this.captureService.startRecording(this.resolvePreferredDeviceId())
      return
    }

    if (command === 'cancelRecording') {
      this.captureService.cancelRecording()
      return
    }
  }
}
