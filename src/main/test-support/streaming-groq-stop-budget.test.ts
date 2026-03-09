/**
 * Where: src/main/test-support/streaming-groq-stop-budget.test.ts
 * What:  Integration coverage for the bounded Groq user_stop path.
 * Why:   SSTP-04 must prove that a hung Groq upload no longer blocks the full
 *        controller stop path forever on the utterance-native Groq path.
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

describe('streaming Groq stop budget integration', () => {
  it('lets the controller finish user_stop even when the active upload hangs', async () => {
    const seenSignals: AbortSignal[] = []
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1',
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
          fetchFn: vi.fn(async (_input, init) => {
            if (init?.signal) {
              seenSignals.push(init.signal)
            }
            await new Promise(() => {})
            return new Response(JSON.stringify({ text: 'never' }), { status: 200 })
          }),
          stopBudgetDelayMs: vi.fn(async () => {})
        })
    })
    const onSessionState = vi.fn()
    controller.onSessionState(onSessionState)

    await controller.start(GROQ_STREAMING_CONFIG)
    await controller.pushAudioUtteranceChunk({
      sessionId: 'session-1',
      sampleRateHz: 16000,
      channels: 1,
      utteranceIndex: 0,
      wavBytes: new Uint8Array([82, 73, 70, 70]).buffer,
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtMs: 1000,
      endedAtMs: 1500,
      hadCarryover: false,
      reason: 'speech_pause',
      source: 'browser_vad'
    })
    await controller.stop('user_stop')

    expect(seenSignals).toHaveLength(1)
    expect(seenSignals[0]?.aborted).toBe(true)
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
