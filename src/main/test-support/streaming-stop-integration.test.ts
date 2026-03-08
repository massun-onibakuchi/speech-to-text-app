/**
 * Where: src/main/test-support/streaming-stop-integration.test.ts
 * What:  Integration coverage for the streaming stop path across the controller
 *        and the real Groq rolling-upload adapter.
 * Why:   SSTP-03 must prove that late stop-time provider output still commits
 *        before the session ends.
 */

import { describe, expect, it, vi } from 'vitest'
import { InMemoryStreamingSessionController } from '../services/streaming/streaming-session-controller'
import { GroqRollingUploadAdapter } from '../services/streaming/groq-rolling-upload-adapter'

const GROQ_STREAMING_CONFIG = {
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

describe('streaming stop integration', () => {
  it('commits the final Groq stop-time segment before publishing ended', async () => {
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: `${segment.sourceText}${segment.delimiter}`
    }))
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
      outputService: { applyStreamingSegmentWithDetail },
      secretStore: {
        getApiKey: () => 'test-key'
      },
      createProviderRuntime: ({ sessionId, config, callbacks }) =>
        new GroqRollingUploadAdapter({
          sessionId,
          config,
          callbacks
        }, {
          secretStore: { getApiKey: () => 'test-key' },
          fetchFn: vi.fn(async () => new Response(JSON.stringify({
            text: 'last words',
            segments: [
              {
                start: 0,
                end: 1,
                text: 'last words'
              }
            ]
          }), { status: 200 }))
        })
    })
    const onSessionState = vi.fn()
    const onSegment = vi.fn()
    controller.onSessionState(onSessionState)
    controller.onSegment(onSegment)

    await controller.start(GROQ_STREAMING_CONFIG)
    await controller.pushAudioFrameBatch({
      sampleRateHz: 16000,
      channels: 1,
      flushReason: null,
      frames: [
        {
          samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
          timestampMs: 1000
        }
      ]
    })
    await controller.stop('user_stop')

    expect(applyStreamingSegmentWithDetail).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      sequence: 0,
      sourceText: 'last words'
    }), expect.anything())
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      sequence: 0,
      text: 'last words'
    }))
    expect(onSessionState.mock.calls.map(([event]) => event.state)).toEqual([
      'starting',
      'active',
      'stopping',
      'ended'
    ])
    expect(controller.getSnapshot()).toEqual({
      sessionId: 'session-1',
      state: 'ended',
      provider: 'groq_whisper_large_v3_turbo',
      transport: 'rolling_upload',
      model: 'whisper-large-v3-turbo',
      reason: 'user_stop'
    })
  })
})
