import { describe, expect, it, vi } from 'vitest'
import type { TransformationAdapter } from './transformation/types'
import { TransformationService } from './transformation-service'

describe('TransformationService', () => {
  it('dispatches to the adapter registered for the selected provider', async () => {
    const googleAdapter: TransformationAdapter = {
      transform: vi.fn(async () => ({
        text: 'x',
        provider: 'google' as const,
        model: 'gemini-2.5-flash' as const
      }))
    }

    const service = new TransformationService({ google: googleAdapter })
    const result = await service.transform({
      text: 'hello',
      provider: 'google' as const,
      apiKey: 'test',
      model: 'gemini-2.5-flash',
      prompt: {
        systemPrompt: 's',
        userPrompt: 'u'
      }
    })

    expect(googleAdapter.transform).toHaveBeenCalledTimes(1)
    expect(googleAdapter.transform).toHaveBeenCalledWith({
      text: 'hello',
      provider: 'google',
      apiKey: 'test',
      model: 'gemini-2.5-flash',
      prompt: {
        systemPrompt: 's',
        userPrompt: 'u'
      }
    })
    expect(result).toEqual({
      text: 'x',
      provider: 'google',
      model: 'gemini-2.5-flash'
    })
  })

  it('rejects providers that are outside the implemented transformation contract before adapter lookup', async () => {
    const googleAdapter: TransformationAdapter = {
      transform: vi.fn()
    }

    const service = new TransformationService({ google: googleAdapter })

    await expect(
      service.transform({
        text: 'hello',
        provider: 'openai-subscription' as any,
        apiKey: 'test',
        model: 'gpt-5.4-mini' as any,
        prompt: {
          systemPrompt: '',
          userPrompt: ''
        }
      })
    ).rejects.toThrow('Unsupported LLM provider: openai-subscription')

    expect(googleAdapter.transform).not.toHaveBeenCalled()
  })

  it('rejects models that are not allowed for the selected provider', async () => {
    const googleAdapter: TransformationAdapter = {
      transform: vi.fn()
    }

    const service = new TransformationService({ google: googleAdapter })

    await expect(
      service.transform({
        text: 'hello',
        provider: 'google',
        apiKey: 'test',
        model: 'gpt-5.4-mini' as any,
        prompt: {
          systemPrompt: 's',
          userPrompt: 'u'
        }
      })
    ).rejects.toThrow('Unsupported LLM model gpt-5.4-mini for provider google')

    expect(googleAdapter.transform).not.toHaveBeenCalled()
  })

  it('fails clearly when a supported provider has no registered adapter', async () => {
    const service = new TransformationService({})

    await expect(
      service.transform({
        text: 'hello',
        provider: 'google',
        apiKey: 'test',
        model: 'gemini-2.5-flash',
        prompt: {
          systemPrompt: 's',
          userPrompt: 'u'
        }
      })
    ).rejects.toThrow('No transformation adapter registered for provider google')
  })

  it('dispatches to the Ollama adapter for supported local models', async () => {
    const ollamaAdapter: TransformationAdapter = {
      transform: vi.fn(async () => ({
        text: 'local result',
        provider: 'ollama' as const,
        model: 'qwen3.5:2b' as const
      }))
    }

    const service = new TransformationService({ ollama: ollamaAdapter })
    const result = await service.transform({
      text: 'hello',
      provider: 'ollama',
      apiKey: '',
      model: 'qwen3.5:2b',
      prompt: {
        systemPrompt: 's',
        userPrompt: 'u'
      }
    })

    expect(ollamaAdapter.transform).toHaveBeenCalledWith({
      text: 'hello',
      provider: 'ollama',
      apiKey: '',
      model: 'qwen3.5:2b',
      prompt: {
        systemPrompt: 's',
        userPrompt: 'u'
      }
    })
    expect(result).toEqual({
      text: 'local result',
      provider: 'ollama',
      model: 'qwen3.5:2b'
    })
  })
})
