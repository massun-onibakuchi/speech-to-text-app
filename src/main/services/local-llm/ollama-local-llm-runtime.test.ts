import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalLlmRuntimeError } from './types'
import { OllamaLocalLlmRuntime } from './ollama-local-llm-runtime'

describe('OllamaLocalLlmRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reports healthy when Ollama tags endpoint is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] })
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.healthcheck()).resolves.toEqual({ ok: true })
  })

  it('reports runtime_unavailable when healthcheck fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434')))

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.healthcheck()).resolves.toEqual({
      ok: false,
      code: 'runtime_unavailable',
      message: 'connect ECONNREFUSED 127.0.0.1:11434'
    })
  })

  it('filters runtime models through the curated supported catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { model: 'qwen3.5:4b' },
            { model: 'gemma3' },
            { name: 'qwen3.5:2b' }
          ]
        })
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.listModels()).resolves.toEqual([
      expect.objectContaining({ id: 'qwen3.5:2b' }),
      expect.objectContaining({ id: 'qwen3.5:4b' })
    ])
  })

  it('sends cleanup requests with structured-output expectations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ cleaned_text: 'cleaned transcript' })
      })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const runtime = new OllamaLocalLlmRuntime()
    const result = await runtime.cleanup(
      {
        text: 'um this is a test',
        protectedTerms: ['Dicta'],
        timeoutMs: 1000
      },
      'qwen3.5:2b'
    )

    expect(result).toEqual({
      cleanedText: 'cleaned transcript',
      modelId: 'qwen3.5:2b'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('qwen3.5:2b')
    expect(body.stream).toBe(false)
    expect(body.format).toEqual({
      type: 'object',
      properties: {
        cleaned_text: { type: 'string' }
      },
      required: ['cleaned_text']
    })
  })

  it('throws invalid_response when cleanup JSON is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: 'not-json'
        })
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.cleanup(
        {
          text: 'uh hello',
          protectedTerms: [],
          timeoutMs: 1000
        },
        'qwen3.5:2b'
      )
    ).rejects.toMatchObject({
      code: 'invalid_response'
    })
  })

  it('throws timeout when cleanup fetch aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const signal = init?.signal as AbortSignal
        return await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        })
      })
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.cleanup(
        {
          text: 'uh hello',
          protectedTerms: [],
          timeoutMs: 1
        },
        'qwen3.5:2b'
      )
    ).rejects.toMatchObject({
      code: 'timeout'
    })
  })
})
