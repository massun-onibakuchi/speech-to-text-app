// Where: src/main/services/transformation/ollama-transformation-adapter.test.ts
// What:  Unit tests for the Ollama transformation adapter.
// Why:   Guards the adapter boundary so the provider registry can rely on one
//        narrow runtime call instead of duplicating prompt wiring elsewhere.

import { describe, expect, it, vi } from 'vitest'
import { OllamaTransformationAdapter } from './ollama-transformation-adapter'

describe('OllamaTransformationAdapter', () => {
  it('routes shared transformation input through the local runtime', async () => {
    const runtime = {
      transform: vi.fn(async () => ({
        transformedText: 'normalized result',
        modelId: 'qwen3.5:4b' as const
      }))
    }

    const adapter = new OllamaTransformationAdapter(runtime)
    const result = await adapter.transform({
      text: 'source text',
      provider: 'ollama',
      apiKey: '',
      model: 'qwen3.5:4b',
      prompt: {
        systemPrompt: 'Keep it short.',
        userPrompt: 'Rewrite this.\n<input_text>{{text}}</input_text>'
      }
    })

    expect(runtime.transform).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'source text',
        systemPrompt: 'Keep it short.',
        userPrompt: 'Rewrite this.\n<input_text>{{text}}</input_text>'
      }),
      'qwen3.5:4b'
    )
    expect(result).toEqual({
      text: 'normalized result',
      provider: 'ollama',
      model: 'qwen3.5:4b'
    })
  })
})
