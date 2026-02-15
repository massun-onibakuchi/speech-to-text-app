import type { RecordingCommand } from '../../shared/ipc'
import { CaptureService, type CaptureResult } from '../services/capture-service'
import { JobQueueService } from '../services/job-queue-service'
import { SettingsService } from '../services/settings-service'
import { ProcessingOrchestrator } from './processing-orchestrator'

interface RecordingDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
  captureService: Pick<CaptureService, 'startRecording' | 'stopRecording' | 'cancelRecording' | 'isRecording'>
  jobQueueService: Pick<JobQueueService, 'enqueueCapture'>
}

export class RecordingOrchestrator {
  private readonly settingsService: Pick<SettingsService, 'getSettings'>
  private readonly captureService: Pick<CaptureService, 'startRecording' | 'stopRecording' | 'cancelRecording' | 'isRecording'>
  private readonly jobQueueService: Pick<JobQueueService, 'enqueueCapture'>

  constructor(dependencies?: Partial<RecordingDependencies>) {
    this.settingsService = dependencies?.settingsService ?? new SettingsService()
    this.captureService = dependencies?.captureService ?? new CaptureService()
    if (dependencies?.jobQueueService) {
      this.jobQueueService = dependencies.jobQueueService
    } else {
      const processingOrchestrator = new ProcessingOrchestrator()
      this.jobQueueService = new JobQueueService({
        processor: (job) => processingOrchestrator.process(job)
      })
    }
  }

  private assertRecordingAvailableInV1(): void {
    throw new Error('Recording via FFmpeg is not implemented in v1.')
  }

  async runCommand(command: RecordingCommand): Promise<CaptureResult | void> {
    if (command === 'startRecording') {
      this.assertRecordingAvailableInV1()
    }

    if (command === 'stopRecording') {
      this.assertRecordingAvailableInV1()
    }

    if (command === 'toggleRecording') {
      this.assertRecordingAvailableInV1()
    }

    if (command === 'cancelRecording') {
      this.assertRecordingAvailableInV1()
    }
  }
}
