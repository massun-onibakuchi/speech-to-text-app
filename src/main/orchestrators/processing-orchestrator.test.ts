import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { QueueJobRecord } from '../services/job-queue-service'
import { ProcessingOrchestrator } from './processing-orchestrator'

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  transformation: {
    ...DEFAULT_SETTINGS.transformation,
    defaultPresetId: 'default',
    lastPickedPresetId: null,
    presets: [
      {
        ...DEFAULT_SETTINGS.transformation.presets[0],
        id: 'default',
        name: 'Default',
        systemPrompt: 'sys prompt',
        userPrompt: 'rewrite: {{input}}'
      }
    ]
  },
  output: {
    ...DEFAULT_SETTINGS.output,
    selectedTextSource: 'transformed'
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
  it('runs transformation when selected output source is transformed', async () => {
    const appendRecord = vi.fn()
    const transform = vi.fn(async () => ({ text: 'hello transformed', model: 'gemini-2.5-flash' as const }))
    const settings: Settings = {
      ...baseSettings,
      output: {
        ...baseSettings.output,
        selectedTextSource: 'transformed'
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
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null })) } as any,
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('succeeded')
    expect(transform).toHaveBeenCalledOnce()
    expect(appendRecord).toHaveBeenCalledTimes(1)
  })

  it('skips capture-time transformation when selected output source is transcript', async () => {
    const appendRecord = vi.fn()
    const transform = vi.fn()
    const settings: Settings = {
      ...baseSettings,
      output: {
        ...baseSettings.output,
        selectedTextSource: 'transcript'
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
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null })) } as any,
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('succeeded')
    expect(transform).not.toHaveBeenCalled()
    expect(appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptText: 'hello',
        transformedText: null,
        terminalStatus: 'succeeded'
      })
    )
  })

  it('returns transcription_failed when transcription key is missing', async () => {
    const appendRecord = vi.fn()
    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      secretStore: { getApiKey: () => null },
      transcriptionService: { transcribe: vi.fn() } as any,
      transformationService: { transform: vi.fn() } as any,
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded', message: null })) } as any,
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
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded', message: null })) } as any,
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
        transform: vi.fn(async () => ({ text: 'hello transformed', model: 'gemini-2.5-flash' as const }))
      },
      outputService: {
        applyOutputWithDetail: vi.fn(async () => ({
          status: 'output_failed_partial' as const,
          message: 'Paste automation failed after 2 attempts. Verify Accessibility permission and focused target app.'
        }))
      },
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('output_failed_partial')
    expect(appendRecord).toHaveBeenCalledTimes(1)
    expect(appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'output_failed_partial',
        failureDetail: expect.stringContaining('Paste automation failed after 2 attempts')
      })
    )
  })

  it('returns succeeded on full happy path', async () => {
    const appendRecord = vi.fn()
    const transform = vi.fn(async () => ({ text: 'hello transformed', model: 'gemini-2.5-flash' as const }))
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
        applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null }))
      },
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('succeeded')
    expect(appendRecord).toHaveBeenCalledTimes(1)
    expect(transform).toHaveBeenCalledWith({
      text: 'hello',
      apiKey: 'key',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      prompt: {
        systemPrompt: 'sys prompt',
        userPrompt: 'rewrite: {{input}}'
      }
    })
  })

  it('applies only the selected output text when transcript and transformed outputs are both configured', async () => {
    const appendRecord = vi.fn()
    const applyOutputWithDetail = vi.fn(async () => ({ status: 'succeeded' as const, message: null }))
    const settings: Settings = {
      ...baseSettings,
      output: {
        selectedTextSource: 'transformed',
        transcript: { copyToClipboard: true, pasteAtCursor: true },
        transformed: { copyToClipboard: true, pasteAtCursor: true }
      }
    }

    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => settings },
      secretStore: { getApiKey: () => 'key' },
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
      outputService: { applyOutputWithDetail } as any,
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)

    expect(result).toBe('succeeded')
    expect(applyOutputWithDetail).toHaveBeenCalledTimes(1)
    expect(applyOutputWithDetail).toHaveBeenCalledWith('hello transformed', settings.output.transformed)
    expect(appendRecord).toHaveBeenCalledTimes(1)
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
        applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null }))
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
        applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null }))
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

  it('uses provider default endpoints only for transcription and transformation calls', async () => {
    const appendRecord = vi.fn()
    const transcribe = vi.fn(async () => ({
      text: 'hello',
      provider: 'groq' as const,
      model: 'whisper-large-v3-turbo' as const
    }))
    const transform = vi.fn(async () => ({ text: 'hello transformed', model: 'gemini-2.5-flash' as const }))

    const orchestrator = new ProcessingOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      secretStore: {
        getApiKey: () => 'key'
      },
      transcriptionService: { transcribe },
      transformationService: { transform },
      outputService: {
        applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null }))
      },
      historyService: { appendRecord }
    })

    const result = await orchestrator.process(job)
    expect(result).toBe('succeeded')
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrlOverride: null
      })
    )
    expect(transform).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrlOverride: null
      })
    )
  })
})
