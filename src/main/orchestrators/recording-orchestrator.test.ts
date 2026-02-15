import { describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '../services/capture-service'
import { RecordingOrchestrator } from './recording-orchestrator'

const captureResult: CaptureResult = {
  jobId: 'job-1',
  audioFilePath: '/tmp/audio.wav',
  capturedAt: new Date().toISOString()
}

describe('RecordingOrchestrator', () => {
  const settingsServiceStub = (device = 'system_default') =>
    ({
      getSettings: vi.fn(() => ({
        recording: { device }
      }))
    }) as any

  it('starts recording on start command', async () => {
    const startRecording = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        listAudioSources: vi.fn(() => []),
        startRecording,
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub()
    })

    await orchestrator.runCommand('startRecording')
    expect(startRecording).toHaveBeenCalledWith(undefined)
  })

  it('stops recording and enqueues capture when currently recording', async () => {
    const stopRecording = vi.fn(async () => captureResult)
    const enqueueCapture = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        listAudioSources: vi.fn(() => []),
        startRecording: vi.fn(),
        stopRecording,
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => true)
      } as any,
      jobQueueService: { enqueueCapture } as any,
      settingsService: settingsServiceStub()
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
        listAudioSources: vi.fn(() => []),
        startRecording: vi.fn(),
        stopRecording,
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture } as any,
      settingsService: settingsServiceStub()
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
        listAudioSources: vi.fn(() => []),
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
      jobQueueService: { enqueueCapture } as any,
      settingsService: settingsServiceStub()
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
        listAudioSources: vi.fn(() => []),
        startRecording: vi.fn(),
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording,
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub()
    })

    await orchestrator.runCommand('cancelRecording')
    expect(cancelRecording).toHaveBeenCalledTimes(1)
  })

  it('uses selected recording device from settings when starting', async () => {
    const startRecording = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        listAudioSources: vi.fn(() => []),
        startRecording,
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub('External USB Mic')
    })

    await orchestrator.runCommand('startRecording')
    expect(startRecording).toHaveBeenCalledWith('External USB Mic')
  })

  it('returns audio input sources from capture service', () => {
    const listAudioSources = vi.fn(() => [
      { id: 'system_default', label: 'System Default Microphone' },
      { id: 'External USB Mic', label: 'External USB Mic' }
    ])
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        listAudioSources,
        startRecording: vi.fn(),
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub()
    })

    expect(orchestrator.getAudioInputSources()).toEqual([
      { id: 'system_default', label: 'System Default Microphone' },
      { id: 'External USB Mic', label: 'External USB Mic' }
    ])
    expect(listAudioSources).toHaveBeenCalledTimes(1)
  })

  it('uses selected recording device when toggle starts from idle', async () => {
    const startRecording = vi.fn()
    const orchestrator = new RecordingOrchestrator({
      captureService: {
        listAudioSources: vi.fn(() => []),
        startRecording,
        stopRecording: vi.fn(async () => captureResult),
        cancelRecording: vi.fn(),
        isRecording: vi.fn(() => false)
      } as any,
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub('MacBook Pro Microphone')
    })

    await orchestrator.runCommand('toggleRecording')
    expect(startRecording).toHaveBeenCalledWith('MacBook Pro Microphone')
  })
})
