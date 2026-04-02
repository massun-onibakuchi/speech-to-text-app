import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalCleanupModelId } from '../../../shared/local-llm'
import { LOCAL_LLM_DISCOVERY_TIMEOUT_MS } from './config'
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

  it('reports server_unreachable when healthcheck fetch throws a connection error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434')))

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.healthcheck()).resolves.toEqual({
      ok: false,
      code: 'server_unreachable',
      message: 'connect ECONNREFUSED 127.0.0.1:11434'
    })
  })

  it('reports server_unreachable when healthcheck fetch throws a DNS error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND localhost')))

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.healthcheck()).resolves.toEqual({
      ok: false,
      code: 'server_unreachable',
      message: 'getaddrinfo ENOTFOUND localhost'
    })
  })

  it('reports server_unreachable when healthcheck times out', async () => {
    vi.useFakeTimers()
    try {
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
      const healthcheckPromise = runtime.healthcheck()
      const resolution = expect(healthcheckPromise).resolves.toEqual({
        ok: false,
        code: 'server_unreachable',
        message: 'The operation was aborted.'
      })
      await vi.advanceTimersByTimeAsync(LOCAL_LLM_DISCOVERY_TIMEOUT_MS)
      await resolution
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports runtime_unavailable when healthcheck fetch throws a non-network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected internal error')))

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.healthcheck()).resolves.toEqual({
      ok: false,
      code: 'runtime_unavailable',
      message: 'unexpected internal error'
    })
  })

  it('reports server_unreachable when healthcheck returns a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.healthcheck()).resolves.toEqual({
      ok: false,
      code: 'server_unreachable',
      message: 'Ollama healthcheck failed with status 503'
    })
  })

  it('reports auth_error when healthcheck returns 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.healthcheck()).resolves.toEqual({
      ok: false,
      code: 'auth_error',
      message: 'Ollama healthcheck failed with status 401'
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
            { model: 'sorc/qwen3.5-instruct:0.8b' },
            { model: 'gemma3' },
            { name: 'qwen3.5:2b' },
            { name: 'sorc/qwen3.5-instruct-uncensored:2b' }
          ]
        })
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.listModels()).resolves.toEqual([
      expect.objectContaining({ id: 'qwen3.5:2b' }),
      expect.objectContaining({ id: 'qwen3.5:4b' }),
      expect.objectContaining({ id: 'sorc/qwen3.5-instruct:0.8b' }),
      expect.objectContaining({ id: 'sorc/qwen3.5-instruct-uncensored:2b' })
    ])
  })

  it('returns an empty model list when Ollama omits the models field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.listModels()).resolves.toEqual([])
  })

  it('sends cleanup requests with structured-output expectations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ cleaned_text: 'cleaned transcript' }),
        done: true
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

  it('accepts supported sorc cleanup model ids on the request path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ cleaned_text: 'cleaned transcript' }),
        done: true
      })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const runtime = new OllamaLocalLlmRuntime()
    await runtime.cleanup(
      {
        text: 'uh test',
        protectedTerms: [],
        timeoutMs: 1000
      },
      'sorc/qwen3.5-instruct:0.8b'
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('sorc/qwen3.5-instruct:0.8b')
  })

  it('throws invalid_response when cleanup JSON is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: 'not-json',
          done: true
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

  it('throws server_unreachable when cleanup fetch throws a connection error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434')))

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
      code: 'server_unreachable'
    })
  })

  it('throws model_missing when Ollama returns 404 for cleanup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404
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
      code: 'model_missing'
    })
  })

  it('throws auth_error when Ollama returns 403 for cleanup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403
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
      code: 'auth_error'
    })
  })

  it('throws unsupported_model before calling Ollama for an unsupported cleanup model', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.cleanup(
        {
          text: 'uh hello',
          protectedTerms: [],
          timeoutMs: 1000
        },
        'not-supported' as LocalCleanupModelId
      )
    ).rejects.toMatchObject({
      code: 'unsupported_model'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws invalid_response when Ollama reports a truncated cleanup response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({ cleaned_text: 'partial output' }),
          done: true,
          done_reason: 'length'
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

  it('throws invalid_response when Ollama reports a context window truncation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({ cleaned_text: 'partial output' }),
          done: true,
          done_reason: 'context_length'
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

  it('throws invalid_response when Ollama omits the completion marker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({ cleaned_text: 'partial output' })
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

  it('throws invalid_response when Ollama omits the response payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          done: true
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

  it('throws timeout when listModels hangs past the discovery timeout', async () => {
    vi.useFakeTimers()
    try {
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
      const listModelsPromise = runtime.listModels()
      const rejection = expect(listModelsPromise).rejects.toMatchObject({
        code: 'timeout'
      })
      await vi.advanceTimersByTimeAsync(LOCAL_LLM_DISCOVERY_TIMEOUT_MS)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws timeout when cleanup fetch aborts', async () => {
    vi.useFakeTimers()
    try {
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
      const cleanupPromise = runtime.cleanup(
        {
          text: 'uh hello',
          protectedTerms: [],
          timeoutMs: 1
        },
        'qwen3.5:2b'
      )
      const rejection = expect(cleanupPromise).rejects.toMatchObject({
        code: 'timeout'
      })
      await vi.advanceTimersByTimeAsync(1)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })
})
