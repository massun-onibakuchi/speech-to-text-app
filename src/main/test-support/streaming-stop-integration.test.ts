/**
 * Where: src/main/test-support/streaming-stop-integration.test.ts
 * What:  Integration coverage for the streaming stop path across the controller
 *        and the real Groq rolling-upload adapter.
 * Why:   SSTP-03 must prove that late stop-time provider output still commits
 *        before the session ends on the utterance-native Groq path.
 */

import { describe, expect, it, vi } from 'vitest'
import { InMemoryStreamingSessionController } from '../services/streaming/streaming-session-controller'
import { GroqRollingUploadAdapter } from '../services/streaming/groq-rolling-upload-adapter'

const createPcm16WavBytes = (): ArrayBuffer => {
  const sampleData = new Int16Array([0, 1024])
  const bytesPerSample = 2
  const buffer = new ArrayBuffer(44 + sampleData.length * bytesPerSample)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + sampleData.length * bytesPerSample, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16_000, true)
  view.setUint32(28, 16_000 * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, sampleData.length * bytesPerSample, true)
  sampleData.forEach((sample, index) => {
    view.setInt16(44 + index * bytesPerSample, sample, true)
  })
  return buffer
}

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
    await controller.pushAudioUtteranceChunk({
      sessionId: 'session-1',
      sampleRateHz: 16000,
      channels: 1,
      utteranceIndex: 0,
      wavBytes: createPcm16WavBytes(),
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtEpochMs: 1000,
      endedAtEpochMs: 2000,
      hadCarryover: false,
      reason: 'session_stop',
      source: 'browser_vad'
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
