// Where: src/main/orchestrators/transform-pipeline.test.ts
// What:  Tests for createTransformProcessor — the snapshot-driven transform pipeline.
// Why:   Verify transformation + output stages, failure modes, and
//        Phase 2B preflight vs post-network error distinction.

import { describe, expect, it, vi } from 'vitest'
import { createTransformProcessor, type TransformPipelineDeps } from './transform-pipeline'
import { buildTransformationRequestSnapshot } from '../test-support/factories'
import type { TerminalJobStatus } from '../../shared/domain'

function makeDeps(overrides?: Partial<TransformPipelineDeps>): TransformPipelineDeps {
  return {
    secretStore: overrides?.secretStore ?? { getApiKey: vi.fn(() => 'test-key') },
    transformationService: overrides?.transformationService ?? {
      transform: vi.fn(async () => ({
        text: 'transformed output',
        model: 'gemini-2.5-flash' as const
      }))
    },
    outputService: overrides?.outputService ?? {
      applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as TerminalJobStatus, message: null }))
    }
  }
}

describe('createTransformProcessor', () => {
  it('happy path: transform + output → ok', async () => {
    const deps = makeDeps()
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot({ sourceText: 'raw text' })

    const result = await processor(snapshot)

    expect(result).toEqual({ status: 'ok', message: 'transformed output' })
    expect(deps.transformationService.transform).toHaveBeenCalledWith({
      text: 'raw text',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      prompt: { systemPrompt: '', userPrompt: '' }
    })
    expect(deps.outputService.applyOutputWithDetail).toHaveBeenCalledOnce()
  })

  // --- Phase 2B: preflight guard tests ---

  it('returns error with failureCategory=preflight when API key is missing', async () => {
    const deps = makeDeps({
      secretStore: { getApiKey: vi.fn(() => null) }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.message).toContain('API key')
    expect(result.message).toContain('Settings')
    expect(result.failureCategory).toBe('preflight')
    expect(deps.transformationService.transform).not.toHaveBeenCalled()
  })

  it('returns error with failureCategory=preflight when LLM model is unsupported', async () => {
    const deps = makeDeps()
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot({
      // Bypass TypeScript to test runtime preflight rejection of deprecated model.
      model: 'gemini-1.5-flash-8b' as any
    })

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.failureCategory).toBe('preflight')
    expect(result.message).toContain('Unsupported LLM model')
    expect(deps.transformationService.transform).not.toHaveBeenCalled()
  })

  // --- Phase 2B: post-network error classification tests ---

  it('returns error with failureCategory=api_auth when transformation returns 401', async () => {
    const deps = makeDeps({
      transformationService: {
        transform: vi.fn(async () => {
          throw new Error('Gemini transformation failed with status 401')
        })
      }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.failureCategory).toBe('api_auth')
  })

  it('returns error with failureCategory=network when transformation has network failure', async () => {
    const deps = makeDeps({
      transformationService: {
        transform: vi.fn(async () => {
          throw new Error('fetch failed: getaddrinfo ENOTFOUND generativelanguage.googleapis.com')
        })
      }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.failureCategory).toBe('network')
  })

  it('returns error with failureCategory=unknown for generic transformation errors', async () => {
    const deps = makeDeps({
      transformationService: {
        transform: vi.fn(async () => {
          throw new Error('gemini rate limit')
        })
      }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.message).toContain('gemini rate limit')
    expect(result.failureCategory).toBe('unknown')
  })

  it('returns error without failureCategory when output application throws', async () => {
    const deps = makeDeps({
      outputService: {
        applyOutputWithDetail: vi.fn(async () => {
          throw new Error('clipboard write failed')
        })
      }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.message).toContain('output application failed')
    // Output failures are not classified — they are not adapter/preflight errors
    expect(result.failureCategory).toBeUndefined()
  })

  it('returns error without failureCategory when output application partially fails', async () => {
    const deps = makeDeps({
      outputService: {
        applyOutputWithDetail: vi.fn(async () => ({
          status: 'output_failed_partial' as TerminalJobStatus,
          message: 'Paste automation failed after 2 attempts. Verify Accessibility permission.'
        }))
      }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.message).toContain('output application partially failed')
    expect(result.message).toContain('Paste automation failed after 2 attempts')
    expect(result.failureCategory).toBeUndefined()
  })
})
