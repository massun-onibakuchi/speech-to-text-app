// Where: Renderer capture helpers.
// What: Local-only microphone PCM capture, batching, and IPC delivery for streaming STT.
// Why: Ticket 5 needs a stable renderer-to-main PCM seam without dragging Ticket 6 runtime/session
//      ownership into the renderer or reusing the blob-based cloud capture path.

import type {
  LocalStreamingAudioAppendPayload,
  LocalStreamingSessionControlPayload,
  LocalStreamingSessionStartPayload,
  LocalStreamingSessionStartResult
} from '../shared/ipc'

const LOCAL_STREAMING_BATCH_DURATION_MS = 75
const LOCAL_STREAMING_SCRIPT_PROCESSOR_BUFFER_SIZE = 2048
const LOCAL_STREAMING_APPEND_TIMEOUT_MS = 500

const normalizeCaptureError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  const clampedTimeoutMs = Math.max(1, Math.round(timeoutMs))
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  // The append promise may reject after the timeout path wins the race.
  void promise.catch(() => {})

  try {
    return await Promise.race<T>([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage))
        }, clampedTimeoutMs)
      })
    ])
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

const stopMediaStreamTracks = (mediaStream: MediaStream): void => {
  for (const track of mediaStream.getTracks()) {
    track.stop()
  }
}

const joinPcm16Chunks = (chunks: Int16Array[]): Int16Array => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const joined = new Int16Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.length
  }
  return joined
}

export const interleaveFloat32ChannelsToPcm16 = (channels: Float32Array[]): Int16Array => {
  if (channels.length === 0) {
    return new Int16Array(0)
  }

  const frameCount = channels[0]?.length ?? 0
  const output = new Int16Array(frameCount * channels.length)
  let offset = 0

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frameIndex] ?? 0))
      output[offset] = sample < 0
        ? Math.round(sample * 0x8000)
        : Math.round(sample * 0x7fff)
      offset += 1
    }
  }

  return output
}

export class LocalPcmBatchAccumulator {
  private readonly chunks: Int16Array[] = []
  private pendingFrameCount = 0

  constructor(
    private readonly channelCount: number,
    private readonly targetFrameCount: number
  ) {}

  append(chunk: Int16Array): Int16Array | null {
    if (chunk.length === 0) {
      return null
    }

    this.chunks.push(chunk)
    this.pendingFrameCount += Math.floor(chunk.length / this.channelCount)
    if (this.pendingFrameCount < this.targetFrameCount) {
      return null
    }
    return this.flush()
  }

  flush(): Int16Array | null {
    if (this.chunks.length === 0) {
      return null
    }

    const flushed = joinPcm16Chunks(this.chunks)
    this.reset()
    return flushed
  }

  reset(): void {
    this.chunks.splice(0, this.chunks.length)
    this.pendingFrameCount = 0
  }
}

export interface LocalStreamingCaptureSession {
  sessionId: string
  stop: () => Promise<void>
  cancel: () => Promise<void>
}

export interface LocalStreamingCaptureOptions {
  mediaStream: MediaStream
  startedAt: string
  startSession: (payload: LocalStreamingSessionStartPayload) => Promise<LocalStreamingSessionStartResult>
  appendAudio: (payload: LocalStreamingAudioAppendPayload) => Promise<void>
  stopSession: (payload: LocalStreamingSessionControlPayload) => Promise<void>
  cancelSession: (payload: LocalStreamingSessionControlPayload) => Promise<void>
  onFatalError?: (error: Error) => void | Promise<void>
  createAudioContext?: () => AudioContext
  batchDurationMs?: number
  scriptProcessorBufferSize?: number
  appendTimeoutMs?: number
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>
}

