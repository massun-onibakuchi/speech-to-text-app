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
  delimiterPolicy: {
    mode: 'space' as const,
    value: null
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

  it('rejects pushed audio frame batches when no session is active', async () => {
    const controller = new InMemoryStreamingSessionController()

    await expect(
      controller.pushAudioFrameBatch({
        sampleRateHz: 16000,
        channels: 1,
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
      frames: [{ samples: new Float32Array([0, 0.1]), timestampMs: 1 }]
    })

    expect(pushAudioFrameBatch).toHaveBeenCalledWith({
      sampleRateHz: 16000,
      channels: 1,
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

  it('resolves parked segment commits when the session stops', async () => {
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: segment.sourceText
    }))
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: { applyStreamingSegmentWithDetail }
    })

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
  })
})
