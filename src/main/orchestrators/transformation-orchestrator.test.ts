import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../shared/domain'
import { TransformationOrchestrator } from './transformation-orchestrator'

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

describe('TransformationOrchestrator', () => {
  it('returns error when clipboard is empty', async () => {
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => '  ' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform: vi.fn() } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded') } as any
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result.status).toBe('error')
    expect(result.message).toContain('Clipboard is empty')
  })

  it('returns transformed text on success path', async () => {
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => 'input text' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: {
        transform: vi.fn(async () => ({ text: 'transformed text', model: 'gemini-1.5-flash-8b' as const }))
      },
      outputService: { applyOutput: vi.fn(async () => 'succeeded' as const) }
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result).toEqual({ status: 'ok', message: 'transformed text' })
  })
})
