/*
Where: src/renderer/streaming-live-capture.ts
What: Browser PCM capture for streaming mode using AudioContext + ScriptProcessor.
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

type AudioProcessEventLike = {
  inputBuffer: {
    getChannelData: (channel: number) => Float32Array
  }
  playbackTime?: number
}

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

class BrowserStreamingLiveCapture implements StreamingLiveCapture {
  private readonly mediaStream: MediaStream
  private readonly audioContext: AudioContext
  private readonly sourceNode: MediaStreamAudioSourceNode
  private readonly processorNode: ScriptProcessorNode
  private readonly muteGainNode: GainNode
  private readonly ingress: StreamingAudioIngress
  private readonly chunker: StreamingSpeechChunker
  private readonly onFatalError: (error: unknown) => void
  private readonly nowMs: () => number
  private fatalNotified = false
  private stopped = false

  constructor(params: {
    mediaStream: MediaStream
    audioContext: AudioContext
    sourceNode: MediaStreamAudioSourceNode
    processorNode: ScriptProcessorNode
    muteGainNode: GainNode
    ingress: StreamingAudioIngress
    chunker: StreamingSpeechChunker
    onFatalError: (error: unknown) => void
    nowMs: () => number
  }) {
    this.mediaStream = params.mediaStream
    this.audioContext = params.audioContext
    this.sourceNode = params.sourceNode
    this.processorNode = params.processorNode
    this.muteGainNode = params.muteGainNode
    this.ingress = params.ingress
    this.chunker = params.chunker
    this.onFatalError = params.onFatalError
    this.nowMs = params.nowMs

    this.processorNode.onaudioprocess = (event) => {
      if (this.stopped) {
        return
      }

      const channelData = event.inputBuffer.getChannelData(0)
      if (channelData.length === 0) {
        return
      }

      const frame = {
        samples: new Float32Array(channelData),
        timestampMs: this.resolveFrameTimestampMs(event)
      }

      try {
        this.ingress.pushFrame(frame)
        const observation = this.chunker.observeFrame(frame, this.audioContext.sampleRate)
        if (observation.shouldFlush) {
          void this.ingress.flush().catch((error) => {
            this.reportFatalError(error)
          })
        }
      } catch (error) {
        this.reportFatalError(error)
      }
    }
  }

  async stop(reason: StreamingSessionStopReason = 'user_stop'): Promise<void> {
    if (this.stopped) {
      return
    }

    this.stopped = true
    this.processorNode.onaudioprocess = null

    try {
      this.sourceNode.disconnect()
    } catch {
      // Disconnect is best-effort during teardown only.
    }
    try {
      this.processorNode.disconnect()
    } catch {
      // Disconnect is best-effort during teardown only.
    }
    try {
      this.muteGainNode.disconnect()
    } catch {
      // Disconnect is best-effort during teardown only.
    }

    if (reason === 'user_cancel' || reason === 'fatal_error') {
      this.ingress.cancel()
    } else {
      await this.ingress.stop()
    }

    this.chunker.reset()
    for (const track of this.mediaStream.getTracks()) {
      track.stop()
    }
    await closeAudioContextSafely(this.audioContext)
  }

  async cancel(): Promise<void> {
    await this.stop('user_cancel')
  }

  private reportFatalError(error: unknown): void {
    if (this.fatalNotified) {
      return
    }
    this.fatalNotified = true
    void this.stop('fatal_error').finally(() => {
      this.onFatalError(error)
    })
  }

  private resolveFrameTimestampMs(event: AudioProcessEventLike): number {
    if (typeof event.playbackTime === 'number' && Number.isFinite(event.playbackTime)) {
      return event.playbackTime * 1000
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

  const mediaStream = await getUserMedia({
    audio: options.deviceConstraints
  })
  const audioContext = createAudioContext({
    sampleRate: options.requestedSampleRateHz
  })

  if (typeof audioContext.createScriptProcessor !== 'function') {
    for (const track of mediaStream.getTracks()) {
      track.stop()
    }
    await closeAudioContextSafely(audioContext)
    throw new Error('This environment does not support live PCM streaming capture.')
  }

  const sourceNode = audioContext.createMediaStreamSource(mediaStream)
  const processorNode = audioContext.createScriptProcessor(
    options.processorBufferSize ?? STREAMING_LIVE_CAPTURE_DEFAULTS.processorBufferSize,
    options.channels,
    options.channels
  )
  const muteGainNode = audioContext.createGain()
  muteGainNode.gain.value = 0

  sourceNode.connect(processorNode)
  processorNode.connect(muteGainNode)
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
    processorNode,
    muteGainNode,
    ingress,
    chunker,
    onFatalError: options.onFatalError,
    nowMs
  })
}
