/*
Where: src/renderer/streaming-live-capture.ts
What: Browser PCM capture for streaming mode using AudioContext + AudioWorklet.
Why: Keep long-lived streaming capture isolated from the batch MediaRecorder path
     while preserving a provider-neutral frame transport contract.
*/

import type { StreamingSessionStopReason } from '../shared/ipc'
import {
  DEFAULT_STREAMING_AUDIO_INGRESS_LIMITS,
  StreamingAudioIngress,
  type StreamingAudioIngressSink
} from './streaming-audio-ingress'
import {
  DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS,
  StreamingSpeechChunker,
  type StreamingSpeechChunkerOptions
} from './streaming-speech-chunker'

export interface StreamingLiveCapture {
  stop(reason?: StreamingSessionStopReason): Promise<void>
  cancel(): Promise<void>
}

export interface StreamingLiveCaptureOptions {
  deviceConstraints: MediaTrackConstraints
  requestedSampleRateHz: number
  channels: 1
  sink: StreamingAudioIngressSink
  onFatalError: (error: unknown) => void
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  createAudioContext?: (options?: AudioContextOptions) => AudioContext
  nowMs?: () => number
  processorBufferSize?: number
  maxFramesPerBatch?: number
  maxQueuedBatches?: number
  chunker?: StreamingSpeechChunkerOptions
}

type StreamingAudioCaptureWorkletMessage =
  | {
    type: 'audio_frame'
    samples: Float32Array
    timestampMs: number
  }
  | {
    type: 'flush_complete'
  }

export const STREAMING_AUDIO_CAPTURE_WORKLET_NAME = 'streaming-audio-capture-processor'

const STREAMING_AUDIO_CAPTURE_WORKLET_URL = new URL('./streaming-audio-capture-worklet.js', import.meta.url).href
const STREAMING_AUDIO_CAPTURE_FLUSH_TIMEOUT_MS = 250

export const STREAMING_LIVE_CAPTURE_DEFAULTS = {
  processorBufferSize: 2048,
  maxFramesPerBatch: DEFAULT_STREAMING_AUDIO_INGRESS_LIMITS.maxFramesPerBatch,
  maxQueuedBatches: DEFAULT_STREAMING_AUDIO_INGRESS_LIMITS.maxQueuedBatches,
  chunker: DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS
} as const

const closeAudioContextSafely = async (audioContext: AudioContext): Promise<void> => {
  try {
    if (audioContext.state !== 'closed') {
      await audioContext.close()
    }
  } catch {
    // Closing is best-effort during teardown only.
  }
}

const isAudioWorkletSupported = (audioContext: AudioContext): boolean =>
  typeof AudioWorkletNode !== 'undefined' && typeof audioContext.audioWorklet?.addModule === 'function'

const delayMs = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

class BrowserStreamingLiveCapture implements StreamingLiveCapture {
  private readonly mediaStream: MediaStream
  private readonly audioContext: AudioContext
  private readonly sourceNode: MediaStreamAudioSourceNode
  private readonly captureNode: AudioWorkletNode
  private readonly muteGainNode: GainNode
  private readonly ingress: StreamingAudioIngress
  private readonly chunker: StreamingSpeechChunker
  private readonly onFatalError: (error: unknown) => void
  private readonly nowMs: () => number
  private readonly handleProcessorError: () => void
  private fatalNotified = false
  private stopping = false
  private stopped = false
  private pendingFlushPromise: Promise<void> | null = null
  private resolvePendingFlush: (() => void) | null = null

  constructor(params: {
    mediaStream: MediaStream
    audioContext: AudioContext
    sourceNode: MediaStreamAudioSourceNode
    captureNode: AudioWorkletNode
    muteGainNode: GainNode
    ingress: StreamingAudioIngress
    chunker: StreamingSpeechChunker
    onFatalError: (error: unknown) => void
    nowMs: () => number
  }) {
    this.mediaStream = params.mediaStream
    this.audioContext = params.audioContext
    this.sourceNode = params.sourceNode
    this.captureNode = params.captureNode
    this.muteGainNode = params.muteGainNode
    this.ingress = params.ingress
    this.chunker = params.chunker
    this.onFatalError = params.onFatalError
    this.nowMs = params.nowMs

    this.handleProcessorError = () => {
      this.resolvePendingWorkletFlush()
      if (this.stopping || this.stopped) {
        return
      }
      this.reportFatalError(new Error('AudioWorklet capture failed.'))
    }

    this.captureNode.port.onmessage = (event: MessageEvent<StreamingAudioCaptureWorkletMessage>) => {
      if (event.data?.type === 'flush_complete') {
        this.resolvePendingWorkletFlush()
        return
      }

      if (this.stopping || this.stopped) {
        return
      }

      if (event.data?.type !== 'audio_frame') {
        return
      }

      const samples = event.data.samples
      if (!(samples instanceof Float32Array) || samples.length === 0) {
        return
      }

      const frame = {
        samples: new Float32Array(samples),
        timestampMs: this.resolveFrameTimestampMs(event.data.timestampMs)
      }

      try {
        const drainPromise = this.ingress.pushFrame(frame)
        if (drainPromise) {
          void drainPromise.catch((error) => {
            this.reportFatalError(error)
          })
        }
        const observation = this.chunker.observeFrame(frame, this.audioContext.sampleRate)
        if (observation.shouldDiscardPending) {
          void this.ingress.discardPendingChunk().catch((error) => {
            this.reportFatalError(error)
          })
        }
        if (observation.shouldFlush) {
          void this.ingress.flush(observation.reason ?? 'speech_pause').catch((error) => {
            this.reportFatalError(error)
          })
        }
      } catch (error) {
        this.reportFatalError(error)
      }
    }
    this.captureNode.addEventListener('processorerror', this.handleProcessorError)
  }

