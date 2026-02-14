import type { RecordingCommand } from '../../shared/ipc'
import { CaptureService, type CaptureResult } from '../services/capture-service'
import { JobQueueService } from '../services/job-queue-service'
import { ProcessingOrchestrator } from './processing-orchestrator'

export class RecordingOrchestrator {
  private readonly captureService = new CaptureService()
  private readonly processingOrchestrator = new ProcessingOrchestrator()
  private readonly jobQueueService = new JobQueueService({
    processor: (job) => this.processingOrchestrator.process(job)
  })

  async runCommand(command: RecordingCommand): Promise<CaptureResult | void> {
    if (command === 'startRecording') {
      this.captureService.startRecording()
      return
    }

    if (command === 'stopRecording') {
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

    this.captureService.cancelRecording()
  }
}
