/*
Where: src/renderer/streaming-live-capture.test.ts
What: Focused lifecycle tests for the browser live streaming capture adapter.
Why: Cover the integration path between audio callbacks, transport ingress, and
     teardown without depending on a real browser audio graph in CI.
*/

import { describe, expect, it, vi } from 'vitest'
import { startStreamingLiveCapture } from './streaming-live-capture'

type FakeProcessorNode = {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  onaudioprocess: ((event: { inputBuffer: { getChannelData: (channel: number) => Float32Array }; playbackTime?: number }) => void) | null
}

const createFakeAudioContext = (): {
  context: AudioContext
  processorNode: FakeProcessorNode
  closeSpy: ReturnType<typeof vi.fn>
  resumeSpy: ReturnType<typeof vi.fn>
} => {
  const processorNode: FakeProcessorNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null
  }
  const closeSpy = vi.fn(async () => {})
  const resumeSpy = vi.fn(async () => {})

  return {
    context: {
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
      close: closeSpy,
      resume: resumeSpy
    } as unknown as AudioContext,
    processorNode,
    closeSpy,
    resumeSpy
  }
}

describe('startStreamingLiveCapture', () => {
  it('flushes buffered audio on stop and closes the audio context', async () => {
    const pushStreamingAudioFrameBatch = vi.fn(async () => {})
    const trackStop = vi.fn()
    const { context, processorNode, closeSpy, resumeSpy } = createFakeAudioContext()

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink: { pushStreamingAudioFrameBatch },
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: trackStop }]
      } as unknown as MediaStream)),
      createAudioContext: () => context,
      onFatalError: vi.fn()
    })

    processorNode.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => new Float32Array([0.2, 0.2, 0.2, 0.2])
      },
      playbackTime: 1.5
    })

    await capture.stop('user_stop')

    expect(resumeSpy).toHaveBeenCalledOnce()
    expect(pushStreamingAudioFrameBatch).toHaveBeenCalledWith({
      sampleRateHz: 16000,
      channels: 1,
      frames: [
        {
          samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
          timestampMs: 1500
        }
      ]
    })
    expect(trackStop).toHaveBeenCalledOnce()
    expect(closeSpy).toHaveBeenCalledOnce()
  })
})
