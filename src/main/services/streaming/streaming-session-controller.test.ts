/**
 * Where: src/main/services/streaming/streaming-session-controller.test.ts
 * What:  Lifecycle tests for the in-memory streaming session controller.
 * Why:   PR-3 needs deterministic, evented session-state behavior before
 *        renderer audio ingress or provider adapters are introduced.
 */

import { describe, expect, it, vi } from 'vitest'
import { InMemoryStreamingSessionController } from './streaming-session-controller'

const LOCAL_STREAMING_CONFIG = {
  provider: 'local_whispercpp_coreml' as const,
  transport: 'native_stream' as const,
  model: 'ggml-large-v3-turbo-q5_0',
  outputMode: 'stream_raw_dictation' as const,
  maxInFlightTransforms: 2,
  delimiterPolicy: {
    mode: 'space' as const,
    value: null
  },
  transformationProfile: null
}

const TRANSFORMED_STREAMING_CONFIG = {
  ...LOCAL_STREAMING_CONFIG,
  outputMode: 'stream_transformed' as const,
  transformationProfile: {
    profileId: 'default',
    provider: 'google' as const,
    model: 'gemini-2.5-flash' as const,
    baseUrlOverride: null,
    systemPrompt: 'system',
    userPrompt: '<input_text>{{text}}</input_text>'
  }
}

