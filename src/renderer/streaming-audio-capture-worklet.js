/*
Where: src/renderer/streaming-audio-capture-worklet.js
What: AudioWorklet processor that batches mono microphone samples into stable renderer frames.
Why: Replace deprecated ScriptProcessor-based capture while preserving the existing
     renderer ingress contract and stop-time tail flush behavior.
*/

const DEFAULT_WORKLET_FRAME_SIZE = 2048

class StreamingAudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()

    const requestedFrameSize = options?.processorOptions?.frameSize
    this.frameSize =
      typeof requestedFrameSize === 'number' && Number.isFinite(requestedFrameSize) && requestedFrameSize > 0
        ? Math.floor(requestedFrameSize)
        : DEFAULT_WORKLET_FRAME_SIZE
    this.pendingSamples = new Float32Array(this.frameSize)
    this.pendingLength = 0
    this.pendingTimestampMs = null

    this.port.onmessage = (event) => {
      if (event.data?.type !== 'flush') {
        return
      }

      this.flushPendingSamples()
      this.port.postMessage({ type: 'flush_complete' })
    }
  }

  process(inputs) {
    const channelSamples = inputs[0]?.[0]
    if (!channelSamples || channelSamples.length === 0) {
      return true
    }

    let readOffset = 0
    while (readOffset < channelSamples.length) {
      if (this.pendingLength === 0) {
        this.pendingTimestampMs = this.resolveChunkTimestampMs(readOffset)
      }

      const writableSamples = Math.min(this.frameSize - this.pendingLength, channelSamples.length - readOffset)
      this.pendingSamples.set(channelSamples.subarray(readOffset, readOffset + writableSamples), this.pendingLength)
      this.pendingLength += writableSamples
      readOffset += writableSamples

      if (this.pendingLength >= this.frameSize) {
        this.flushPendingSamples()
      }
    }

    return true
  }

  flushPendingSamples() {
    if (this.pendingLength === 0) {
      return
    }

    this.port.postMessage({
      type: 'audio_frame',
      samples: this.pendingSamples.slice(0, this.pendingLength),
      timestampMs: this.pendingTimestampMs ?? (currentTime * 1000)
    })
    this.pendingLength = 0
    this.pendingTimestampMs = null
  }

  resolveChunkTimestampMs(readOffset) {
    return ((currentFrame + readOffset) / sampleRate) * 1000
  }
}

registerProcessor('streaming-audio-capture-processor', StreamingAudioCaptureProcessor)
