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
  model: 'ggml-large-v3-turbo-q5_0'
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
})
