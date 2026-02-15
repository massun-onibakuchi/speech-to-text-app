import { describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '../services/capture-service'
import { RecordingOrchestrator } from './recording-orchestrator'

const captureResult: CaptureResult = {
  jobId: 'job-1',
  audioFilePath: '/tmp/audio.wav',
  capturedAt: new Date().toISOString()
}

describe('RecordingOrchestrator', () => {
  it('starts recording on start command', async () => {
    const startRecording = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        startRecording,
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any
    })

    await orchestrator.runCommand('startRecording')
    expect(startRecording).toHaveBeenCalledTimes(1)
  })

  it('stops recording and enqueues capture when currently recording', async () => {
    const stopRecording = vi.fn(async () => captureResult)
    const enqueueCapture = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        startRecording: vi.fn(),
        stopRecording,
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => true)
      } as any,
      jobQueueService: { enqueueCapture } as any
    })

    const result = await orchestrator.runCommand('stopRecording')
    expect(stopRecording).toHaveBeenCalledTimes(1)
    expect(enqueueCapture).toHaveBeenCalledWith(captureResult)
    expect(result).toEqual(captureResult)
  })

  it('no-ops stopRecording when capture is not active', async () => {
    const stopRecording = vi.fn(async () => captureResult)
    const enqueueCapture = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        startRecording: vi.fn(),
        stopRecording,
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture } as any
    })

    const result = await orchestrator.runCommand('stopRecording')
    expect(stopRecording).not.toHaveBeenCalled()
    expect(enqueueCapture).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('toggle starts when idle and stops when recording', async () => {
    const startRecording = vi.fn()
    const stopRecording = vi.fn(async () => captureResult)
    const enqueueCapture = vi.fn()
    let recording = false

    const orchestrator = new RecordingOrchestrator({
      captureService: {
        startRecording: vi.fn(() => {
          startRecording()
          recording = true
        }),
        stopRecording: vi.fn(async () => {
          recording = false
          return stopRecording()
        }),
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => recording)
      } as any,
      jobQueueService: { enqueueCapture } as any
    })

    await orchestrator.runCommand('toggleRecording')
    await orchestrator.runCommand('toggleRecording')

    expect(startRecording).toHaveBeenCalledTimes(1)
    expect(stopRecording).toHaveBeenCalledTimes(1)
    expect(enqueueCapture).toHaveBeenCalledWith(captureResult)
  })

  it('cancels recording on cancel command', async () => {
    const cancelRecording = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        startRecording: vi.fn(),
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording,
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any
    })

    await orchestrator.runCommand('cancelRecording')
    expect(cancelRecording).toHaveBeenCalledTimes(1)
  })
})
