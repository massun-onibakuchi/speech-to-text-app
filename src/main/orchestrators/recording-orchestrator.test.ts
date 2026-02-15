import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { CaptureResult } from '../services/capture-service'
import { RecordingOrchestrator } from './recording-orchestrator'

const captureResult: CaptureResult = {
  jobId: 'job-1',
  audioFilePath: '/tmp/audio.wav',
  capturedAt: new Date().toISOString()
}

const createSettings = (ffmpegEnabled: boolean): Settings => ({
  ...DEFAULT_SETTINGS,
  recording: {
    ...DEFAULT_SETTINGS.recording,
    ffmpegEnabled
  }
})

describe('RecordingOrchestrator', () => {
  it('blocks startRecording in v1 with unsupported guidance', async () => {
    const startRecording = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      settingsService: { getSettings: () => createSettings(false) },
      captureService: {
        startRecording,
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any
    })

    await expect(orchestrator.runCommand('startRecording')).rejects.toThrow('not implemented in v1')
    expect(startRecording).not.toHaveBeenCalled()
  })

  it('blocks toggleRecording in v1', async () => {
    const startRecording = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      settingsService: { getSettings: () => createSettings(false) },
      captureService: {
        startRecording,
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any
    })

    await expect(orchestrator.runCommand('toggleRecording')).rejects.toThrow('not implemented in v1')
    expect(startRecording).not.toHaveBeenCalled()
  })

  it('blocks stopRecording in v1', async () => {
    const stopRecording = vi.fn(async () => captureResult)
    const enqueueCapture = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      settingsService: { getSettings: () => createSettings(false) },
      captureService: {
        startRecording: vi.fn(),
        stopRecording,
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => true)
      } as any,
      jobQueueService: { enqueueCapture } as any
    })

    await expect(orchestrator.runCommand('stopRecording')).rejects.toThrow('not implemented in v1')
    expect(stopRecording).not.toHaveBeenCalled()
    expect(enqueueCapture).not.toHaveBeenCalled()
  })

  it('blocks cancelRecording in v1', async () => {
    const cancelRecording = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      settingsService: { getSettings: () => createSettings(true) },
      captureService: {
        startRecording: vi.fn(),
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording,
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any
    })

    await expect(orchestrator.runCommand('cancelRecording')).rejects.toThrow('not implemented in v1')
    expect(cancelRecording).not.toHaveBeenCalled()
  })
})
