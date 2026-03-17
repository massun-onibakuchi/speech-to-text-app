// Where: src/main/orchestrators/transformation-execution.test.ts
// What:  Tests for the shared executeTransformation helper used by both pipelines.
// Why:   Lock the common failure contract so capture and standalone transform
//        flows cannot drift in prompt safety, preflight, or empty-output handling.

import { describe, expect, it, vi } from 'vitest'
import { executeTransformation } from './transformation-execution'

describe('executeTransformation', () => {
  it('returns transformed text when the prompt, preflight, and adapter call succeed', async () => {
    const result = await executeTransformation({
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      transformationService: {
        transform: vi.fn(async () => ({
          text: 'transformed output',
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
})
