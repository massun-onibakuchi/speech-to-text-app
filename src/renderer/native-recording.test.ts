/*
Where: src/renderer/native-recording.test.ts
What: Unit tests for renderer-native recording command dispatch idle guards.
Why: Ensure stop/cancel commands show clear feedback instead of silent/success paths when no recording is active.
*/

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import type { GroqBrowserVadCapture } from './groq-browser-vad-capture'

const { startGroqBrowserVadCaptureMock } = vi.hoisted(() => ({
  startGroqBrowserVadCaptureMock: vi.fn<
    (typeof import('./groq-browser-vad-capture'))['startGroqBrowserVadCapture']
  >(async () => ({
    stop: vi.fn(async () => {}),
    cancel: vi.fn(async () => {})
  }) satisfies GroqBrowserVadCapture)
}))

vi.mock('./groq-browser-vad-capture', () => ({
  startGroqBrowserVadCapture: startGroqBrowserVadCaptureMock
}))

import {
  handleRecordingCommandDispatch,
  handleStreamingSessionStateUpdate,
  pollRecordingOutcome,
  resetRecordingState,
  resolveSuccessfulRecordingMessage,
  type NativeRecordingDeps
} from './native-recording'

const createDeps = (): { deps: NativeRecordingDeps; state: NativeRecordingDeps['state'] } => {
  const state: NativeRecordingDeps['state'] = {
    settings: structuredClone(DEFAULT_SETTINGS),
    apiKeyStatus: { groq: true, elevenlabs: true, google: true },
    audioInputSources: [],
    audioSourceHint: '',
    hasCommandError: true,
    pendingActionId: 'recording:cancelRecording',
    pendingStreamingSessionId: null,
    pendingStreamingCommandToken: null,
    streamingSessionState: {
      sessionId: null,
      state: 'idle',
      provider: null,
      transport: null,
      model: null,
      reason: null
    }
  }

  const deps: NativeRecordingDeps = {
    state,
    addActivity: vi.fn(),
    addTerminalActivity: vi.fn(),
    addToast: vi.fn(),
    logError: vi.fn(),
    onStateChange: vi.fn()
  }

  return { deps, state }
}

let getUserMediaMock: ReturnType<typeof vi.fn>
let audioContextResumeMock: ReturnType<typeof vi.fn>
let audioContextCloseMock: ReturnType<typeof vi.fn>

class FakeAudioWorkletNode {
  readonly connect = vi.fn()
  readonly disconnect = vi.fn()
  readonly addEventListener = vi.fn()
  readonly removeEventListener = vi.fn()
  readonly port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: vi.fn((message: { type: 'flush' }) => {
      if (message.type === 'flush') {
        this.port.onmessage?.({ data: { type: 'flush_complete' } })
      }
    })
  }

  constructor(
    readonly context: AudioContext,
    readonly name: string,
    readonly options?: AudioWorkletNodeOptions
  ) {}
}

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => false)
  mimeType = 'audio/webm'
  private readonly listeners = new Map<string, Array<(event?: any) => void>>()

  addEventListener(event: string, listener: (event?: any) => void): void {
    const existing = this.listeners.get(event) ?? []
    existing.push(listener)
    this.listeners.set(event, existing)
  }

  start(): void {
    // No-op for start-path tests.
  }

  stop(): void {
    for (const listener of this.listeners.get('stop') ?? []) {
      listener()
    }
  }
}

