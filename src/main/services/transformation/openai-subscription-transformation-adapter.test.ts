// Where: src/main/services/transformation/openai-subscription-transformation-adapter.test.ts
// What:  Unit tests for the Codex CLI-backed OpenAI subscription transformation adapter.
// Why:   Lock the bounded prompt contract and credential expectations for ChatGPT-plan execution.

import { describe, expect, it, vi } from 'vitest'
import { OpenAiSubscriptionTransformationAdapter } from './openai-subscription-transformation-adapter'

describe('OpenAiSubscriptionTransformationAdapter', () => {
  it('delegates execution to Codex CLI with a bounded prompt contract', async () => {
    const runTransformation = vi.fn(async () => 'transformed output')
    const adapter = new OpenAiSubscriptionTransformationAdapter({
      codexCliService: { runTransformation }
    })
    const result = await adapter.transform({
      text: 'input text',
      provider: 'openai-subscription',
      credential: { kind: 'cli' },
      model: 'gpt-5.4-mini',
      prompt: {
        systemPrompt: 'Rewrite cleanly.',
        userPrompt: 'Rewrite this.\n<input_text>{{text}}</input_text>'
      }
    })

    expect(result).toEqual({
      text: 'transformed output',
      provider: 'openai-subscription',
      model: 'gpt-5.4-mini'
    })
    expect(runTransformation).toHaveBeenCalledWith({
      model: 'gpt-5.4-mini',
      prompt: expect.stringContaining('Rewrite cleanly.')
    })
    expect(runTransformation).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('<input_text>input text</input_text>')
      })
    )
  })

  it('rejects non-cli credentials before invoking Codex CLI', async () => {
    const runTransformation = vi.fn()
    const adapter = new OpenAiSubscriptionTransformationAdapter({
      codexCliService: { runTransformation }
    })
    await expect(
      adapter.transform({
        text: 'input text',
        provider: 'openai-subscription',
        credential: { kind: 'local' },
        model: 'gpt-5.4-mini',
        prompt: {
          systemPrompt: '',
          userPrompt: '<input_text>{{text}}</input_text>'
        }
      })
    ).rejects.toThrow('OpenAI subscription transformation requires Codex CLI readiness.')

    expect(runTransformation).not.toHaveBeenCalled()
  })

  it('rejects unsupported OpenAI subscription models', async () => {
    const runTransformation = vi.fn()
    const adapter = new OpenAiSubscriptionTransformationAdapter({
      codexCliService: { runTransformation }
    })

    await expect(
      adapter.transform({
        text: 'input text',
        provider: 'openai-subscription',
        credential: { kind: 'cli' },
        model: 'gemini-2.5-flash' as any,
        prompt: {
          systemPrompt: '',
          userPrompt: '<input_text>{{text}}</input_text>'
        }
      })
    ).rejects.toThrow('Unsupported OpenAI subscription model: gemini-2.5-flash')

    expect(runTransformation).not.toHaveBeenCalled()
  })
})
