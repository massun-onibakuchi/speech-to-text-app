// Where: Main-process Ollama runtime tests.
// What:  Verifies healthcheck, installed model discovery, and structured
//        transformation execution against the Ollama adapter.
// Why:   Keep the remaining local LLM path focused on transformation only.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalLlmModelId } from '../../../shared/local-llm'
import {
  LOCAL_LLM_DISCOVERY_TIMEOUT_MS,
  LOCAL_LLM_TRANSFORMATION_TIMEOUT_MS
} from './config'
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

  it('returns installed model ids directly from the Ollama tags response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { model: 'llama3.2:latest' },
            { model: 'mistral:7b' },
            { model: 'llama3.2:latest' },
            { name: 'qwen2.5:3b' }
          ]
        })
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(runtime.listModels()).resolves.toEqual([
      { id: 'llama3.2:latest', label: 'llama3.2:latest' },
      { id: 'mistral:7b', label: 'mistral:7b' },
      { id: 'qwen2.5:3b', label: 'qwen2.5:3b' }
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

  it('sends transformation requests with the shared prompt semantics and structured output schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ transformed_text: 'transformed output' }),
        done: true
      })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const runtime = new OllamaLocalLlmRuntime()
    const result = await runtime.transform(
      {
        text: 'raw <xml> text',
        systemPrompt: 'Rewrite for clarity.',
        userPrompt: 'Transform this.\n<input_text>{{text}}</input_text>',
        timeoutMs: 1000
      },
      'llama3.2:latest'
    )

    expect(result).toEqual({
      transformedText: 'transformed output',
      modelId: 'llama3.2:latest'
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.system).toBe('Rewrite for clarity.')
    expect(body.prompt).toBe('Transform this.\n<input_text>raw &lt;xml&gt; text</input_text>')
    expect(body.format).toEqual({
      type: 'object',
      properties: {
        transformed_text: { type: 'string' }
      },
      required: ['transformed_text']
    })
  })

  it('sends the selected model id directly to Ollama', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ transformed_text: 'out' }),
        done: true
      })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const runtime = new OllamaLocalLlmRuntime()
    await runtime.transform(
      { text: 'hello', systemPrompt: 'sys', userPrompt: '<input_text>{{text}}</input_text>', timeoutMs: 1000 },
      'mistral:7b'
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('mistral:7b')
    expect(body.think).toBeUndefined()
  })

  it('accepts supported sorc model ids on the transformation request path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ transformed_text: 'transformed output' }),
        done: true
      })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const runtime = new OllamaLocalLlmRuntime()
    await runtime.transform(
      {
        text: 'uh test',
        systemPrompt: 'system',
        userPrompt: '<input_text>{{text}}</input_text>',
        timeoutMs: 1000
      },
      'sorc/qwen3.5-instruct:0.8b'
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('sorc/qwen3.5-instruct:0.8b')
  })

  it('throws invalid_response when transformation JSON is malformed', async () => {
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
      runtime.transform(
        {
          text: 'hello',
          systemPrompt: 'system',
          userPrompt: '<input_text>{{text}}</input_text>',
          timeoutMs: 1000
        },
        'qwen3.5:2b'
      )
    ).rejects.toMatchObject({
      code: 'invalid_response'
    })
  })

  it('throws server_unreachable when transformation fetch throws a connection error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434')))

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.transform(
        {
          text: 'hello',
          systemPrompt: 'system',
          userPrompt: '<input_text>{{text}}</input_text>',
          timeoutMs: 1000
        },
        'qwen3.5:2b'
      )
    ).rejects.toMatchObject({
      code: 'server_unreachable'
    })
  })

  it('throws model_missing when Ollama returns 404 for transformation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.transform(
        {
          text: 'hello',
          systemPrompt: 'system',
          userPrompt: '<input_text>{{text}}</input_text>',
          timeoutMs: 1000
        },
        'qwen3.5:2b'
      )
    ).rejects.toMatchObject({
      code: 'model_missing'
    })
  })

  it('throws unsupported_model before calling Ollama for an empty model id', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.transform(
        {
          text: 'hello',
          systemPrompt: 'system',
          userPrompt: '<input_text>{{text}}</input_text>',
          timeoutMs: 1000
        },
        '   ' as LocalLlmModelId
      )
    ).rejects.toMatchObject({
      code: 'unsupported_model'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws invalid_response when Ollama reports a truncated transformation response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({ transformed_text: 'partial output' }),
          done: true,
          done_reason: 'length'
        })
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.transform(
        {
          text: 'hello',
          systemPrompt: 'system',
          userPrompt: '<input_text>{{text}}</input_text>',
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
          response: JSON.stringify({ transformed_text: 'partial output' })
        })
      } as Response)
    )

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.transform(
        {
          text: 'hello',
          systemPrompt: 'system',
          userPrompt: '<input_text>{{text}}</input_text>',
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

  it('throws timeout when transformation fetch aborts', async () => {
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
      const transformPromise = runtime.transform(
        {
          text: 'hello',
          systemPrompt: 'system',
          userPrompt: '<input_text>{{text}}</input_text>',
          timeoutMs: 1
        },
        'qwen3.5:2b'
      )
      const rejection = expect(transformPromise).rejects.toMatchObject({
        code: 'timeout'
      })
      await vi.advanceTimersByTimeAsync(1)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps transformation timeout defaults aligned with the local runtime policy', () => {
    expect(LOCAL_LLM_TRANSFORMATION_TIMEOUT_MS).toBe(15_000)
  })

  it('surfaces unknown non-network fetch failures as runtime_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected internal error')))

    const runtime = new OllamaLocalLlmRuntime()
    await expect(
      runtime.transform(
        {
          text: 'hello',
          systemPrompt: 'system',
          userPrompt: '<input_text>{{text}}</input_text>',
          timeoutMs: 1000
        },
        'qwen3.5:2b'
      )
    ).rejects.toEqual(
      expect.objectContaining<Partial<LocalLlmRuntimeError>>({
        code: 'runtime_unavailable'
      })
    )
  })
})
