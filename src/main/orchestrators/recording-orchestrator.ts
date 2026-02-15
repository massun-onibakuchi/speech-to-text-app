import type { RecordingCommand } from '../../shared/ipc'
import { CaptureService, type CaptureResult } from '../services/capture-service'
import { JobQueueService } from '../services/job-queue-service'
import { ProcessingOrchestrator } from './processing-orchestrator'

interface RecordingDependencies {
  captureService: Pick<CaptureService, 'startRecording' | 'stopRecording' | 'cancelRecording' | 'isRecording'>
  jobQueueService: Pick<JobQueueService, 'enqueueCapture'>
}

export class RecordingOrchestrator {
  private readonly captureService: Pick<CaptureService, 'startRecording' | 'stopRecording' | 'cancelRecording' | 'isRecording'>
  private readonly jobQueueService: Pick<JobQueueService, 'enqueueCapture'>

  constructor(dependencies?: Partial<RecordingDependencies>) {
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

  async runCommand(command: RecordingCommand): Promise<CaptureResult | void> {
    if (command === 'startRecording') {
      this.captureService.startRecording()
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
      this.captureService.startRecording()
      return
    }

    if (command === 'cancelRecording') {
      this.captureService.cancelRecording()
      return
    }
  }
}
