/*
Where: src/renderer/streaming-live-capture.test.ts
What: Focused lifecycle tests for browser-side streaming PCM capture wiring.
Why: Cover the PR-4 live audio graph directly instead of relying only on higher-
     level native-recording tests around the same capture path.
*/

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { startStreamingLiveCapture } from './streaming-live-capture'

const createTrack = () => ({
  stop: vi.fn()
})

describe('startStreamingLiveCapture', () => {
  it('pushes playback-timestamped frames and flushes on stop', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }

    const sourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn()
    }
    const processorNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as ((event: { playbackTime?: number; inputBuffer: { getChannelData: () => Float32Array } }) => void) | null
    }
    const gainNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 0 }
    }
    const resume = vi.fn(async () => {})
    const close = vi.fn(async () => {})

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      createMediaStreamSource: vi.fn(() => sourceNode),
      createScriptProcessor: vi.fn(() => processorNode),
      createGain: vi.fn(() => gainNode),
      resume,
      close
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })

    processorNode.onaudioprocess?.({
      playbackTime: 1.25,
      inputBuffer: {
        getChannelData: () => new Float32Array([0.2, 0.2, 0.2, 0.2])
      }
    })

    await capture.stop()

    expect(resume).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledWith({
      sampleRateHz: 16000,
      channels: 1,
      flushReason: 'session_stop',
      frames: [
        {
          samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
          timestampMs: 1250
        }
      ]
    })
    expect(track.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('cancels without flushing pending frames', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }

    const processorNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as ((event: { playbackTime?: number; inputBuffer: { getChannelData: () => Float32Array } }) => void) | null
    }

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createScriptProcessor: vi.fn(() => processorNode),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {})
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })

    processorNode.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => new Float32Array([0.2, 0.2, 0.2, 0.2])
      }
    })

    await capture.cancel()

    expect(sink.pushStreamingAudioFrameBatch).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalledOnce()
  })
})
