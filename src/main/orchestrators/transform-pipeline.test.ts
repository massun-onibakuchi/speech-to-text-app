// Where: src/main/orchestrators/transform-pipeline.test.ts
// What:  Tests for createTransformProcessor — the snapshot-driven transform pipeline.
// Why:   Verify transformation + output stages and failure modes.

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
      applyOutput: vi.fn(async () => 'succeeded' as TerminalJobStatus)
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
      prompt: { systemPrompt: '', userPrompt: '' }
    })
    expect(deps.outputService.applyOutput).toHaveBeenCalledOnce()
  })

  it('returns error when API key is missing', async () => {
    const deps = makeDeps({
      secretStore: { getApiKey: vi.fn(() => null) }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.message).toContain('API key')
    expect(deps.transformationService.transform).not.toHaveBeenCalled()
  })

  it('returns error when transformation throws', async () => {
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
  })

  it('returns error when output application throws', async () => {
    const deps = makeDeps({
      outputService: {
        applyOutput: vi.fn(async () => {
          throw new Error('clipboard write failed')
        })
      }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.message).toContain('output application failed')
  })

  it('returns error when output application partially fails', async () => {
    const deps = makeDeps({
      outputService: {
        applyOutput: vi.fn(async () => 'output_failed_partial' as TerminalJobStatus)
      }
    })
    const processor = createTransformProcessor(deps)
    const snapshot = buildTransformationRequestSnapshot()

    const result = await processor(snapshot)

    expect(result.status).toBe('error')
    expect(result.message).toContain('output application partially failed')
  })
})