describe('handleRecordingCommandDispatch', () => {
  beforeEach(() => {
    resetRecordingState()
    vi.clearAllMocks()
    startGroqBrowserVadCaptureMock.mockReset()
    startGroqBrowserVadCaptureMock.mockResolvedValue({
      stop: vi.fn(async () => {}),
      cancel: vi.fn(async () => {})
    })
    getUserMediaMock = vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }]
    }))
    audioContextResumeMock = vi.fn(async () => {})
    audioContextCloseMock = vi.fn(async () => {})
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      playSound: vi.fn(),
      getHistory: vi.fn(),
      submitRecordedAudio: vi.fn(),
      pushStreamingAudioFrameBatch: vi.fn(),
      pushStreamingAudioUtteranceChunk: vi.fn(),
      stopStreamingSession: vi.fn(async (_request) => {}),
      ackStreamingRendererStop: vi.fn(async (_ack) => {})
    }
    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: FakeMediaRecorder,
      configurable: true
    })
    Object.defineProperty(globalThis, 'AudioWorkletNode', {
      value: FakeAudioWorkletNode,
      configurable: true
    })
    Object.defineProperty(globalThis, 'AudioContext', {
      value: class FakeAudioContext {
        sampleRate = 16000
        state: AudioContextState = 'running'
        destination = {} as AudioDestinationNode
        audioWorklet = {
          addModule: vi.fn(async () => {})
        }

        createMediaStreamSource = vi.fn(() => ({
          connect: vi.fn(),
          disconnect: vi.fn()
        }))

        createGain = vi.fn(() => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
          gain: { value: 0 }
        }))

        resume = audioContextResumeMock
        close = audioContextCloseMock
      },
      configurable: true
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaMock
      },
      configurable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an idle message and keeps state unchanged for cancelRecording when no recording is active',
    async () => {
      const { deps, state } = createDeps()
      const beforeState = structuredClone(state)

      await handleRecordingCommandDispatch(deps, { command: 'cancelRecording' })

      expect(deps.addToast).toHaveBeenCalledWith('Recording is not in progress.', 'info')
      expect(deps.onStateChange).not.toHaveBeenCalled()
      expect(deps.logError).not.toHaveBeenCalled()
      expect(state).toEqual(beforeState)
      expect(window.speechToTextApi.playSound).not.toHaveBeenCalled()
    }
  )

  it(
    'plays the start recording sound even when the app document is not focused (background hotkey)',
    async () => {
      const { deps, state } = createDeps()
      vi.spyOn(document, 'hasFocus').mockReturnValue(false)

      await handleRecordingCommandDispatch(deps, { command: 'toggleRecording' })

      expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('recording_started')
      expect(deps.addToast).toHaveBeenCalledWith('Recording started.', 'success')
      expect(deps.onStateChange).toHaveBeenCalledOnce()
      expect(state.hasCommandError).toBe(false)
    }
  )

  it(
    'does not start recording or play sounds when toggleRecording is blocked by transformed output without Google key',
    async () => {
      const { deps, state } = createDeps()
      state.settings = structuredClone(DEFAULT_SETTINGS)
      state.settings.output.selectedTextSource = 'transformed'
      state.apiKeyStatus = { groq: true, elevenlabs: true, google: false }

      await handleRecordingCommandDispatch(deps, { command: 'toggleRecording' })

      expect(getUserMediaMock).not.toHaveBeenCalled()
      expect(window.speechToTextApi.playSound).not.toHaveBeenCalled()
      expect(deps.addToast).toHaveBeenCalledWith(
        'toggleRecording failed: Missing Google API key. Add it in Settings > LLM Transformation, or switch output mode to Transcript.',
        'error'
      )
      expect(deps.onStateChange).toHaveBeenCalledOnce()
      expect(state.hasCommandError).toBe(true)
    }
  )

  it('starts live streaming capture from streaming_start without batch STT or transform key gating', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'local_whispercpp_coreml'
    state.settings.processing.streaming.transport = 'native_stream'
    state.settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    state.settings.output.selectedTextSource = 'transformed'
    state.apiKeyStatus = { groq: false, elevenlabs: false, google: false }
    state.streamingSessionState = {
      sessionId: 'session-start',
      state: 'starting',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-start',
      preferredDeviceId: 'mic-1'
    })

    expect(getUserMediaMock).toHaveBeenCalledOnce()
    expect(audioContextResumeMock).toHaveBeenCalledOnce()
    expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('recording_started')
    expect(deps.addToast).toHaveBeenCalledWith('Recording started.', 'success')
    expect(state.hasCommandError).toBe(false)
  })

  it('starts live streaming capture from explicit streaming_start dispatch', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'local_whispercpp_coreml'
    state.settings.processing.streaming.transport = 'native_stream'
    state.settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    state.streamingSessionState = {
      sessionId: 'session-1',
      state: 'starting',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-1',
      preferredDeviceId: 'mic-1'
    })

    expect(getUserMediaMock).toHaveBeenCalledOnce()
    expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('recording_started')
    expect(deps.addToast).toHaveBeenCalledWith('Recording started.', 'success')
    expect(state.hasCommandError).toBe(false)
  })

  it('starts Groq streaming with browser VAD and skips the frame-stream AudioContext path', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'groq_whisper_large_v3_turbo'
    state.settings.processing.streaming.transport = 'rolling_upload'
    state.settings.processing.streaming.model = 'whisper-large-v3-turbo'
    state.streamingSessionState = {
      sessionId: 'session-groq',
      state: 'starting',
      provider: 'groq_whisper_large_v3_turbo',
      transport: 'rolling_upload',
      model: 'whisper-large-v3-turbo',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-groq',
      preferredDeviceId: 'mic-1'
    })

    expect(startGroqBrowserVadCaptureMock).toHaveBeenCalledOnce()
    expect(audioContextResumeMock).not.toHaveBeenCalled()
    expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('recording_started')
    expect(deps.addToast).toHaveBeenCalledWith('Recording started.', 'success')
    expect(state.hasCommandError).toBe(false)
  })

  it('bridges Groq browser-VAD utterances into dedicated utterance IPC with the session id', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'groq_whisper_large_v3_turbo'
    state.settings.processing.streaming.transport = 'rolling_upload'
    state.settings.processing.streaming.model = 'whisper-large-v3-turbo'
    state.streamingSessionState = {
      sessionId: 'session-groq-bridge',
      state: 'starting',
      provider: 'groq_whisper_large_v3_turbo',
      transport: 'rolling_upload',
      model: 'whisper-large-v3-turbo',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-groq-bridge',
      preferredDeviceId: 'mic-1'
    })

    const groqCaptureOptions = startGroqBrowserVadCaptureMock.mock.calls[0]?.[0]
    if (!groqCaptureOptions) {
      throw new Error('Expected Groq capture options to be passed to the browser VAD starter.')
    }

    const wavBytes = new Uint8Array([1, 2, 3, 4]).buffer
    await groqCaptureOptions.sink.pushStreamingAudioUtteranceChunk({
      sampleRateHz: 16_000,
      channels: 1,
      utteranceIndex: 0,
      wavBytes,
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtEpochMs: 1_500,
      endedAtEpochMs: 1_800,
      reason: 'speech_pause',
      source: 'browser_vad'
    })

    expect(window.speechToTextApi.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith({
      sessionId: 'session-groq-bridge',
      sampleRateHz: 16_000,
      channels: 1,
      utteranceIndex: 0,
      wavBytes,
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtEpochMs: 1_500,
      endedAtEpochMs: 1_800,
      reason: 'speech_pause',
      source: 'browser_vad'
    })
  })

  it('surfaces Groq upload backpressure pause and resume through renderer activity', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'groq_whisper_large_v3_turbo'
    state.settings.processing.streaming.transport = 'rolling_upload'
    state.settings.processing.streaming.model = 'whisper-large-v3-turbo'
    state.streamingSessionState = {
      sessionId: 'session-groq-backpressure',
      state: 'starting',
      provider: 'groq_whisper_large_v3_turbo',
      transport: 'rolling_upload',
      model: 'whisper-large-v3-turbo',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-groq-backpressure',
      preferredDeviceId: 'mic-1'
    })

    const groqCaptureOptions = startGroqBrowserVadCaptureMock.mock.calls[0]?.[0]
    if (!groqCaptureOptions?.onBackpressureStateChange) {
      throw new Error('Expected Groq capture to receive an onBackpressureStateChange hook.')
    }

    groqCaptureOptions.onBackpressureStateChange({ paused: true })
    groqCaptureOptions.onBackpressureStateChange({ paused: false, durationMs: 425 })

    expect(deps.addToast).toHaveBeenCalledWith(
      'Groq upload backlog detected. Live dictation is waiting for uploads.',
      'info'
    )
    expect(deps.addActivity).toHaveBeenCalledWith(
      'Groq upload backlog detected. Pausing utterance delivery until the queue drains.',
      'info'
    )
    expect(deps.addActivity).toHaveBeenCalledWith(
      'Groq upload backlog cleared after 425 ms.',
      'info'
    )
  })

  it('stops live streaming capture and acknowledges explicit streaming stop requests', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'local_whispercpp_coreml'
    state.settings.processing.streaming.transport = 'native_stream'
    state.settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    state.streamingSessionState = {
      sessionId: 'session-2',
      state: 'active',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-2',
      preferredDeviceId: 'mic-1'
    })
    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_stop_requested',
      sessionId: 'session-2',
      reason: 'user_stop'
    })

    expect(audioContextCloseMock).toHaveBeenCalledOnce()
    expect(window.speechToTextApi.ackStreamingRendererStop).toHaveBeenCalledWith({
      sessionId: 'session-2',
      reason: 'user_stop'
    })
    expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('recording_stopped')
  })

  it('ignores stale streaming stop requests for an older session', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'local_whispercpp_coreml'
    state.settings.processing.streaming.transport = 'native_stream'
    state.settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    state.streamingSessionState = {
      sessionId: 'session-live',
      state: 'active',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-live',
      preferredDeviceId: 'mic-1'
    })
    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_stop_requested',
      sessionId: 'session-stale',
      reason: 'user_stop'
    })

    expect(audioContextCloseMock).not.toHaveBeenCalled()
    expect(window.speechToTextApi.ackStreamingRendererStop).not.toHaveBeenCalled()
    expect(window.speechToTextApi.playSound).toHaveBeenCalledTimes(1)
    expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('recording_started')
  })

  it('acknowledges a matching stop request at most once', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'local_whispercpp_coreml'
    state.settings.processing.streaming.transport = 'native_stream'
    state.settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    state.streamingSessionState = {
      sessionId: 'session-ack-once',
      state: 'active',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-ack-once',
      preferredDeviceId: 'mic-1'
    })
    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_stop_requested',
      sessionId: 'session-ack-once',
      reason: 'user_stop'
    })
    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_stop_requested',
      sessionId: 'session-ack-once',
      reason: 'user_stop'
    })

    expect(window.speechToTextApi.ackStreamingRendererStop).toHaveBeenCalledTimes(1)
  })

  it('cancels live streaming capture when the main session fails', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'local_whispercpp_coreml'
    state.settings.processing.streaming.transport = 'native_stream'
    state.settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    state.streamingSessionState = {
      sessionId: 'session-1',
      state: 'active',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-1',
      preferredDeviceId: 'mic-1'
    })
    await handleStreamingSessionStateUpdate(deps, {
      sessionId: 'session-1',
      state: 'failed',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'fatal_error'
    })

    expect(audioContextCloseMock).toHaveBeenCalledOnce()
    expect(deps.addToast).toHaveBeenCalledTimes(1)
    expect(deps.addToast).toHaveBeenLastCalledWith('Recording started.', 'success')
    expect(state.hasCommandError).toBe(true)
  })

  it('stops Groq browser-VAD capture with fatal_error when the main session fails', async () => {
    const stop = vi.fn(async () => {})
    const cancel = vi.fn(async () => {})
    startGroqBrowserVadCaptureMock.mockResolvedValueOnce({
      stop,
      cancel
    })

    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'groq_whisper_large_v3_turbo'
    state.settings.processing.streaming.transport = 'rolling_upload'
    state.settings.processing.streaming.model = 'whisper-large-v3-turbo'
    state.streamingSessionState = {
      sessionId: 'session-groq-fatal',
      state: 'active',
      provider: 'groq_whisper_large_v3_turbo',
      transport: 'rolling_upload',
      model: 'whisper-large-v3-turbo',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-groq-fatal',
      preferredDeviceId: 'mic-1'
    })
    await handleStreamingSessionStateUpdate(deps, {
      sessionId: 'session-groq-fatal',
      state: 'failed',
      provider: 'groq_whisper_large_v3_turbo',
      transport: 'rolling_upload',
      model: 'whisper-large-v3-turbo',
      reason: 'fatal_error'
    })

    expect(stop).toHaveBeenCalledWith('fatal_error')
    expect(cancel).not.toHaveBeenCalled()
    expect(state.hasCommandError).toBe(true)
  })

  it('still cancels Groq browser-VAD capture for explicit user_cancel terminal states', async () => {
    const stop = vi.fn(async () => {})
    const cancel = vi.fn(async () => {})
    startGroqBrowserVadCaptureMock.mockResolvedValueOnce({
      stop,
      cancel
    })

    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'groq_whisper_large_v3_turbo'
    state.settings.processing.streaming.transport = 'rolling_upload'
    state.settings.processing.streaming.model = 'whisper-large-v3-turbo'
    state.streamingSessionState = {
      sessionId: 'session-groq-cancel',
      state: 'active',
      provider: 'groq_whisper_large_v3_turbo',
      transport: 'rolling_upload',
      model: 'whisper-large-v3-turbo',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-groq-cancel',
      preferredDeviceId: 'mic-1'
    })
    await handleStreamingSessionStateUpdate(deps, {
      sessionId: 'session-groq-cancel',
      state: 'ended',
      provider: 'groq_whisper_large_v3_turbo',
      transport: 'rolling_upload',
      model: 'whisper-large-v3-turbo',
      reason: 'user_cancel'
    })

    expect(cancel).toHaveBeenCalledOnce()
    expect(stop).not.toHaveBeenCalled()
  })

  it('ignores terminal session updates for a stale session while a newer capture is active', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.processing.mode = 'streaming'
    state.settings.processing.streaming.enabled = true
    state.settings.processing.streaming.provider = 'local_whispercpp_coreml'
    state.settings.processing.streaming.transport = 'native_stream'
    state.settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    state.streamingSessionState = {
      sessionId: 'session-current',
      state: 'active',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    }

    await handleRecordingCommandDispatch(deps, {
      kind: 'streaming_start',
      sessionId: 'session-current',
      preferredDeviceId: 'mic-1'
    })
    await handleStreamingSessionStateUpdate(deps, {
      sessionId: 'session-old',
      state: 'ended',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'user_stop'
    })

    expect(audioContextCloseMock).not.toHaveBeenCalled()
  })
})

