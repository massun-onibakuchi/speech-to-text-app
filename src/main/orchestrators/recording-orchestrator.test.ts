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
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub('Built-in Mic')
    })

    expect(orchestrator.runCommand('startRecording')).toEqual({
      command: 'startRecording',
      preferredDeviceId: 'Built-in Mic'
    })
  })

  it('dispatches toggle command with preferred device from settings', () => {
    const orchestrator = new RecordingOrchestrator({
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub('External USB Mic')
    })

    expect(orchestrator.runCommand('toggleRecording')).toEqual({
      command: 'toggleRecording',
      preferredDeviceId: 'External USB Mic'
    })
  })

  it('omits preferred device for system default selection', () => {
    const orchestrator = new RecordingOrchestrator({
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub('system_default')
    })

    expect(orchestrator.runCommand('startRecording')).toEqual({
      command: 'startRecording',
      preferredDeviceId: undefined
    })
  })

  it('returns default system input source', () => {
    const orchestrator = new RecordingOrchestrator({
      jobQueueService: { enqueueCapture: vi.fn() } as any,
      settingsService: settingsServiceStub()
    })

    expect(orchestrator.getAudioInputSources()).toEqual([{ id: 'system_default', label: 'System Default Microphone' }])
  })

  it('writes submitted audio and enqueues capture', () => {
    const root = mkdtempSync(join(tmpdir(), 'recording-orchestrator-'))
    tempDirs.push(root)
    vi.mocked(app.getPath).mockReturnValue(root)
    const enqueueCapture = vi.fn()

    const orchestrator = new RecordingOrchestrator({
      jobQueueService: { enqueueCapture } as any,
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
    expect(enqueueCapture).toHaveBeenCalledWith(result)
  })
})
