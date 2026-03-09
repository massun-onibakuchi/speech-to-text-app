/**
 * Where: src/main/services/streaming/groq-rolling-upload-adapter.test.ts
 * What:  Tests the Groq rolling-upload runtime around ordering, retries, and dedupe.
 * Why:   PR-7 must prove that near-realtime chunk uploads do not emit duplicate
 *        text or reorder commits when uploads finish out of order.
 */

import { describe, expect, it, vi } from 'vitest'
import { GroqRollingUploadAdapter } from './groq-rolling-upload-adapter'

const LOCAL_CONFIG = {
  provider: 'groq_whisper_large_v3_turbo' as const,
  transport: 'rolling_upload' as const,
  model: 'whisper-large-v3-turbo',
  outputMode: 'stream_raw_dictation' as const,
  maxInFlightTransforms: 2,
  apiKeyRef: 'groq',
  language: 'auto' as const,
  delimiterPolicy: {
    mode: 'space' as const,
    value: null
  },
  transformationProfile: null
}

const makeBatch = (params: {
  startMs: number
  flushReason: 'speech_pause' | 'max_chunk' | 'session_stop' | 'discard_pending'
  values?: number[]
}) => ({
  sessionId: 'session-1',
  sampleRateHz: 16000,
  channels: 1,
  flushReason: params.flushReason,
  frames: [
    {
      samples: new Float32Array(params.values ?? [0.2, 0.2, 0.2, 0.2]),
      timestampMs: params.startMs
    }
  ]
})