describe('resolveSuccessfulRecordingMessage', () => {
  const baseRecord = {
    jobId: 'job-1',
    capturedAt: '2026-02-28T10:00:00.000Z',
    transcriptText: 'raw transcript text',
    transformedText: 'final transformed text',
    terminalStatus: 'succeeded' as const,
    failureDetail: null,
    failureCategory: null,
    createdAt: '2026-02-28T10:00:01.000Z'
  }

  it('returns transformed text when transformed source is selected', () => {
    expect(resolveSuccessfulRecordingMessage(baseRecord, 'transformed')).toBe('final transformed text')
  })

  it('returns transcript text when transcript source is selected', () => {
    expect(resolveSuccessfulRecordingMessage(baseRecord, 'transcript')).toBe('raw transcript text')
  })

  it('falls back to transcript when transformed source is selected but transformed text is unavailable', () => {
    expect(
      resolveSuccessfulRecordingMessage(
        {
          ...baseRecord,
          transformedText: null
        },
        'transformed'
      )
    ).toBe('raw transcript text')
  })

  it('falls back to transformed text when transcript source is selected but transcript is unavailable', () => {
    expect(
      resolveSuccessfulRecordingMessage(
        {
          ...baseRecord,
          transcriptText: null
        },
        'transcript'
      )
    ).toBe('final transformed text')
  })

  it('returns the default completion message when neither transcript nor transformed text is available', () => {
    expect(
      resolveSuccessfulRecordingMessage(
        {
          ...baseRecord,
          transcriptText: null,
          transformedText: null
        },
        'transformed'
      )
    ).toBe('Transcription complete.')
  })
})

