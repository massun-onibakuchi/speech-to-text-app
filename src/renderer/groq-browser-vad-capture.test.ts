/*
Where: src/renderer/groq-browser-vad-capture.test.ts
What: Focused tests for the thin Groq browser VAD capture path.
Why: Lock the renderer to MicVAD-owned speech_pause boundaries with Epicenter-style
     destroy-only stop semantics.
*/

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as errorLogging from '../shared/error-logging'
import {
  type GroqBrowserVadDebugEvent,
  type GroqBrowserVadCapture,
  startGroqBrowserVadCapture
} from './groq-browser-vad-capture'

type SpeechProbabilities = {
  isSpeech: number
  notSpeech: number
}

type FakeVadOptions = {
  baseAssetPath?: string
  onnxWASMBasePath?: string
  submitUserSpeechOnPause?: boolean
  stream?: MediaStream
  frameSamples?: number
  redemptionFrames?: number
  preSpeechPadFrames?: number
  minSpeechFrames?: number
  onFrameProcessed?: (probabilities: SpeechProbabilities, frame: Float32Array) => Promise<void> | void
  onSpeechStart?: () => Promise<void> | void
  onSpeechRealStart?: () => Promise<void> | void
  onSpeechEnd?: (audio: Float32Array) => Promise<void> | void
  onVADMisfire?: () => Promise<void> | void
}

class FakeMicVad {
  static instances: FakeMicVad[] = []

  static create = vi.fn(async (options: FakeVadOptions = {}) => {
    const instance = new FakeMicVad(options)
    FakeMicVad.instances.push(instance)
    return instance
  })

  readonly start = vi.fn(async () => {})
  readonly pause = vi.fn(async () => {})
  readonly destroy = vi.fn(async () => {})

  constructor(readonly options: FakeVadOptions) {}

  async emitFrame(probabilities: SpeechProbabilities, frame: Float32Array): Promise<void> {
    await this.options.onFrameProcessed?.(probabilities, frame)
  }

  async emitSpeechStart(): Promise<void> {
    await this.options.onSpeechStart?.()
  }

  async emitSpeechRealStart(): Promise<void> {
    await this.options.onSpeechRealStart?.()
  }

  async emitSpeechEnd(audio: Float32Array): Promise<void> {
    await this.options.onSpeechEnd?.(audio)
  }

  async emitMisfire(): Promise<void> {
    await this.options.onVADMisfire?.()
  }
}

type FakeVadStep =
  | { type: 'speechStart' }
  | { type: 'speechRealStart' }
  | { type: 'misfire' }
  | { type: 'frame'; probabilities: SpeechProbabilities; frame: Float32Array }
  | { type: 'speechEnd'; audio: Float32Array }

const playVadScript = async (vad: FakeMicVad, steps: readonly FakeVadStep[]): Promise<void> => {
  for (const step of steps) {
    switch (step.type) {
      case 'speechStart':
        await vad.emitSpeechStart()
        break
      case 'speechRealStart':
        await vad.emitSpeechRealStart()
        break
      case 'misfire':
        await vad.emitMisfire()
        break
      case 'frame':
        await vad.emitFrame(step.probabilities, step.frame)
        break
      case 'speechEnd':
        await vad.emitSpeechEnd(step.audio)
        break
    }
  }
}