describe('GroqRollingUploadAdapter', () => {
  it('emits timestamped final segments for a pause-bounded Groq chunk', async () => {
    const onFinalSegment = vi.fn()
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn: vi.fn(async () => new Response(JSON.stringify({
        text: 'hello world',
        segments: [
          { start: 0, end: 0.5, text: 'hello' },
          { start: 0.5, end: 1.0, text: 'world' }
        ]
      }), { status: 200 }))
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch(makeBatch({
      startMs: 1000,
      flushReason: 'speech_pause'
    }))
    await adapter.stop('user_stop')

    expect(onFinalSegment.mock.calls.map(([segment]) => segment.sequence)).toEqual([0, 1])
    expect(onFinalSegment).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sessionId: 'session-1',
      text: 'hello',
      startedAt: '1970-01-01T00:00:01.000Z',
      endedAt: '1970-01-01T00:00:01.500Z'
    }))
    expect(onFinalSegment).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: 'world',
      startedAt: '1970-01-01T00:00:01.500Z',
      endedAt: '1970-01-01T00:00:02.000Z'
    }))
  })

  it('releases chunk results in chunk order even when later uploads finish first', async () => {
    const resolvers: Array<(response: Response) => void> = []
    const fetchFn = vi.fn(() => new Promise<Response>((resolve) => {
      resolvers.push(resolve)
    }))
    const onFinalSegment = vi.fn()
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch(makeBatch({ startMs: 0, flushReason: 'speech_pause' }))
    await adapter.pushAudioFrameBatch(makeBatch({ startMs: 1000, flushReason: 'speech_pause' }))

    if (resolvers[1]) {
      resolvers[1](new Response(JSON.stringify({ text: 'second chunk' }), { status: 200 }))
    }
    await Promise.resolve()
    expect(onFinalSegment).not.toHaveBeenCalled()

    if (resolvers[0]) {
      resolvers[0](new Response(JSON.stringify({ text: 'first chunk' }), { status: 200 }))
    }
    await adapter.stop('user_stop')

    expect(onFinalSegment.mock.calls.map(([segment]) => segment.text)).toEqual(['first chunk', 'second chunk'])
    expect(onFinalSegment.mock.calls.map(([segment]) => segment.sequence)).toEqual([0, 1000])
  })

  it('clears buffered audio when discard_pending is received before the next pause flush', async () => {
    const onFinalSegment = vi.fn()
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn: vi.fn(async () => new Response(JSON.stringify({
        text: 'later',
        segments: [
          { start: 0, end: 0.5, text: 'later' }
        ]
      }), { status: 200 }))
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch({
      sessionId: 'session-1',
      sampleRateHz: 16000,
      channels: 1,
      flushReason: null,
      frames: [
        {
          samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
          timestampMs: 0
        }
      ]
    })
    await adapter.pushAudioFrameBatch({
      sessionId: 'session-1',
      sampleRateHz: 16000,
      channels: 1,
      flushReason: 'discard_pending',
      frames: []
    })
    await adapter.pushAudioFrameBatch(makeBatch({ startMs: 1000, flushReason: 'speech_pause' }))
    await adapter.stop('user_stop')

    expect(onFinalSegment).toHaveBeenCalledWith(expect.objectContaining({
      text: 'later',
      startedAt: '1970-01-01T00:00:01.000Z'
    }))
  })

  it('retries one transient Groq failure without duplicating committed text', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('retry later', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'recovered chunk' }), { status: 200 }))
    const onFinalSegment = vi.fn()
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn,
      delayMs: vi.fn(async () => {})
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch(makeBatch({ startMs: 0, flushReason: 'speech_pause' }))
    await adapter.stop('user_stop')

    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(onFinalSegment).toHaveBeenCalledOnce()
    expect(onFinalSegment).toHaveBeenCalledWith(expect.objectContaining({
      text: 'recovered chunk',
      sequence: 0
    }))
  })

  it('trims duplicated fallback text when a speech_pause chunk carries overlap from a prior max_chunk', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'hello world' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'world again' }), { status: 200 }))
    const onFinalSegment = vi.fn()
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch(makeBatch({
      startMs: 0,
      flushReason: 'max_chunk',
      values: new Array(16000).fill(0.2)
    }))
    await adapter.pushAudioFrameBatch(makeBatch({
      startMs: 1000,
      flushReason: 'speech_pause',
      values: new Array(16000).fill(0.2)
    }))
    await adapter.stop('user_stop')

    expect(onFinalSegment.mock.calls.map(([segment]) => segment.text)).toEqual(['hello world', 'again'])
  })

  it('fails startup when the Groq API key is missing', async () => {
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => null) },
      fetchFn: vi.fn()
    })

    await expect(adapter.start()).rejects.toThrow('Groq rolling upload requires a saved Groq API key.')
  })

  it('aborts in-flight chunk uploads on user_cancel without emitting text', async () => {
    const seenSignals: AbortSignal[] = []
    const onFinalSegment = vi.fn()
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn: vi.fn(async (_input, init) => {
        if (init?.signal) {
          seenSignals.push(init.signal)
        }
        await new Promise(() => {})
        return new Response(JSON.stringify({ text: 'never' }), { status: 200 })
      })
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch(makeBatch({ startMs: 0, flushReason: 'speech_pause' }))
    await adapter.stop('user_cancel')

    expect(seenSignals).toHaveLength(1)
    expect(seenSignals[0]?.aborted).toBe(true)
    expect(onFinalSegment).not.toHaveBeenCalled()
  })

  it('drops buffered audio on user_cancel even before any upload starts', async () => {
    const fetchFn = vi.fn()
    const onFinalSegment = vi.fn()
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch({
      sessionId: 'session-1',
      sampleRateHz: 16000,
      channels: 1,
      flushReason: null,
      frames: [{ samples: new Float32Array([0.2, 0.2, 0.2, 0.2]), timestampMs: 0 }]
    })
    await adapter.stop('user_cancel')

    expect(fetchFn).not.toHaveBeenCalled()
    expect(onFinalSegment).not.toHaveBeenCalled()
  })

  it('reports a fatal upload error when all Groq retries are exhausted', async () => {
    const onFailure = vi.fn()
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('retry later', { status: 500 }))
      .mockResolvedValueOnce(new Response('still failing', { status: 500 }))
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn,
      delayMs: vi.fn(async () => {})
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch(makeBatch({ startMs: 0, flushReason: 'speech_pause' }))
    await adapter.stop('user_stop')

    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'groq_chunk_upload_failed'
    }))
  })

  it('bounds user_stop when an upload never settles', async () => {
    const seenSignals: AbortSignal[] = []
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn: vi.fn(async (_input, init) => {
        if (init?.signal) {
          seenSignals.push(init.signal)
        }
        await new Promise(() => {})
        return new Response(JSON.stringify({ text: 'never' }), { status: 200 })
      }),
      stopBudgetDelayMs: vi.fn(async () => {})
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch(makeBatch({ startMs: 0, flushReason: 'speech_pause' }))
    await adapter.stop('user_stop')

    expect(seenSignals).toHaveLength(1)
    expect(seenSignals[0]?.aborted).toBe(true)
  })

  it('cuts off the remaining drain tail when user_stop budget expires mid-drain', async () => {
    let releaseFirstSegment: (() => void) | null = null
    let releaseStopBudget: (() => void) | null = null
    const onFinalSegment = vi.fn(async (segment: { text: string }) => {
      if (segment.text === 'hello') {
        releaseStopBudget?.()
        await new Promise<void>((resolve) => {
          releaseFirstSegment = resolve
        })
      }
    })
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn: vi.fn(async () => new Response(JSON.stringify({
        text: 'hello world',
        segments: [
          { start: 0, end: 0.5, text: 'hello' },
          { start: 0.5, end: 1.0, text: 'world' }
        ]
      }), { status: 200 })),
      stopBudgetDelayMs: vi.fn(() => new Promise<void>((resolve) => {
        releaseStopBudget = resolve
      }))
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch(makeBatch({
      startMs: 1000,
      flushReason: 'speech_pause'
    }))
    await adapter.stop('user_stop')

    expect(onFinalSegment).toHaveBeenCalledTimes(1)
    expect(onFinalSegment).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hello'
    }))
    ;(releaseFirstSegment as (() => void) | null)?.()
  })
})