describe('pollRecordingOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('appends transformed terminal activity when transformed source is selected', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.output.selectedTextSource = 'transformed'

    window.speechToTextApi.getHistory = vi.fn(async () => [
      {
        jobId: 'job-1',
        capturedAt: '2026-02-28T10:00:00.000Z',
        transcriptText: 'raw transcript text',
        transformedText: 'final transformed text',
        terminalStatus: 'succeeded' as const,
        failureDetail: null,
        failureCategory: null,
        createdAt: '2026-02-28T10:00:01.000Z'
      }
    ])

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z')

    expect(deps.addTerminalActivity).toHaveBeenCalledWith('final transformed text', 'success')
    expect(deps.addToast).toHaveBeenCalledWith('Transcription complete.', 'success')
  })

  it('falls back to transcript terminal activity when transformed text is absent', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.output.selectedTextSource = 'transformed'

    window.speechToTextApi.getHistory = vi.fn(async () => [
      {
        jobId: 'job-1',
        capturedAt: '2026-02-28T10:00:00.000Z',
        transcriptText: 'raw transcript text',
        transformedText: null,
        terminalStatus: 'succeeded' as const,
        failureDetail: null,
        failureCategory: null,
        createdAt: '2026-02-28T10:00:01.000Z'
      }
    ])

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z')

    expect(deps.addTerminalActivity).toHaveBeenCalledWith('raw transcript text', 'success')
  })

  it('continues polling after initial timeout and appends late transformed terminal activity', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.output.selectedTextSource = 'transformed'

    window.speechToTextApi.getHistory = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          jobId: 'job-1',
          capturedAt: '2026-02-28T10:00:00.000Z',
          transcriptText: 'raw transcript text',
          transformedText: 'final transformed text',
          terminalStatus: 'succeeded',
          failureDetail: null,
          failureCategory: null,
          createdAt: '2026-02-28T10:00:01.000Z'
        }
      ])

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z', {
      initialPhase: { attempts: 2, delayMs: 0 },
      followUpPhase: { attempts: 2, delayMs: 0 }
    })

    expect(deps.addTerminalActivity).toHaveBeenCalledWith('final transformed text', 'success')
    expect(deps.addTerminalActivity).toHaveBeenCalledTimes(1)
    expect(window.speechToTextApi.getHistory).toHaveBeenCalledTimes(3)
  })

  it('shows one info notice and no terminal activity when no terminal record appears in either poll phase', async () => {
    const { deps } = createDeps()
    window.speechToTextApi.getHistory = vi.fn().mockResolvedValue([])

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z', {
      initialPhase: { attempts: 2, delayMs: 0 },
      followUpPhase: { attempts: 2, delayMs: 0 }
    })

    expect(deps.addTerminalActivity).not.toHaveBeenCalled()
    expect(window.speechToTextApi.getHistory).toHaveBeenCalledTimes(4)
  })

  it('reports history refresh error during follow-up polling and does not append terminal activity', async () => {
    const { deps } = createDeps()
    window.speechToTextApi.getHistory = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network down'))

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z', {
      initialPhase: { attempts: 1, delayMs: 0 },
      followUpPhase: { attempts: 2, delayMs: 0 }
    })

    expect(deps.addTerminalActivity).not.toHaveBeenCalled()
  })
})
