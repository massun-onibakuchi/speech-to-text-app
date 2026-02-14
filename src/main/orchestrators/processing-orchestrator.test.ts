import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../shared/domain'
import type { QueueJobRecord } from '../services/job-queue-service'
import { ProcessingOrchestrator } from './processing-orchestrator'

const baseSettings: Settings = {
  recording: {
    mode: 'manual',
    method: 'ffmpeg',
    sampleRateHz: 16000,
    channels: 1
  },
  transcription: {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
    outputLanguage: 'auto',
    temperature: 0,
    networkRetries: 2
  },
  transformation: {
    enabled: true,
    provider: 'google',
    model: 'gemini-1.5-flash-8b',
    autoRunDefaultTransform: false
  },
  output: {
    transcript: {
      copyToClipboard: true,
      pasteAtCursor: false
    },
    transformed: {
      copyToClipboard: true,
      pasteAtCursor: false
    }
  }
}

const job: QueueJobRecord = {
  jobId: 'job-1',
  audioFilePath: '/tmp/audio.wav',
  capturedAt: new Date().toISOString(),
  processingState: 'queued',
  terminalStatus: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

describe('ProcessingOrchestrator', () => {
  it('returns transcription_failed when transcription key is missing', async () => {
    const appendRecord = vi.fn()
    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      secretStore: { getApiKey: () => null },
      transcriptionService: { transcribe: vi.fn() } as any,
      transformationService: { transform: vi.fn() } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded') } as any,
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('transcription_failed')
    expect(appendRecord).toHaveBeenCalledTimes(1)
  })

  it('returns transformation_failed when transform key is missing', async () => {
    const appendRecord = vi.fn()
    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      secretStore: {
        getApiKey: (provider: 'groq' | 'elevenlabs' | 'google') => (provider === 'groq' ? 'g-key' : null)
      },
      transcriptionService: {
        transcribe: vi.fn(async () => ({
          text: 'hello',
          provider: 'groq' as const,
          model: 'whisper-large-v3-turbo' as const
        }))
      },
      transformationService: { transform: vi.fn() } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded') } as any,
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('transformation_failed')
    expect(appendRecord).toHaveBeenCalledTimes(1)
  })

  it('returns output_failed_partial when output application partially fails', async () => {
    const appendRecord = vi.fn()
    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      secretStore: {
        getApiKey: () => 'key'
      },
      transcriptionService: {
        transcribe: vi.fn(async () => ({
          text: 'hello',
          provider: 'groq' as const,
          model: 'whisper-large-v3-turbo' as const
        }))
      },
      transformationService: {
        transform: vi.fn(async () => ({ text: 'hello transformed', model: 'gemini-1.5-flash-8b' as const }))
      },
      outputService: {
        applyOutput: vi.fn(async () => 'output_failed_partial' as const)
      },
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('output_failed_partial')
    expect(appendRecord).toHaveBeenCalledTimes(1)
  })

  it('returns succeeded on full happy path', async () => {
    const appendRecord = vi.fn()
    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      secretStore: {
        getApiKey: () => 'key'
      },
      transcriptionService: {
        transcribe: vi.fn(async () => ({
          text: 'hello',
          provider: 'groq' as const,
          model: 'whisper-large-v3-turbo' as const
        }))
      },
      transformationService: {
        transform: vi.fn(async () => ({ text: 'hello transformed', model: 'gemini-1.5-flash-8b' as const }))
      },
      outputService: {
        applyOutput: vi.fn(async () => 'succeeded' as const)
      },
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('succeeded')
    expect(appendRecord).toHaveBeenCalledTimes(1)
  })
})
