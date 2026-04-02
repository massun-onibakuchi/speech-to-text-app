// Where: src/main/orchestrators/transformation-execution.test.ts
// What:  Tests for the shared executeTransformation helper used by both pipelines.
// Why:   Lock the common failure contract so capture and standalone transform
//        flows cannot drift in prompt safety, preflight, or empty-output handling.

import { describe, expect, it, vi } from 'vitest'
import type { LlmProviderStatusSnapshot } from '../../shared/ipc'
import { LocalLlmRuntimeError } from '../services/local-llm/types'
import { executeTransformation } from './transformation-execution'

const buildLlmProviderStatusSnapshot = (overrides?: Partial<LlmProviderStatusSnapshot['ollama']>): LlmProviderStatusSnapshot => ({
  google: {
    provider: 'google',
    credential: { kind: 'api_key', configured: false },
    status: { kind: 'missing_credentials', message: 'Add a Google API key.' },
    models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', available: false }]
  },
  ollama: {
    provider: 'ollama',
    credential: { kind: 'local' },
    status: { kind: 'ready', message: 'Ollama is available.' },
    models: [{ id: 'qwen3.5:2b', label: 'Qwen 3.5 2B', available: true }],
    ...overrides
  },
  'openai-subscription': {
    provider: 'openai-subscription',
    credential: { kind: 'oauth', configured: false },
    status: { kind: 'oauth_required', message: 'Browser sign-in is required.' },
    models: [{ id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', available: false }]
  }
})

describe('executeTransformation', () => {
  it('returns transformed text when the prompt, preflight, and adapter call succeed', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      transformationService: {
        transform: vi.fn(async () => ({
          text: 'transformed output',
          provider: 'google' as const,
          model: 'gemini-2.5-flash' as const
        }))
      },
      text: 'raw text',
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: 'sys',
      userPrompt: '<input_text>{{text}}</input_text>',
      logEvent: 'test.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })

    expect(result).toEqual({
      ok: true,
      text: 'transformed output'
    })
  })

  it('returns a preflight failure when the prompt template is unsafe', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      transformationService: {
        transform: vi.fn(async () => ({
          text: 'ignored',
          provider: 'google' as const,
          model: 'gemini-2.5-flash' as const
        }))
      },
      text: 'raw text',
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: '',
      userPrompt: 'Rewrite: {{text}}',
      logEvent: 'test.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })

    expect(result).toEqual({
      ok: false,
      failureDetail: expect.stringContaining('Unsafe user prompt template'),
      failureCategory: 'preflight'
    })
  })

  it('returns a preflight failure when the API key is missing', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => null) },
      transformationService: {
        transform: vi.fn(async () => ({
          text: 'ignored',
          provider: 'google' as const,
          model: 'gemini-2.5-flash' as const
        }))
      },
      text: 'raw text',
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: '',
      userPrompt: '<input_text>{{text}}</input_text>',
      logEvent: 'test.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })

    expect(result).toEqual({
      ok: false,
      failureDetail: 'Missing google API key. Add it in Settings → API Keys.',
      failureCategory: 'preflight'
    })
  })

  it('returns an unknown failure when the model output is empty after trimming', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      transformationService: {
        transform: vi.fn(async () => ({
          text: ' \n\t ',
          provider: 'google' as const,
          model: 'gemini-2.5-flash' as const
        }))
      },
      text: 'raw text',
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: '',
      userPrompt: '<input_text>{{text}}</input_text>',
      logEvent: 'test.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })

    expect(result).toEqual({
      ok: false,
      failureDetail: 'Transformation returned empty text.',
      failureCategory: 'unknown'
    })
  })

  it('uses the caller-provided fallback detail for non-Error throws', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      transformationService: {
        transform: vi.fn(async () => {
          throw 'rate limited'
        })
      },
      text: 'raw text',
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: '',
      userPrompt: '<input_text>{{text}}</input_text>',
      logEvent: 'test.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })

    expect(result).toEqual({
      ok: false,
      failureDetail: 'Unknown error',
      failureCategory: 'unknown'
    })
  })

  it('trims blank Error messages and falls back to the caller-provided unknown detail', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      transformationService: {
        transform: vi.fn(async () => {
          throw new Error('   ')
        })
      },
      text: 'raw text',
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      systemPrompt: '',
      userPrompt: '<input_text>{{text}}</input_text>',
      logEvent: 'test.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })

    expect(result).toEqual({
      ok: false,
      failureDetail: 'Unknown error',
      failureCategory: 'unknown'
    })
  })

  it('blocks Ollama transformation when readiness says the selected model is unavailable', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => null) },
      transformationService: {
        transform: vi.fn(async () => ({
          text: 'ignored',
          provider: 'ollama' as const,
          model: 'qwen3.5:2b' as const
        }))
      },
      llmProviderReadinessService: {
        getSnapshot: vi.fn(async () =>
          buildLlmProviderStatusSnapshot({
            models: [{ id: 'qwen3.5:2b', label: 'Qwen 3.5 2B', available: false }]
          })
        )
      },
      text: 'raw text',
      provider: 'ollama',
      model: 'qwen3.5:2b',
      baseUrlOverride: null,
      systemPrompt: 'sys',
      userPrompt: '<input_text>{{text}}</input_text>',
      logEvent: 'test.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })

    expect(result).toEqual({
      ok: false,
      failureDetail:
        'Selected Ollama model qwen3.5:2b is not installed. Install it in Ollama or choose an available model.',
      failureCategory: 'preflight'
    })
  })

  it('classifies Ollama runtime connection failures as network errors', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => null) },
      transformationService: {
        transform: vi.fn(async () => {
          throw new LocalLlmRuntimeError('server_unreachable', 'connect ECONNREFUSED 127.0.0.1:11434')
        })
      },
      llmProviderReadinessService: {
        getSnapshot: vi.fn(async () => buildLlmProviderStatusSnapshot())
      },
      text: 'raw text',
      provider: 'ollama',
      model: 'qwen3.5:2b',
      baseUrlOverride: null,
      systemPrompt: 'sys',
      userPrompt: '<input_text>{{text}}</input_text>',
      logEvent: 'test.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })

    expect(result).toEqual({
      ok: false,
      failureDetail: 'connect ECONNREFUSED 127.0.0.1:11434',
      failureCategory: 'network'
    })
  })
})
