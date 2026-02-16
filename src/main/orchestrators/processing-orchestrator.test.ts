import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { QueueJobRecord } from '../services/job-queue-service'
import { ProcessingOrchestrator } from './processing-orchestrator'

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  transformation: {
    ...DEFAULT_SETTINGS.transformation,
    activePresetId: 'default',
    defaultPresetId: 'default',
    presets: [
      {
        ...DEFAULT_SETTINGS.transformation.presets[0],
        id: 'default',
        name: 'Default',
        systemPrompt: 'sys prompt',
        userPrompt: 'rewrite: {{input}}'
      }
    ]
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
  it('skips transformation when feature is disabled', async () => {
    const appendRecord = vi.fn()
    const transform = vi.fn()
    const settings: Settings = {
      ...baseSettings,
      transformation: {
        ...baseSettings.transformation,
        enabled: false
      }
    }

    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => settings },
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
      transformationService: { transform } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded' as const) } as any,
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('succeeded')
    expect(transform).not.toHaveBeenCalled()
    expect(appendRecord).toHaveBeenCalledTimes(1)
  })

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
    const transform = vi.fn(async () => ({ text: 'hello transformed', model: 'gemini-1.5-flash-8b' as const }))
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
      transformationService: { transform } as any,
      outputService: {
        applyOutput: vi.fn(async () => 'succeeded' as const)
      },
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('succeeded')
    expect(appendRecord).toHaveBeenCalledTimes(1)
    expect(transform).toHaveBeenCalledWith({
      text: 'hello',
      apiKey: 'key',
      model: 'gemini-1.5-flash-8b',
      prompt: {
        systemPrompt: 'sys prompt',
        userPrompt: 'rewrite: {{input}}'
      }
    })
  })

  it('returns transformation_failed when transformation throws', async () => {
    const appendRecord = vi.fn()
    const transform = vi.fn(async () => {
      throw new Error('gemini upstream failure')
    })
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
      transformationService: { transform } as any,
      outputService: {
        applyOutput: vi.fn(async () => 'succeeded' as const)
      },
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('transformation_failed')
    expect(transform).toHaveBeenCalledTimes(1)
    expect(appendRecord).toHaveBeenCalledTimes(1)
  })

  it('emits Groq split-tunnel diagnostics on transcription network failures', async () => {
    const appendRecord = vi.fn()
    const diagnoseGroqConnectivity = vi.fn(async () => ({
      reachable: false,
      provider: 'groq' as const,
      endpoint: 'https://api.groq.com',
      message: 'Failed to reach Groq endpoint.',
      guidance: 'If using VPN, configure split-tunnel allow for api.groq.com and retry.'
    }))
    const transcribe = vi.fn(async () => {
      throw new Error('fetch failed: getaddrinfo ENOTFOUND api.groq.com')
    })

    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      secretStore: {
        getApiKey: () => 'key'
      },
      transcriptionService: { transcribe } as any,
      transformationService: { transform: vi.fn() } as any,
      outputService: {
        applyOutput: vi.fn(async () => 'succeeded' as const)
      },
      historyService: { appendRecord },
      networkCompatibilityService: { diagnoseGroqConnectivity }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('transcription_failed')
    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'groq'
      })
    )
    expect(diagnoseGroqConnectivity).toHaveBeenCalledTimes(1)
    expect(appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'transcription_failed',
        failureDetail: expect.stringContaining('api.groq.com')
      })
    )
  })

  it('merges fallback model migration into latest settings snapshot', async () => {
    const appendRecord = vi.fn()
    const latestSettings: Settings = {
      ...baseSettings,
      shortcuts: {
        ...baseSettings.shortcuts,
        runTransform: 'Cmd+Shift+X'
      }
    }
    const getSettings = vi
      .fn()
      .mockReturnValueOnce(baseSettings)
      .mockReturnValueOnce(latestSettings)
    const setSettings = vi.fn((next: Settings) => next)

    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings, setSettings },
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
        transform: vi.fn(async () => ({ text: 'hello transformed', model: 'gemini-2.5-flash' as const }))
      },
      outputService: {
        applyOutput: vi.fn(async () => 'succeeded' as const)
      },
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('succeeded')
    expect(setSettings).toHaveBeenCalledTimes(1)
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        shortcuts: expect.objectContaining({
          runTransform: 'Cmd+Shift+X'
        }),
        transformation: expect.objectContaining({
          presets: expect.arrayContaining([
            expect.objectContaining({
              id: 'default',
              model: 'gemini-2.5-flash'
            })
          ])
        })
      })
    )
  })
})
