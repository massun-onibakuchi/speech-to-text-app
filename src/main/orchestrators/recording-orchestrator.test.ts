// Where: src/main/orchestrators/recording-orchestrator.test.ts
// What:  Tests for RecordingOrchestrator — recording commands and audio persistence.
// Why:   Verify command dispatch with preferred device and audio file persistence.
//        Phase 2A: RecordingOrchestrator no longer enqueues to JobQueueService;
//        enqueue is handled by CommandRouter via CaptureQueue.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecordingOrchestrator } from './recording-orchestrator'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tmpdir())
  }
}))

describe('RecordingOrchestrator', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  const settingsServiceStub = (device = 'system_default') =>
    ({
      getSettings: vi.fn(() => ({
        recording: { device }
      }))
    }) as any

  it('dispatches start command with preferred device from settings', () => {
    const orchestrator = new RecordingOrchestrator({
      settingsService: settingsServiceStub('Built-in Mic')
    })

    expect(orchestrator.runCommand('startRecording')).toEqual({
      command: 'startRecording',
      preferredDeviceId: 'Built-in Mic'
    })
  })

  it('dispatches toggle command with preferred device from settings', () => {
    const orchestrator = new RecordingOrchestrator({
      settingsService: settingsServiceStub('External USB Mic')
    })

    expect(orchestrator.runCommand('toggleRecording')).toEqual({
      command: 'toggleRecording',
      preferredDeviceId: 'External USB Mic'
    })
  })

  it('omits preferred device for system default selection', () => {
    const orchestrator = new RecordingOrchestrator({
      settingsService: settingsServiceStub('system_default')
    })

    expect(orchestrator.runCommand('startRecording')).toEqual({
      command: 'startRecording',
      preferredDeviceId: undefined
    })
  })

  it('returns default system input source', async () => {
    const orchestrator = new RecordingOrchestrator({
      settingsService: settingsServiceStub(),
      listAudioInputSources: async () => []
    })

    await expect(orchestrator.getAudioInputSources()).resolves.toEqual([
      { id: 'system_default', label: 'System Default Microphone' }
    ])
  })

  it('returns discovered input sources plus system default', async () => {
    const listAudioInputSources = vi.fn(async () => [
      { id: 'mic-1', label: 'Desk Mic' },
      { id: 'mic-2', label: 'USB Mic' }
    ])
    const orchestrator = new RecordingOrchestrator({
      settingsService: settingsServiceStub(),
      listAudioInputSources
    })

    await expect(orchestrator.getAudioInputSources()).resolves.toEqual([
      { id: 'system_default', label: 'System Default Microphone' },
      { id: 'mic-1', label: 'Desk Mic' },
      { id: 'mic-2', label: 'USB Mic' }
    ])

    // Discovery is cached for a short TTL to avoid repeated process spawning.
    await orchestrator.getAudioInputSources()
    expect(listAudioInputSources).toHaveBeenCalledTimes(1)
  })

  it('retries discovery after transient source-list failure instead of caching empty fallback forever', async () => {
    const listAudioInputSources = vi
      .fn<() => Promise<Array<{ id: string; label: string }>>>()
      .mockRejectedValueOnce(new Error('temporary system_profiler timeout'))
      .mockResolvedValueOnce([{ id: 'mic-1', label: 'Desk Mic' }])

    const orchestrator = new RecordingOrchestrator({
      settingsService: settingsServiceStub(),
      listAudioInputSources
    })

    await expect(orchestrator.getAudioInputSources()).resolves.toEqual([
      { id: 'system_default', label: 'System Default Microphone' }
    ])
    await expect(orchestrator.getAudioInputSources()).resolves.toEqual([
      { id: 'system_default', label: 'System Default Microphone' },
      { id: 'mic-1', label: 'Desk Mic' }
    ])
    expect(listAudioInputSources).toHaveBeenCalledTimes(2)
  })

  it('refreshes cached device discovery after cache TTL elapses', async () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValueOnce(10_000).mockReturnValueOnce(10_100).mockReturnValueOnce(45_000)
    const listAudioInputSources = vi
      .fn<() => Promise<Array<{ id: string; label: string }>>>()
      .mockResolvedValueOnce([{ id: 'mic-1', label: 'Desk Mic' }])
      .mockResolvedValueOnce([{ id: 'mic-2', label: 'USB Mic' }])

    const orchestrator = new RecordingOrchestrator({
      settingsService: settingsServiceStub(),
      listAudioInputSources
    })

    await expect(orchestrator.getAudioInputSources()).resolves.toEqual([
      { id: 'system_default', label: 'System Default Microphone' },
      { id: 'mic-1', label: 'Desk Mic' }
    ])
    await expect(orchestrator.getAudioInputSources()).resolves.toEqual([
      { id: 'system_default', label: 'System Default Microphone' },
      { id: 'mic-1', label: 'Desk Mic' }
    ])
    await expect(orchestrator.getAudioInputSources()).resolves.toEqual([
      { id: 'system_default', label: 'System Default Microphone' },
      { id: 'mic-2', label: 'USB Mic' }
    ])
    expect(listAudioInputSources).toHaveBeenCalledTimes(2)
    nowSpy.mockRestore()
  })

  it('writes submitted audio to disk and returns CaptureResult', () => {
    const root = mkdtempSync(join(tmpdir(), 'recording-orchestrator-'))
    tempDirs.push(root)
    vi.mocked(app.getPath).mockReturnValue(root)

    const orchestrator = new RecordingOrchestrator({
      settingsService: settingsServiceStub()
    })

    const payload = {
      data: new Uint8Array([1, 2, 3, 4]),
      mimeType: 'audio/webm',
      capturedAt: '2026-02-16T00:00:00.000Z'
    }

    const result = orchestrator.submitRecordedAudio(payload)
    expect(result.audioFilePath.endsWith('.webm')).toBe(true)
    expect(readFileSync(result.audioFilePath)).toEqual(Buffer.from(payload.data))
    expect(result.jobId).toBeTruthy()
    expect(result.capturedAt).toBe('2026-02-16T00:00:00.000Z')
  })
})
