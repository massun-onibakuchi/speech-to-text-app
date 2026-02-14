import { describe, expect, it, vi } from 'vitest'
import type { TranscriptionAdapter } from './transcription/types'
import { TranscriptionService } from './transcription-service'

describe('TranscriptionService', () => {
  it('rejects models not in provider allowlist', async () => {
    const groqAdapter: TranscriptionAdapter = {
      transcribe: vi.fn()
    }

    const service = new TranscriptionService({ groq: groqAdapter })

    await expect(
      service.transcribe({
        provider: 'groq',
        model: 'scribe_v2',
        apiKey: 'test',
        audioFilePath: '/tmp/audio.wav'
      })
    ).rejects.toThrow('not allowed')

    expect(groqAdapter.transcribe).not.toHaveBeenCalled()
  })

  it('dispatches to provider adapter when model is allowed', async () => {
    const groqAdapter: TranscriptionAdapter = {
      transcribe: vi.fn(async () => ({
        text: 'hello world',
        provider: 'groq' as const,
        model: 'whisper-large-v3-turbo' as const
      }))
    }

    const service = new TranscriptionService({ groq: groqAdapter })

    const result = await service.transcribe({
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      apiKey: 'test',
      audioFilePath: '/tmp/audio.wav'
    })

    expect(groqAdapter.transcribe).toHaveBeenCalledTimes(1)
    expect(result.text).toBe('hello world')
  })
})