  async stop(reason: StreamingSessionStopReason = 'user_stop'): Promise<void> {
    if (this.stopped || this.stopping) {
      return
    }

    this.stopping = true
    let stopError: unknown = null

    try {
      if (reason !== 'user_cancel' && reason !== 'fatal_error') {
        await this.flushWorkletCapture()
      }
    } catch (error) {
      stopError = error
    } finally {
      this.stopped = true
      this.stopping = false
      this.resolvePendingWorkletFlush()
      this.captureNode.port.onmessage = null
      this.captureNode.removeEventListener('processorerror', this.handleProcessorError)

      try {
        this.sourceNode.disconnect()
      } catch {
        // Disconnect is best-effort during teardown only.
      }
      try {
        this.captureNode.disconnect()
      } catch {
        // Disconnect is best-effort during teardown only.
      }
      try {
        this.muteGainNode.disconnect()
      } catch {
        // Disconnect is best-effort during teardown only.
      }
    }

    try {
      if (reason === 'user_cancel' || reason === 'fatal_error') {
        this.ingress.cancel()
      } else {
        await this.ingress.stop()
      }
    } catch (error) {
      stopError = stopError ?? error
    } finally {
      this.chunker.reset()
      for (const track of this.mediaStream.getTracks()) {
        track.stop()
      }
      await closeAudioContextSafely(this.audioContext)
    }

    if (stopError && reason !== 'user_stop') {
      throw stopError
    }
  }

  async cancel(): Promise<void> {
    await this.stop('user_cancel')
  }

  private async flushWorkletCapture(): Promise<void> {
    if (this.pendingFlushPromise) {
      await this.pendingFlushPromise
      return
    }

    let resolveFlush: (() => void) | null = null
    this.pendingFlushPromise = new Promise<void>((resolve) => {
      resolveFlush = resolve
    })
    this.resolvePendingFlush = resolveFlush

    this.captureNode.port.postMessage({ type: 'flush' })
    await Promise.race([
      this.pendingFlushPromise,
      delayMs(STREAMING_AUDIO_CAPTURE_FLUSH_TIMEOUT_MS).then(() => {
        this.resolvePendingWorkletFlush()
      })
    ])
  }

  private resolvePendingWorkletFlush(): void {
    const resolve = this.resolvePendingFlush
    this.pendingFlushPromise = null
    this.resolvePendingFlush = null
    resolve?.()
  }

  private reportFatalError(error: unknown): void {
    // Once an explicit stop/cancel is underway, late drain failures should not
    // reclassify the session as fatal or reopen teardown.
    if (this.stopping || this.stopped || this.fatalNotified) {
      return
    }
    this.fatalNotified = true
    this.resolvePendingWorkletFlush()
    void this.stop('fatal_error').finally(() => {
      this.onFatalError(error)
    })
  }

  private resolveFrameTimestampMs(timestampMs: number): number {
    if (typeof timestampMs === 'number' && Number.isFinite(timestampMs)) {
      return timestampMs
    }
    return this.nowMs()
  }
}

export const startStreamingLiveCapture = async (options: StreamingLiveCaptureOptions): Promise<StreamingLiveCapture> => {
  const getUserMedia = options.getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
  if (!getUserMedia) {
    throw new Error('This environment does not support microphone recording.')
  }

  const createAudioContext = options.createAudioContext ?? ((contextOptions?: AudioContextOptions) => new AudioContext(contextOptions))
  const nowMs = options.nowMs ?? (() => performance.now())
  let mediaStream: MediaStream | null = null
  let audioContext: AudioContext | null = null

  try {
    mediaStream = await getUserMedia({
      audio: options.deviceConstraints
    })
    audioContext = createAudioContext({
      sampleRate: options.requestedSampleRateHz
    })

    if (!isAudioWorkletSupported(audioContext)) {
      throw new Error('This environment does not support live PCM streaming capture.')
    }

    await audioContext.audioWorklet.addModule(STREAMING_AUDIO_CAPTURE_WORKLET_URL)

    const sourceNode = audioContext.createMediaStreamSource(mediaStream)
    const captureNode = new AudioWorkletNode(audioContext, STREAMING_AUDIO_CAPTURE_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [options.channels],
      processorOptions: {
        frameSize: options.processorBufferSize ?? STREAMING_LIVE_CAPTURE_DEFAULTS.processorBufferSize
      }
    })
    const muteGainNode = audioContext.createGain()
    muteGainNode.gain.value = 0

    sourceNode.connect(captureNode)
    captureNode.connect(muteGainNode)
    muteGainNode.connect(audioContext.destination)

    const ingress = new StreamingAudioIngress(options.sink, {
      sampleRateHz: audioContext.sampleRate,
      channels: options.channels,
      maxFramesPerBatch: options.maxFramesPerBatch ?? STREAMING_LIVE_CAPTURE_DEFAULTS.maxFramesPerBatch,
      maxQueuedBatches: options.maxQueuedBatches ?? STREAMING_LIVE_CAPTURE_DEFAULTS.maxQueuedBatches
    })

    const chunker = new StreamingSpeechChunker(options.chunker ?? STREAMING_LIVE_CAPTURE_DEFAULTS.chunker)

    await audioContext.resume()

    return new BrowserStreamingLiveCapture({
      mediaStream,
      audioContext,
      sourceNode,
      captureNode,
      muteGainNode,
      ingress,
      chunker,
      onFatalError: options.onFatalError,
      nowMs
    })
  } catch (error) {
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop()
      }
    }
    if (audioContext) {
      await closeAudioContextSafely(audioContext)
    }
    throw error
  }
}
