/**
 * Where: src/main/services/streaming/groq-rolling-upload-adapter.test.ts
 * What:  Tests the Groq utterance-upload runtime around ordering, retries, and dedupe.
 * Why:   T440-04 removes frame accumulation from the Groq adapter, so the
 *        remaining behavior must be validated strictly at utterance boundaries.
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

const makeUtterance = (params: {
  utteranceIndex: number
  startMs: number
  endMs: number
  reason: 'speech_pause' | 'max_chunk' | 'session_stop'
  hadCarryover?: boolean
  wavBytes?: number[]
}) => ({
  sessionId: 'session-1',
  sampleRateHz: 16000,
  channels: 1,
  utteranceIndex: params.utteranceIndex,
  wavBytes: new Uint8Array(params.wavBytes ?? [82, 73, 70, 70]).buffer,
  wavFormat: 'wav_pcm_s16le_mono_16000' as const,
  startedAtMs: params.startMs,
  endedAtMs: params.endMs,
  hadCarryover: params.hadCarryover ?? false,
  reason: params.reason,
  source: 'browser_vad' as const
})

describe('GroqRollingUploadAdapter', () => {
  it('emits timestamped final segments for a pause-bounded Groq utterance', async () => {
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 1000,
      endMs: 2000,
      reason: 'speech_pause'
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

  it('accepts browser-VAD utterance chunks directly', async () => {
    const onFinalSegment = vi.fn()
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      text: 'utterance path'
    }), { status: 200 }))
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 2_000,
      endMs: 2_500,
      hadCarryover: true,
      reason: 'speech_pause'
    }))
    await adapter.stop('user_stop')

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(onFinalSegment).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      sequence: 0,
      text: 'utterance path',
      startedAt: '1970-01-01T00:00:02.000Z',
      endedAt: '1970-01-01T00:00:02.500Z'
    }))
  })

  it('releases utterance results in utterance order even when later sends are queued quickly', async () => {
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 500,
      reason: 'speech_pause'
    }))
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 1,
      startMs: 1000,
      endMs: 1500,
      reason: 'speech_pause'
    }))

    await Promise.resolve()
    expect(onFinalSegment).not.toHaveBeenCalled()

    if (resolvers[0]) {
      resolvers[0](new Response(JSON.stringify({ text: 'first utterance' }), { status: 200 }))
    }
    await vi.waitFor(() => {
      expect(resolvers).toHaveLength(2)
    })
    if (resolvers[1]) {
      resolvers[1](new Response(JSON.stringify({ text: 'second utterance' }), { status: 200 }))
    }
    await adapter.stop('user_stop')

    expect(onFinalSegment.mock.calls.map(([segment]) => segment.text)).toEqual(['first utterance', 'second utterance'])
    expect(onFinalSegment.mock.calls.map(([segment]) => segment.sequence)).toEqual([0, 1])
  })

  it('blocks new utterances when the Groq upload queue reaches capacity', async () => {
    let releaseFirstUpload = (): void => {
      throw new Error('First upload resolver was not captured.')
    }
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(async () => await new Promise<Response>((resolve) => {
        releaseFirstUpload = () => resolve(new Response(JSON.stringify({ text: 'first' }), { status: 200 }))
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'second' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'third' }), { status: 200 }))
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn,
      chunkWindowPolicy: {
        maxRetryCount: 1,
        retryBackoffMs: 0,
        maxQueuedUtterances: 2
      }
    })

    await adapter.start()
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 500,
      reason: 'speech_pause'
    }))
    const secondPush = adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 1,
      startMs: 600,
      endMs: 1100,
      reason: 'speech_pause'
    }))
    await secondPush

    const thirdPush = adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 2,
      startMs: 1200,
      endMs: 1700,
      reason: 'speech_pause'
    }))
    await Promise.resolve()
    expect(fetchFn).toHaveBeenCalledTimes(1)

    releaseFirstUpload()
    await thirdPush
    await adapter.stop('user_stop')

    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('rejects legacy frame-batch ingress for Groq', async () => {
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn: vi.fn()
    })

    await adapter.start()

    await expect(
      adapter.pushAudioFrameBatch({
        sessionId: 'session-1',
        sampleRateHz: 16000,
        channels: 1,
        flushReason: null,
        frames: [{ samples: new Float32Array([0.2, 0.2]), timestampMs: 0 }]
      })
    ).rejects.toThrow('only accepts browser-VAD utterance chunks')
  })

  it('rejects out-of-order utterance indices', async () => {
    const adapter = new GroqRollingUploadAdapter({
      sessionId: 'session-1',
      config: LOCAL_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure: vi.fn()
      }
    }, {
      secretStore: { getApiKey: vi.fn(() => 'test-key') },
      fetchFn: vi.fn()
    })

    await adapter.start()

    await expect(
      adapter.pushAudioUtteranceChunk(makeUtterance({
        utteranceIndex: 1,
        startMs: 0,
        endMs: 500,
        reason: 'speech_pause'
      }))
    ).rejects.toThrow('expected utteranceIndex=0')
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 500,
      reason: 'speech_pause'
    }))
    await adapter.stop('user_stop')

    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(onFinalSegment).toHaveBeenCalledOnce()
    expect(onFinalSegment).toHaveBeenCalledWith(expect.objectContaining({
      text: 'recovered chunk',
      sequence: 0
    }))
  })

  it('trims duplicated fallback text when a max_chunk continuation carries overlap into the next utterance', async () => {
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 1000,
      reason: 'max_chunk'
    }))
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 1,
      startMs: 1000,
      endMs: 1800,
      reason: 'speech_pause',
      hadCarryover: true
    }))
    await adapter.stop('user_stop')

    expect(onFinalSegment.mock.calls.map(([segment]) => segment.text)).toEqual(['hello world', 'again'])
  })

  it('does not trim repeated words across normal pause-bounded utterances without carryover', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'hello' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'hello there' }), { status: 200 }))
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 500,
      reason: 'speech_pause'
    }))
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 1,
      startMs: 900,
      endMs: 1600,
      reason: 'speech_pause'
    }))
    await adapter.stop('user_stop')

    expect(onFinalSegment.mock.calls.map(([segment]) => segment.text)).toEqual(['hello', 'hello there'])
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 500,
      reason: 'speech_pause'
    }))
    await adapter.stop('user_cancel')

    expect(seenSignals).toHaveLength(1)
    expect(seenSignals[0]?.aborted).toBe(true)
    expect(onFinalSegment).not.toHaveBeenCalled()
  })

  it('drops queued utterances on user_cancel after the active upload is aborted', async () => {
    const seenSignals: AbortSignal[] = []
    const fetchFn = vi.fn(async (_input, init) => {
      if (init?.signal) {
        seenSignals.push(init.signal)
      }
      await new Promise(() => {})
      return new Response(JSON.stringify({ text: 'never' }), { status: 200 })
    })
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 500,
      reason: 'speech_pause'
    }))
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 1,
      startMs: 600,
      endMs: 1100,
      reason: 'session_stop'
    }))
    await adapter.stop('user_cancel')

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(seenSignals).toHaveLength(1)
    expect(seenSignals[0]?.aborted).toBe(true)
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 500,
      reason: 'speech_pause'
    }))
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 500,
      reason: 'speech_pause'
    }))
    await adapter.stop('user_stop')

    expect(seenSignals).toHaveLength(1)
    expect(seenSignals[0]?.aborted).toBe(true)
  })

  it('lets already-uploaded segments finish committing even when final-segment processing is slow', async () => {
    let releaseFirstSegment: (() => void) | null = null
    const onFinalSegment = vi.fn(async (segment: { text: string }) => {
      if (segment.text === 'hello') {
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
      }), { status: 200 }))
    })

    await adapter.start()
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 1000,
      endMs: 2000,
      reason: 'speech_pause'
    }))
    const stopPromise = adapter.stop('user_stop')
    await vi.waitFor(() => {
      expect(onFinalSegment).toHaveBeenCalledTimes(1)
    })

    expect(onFinalSegment).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hello'
    }))
    ;(releaseFirstSegment as (() => void) | null)?.()
    await stopPromise
    expect(onFinalSegment).toHaveBeenCalledTimes(2)
    expect(onFinalSegment).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: 'world'
    }))
  })

  it('does not let slow final-segment processing delay the next upload start', async () => {
    let releaseFirstSegment = (): void => {
      throw new Error('Segment release was not captured.')
    }
    const resolvers: Array<(response: Response) => void> = []
    const onFinalSegment = vi.fn(async (segment: { text: string }) => {
      if (segment.text === 'first') {
        await new Promise<void>((resolve) => {
          releaseFirstSegment = resolve
        })
      }
    })
    const fetchFn = vi.fn(() => new Promise<Response>((resolve) => {
      resolvers.push(resolve)
    }))
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 400,
      reason: 'speech_pause'
    }))
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 1,
      startMs: 500,
      endMs: 900,
      reason: 'speech_pause'
    }))

    resolvers[0]?.(new Response(JSON.stringify({
      text: 'first'
    }), { status: 200 }))
    await vi.waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    resolvers[1]?.(new Response(JSON.stringify({
      text: 'second'
    }), { status: 200 }))
    releaseFirstSegment()
    await adapter.stop('user_stop')

    expect(onFinalSegment.mock.calls.map(([segment]) => segment.text)).toEqual(['first', 'second'])
  })

  it('uses monotonic final segment sequences across utterances with many provider segments', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        text: 'alpha bravo',
        segments: [
          { start: 0, end: 0.3, text: 'alpha' },
          { start: 0.3, end: 0.6, text: 'bravo' }
        ]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        text: 'charlie',
        segments: [
          { start: 0, end: 0.4, text: 'charlie' }
        ]
      }), { status: 200 }))
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
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 0,
      startMs: 0,
      endMs: 600,
      reason: 'speech_pause'
    }))
    await adapter.pushAudioUtteranceChunk(makeUtterance({
      utteranceIndex: 1,
      startMs: 1000,
      endMs: 1400,
      reason: 'session_stop'
    }))
    await adapter.stop('user_stop')

    expect(onFinalSegment.mock.calls.map(([segment]) => segment.sequence)).toEqual([0, 1, 2])
    expect(onFinalSegment.mock.calls.map(([segment]) => segment.text)).toEqual(['alpha', 'bravo', 'charlie'])
  })
})