export const createLocalStreamingCaptureSession = async (
  options: LocalStreamingCaptureOptions
): Promise<LocalStreamingCaptureSession> => {
  const audioContext = options.createAudioContext?.() ?? new AudioContext()
  let startedSessionId: string | null = null
  try {
    const channelCount = Math.max(1, Math.round(options.mediaStream.getAudioTracks()[0]?.getSettings().channelCount ?? 1))
    const sampleRateHz = Math.round(audioContext.sampleRate)
    const batchTargetFrames = Math.max(
      1,
      Math.round(sampleRateHz * ((options.batchDurationMs ?? LOCAL_STREAMING_BATCH_DURATION_MS) / 1000))
    )
    const appendTimeoutMs = options.appendTimeoutMs ?? LOCAL_STREAMING_APPEND_TIMEOUT_MS
    const session = await options.startSession({
      startedAt: options.startedAt,
      sampleRateHz,
      channelCount
    })
    startedSessionId = session.sessionId

    const sourceNode = audioContext.createMediaStreamSource(options.mediaStream)
    const processorNode = audioContext.createScriptProcessor(
      options.scriptProcessorBufferSize ?? LOCAL_STREAMING_SCRIPT_PROCESSOR_BUFFER_SIZE,
      channelCount,
      channelCount
    )
    const silentSink = audioContext.createGain()
    silentSink.gain.value = 0

    const batcher = new LocalPcmBatchAccumulator(channelCount, batchTargetFrames)
    const pendingBatches: Int16Array[] = []
    const drainWaiters: Array<() => void> = []
    const cleanupCallbacks: Array<() => void> = []
    let isAcceptingAudio = true
    let isClosed = false
    let fatalError: Error | null = null
    let pumpPromise: Promise<void> | null = null
    let cleanedUp = false

    const resolveDrainWaiters = (): void => {
      if (pumpPromise !== null || pendingBatches.length > 0) {
        return
      }
      while (drainWaiters.length > 0) {
        drainWaiters.shift()?.()
      }
    }

    const waitForDrain = async (): Promise<void> => {
      if (pumpPromise === null && pendingBatches.length === 0) {
        return
      }
      await new Promise<void>((resolve) => {
        drainWaiters.push(resolve)
      })
    }

    const cleanupCaptureGraph = async (): Promise<void> => {
      if (cleanedUp) {
        return
      }
      cleanedUp = true

      processorNode.onaudioprocess = null
      try {
        sourceNode.disconnect()
      } catch {}
      try {
        processorNode.disconnect()
      } catch {}
      try {
        silentSink.disconnect()
      } catch {}

      while (cleanupCallbacks.length > 0) {
        cleanupCallbacks.pop()?.()
      }

      stopMediaStreamTracks(options.mediaStream)
      await audioContext.close()
    }

    const handleFatalError = async (error: Error): Promise<void> => {
      if (isClosed) {
        return
      }

      fatalError = error
      isAcceptingAudio = false
      pendingBatches.splice(0, pendingBatches.length)
      isClosed = true
      await cleanupCaptureGraph()
      resolveDrainWaiters()

      try {
        await options.cancelSession({ sessionId: session.sessionId })
      } catch {
        // Preserve the original renderer-visible capture error.
      }
      await options.onFatalError?.(error)
    }

    const pumpQueuedBatches = (): void => {
      if (pumpPromise !== null || isClosed) {
        return
      }

      pumpPromise = (async () => {
        while (pendingBatches.length > 0 && !isClosed) {
          const batch = pendingBatches.shift()
          if (!batch) {
            continue
          }
          await withTimeout(
            options.appendAudio({
              sessionId: session.sessionId,
              pcmFrames: batch
            }),
            appendTimeoutMs,
            'Local streaming audio append timed out.'
          )
        }
      })()
        .catch((error) => {
          void handleFatalError(normalizeCaptureError(error))
        })
        .finally(() => {
          pumpPromise = null
          if (pendingBatches.length > 0 && !isClosed) {
            pumpQueuedBatches()
            return
          }
          resolveDrainWaiters()
        })
    }

    const enqueueBatch = (batch: Int16Array | null): void => {
      if (!batch || batch.length === 0 || !isAcceptingAudio || isClosed || fatalError) {
        return
      }
      pendingBatches.push(batch)
      pumpQueuedBatches()
    }

    const onTrackEnded = (): void => {
      void handleFatalError(new Error('Microphone capture ended unexpectedly.'))
    }

    for (const track of options.mediaStream.getAudioTracks()) {
      track.addEventListener('ended', onTrackEnded)
      cleanupCallbacks.push(() => {
        track.removeEventListener('ended', onTrackEnded)
      })
    }

    const windowTarget = options.windowTarget ?? window
    const onPageHide = (): void => {
      void cancel()
    }
    windowTarget.addEventListener('pagehide', onPageHide)
    cleanupCallbacks.push(() => {
      windowTarget.removeEventListener('pagehide', onPageHide)
    })

    processorNode.onaudioprocess = (event) => {
      if (!isAcceptingAudio || isClosed || fatalError) {
        return
      }

      const channels = Array.from(
        { length: channelCount },
        (_, channelIndex) => event.inputBuffer.getChannelData(channelIndex)
      )
      enqueueBatch(batcher.append(interleaveFloat32ChannelsToPcm16(channels)))
    }

    sourceNode.connect(processorNode)
    processorNode.connect(silentSink)
    silentSink.connect(audioContext.destination)
    await audioContext.resume()

    const stop = async (): Promise<void> => {
      if (isClosed) {
        if (fatalError) {
          throw fatalError
        }
        return
      }

      const trailingBatch = batcher.flush()
      if (trailingBatch && trailingBatch.length > 0) {
        pendingBatches.push(trailingBatch)
        pumpQueuedBatches()
      }
      isAcceptingAudio = false
      await waitForDrain()
      await cleanupCaptureGraph()
      isClosed = true
      if (fatalError) {
        throw fatalError
      }
      await options.stopSession({ sessionId: session.sessionId })
    }

    const cancel = async (): Promise<void> => {
      if (isClosed) {
        return
      }

      isAcceptingAudio = false
      pendingBatches.splice(0, pendingBatches.length)
      batcher.reset()
      isClosed = true
      await cleanupCaptureGraph()
      resolveDrainWaiters()
      if (!fatalError) {
        await options.cancelSession({ sessionId: session.sessionId })
      }
    }

    return {
      sessionId: session.sessionId,
      stop,
      cancel
    }
  } catch (error) {
    stopMediaStreamTracks(options.mediaStream)
    try {
      await audioContext.close()
    } catch {}
    if (startedSessionId) {
      try {
        await options.cancelSession({ sessionId: startedSessionId })
      } catch {}
    }
    throw error
  }
}