describe('startGroqBrowserVadCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeMicVad.instances = []
    FakeMicVad.create.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const createCapture = async (overrides: {
    sessionId?: string
    sink?: { pushStreamingAudioUtteranceChunk: ReturnType<typeof vi.fn> }
    onFatalError?: ReturnType<typeof vi.fn>
    onBackpressureStateChange?: (state: { paused: boolean; durationMs?: number }) => void
    onDebugEvent?: (event: GroqBrowserVadDebugEvent) => void
    nowMs?: () => number
    nowEpochMs?: () => number
    traceEnabled?: boolean
    startupTimeoutMs?: number
    backpressureSignalMs?: number
    encodeWav?: (audio: Float32Array) => ArrayBuffer
    createVad?: typeof FakeMicVad.create
    getUserMedia?: ReturnType<typeof vi.fn>
  } = {}): Promise<{
    capture: GroqBrowserVadCapture
    vad: FakeMicVad
    sink: { pushStreamingAudioUtteranceChunk: ReturnType<typeof vi.fn> }
    onFatalError: ReturnType<typeof vi.fn>
    getUserMedia: ReturnType<typeof vi.fn>
  }> => {
    const sink = overrides.sink ?? {
      pushStreamingAudioUtteranceChunk: vi.fn(async () => {})
    }
    const onFatalError = overrides.onFatalError ?? vi.fn()
    const getUserMedia = overrides.getUserMedia ?? vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }]
    }) as unknown as MediaStream)

    const capture = await startGroqBrowserVadCapture({
      sessionId: overrides.sessionId ?? 'session-1',
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink,
      onFatalError,
      onBackpressureStateChange: overrides.onBackpressureStateChange,
      onDebugEvent: overrides.onDebugEvent,
      nowMs: overrides.nowMs ?? (() => 5_000),
      nowEpochMs: overrides.nowEpochMs ?? overrides.nowMs ?? (() => 5_000),
      traceEnabled: overrides.traceEnabled,
      config: {
        startupTimeoutMs: overrides.startupTimeoutMs,
        backpressureSignalMs: overrides.backpressureSignalMs
      }
    }, {
      createVad: overrides.createVad ?? FakeMicVad.create,
      encodeWav: overrides.encodeWav ?? ((audio) => audio.buffer.slice(0)),
      getUserMedia
    })

    return {
      capture,
      vad: FakeMicVad.instances[0]!,
      sink,
      onFatalError,
      getUserMedia
    }
  }

  it('starts MicVAD with Groq-specific overrides and a pre-acquired stream', async () => {
    const { vad, getUserMedia } = await createCapture()

    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(FakeMicVad.create).toHaveBeenCalledOnce()
    const vadOptions = FakeMicVad.create.mock.calls[0]?.[0]
    expect(vadOptions).toEqual(expect.objectContaining({
      model: 'v5',
      submitUserSpeechOnPause: true,
      baseAssetPath: expect.any(String),
      onnxWASMBasePath: expect.any(String),
      positiveSpeechThreshold: 0.15,
      negativeSpeechThreshold: 0.1,
      frameSamples: 512,
      preSpeechPadFrames: 25,
      redemptionFrames: 44,
      minSpeechFrames: 5
    }))
    expect(vadOptions?.stream).toBeDefined()
    expect(vad.start).toHaveBeenCalledOnce()
  })

  it('emits a speech_pause utterance when MicVAD seals natural speech', async () => {
    const encodeWav = vi.fn((audio: Float32Array) => audio.buffer.slice(0))
    const { vad, sink } = await createCapture({
      nowMs: () => 7_000,
      encodeWav
    })

    await vad.emitSpeechStart()
    await vad.emitSpeechRealStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(16_000).fill(0.2))
    await vad.emitSpeechEnd(new Float32Array(16_000).fill(0.2))

    expect(encodeWav).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      sampleRateHz: 16_000,
      channels: 1,
      utteranceIndex: 0,
      wavFormat: 'wav_pcm_s16le_mono_16000',
      reason: 'speech_pause',
      source: 'browser_vad',
      startedAtEpochMs: 6_000,
      endedAtEpochMs: 7_000
    }))
  })

  it('emits debug events for live callback sequencing and utterance handoff', async () => {
    const events: GroqBrowserVadDebugEvent[] = []
    const { vad } = await createCapture({
      nowMs: () => 7_000,
      onDebugEvent: (event) => {
        events.push(event)
      }
    })

    await vad.emitSpeechStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(1_600).fill(0.2))
    await vad.emitSpeechRealStart()
    await vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'speech_start',
        utteranceIndex: 0
      }),
      expect.objectContaining({
        type: 'frame_processed',
        utteranceIndex: 0,
        frameSamples: 1_600
      }),
      expect.objectContaining({
        type: 'speech_real_start',
        utteranceIndex: 0
      }),
      expect.objectContaining({
        type: 'speech_end',
        utteranceIndex: 0,
        audioSamples: 3_200,
        reason: 'speech_pause'
      }),
      expect.objectContaining({
        type: 'utterance_chunk',
        utteranceIndex: 0,
        audioSamples: 3_200,
        reason: 'speech_pause'
      }),
      expect.objectContaining({
        type: 'utterance_sent',
        utteranceIndex: 0,
        reason: 'speech_pause'
      })
    ]))
  })

  it('treats debug hook failures as non-fatal instrumentation errors', async () => {
    const onFatalError = vi.fn()
    const { vad, sink } = await createCapture({
      onFatalError,
      onDebugEvent: () => {
        throw new Error('debug hook exploded')
      }
    })

    await vad.emitSpeechStart()
    await expect(vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))).resolves.toBeUndefined()

    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledOnce()
    expect(onFatalError).not.toHaveBeenCalled()
  })

  it('summarizes post-seal frames so the second-utterance bug can distinguish no-frames vs no-rearm', async () => {
    let currentNowMs = 1_000
    const events: GroqBrowserVadDebugEvent[] = []
    const { vad } = await createCapture({
      nowMs: () => currentNowMs,
      onDebugEvent: (event) => {
        events.push(event)
      }
    })

    await vad.emitSpeechStart()
    await vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))

    currentNowMs = 1_050
    await vad.emitFrame({ isSpeech: 0.12, notSpeech: 0.88 }, new Float32Array(160).fill(0.05))
    currentNowMs = 1_100
    await vad.emitFrame({ isSpeech: 0.22, notSpeech: 0.78 }, new Float32Array(160).fill(0.05))

    currentNowMs = 5_000
    await vi.advanceTimersByTimeAsync(4_000)

    expect(events).toContainEqual(expect.objectContaining({
      type: 'post_seal_window_summary',
      sourceUtteranceIndex: 0,
      nextUtteranceIndex: 1,
      frameCount: 2,
      maxIsSpeech: 0.22,
      lastIsSpeech: 0.22,
      endedBy: 'timeout'
    }))
  })

  it('keeps rolling post-seal summaries after timeout so late speech is still observable', async () => {
    let currentNowMs = 1_000
    const events: GroqBrowserVadDebugEvent[] = []
    const { vad } = await createCapture({
      nowMs: () => currentNowMs,
      onDebugEvent: (event) => {
        events.push(event)
      }
    })

    await vad.emitSpeechStart()
    await vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))

    currentNowMs = 5_000
    await vi.advanceTimersByTimeAsync(4_000)

    currentNowMs = 5_050
    await vad.emitFrame({ isSpeech: 0.41, notSpeech: 0.59 }, new Float32Array(160).fill(0.05))
    currentNowMs = 5_100
    await vad.emitSpeechStart()

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'post_seal_window_summary',
        sourceUtteranceIndex: 0,
        nextUtteranceIndex: 1,
        frameCount: 0,
        endedBy: 'timeout'
      }),
      expect.objectContaining({
        type: 'post_seal_window_summary',
        sourceUtteranceIndex: 0,
        nextUtteranceIndex: 1,
        frameCount: 1,
        maxIsSpeech: 0.41,
        lastIsSpeech: 0.41,
        endedBy: 'next_speech_start'
      })
    ]))
  })

  it('trusts MicVAD sealed audio even when speechRealStart never fired', async () => {
    const encodeWav = vi.fn((audio: Float32Array) => audio.buffer.slice(0))
    const { vad, sink } = await createCapture({
      nowMs: () => 7_000,
      encodeWav
    })

    await vad.emitSpeechStart()
    await vad.emitFrame({ isSpeech: 0.1, notSpeech: 0.9 }, new Float32Array(400).fill(0.2))
    await vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))

    expect(encodeWav).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      utteranceIndex: 0,
      reason: 'speech_pause'
    }))
  })

  it('emits repeated speech_pause utterances across one session without carryover state', async () => {
    const { vad, sink } = await createCapture({
      nowMs: () => 7_000
    })

    await playVadScript(vad, [
      { type: 'speechStart' },
      { type: 'speechEnd', audio: new Float32Array(3_200).fill(0.2) },
      { type: 'speechStart' },
      { type: 'speechEnd', audio: new Float32Array(4_800).fill(0.3) },
      { type: 'speechStart' },
      { type: 'speechEnd', audio: new Float32Array(1_600).fill(0.1) }
    ])

    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenNthCalledWith(1, expect.objectContaining({
      utteranceIndex: 0,
      reason: 'speech_pause'
    }))
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenNthCalledWith(2, expect.objectContaining({
      utteranceIndex: 1,
      reason: 'speech_pause'
    }))
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenNthCalledWith(3, expect.objectContaining({
      utteranceIndex: 2,
      reason: 'speech_pause'
    }))
  })

  it('clears a misfire so the next valid utterance emits cleanly', async () => {
    const { vad, sink } = await createCapture({
      nowMs: () => 7_000
    })

    await playVadScript(vad, [
      { type: 'speechStart' },
      { type: 'frame', probabilities: { isSpeech: 0.2, notSpeech: 0.8 }, frame: new Float32Array(800).fill(0.05) },
      { type: 'misfire' },
      { type: 'speechStart' },
      { type: 'frame', probabilities: { isSpeech: 0.9, notSpeech: 0.1 }, frame: new Float32Array(1_600).fill(0.2) },
      { type: 'speechEnd', audio: new Float32Array(3_200).fill(0.2) }
    ])

    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledTimes(1)
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      utteranceIndex: 0,
      reason: 'speech_pause'
    }))
  })

  it('salvages a long misfire window into a speech_pause utterance', async () => {
    const events: GroqBrowserVadDebugEvent[] = []
    const { vad, sink } = await createCapture({
      nowMs: () => 7_000,
      onDebugEvent: (event) => {
        events.push(event)
      }
    })

    await vad.emitSpeechStart()
    for (let index = 0; index < 20; index += 1) {
      await vad.emitFrame(
        { isSpeech: index < 6 ? 0.14 : 0.04, notSpeech: index < 6 ? 0.86 : 0.96 },
        new Float32Array(512).fill(0.02)
      )
    }
    await vad.emitMisfire()

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'vad_misfire_salvaged',
        utteranceIndex: 0
      }),
      expect.objectContaining({
        type: 'utterance_sent',
        utteranceIndex: 0,
        reason: 'speech_pause'
      })
    ]))
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      utteranceIndex: 0,
      reason: 'speech_pause'
    }))
  })

  it('keeps emitting after mixed pause and misfire sequences', async () => {
    const { vad, sink } = await createCapture({
      nowMs: () => 7_000
    })

    await playVadScript(vad, [
      { type: 'speechStart' },
      { type: 'speechEnd', audio: new Float32Array(3_200).fill(0.2) },
      { type: 'speechStart' },
      { type: 'frame', probabilities: { isSpeech: 0.2, notSpeech: 0.8 }, frame: new Float32Array(600).fill(0.05) },
      { type: 'misfire' },
      { type: 'speechStart' },
      { type: 'speechEnd', audio: new Float32Array(2_400).fill(0.3) },
      { type: 'speechStart' },
      { type: 'speechRealStart' },
      { type: 'frame', probabilities: { isSpeech: 0.9, notSpeech: 0.1 }, frame: new Float32Array(1_600).fill(0.2) },
      { type: 'speechEnd', audio: new Float32Array(1_600).fill(0.2) }
    ])

    expect(sink.pushStreamingAudioUtteranceChunk.mock.calls.map(([chunk]) => ({
      utteranceIndex: chunk.utteranceIndex,
      reason: chunk.reason
    }))).toEqual([
      { utteranceIndex: 0, reason: 'speech_pause' },
      { utteranceIndex: 1, reason: 'speech_pause' },
      { utteranceIndex: 2, reason: 'speech_pause' }
    ])
  })

  it('uses epoch time for utterance timestamps even when the monotonic clock differs', async () => {
    const { vad, sink } = await createCapture({
      nowMs: () => 75,
      nowEpochMs: () => 1_700_000_007_000
    })

    await vad.emitSpeechStart()
    await vad.emitSpeechEnd(new Float32Array(16_000).fill(0.2))

    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      startedAtEpochMs: 1_700_000_006_000,
      endedAtEpochMs: 1_700_000_007_000
    }))
  })

  it('emits the bounded Groq handoff trace only when explicitly enabled', async () => {
    const logSpy = vi.spyOn(errorLogging, 'logStructured')
    const { vad } = await createCapture({
      sessionId: 'session-trace',
      traceEnabled: true,
      nowEpochMs: () => 1_700_000_007_000
    })

    await vad.emitSpeechStart()
    await vad.emitSpeechEnd(new Float32Array(1_600).fill(0.2))

    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: 'streaming.groq_utterance_trace',
      context: expect.objectContaining({
        sessionId: 'session-trace',
        utteranceIndex: 0,
        reason: 'speech_pause',
        wavBytesByteLength: expect.any(Number),
        endedAtEpochMs: 1_700_000_007_000,
        result: 'sealed'
      })
    }))
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: 'streaming.groq_utterance_trace',
      context: expect.objectContaining({
        sessionId: 'session-trace',
        utteranceIndex: 0,
        reason: 'speech_pause',
        wavBytesByteLength: expect.any(Number),
        endedAtEpochMs: 1_700_000_007_000,
        result: 'sent'
      })
    }))
  })

  it('uses PCM16 mono 16 kHz WAV bytes by default', async () => {
    const sink = {
      pushStreamingAudioUtteranceChunk: vi.fn(async (chunk: { wavBytes: ArrayBuffer }) => {
        void chunk
      })
    }
    await startGroqBrowserVadCapture({
      sessionId: 'session-1',
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink,
      onFatalError: vi.fn(),
      nowMs: () => 7_000,
      nowEpochMs: () => 1_700_000_007_000
    }, {
      createVad: FakeMicVad.create,
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })
    const vad = FakeMicVad.instances[0]!

    await vad.emitSpeechStart()
    await vad.emitSpeechEnd(new Float32Array(1_600).fill(0.2))

    const chunk = sink.pushStreamingAudioUtteranceChunk.mock.calls[0]?.[0]
    if (!chunk) {
      throw new Error('Expected a Groq utterance chunk to be emitted.')
    }
    const wavView = new DataView(chunk.wavBytes)
    expect(String.fromCharCode(wavView.getUint8(0), wavView.getUint8(1), wavView.getUint8(2), wavView.getUint8(3))).toBe('RIFF')
    expect(String.fromCharCode(wavView.getUint8(8), wavView.getUint8(9), wavView.getUint8(10), wavView.getUint8(11))).toBe('WAVE')
    expect(wavView.getUint16(20, true)).toBe(1)
    expect(wavView.getUint16(22, true)).toBe(1)
    expect(wavView.getUint32(24, true)).toBe(16_000)
    expect(wavView.getUint16(34, true)).toBe(16)
  })

  it('does not emit a stop utterance when explicit stop interrupts active speech', async () => {
    const { capture, vad, sink } = await createCapture()

    await vad.emitSpeechStart()
    await vad.emitFrame({ isSpeech: 0.8, notSpeech: 0.2 }, new Float32Array(3_200).fill(0.2))
    await vad.emitSpeechRealStart()
    await capture.stop()

    expect(vad.pause).not.toHaveBeenCalled()
    expect(sink.pushStreamingAudioUtteranceChunk).not.toHaveBeenCalled()
    expect(vad.destroy).toHaveBeenCalledOnce()
  })

  it('waits for an in-flight speech_pause push before stop completes', async () => {
    let releasePush: (() => void) | null = null
    const sink = {
      pushStreamingAudioUtteranceChunk: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          releasePush = resolve
        })
      })
    }
    const { capture, vad } = await createCapture({ sink })

    await vad.emitSpeechStart()
    const speechEndPromise = vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))
    await vi.waitFor(() => {
      expect(releasePush).not.toBeNull()
    })
    const stopPromise = capture.stop()
    await Promise.resolve()

    expect(vad.destroy).not.toHaveBeenCalled()
    const release = releasePush as (() => void) | null
    if (!release) {
      throw new Error('Expected speech_pause push to be pending.')
    }
    release()
    await speechEndPromise
    await stopPromise

    expect(vad.destroy).toHaveBeenCalledOnce()
  })

  it('ignores a late MicVAD speech_end callback after stop already destroyed capture', async () => {
    const { capture, vad, sink } = await createCapture({
      nowMs: () => 9_000
    })

    await vad.emitSpeechStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(3_200).fill(0.2))
    await vad.emitSpeechRealStart()
    await capture.stop()
    await vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))

    expect(sink.pushStreamingAudioUtteranceChunk).not.toHaveBeenCalled()
  })

  it('cancels without emitting a terminal utterance', async () => {
    const { capture, vad, sink } = await createCapture()

    await vad.emitSpeechStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(2_000).fill(0.2))
    await vad.emitSpeechRealStart()
    await capture.cancel()

    expect(vad.destroy).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioUtteranceChunk).not.toHaveBeenCalled()
  })

  it('signals backpressure pause and resume when utterance delivery blocks past the threshold', async () => {
    let resolvePush = (): void => {
      throw new Error('Push resolver was not captured.')
    }
    const backpressureEvents: Array<{ paused: boolean; durationMs?: number }> = []
    const sink = {
      pushStreamingAudioUtteranceChunk: vi.fn(async () => await new Promise<void>((resolve) => {
        resolvePush = resolve
      }))
    }
    const { vad } = await createCapture({
      sink,
      nowMs: () => 8_000,
      backpressureSignalMs: 100,
      onBackpressureStateChange: (state) => {
        backpressureEvents.push(state)
      }
    })

    const speechEndPromise = vad.emitSpeechStart()
      .then(async () => {
        await vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))
      })

    await vi.advanceTimersByTimeAsync(100)
    expect(backpressureEvents).toEqual([{ paused: true }])

    resolvePush()
    await speechEndPromise

    expect(backpressureEvents).toEqual([
      { paused: true },
      { paused: false, durationMs: 0 }
    ])
  })

  it('keeps working when the global timer host methods require the global receiver', async () => {
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout

    Object.defineProperty(globalThis, 'setTimeout', {
      configurable: true,
      value: function receiverSensitiveSetTimeout(
        this: typeof globalThis,
        handler: TimerHandler,
        timeout?: number,
        ...args: unknown[]
      ): ReturnType<typeof setTimeout> {
        if (this !== globalThis) {
          throw new TypeError('Illegal invocation')
        }
        return originalSetTimeout(handler, timeout, ...args) as unknown as ReturnType<typeof setTimeout>
      }
    })
    Object.defineProperty(globalThis, 'clearTimeout', {
      configurable: true,
      value: function receiverSensitiveClearTimeout(
        this: typeof globalThis,
        timeoutId?: ReturnType<typeof setTimeout>
      ): void {
        if (this !== globalThis) {
          throw new TypeError('Illegal invocation')
        }
        originalClearTimeout(timeoutId)
      }
    })

    try {
      const { vad, sink } = await createCapture({
        nowMs: () => 7_000
      })

      await vad.emitSpeechStart()
      await vad.emitSpeechEnd(new Float32Array(16_000).fill(0.2))

      expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledOnce()
    } finally {
      Object.defineProperty(globalThis, 'setTimeout', {
        configurable: true,
        value: originalSetTimeout
      })
      Object.defineProperty(globalThis, 'clearTimeout', {
        configurable: true,
        value: originalClearTimeout
      })
    }
  })

  it('does not orphan an utterance push when timer setup throws before transport starts', async () => {
    const sink = {
      pushStreamingAudioUtteranceChunk: vi.fn(async () => {})
    }
    const timerError = new TypeError('Illegal invocation')
    const onFatalError = vi.fn()
    const capture = await startGroqBrowserVadCapture({
      sessionId: 'session-1',
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink,
      onFatalError,
      nowMs: () => 8_000
    }, {
      createVad: FakeMicVad.create,
      encodeWav: (audio) => audio.buffer.slice(0),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })
    const vad = FakeMicVad.instances[0]!
    ;(capture as unknown as { setTimeoutFn: typeof setTimeout }).setTimeoutFn =
      vi.fn((): never => {
        throw timerError
      }) as unknown as typeof setTimeout

    await vad.emitSpeechStart()
    await expect(vad.emitSpeechEnd(new Float32Array(4_000).fill(0.2))).resolves.toBeUndefined()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Promise.resolve()
    }

    expect(sink.pushStreamingAudioUtteranceChunk).not.toHaveBeenCalled()
    expect(onFatalError).toHaveBeenCalledWith(timerError)
    expect(vad.destroy).toHaveBeenCalledOnce()
  })

  it('routes sink failures into fatal cleanup once', async () => {
    const logStructuredSpy = vi.spyOn(errorLogging, 'logStructured')
    const onFatalError = vi.fn()
    const sink = {
      pushStreamingAudioUtteranceChunk: vi.fn(async () => {
        throw new Error('utterance push failed')
      })
    }
    await startGroqBrowserVadCapture({
      sessionId: 'session-1',
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink,
      onFatalError,
      nowMs: () => 8_000
    }, {
      createVad: FakeMicVad.create,
      encodeWav: (audio) => audio.buffer.slice(0),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })

    const vad = FakeMicVad.instances[0]!
    await vad.emitSpeechStart()
    await vad.emitSpeechEnd(new Float32Array(4_000).fill(0.2))
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Promise.resolve()
    }

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'utterance push failed' }))
    expect(vad.destroy).toHaveBeenCalledOnce()
    expect(logStructuredSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: 'streaming.groq_vad.stop_begin',
      context: expect.objectContaining({ reason: 'fatal_error' })
    }))
  })

  it('fails startup when the VAD factory never resolves', async () => {
    const never = new Promise<FakeMicVad>(() => {})

    const startupPromise = startGroqBrowserVadCapture({
      sessionId: 'session-1',
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink: {
        pushStreamingAudioUtteranceChunk: vi.fn(async () => {})
      },
      onFatalError: vi.fn(),
      config: {
        startupTimeoutMs: 250
      }
    }, {
      createVad: vi.fn(async () => await never) as unknown as typeof FakeMicVad.create,
      encodeWav: (audio) => audio.buffer.slice(0),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })
    const handledStartupPromise = startupPromise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(250)
    const startupError = await handledStartupPromise
    expect(startupError).toEqual(expect.objectContaining({
      message: 'Timed out starting Groq browser VAD capture.'
    }))
  })

  it('destroys a MicVAD instance that resolves after the startup timeout already fired', async () => {
    const delayedVadResolver: { current: ((vad: FakeMicVad) => void) | null } = { current: null }
    const lateVad = new FakeMicVad({})

    const startupPromise = startGroqBrowserVadCapture({
      sessionId: 'session-1',
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink: {
        pushStreamingAudioUtteranceChunk: vi.fn(async () => {})
      },
      onFatalError: vi.fn(),
      config: {
        startupTimeoutMs: 250
      }
    }, {
      createVad: vi.fn(async () => await new Promise<FakeMicVad>((resolve) => {
        delayedVadResolver.current = resolve
      })) as unknown as typeof FakeMicVad.create,
      encodeWav: (audio) => audio.buffer.slice(0),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })
    const handledStartupPromise = startupPromise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(250)
    const startupError = await handledStartupPromise
    expect(startupError).toEqual(expect.objectContaining({
      message: 'Timed out starting Groq browser VAD capture.'
    }))

    const resolveLateVad = delayedVadResolver.current
    if (!resolveLateVad) {
      throw new Error('Expected createVad resolver to be captured.')
    }
    resolveLateVad(lateVad)
    await Promise.resolve()
    await Promise.resolve()

    expect(lateVad.destroy).toHaveBeenCalledOnce()
  })

  it('stops a microphone stream that resolves after the startup timeout already fired', async () => {
    const delayedStreamResolver: { current: ((stream: MediaStream) => void) | null } = { current: null }
    const stopTrack = vi.fn()
    const lateStream = {
      getTracks: () => [{ stop: stopTrack }]
    } as unknown as MediaStream

    const startupPromise = startGroqBrowserVadCapture({
      sessionId: 'session-1',
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink: {
        pushStreamingAudioUtteranceChunk: vi.fn(async () => {})
      },
      onFatalError: vi.fn(),
      config: {
        startupTimeoutMs: 250
      }
    }, {
      createVad: FakeMicVad.create,
      encodeWav: (audio) => audio.buffer.slice(0),
      getUserMedia: vi.fn(async () => await new Promise<MediaStream>((resolve) => {
        delayedStreamResolver.current = resolve
      }))
    })
    const handledStartupPromise = startupPromise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(250)
    const startupError = await handledStartupPromise
    expect(startupError).toEqual(expect.objectContaining({
      message: 'Timed out starting Groq browser VAD capture.'
    }))

    const resolveLateStream = delayedStreamResolver.current
    if (!resolveLateStream) {
      throw new Error('Expected getUserMedia resolver to be captured.')
    }
    resolveLateStream(lateStream)
    await Promise.resolve()
    await Promise.resolve()

    expect(stopTrack).toHaveBeenCalledOnce()
  })
})
