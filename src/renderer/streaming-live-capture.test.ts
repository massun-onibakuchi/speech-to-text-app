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

const flushAsyncWork = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

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

  it('discards a below-threshold blip before the next real utterance flushes', async () => {
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
      createAudioContext: () => audioContext,
      maxFramesPerBatch: 10
    })

    processorNode.onaudioprocess?.({
      playbackTime: 0,
      inputBuffer: {
        getChannelData: () => new Float32Array(1600).fill(0.2)
      }
    })
    processorNode.onaudioprocess?.({
      playbackTime: 0.7,
      inputBuffer: {
        getChannelData: () => new Float32Array(1600).fill(0)
      }
    })
    processorNode.onaudioprocess?.({
      playbackTime: 1.2,
      inputBuffer: {
        getChannelData: () => new Float32Array(1600).fill(0.2)
      }
    })
    processorNode.onaudioprocess?.({
      playbackTime: 1.3,
      inputBuffer: {
        getChannelData: () => new Float32Array(1600).fill(0.2)
      }
    })
    processorNode.onaudioprocess?.({
      playbackTime: 1.9,
      inputBuffer: {
        getChannelData: () => new Float32Array(1600).fill(0)
      }
    })

    await flushAsyncWork()
    await capture.cancel()

    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenNthCalledWith(1, {
      sampleRateHz: 16000,
      channels: 1,
      flushReason: 'discard_pending',
      frames: []
    })
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      flushReason: 'speech_pause',
      frames: expect.arrayContaining([
        expect.objectContaining({ timestampMs: 1200 }),
        expect.objectContaining({ timestampMs: 1300 }),
        expect.objectContaining({ timestampMs: 1900 })
      ])
    }))
  })

  it('routes auto-batch drain failures into fatal cleanup', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockRejectedValue(new Error('push failed'))
    }
    const onFatalError = vi.fn()

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
    const close = vi.fn(async () => {})

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      createMediaStreamSource: vi.fn(() => sourceNode),
      createScriptProcessor: vi.fn(() => processorNode),
      createGain: vi.fn(() => gainNode),
      resume: vi.fn(async () => {}),
      close
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError,
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext,
      maxFramesPerBatch: 1
    })

    processorNode.onaudioprocess?.({
      playbackTime: 1,
      inputBuffer: {
        getChannelData: () => new Float32Array([0.2, 0.2, 0.2, 0.2])
      }
    })

    await flushAsyncWork()
    await flushAsyncWork()

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'push failed' }))
    expect(track.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(capture).toBeDefined()
  })

  it('tears down cleanly when an in-flight drain fails during explicit stop', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    let rejectPush: ((error: Error) => void) | null = null
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn(
        async () =>
          await new Promise<void>((_resolve, reject) => {
            rejectPush = reject
          })
      )
    }
    const onFatalError = vi.fn()

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
      onFatalError,
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext,
      maxFramesPerBatch: 1
    })

    processorNode.onaudioprocess?.({
      playbackTime: 1,
      inputBuffer: {
        getChannelData: () => new Float32Array([0.2, 0.2, 0.2, 0.2])
      }
    })

    const stopPromise = capture.stop()
    rejectPush?.(new Error('push failed during stop'))
    await stopPromise
    await flushAsyncWork()

    expect(onFatalError).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(audioContext.close).toHaveBeenCalledOnce()
  })

  it('suppresses late fatal reporting after cancel completes', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    let rejectPush: ((error: Error) => void) | null = null
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn(
        async () =>
          await new Promise<void>((_resolve, reject) => {
            rejectPush = reject
          })
      )
    }
    const onFatalError = vi.fn()

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
      onFatalError,
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext,
      maxFramesPerBatch: 1
    })

    processorNode.onaudioprocess?.({
      playbackTime: 1,
      inputBuffer: {
        getChannelData: () => new Float32Array([0.2, 0.2, 0.2, 0.2])
      }
    })

    await capture.cancel()
    rejectPush?.(new Error('push failed after cancel'))
    await flushAsyncWork()

    expect(onFatalError).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(audioContext.close).toHaveBeenCalledOnce()
  })

  it('cleans up the media stream and audio context if startup fails after resources are acquired', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const resumeError = new Error('resume failed')
    const close = vi.fn(async () => {})

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createScriptProcessor: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {
        throw resumeError
      }),
      close
    } as unknown as AudioContext

    await expect(startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink: {
        pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
      },
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })).rejects.toThrow('resume failed')

    expect(track.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})