describe('InMemoryStreamingSessionController', () => {
  it('transitions start -> active -> stopping -> ended deterministically', async () => {
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1'
    })
    const onSessionState = vi.fn()
    controller.onSessionState(onSessionState)

    await controller.start(LOCAL_STREAMING_CONFIG)
    await controller.stop('user_stop')

    expect(onSessionState.mock.calls.map(([event]) => event.state)).toEqual([
      'starting',
      'active',
      'stopping',
      'ended'
    ])
    expect(controller.getState()).toBe('ended')
    expect(controller.getSnapshot()).toEqual({
      sessionId: 'session-1',
      state: 'ended',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'user_stop'
    })
  })

  it('rejects duplicate start while a session is active and emits an error event', async () => {
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1'
    })
    const onError = vi.fn()
    controller.onError(onError)

    await controller.start(LOCAL_STREAMING_CONFIG)
    await expect(controller.start(LOCAL_STREAMING_CONFIG)).rejects.toThrow('already active')

    expect(onError).toHaveBeenCalledWith({
      sessionId: 'session-1',
      code: 'duplicate_start',
      message: 'Streaming session already active.'
    })
  })

  it('treats stop as idempotent when no active session exists', async () => {
    const controller = new InMemoryStreamingSessionController()
    const onSessionState = vi.fn()
    controller.onSessionState(onSessionState)

    await controller.stop('user_stop')
    await controller.stop('user_stop')

    expect(onSessionState).not.toHaveBeenCalled()
    expect(controller.getState()).toBe('idle')
  })

  it('publishes fatal failure and transitions to failed', async () => {
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1'
    })
    const onSessionState = vi.fn()
    const onError = vi.fn()
    controller.onSessionState(onSessionState)
    controller.onError(onError)

    await controller.start(LOCAL_STREAMING_CONFIG)
    await controller.failCurrentSession({
      code: 'fatal_error',
      message: 'Provider crashed.'
    })

    expect(onError).toHaveBeenCalledWith({
      sessionId: 'session-1',
      code: 'fatal_error',
      message: 'Provider crashed.'
    })
    expect(onSessionState.mock.calls.at(-1)?.[0]).toEqual({
      sessionId: 'session-1',
      state: 'failed',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'fatal_error'
    })
    expect(controller.getState()).toBe('failed')
  })

  it('keeps structured startup failure details instead of collapsing them to provider_start_failed', async () => {
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      createProviderRuntime: () => ({
        start: async () => {
          const error = new Error('Missing whisper.cpp model file') as Error & { code: string }
          error.code = 'provider_runtime_not_ready'
          throw error
        },
        stop: async () => {},
        pushAudioFrameBatch: async () => {}
      })
    })
    const onSessionState = vi.fn()
    const onError = vi.fn()
    controller.onSessionState(onSessionState)
    controller.onError(onError)

    await expect(controller.start(LOCAL_STREAMING_CONFIG)).rejects.toMatchObject({
      code: 'provider_runtime_not_ready',
      message: 'Missing whisper.cpp model file'
    })

    expect(onError).toHaveBeenCalledWith({
      sessionId: 'session-1',
      code: 'provider_runtime_not_ready',
      message: 'Missing whisper.cpp model file'
    })
    expect(onSessionState.mock.calls.map(([event]) => event.state)).toEqual(['starting', 'failed'])
    expect(controller.getSnapshot()).toEqual({
      sessionId: 'session-1',
      state: 'failed',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'fatal_error'
    })
  })

  it('does not publish active until the provider start promise resolves', async () => {
    let resolveStart = (): void => {
      throw new Error('Provider start resolver was not captured.')
    }
    const startGate = new Promise<void>((resolve) => {
      resolveStart = resolve
    })
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      createProviderRuntime: () => ({
        start: async () => await startGate,
        stop: async () => {},
        pushAudioFrameBatch: async () => {}
      })
    })
    const onSessionState = vi.fn()
    controller.onSessionState(onSessionState)

    const startPromise = controller.start(LOCAL_STREAMING_CONFIG)
    await Promise.resolve()

    expect(onSessionState.mock.calls.map(([event]) => event.state)).toEqual(['starting'])
    expect(controller.getState()).toBe('starting')

    resolveStart()
    await startPromise

    expect(onSessionState.mock.calls.map(([event]) => event.state)).toEqual(['starting', 'active'])
    expect(controller.getState()).toBe('active')
  })

  it('rejects pushed audio frame batches when no session is active', async () => {
    const controller = new InMemoryStreamingSessionController()

    await expect(
      controller.pushAudioFrameBatch({
        sampleRateHz: 16000,
        channels: 1,
        flushReason: null,
        frames: [{ samples: new Float32Array([0, 0.1]), timestampMs: 1 }]
      })
    ).rejects.toThrow('active session')
  })

  it('forwards accepted frame batches into the active provider runtime', async () => {
    const pushAudioFrameBatch = vi.fn(async () => {})
    const controller = new InMemoryStreamingSessionController({
      createProviderRuntime: () => ({
        start: async () => {},
        stop: async () => {},
        pushAudioFrameBatch
      })
    })

    await controller.start(LOCAL_STREAMING_CONFIG)
    await controller.pushAudioFrameBatch({
      sampleRateHz: 16000,
      channels: 1,
      flushReason: null,
      frames: [{ samples: new Float32Array([0, 0.1]), timestampMs: 1 }]
    })

    expect(pushAudioFrameBatch).toHaveBeenCalledWith({
      sampleRateHz: 16000,
      channels: 1,
      flushReason: null,
      frames: [{ samples: new Float32Array([0, 0.1]), timestampMs: 1 }]
    })
  })

  it('fails the session when the provider runtime reports a fatal error', async () => {
    let runtimeCallbacks:
      | {
        onFailure: (failure: { code: string; message: string }) => Promise<void> | void
      }
      | undefined
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      createProviderRuntime: ({ callbacks }) => {
        runtimeCallbacks = callbacks
        return {
          start: async () => {},
          stop: async () => {},
          pushAudioFrameBatch: async () => {}
        }
      }
    })

    await controller.start(LOCAL_STREAMING_CONFIG)
    await runtimeCallbacks?.onFailure({
      code: 'provider_exited',
      message: 'Runtime crashed.'
    })

    expect(controller.getSnapshot()).toEqual({
      sessionId: 'session-1',
      state: 'failed',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'fatal_error'
    })
  })

  it('commits late final segments that arrive while user_stop is draining', async () => {
    let runtimeCallbacks:
      | {
        onFinalSegment: (segment: {
          sessionId: string
          sequence: number
          text: string
          startedAt: string
          endedAt: string
        }) => Promise<void> | void
      }
      | undefined
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: `${segment.sourceText}${segment.delimiter}`
    }))
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: { applyStreamingSegmentWithDetail },
      createProviderRuntime: ({ callbacks }) => {
        runtimeCallbacks = callbacks
        return {
          start: async () => {},
          stop: async () => {
            await runtimeCallbacks?.onFinalSegment({
              sessionId: 'session-1',
              sequence: 0,
              text: 'late words',
              startedAt: '2026-03-07T00:00:00.000Z',
              endedAt: '2026-03-07T00:00:01.000Z'
            })
          },
          pushAudioFrameBatch: async () => {}
        }
      }
    })
    const onSegment = vi.fn()
    controller.onSegment(onSegment)

    await controller.start(LOCAL_STREAMING_CONFIG)
    await controller.stop('user_stop')

    expect(applyStreamingSegmentWithDetail).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      sequence: 0,
      sourceText: 'late words'
    }), expect.anything())
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      sequence: 0,
      text: 'late words'
    }))
    expect(controller.getSnapshot()).toEqual({
      sessionId: 'session-1',
      state: 'ended',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'user_stop'
    })
  })

  it('drops late final segments that arrive while user_cancel is stopping', async () => {
    let runtimeCallbacks:
      | {
        onFinalSegment: (segment: {
          sessionId: string
          sequence: number
          text: string
          startedAt: string
          endedAt: string
        }) => Promise<void> | void
      }
      | undefined
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: `${segment.sourceText}${segment.delimiter}`
    }))
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: { applyStreamingSegmentWithDetail },
      createProviderRuntime: ({ callbacks }) => {
        runtimeCallbacks = callbacks
        return {
          start: async () => {},
          stop: async () => {
            await runtimeCallbacks?.onFinalSegment({
              sessionId: 'session-1',
              sequence: 0,
              text: 'discard me',
              startedAt: '2026-03-07T00:00:00.000Z',
              endedAt: '2026-03-07T00:00:01.000Z'
            })
          },
          pushAudioFrameBatch: async () => {}
        }
      }
    })
    const onSegment = vi.fn()
    controller.onSegment(onSegment)

    await controller.start(LOCAL_STREAMING_CONFIG)
    await controller.stop('user_cancel')

    expect(applyStreamingSegmentWithDetail).not.toHaveBeenCalled()
    expect(onSegment).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toEqual({
      sessionId: 'session-1',
      state: 'ended',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'user_cancel'
    })
  })

  it('preserves failed terminal state when the provider reports failure during stop', async () => {
    let runtimeCallbacks:
      | {
        onFailure: (failure: { code: string; message: string }) => Promise<void> | void
      }
      | undefined
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      createProviderRuntime: ({ callbacks }) => {
        runtimeCallbacks = callbacks
        return {
          start: async () => {},
          stop: async () => {
            await runtimeCallbacks?.onFailure({
              code: 'provider_stop_failed',
              message: 'Provider stop exploded.'
            })
          },
          pushAudioFrameBatch: async () => {}
        }
      }
    })
    const onSessionState = vi.fn()
    controller.onSessionState(onSessionState)

    await controller.start(LOCAL_STREAMING_CONFIG)
    await controller.stop('user_stop')

    expect(onSessionState.mock.calls.map(([event]) => event.state)).toEqual([
      'starting',
      'active',
      'stopping',
      'failed'
    ])
    expect(controller.getSnapshot()).toEqual({
      sessionId: 'session-1',
      state: 'failed',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'fatal_error'
    })
  })

  it('commits finalized streaming segments in per-session sequence order', async () => {
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: `${segment.sourceText}${segment.delimiter}`
    }))
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: { applyStreamingSegmentWithDetail }
    })
    const onSegment = vi.fn()
    controller.onSegment(onSegment)

    await controller.start(LOCAL_STREAMING_CONFIG)

    const secondPromise = controller.commitFinalSegment({
      sessionId: 'session-1',
      sequence: 1,
      text: 'world',
      startedAt: '2026-03-07T00:00:01.000Z',
      endedAt: '2026-03-07T00:00:02.000Z'
    })
    const firstResult = await controller.commitFinalSegment({
      sessionId: 'session-1',
      sequence: 0,
      text: 'hello',
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    })
    const secondResult = await secondPromise

    expect(firstResult).toEqual({ status: 'succeeded', message: 'hello ' })
    expect(secondResult).toEqual({ status: 'succeeded', message: 'world ' })
    expect(applyStreamingSegmentWithDetail.mock.calls.map(([segment]) => segment.sequence)).toEqual([0, 1])
    expect(onSegment.mock.calls.map(([event]) => event.sequence)).toEqual([0, 1])
  })

  it('releases blank finalized segments so later segments are not blocked', async () => {
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: segment.sourceText
    }))
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: { applyStreamingSegmentWithDetail }
    })

    await controller.start(LOCAL_STREAMING_CONFIG)

    expect(
      await controller.commitFinalSegment({
        sessionId: 'session-1',
        sequence: 0,
        text: '   ',
        startedAt: '2026-03-07T00:00:00.000Z',
        endedAt: '2026-03-07T00:00:01.000Z'
      })
    ).toBeNull()

    expect(
      await controller.commitFinalSegment({
        sessionId: 'session-1',
        sequence: 1,
        text: 'hello',
        startedAt: '2026-03-07T00:00:01.000Z',
        endedAt: '2026-03-07T00:00:02.000Z'
      })
    ).toEqual({
      status: 'succeeded',
      message: 'hello'
    })
    expect(applyStreamingSegmentWithDetail).toHaveBeenCalledOnce()
  })

  it('publishes a non-terminal streaming error when output application fails partially', async () => {
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: {
        applyStreamingSegmentWithDetail: vi.fn(async () => ({
          status: 'output_failed_partial' as const,
          message: 'Enable Accessibility permission in System Settings.'
        }))
      }
    })
    const onError = vi.fn()
    const onSegment = vi.fn()
    controller.onError(onError)
    controller.onSegment(onSegment)

    await controller.start(LOCAL_STREAMING_CONFIG)

    const result = await controller.commitFinalSegment({
      sessionId: 'session-1',
      sequence: 0,
      text: 'hello',
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    })

    expect(result).toEqual({
      status: 'output_failed_partial',
      message: 'Enable Accessibility permission in System Settings.'
    })
    expect(onError).toHaveBeenCalledWith({
      sessionId: 'session-1',
      code: 'streaming_output_failed_partial',
      message: 'Enable Accessibility permission in System Settings.'
    })
    expect(onSegment).not.toHaveBeenCalled()
  })

  it('resolves parked segment commits when the session stops', async () => {
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: segment.sourceText
    }))
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: { applyStreamingSegmentWithDetail }
    })
    const onError = vi.fn()
    controller.onError(onError)

    await controller.start(LOCAL_STREAMING_CONFIG)

    const parkedCommit = controller.commitFinalSegment({
      sessionId: 'session-1',
      sequence: 1,
      text: 'parked',
      startedAt: '2026-03-07T00:00:01.000Z',
      endedAt: '2026-03-07T00:00:02.000Z'
    })

    await controller.stop('user_stop')

    await expect(parkedCommit).resolves.toEqual({
      status: 'output_failed_partial',
      message: null
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('transforms finalized segments and falls back to raw text without ending the session', async () => {
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: segment.committedText
    }))
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: { applyStreamingSegmentWithDetail },
      transformationService: {
        transform: vi.fn(async (input: any) => {
          if (input.text === 'hello') {
            throw new Error('provider unavailable')
          }
          return {
            text: input.text.toUpperCase(),
            model: 'gemini-2.5-flash' as const
          }
        })
      },
      secretStore: {
        getApiKey: () => 'google-key'
      }
    })
    const onError = vi.fn()
    const onSegment = vi.fn()
    controller.onError(onError)
    controller.onSegment(onSegment)

    await controller.start(TRANSFORMED_STREAMING_CONFIG)

    await expect(controller.commitFinalSegment({
      sessionId: 'session-1',
      sequence: 0,
      text: 'hello',
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    })).resolves.toEqual({
      status: 'succeeded',
      message: 'hello'
    })

    await expect(controller.commitFinalSegment({
      sessionId: 'session-1',
      sequence: 1,
      text: 'world',
      startedAt: '2026-03-07T00:00:01.000Z',
      endedAt: '2026-03-07T00:00:02.000Z'
    })).resolves.toEqual({
      status: 'succeeded',
      message: 'WORLD'
    })

    expect(controller.getState()).toBe('active')
    expect(applyStreamingSegmentWithDetail.mock.calls.map(([segment]) => [segment.sequence, segment.committedText, segment.usedFallback])).toEqual([
      [0, 'hello', true],
      [1, 'WORLD', false]
    ])
    expect(onError).toHaveBeenCalledWith({
      sessionId: 'session-1',
      code: 'streaming_transform_fallback',
      message: 'Transformation failed for streamed segment 0. Falling back to raw dictation. provider unavailable'
    })
    expect(onSegment.mock.calls.map(([event]) => [event.sequence, event.text])).toEqual([
      [0, 'hello'],
      [1, 'WORLD']
    ])
  })
})
