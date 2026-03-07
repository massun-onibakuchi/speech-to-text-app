/**
 * Where: src/main/services/streaming/whispercpp-streaming-adapter.test.ts
 * What:  Tests the local whisper.cpp adapter protocol, failure policy, and PCM batching.
 * Why:   PR-6 needs one test-backed provider seam before any real packaged
 *        runtime is trusted to drive streaming dictation sessions.
 */

import { describe, expect, it, vi } from 'vitest'
import { WhisperCppStreamingAdapter } from './whispercpp-streaming-adapter'

class FakeChildProcessStreamClient {
  readonly writes: string[] = []
  private readonly stdoutListeners = new Set<(line: string) => void>()
  private readonly stderrListeners = new Set<(line: string) => void>()
  private readonly exitListeners = new Set<(payload: { code: number | null; signal: NodeJS.Signals | null }) => void>()

  start(): void {}

  writeLine(line: string): void {
    this.writes.push(line)
  }

  async stop(): Promise<void> {
    this.emitExit({ code: 0, signal: null })
  }

  onStdoutLine(listener: (line: string) => void): () => void {
    this.stdoutListeners.add(listener)
    return () => {
      this.stdoutListeners.delete(listener)
    }
  }

  onStderrLine(listener: (line: string) => void): () => void {
    this.stderrListeners.add(listener)
    return () => {
      this.stderrListeners.delete(listener)
    }
  }

  onExit(listener: (payload: { code: number | null; signal: NodeJS.Signals | null }) => void): () => void {
    this.exitListeners.add(listener)
    return () => {
      this.exitListeners.delete(listener)
    }
  }

  emitStdout(line: string): void {
    for (const listener of this.stdoutListeners) {
      listener(line)
    }
  }

  emitStderr(line: string): void {
    for (const listener of this.stderrListeners) {
      listener(line)
    }
  }

  emitExit(payload: { code: number | null; signal: NodeJS.Signals | null }): void {
    for (const listener of this.exitListeners) {
      listener(payload)
    }
  }
}

const LOCAL_STREAMING_CONFIG = {
  provider: 'local_whispercpp_coreml' as const,
  transport: 'native_stream' as const,
  model: 'ggml-large-v3-turbo-q5_0',
  outputMode: 'stream_raw_dictation' as const,
  delimiterPolicy: {
    mode: 'space' as const,
    value: null
  }
}

describe('WhisperCppStreamingAdapter', () => {
  it('resolves runtime paths, spawns the child client, and writes PCM16 JSONL batches', async () => {
    const fakeClient = new FakeChildProcessStreamClient()
    const createClient = vi.fn(() => fakeClient)
    const adapter = new WhisperCppStreamingAdapter({
      sessionId: 'session-1',
      config: LOCAL_STREAMING_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure: vi.fn()
      }
    }, {
      modelManager: {
        ensureRuntimeReady: vi.fn(() => ({
          binaryPath: '/runtime/whisper-stream',
          modelPath: '/models/model.bin',
          coreMlModelPath: '/models/model-encoder.mlmodelc'
        }))
      } as any,
      createClient
    })

    await adapter.start()
    await adapter.pushAudioFrameBatch({
      sampleRateHz: 16000,
      channels: 1,
      frames: [{ timestampMs: 12, samples: new Float32Array([0, 1, -1]) }]
    })

    expect(createClient).toHaveBeenCalledWith({
      command: '/runtime/whisper-stream',
      args: [
        '--protocol',
        'speech-to-text-jsonl-v1',
        '--session-id',
        'session-1',
        '--model-path',
        '/models/model.bin',
        '--coreml-model-path',
        '/models/model-encoder.mlmodelc'
      ]
    })

    const pushedBatch = JSON.parse(fakeClient.writes[0] ?? '{}')
    expect(pushedBatch.type).toBe('push_audio_batch')
    expect(pushedBatch.sampleRateHz).toBe(16000)
    expect(pushedBatch.channels).toBe(1)
    expect(pushedBatch.frames).toHaveLength(1)
    expect(pushedBatch.frames[0]).toEqual({
      timestampMs: 12,
      pcm16Base64: 'AAD/fwCA'
    })
  })

  it('maps final-segment JSONL output into canonical provider callbacks', async () => {
    const fakeClient = new FakeChildProcessStreamClient()
    const onFinalSegment = vi.fn()
    const adapter = new WhisperCppStreamingAdapter({
      sessionId: 'session-1',
      config: LOCAL_STREAMING_CONFIG,
      callbacks: {
        onFinalSegment,
        onFailure: vi.fn()
      }
    }, {
      modelManager: {
        ensureRuntimeReady: vi.fn(() => ({
          binaryPath: '/runtime/whisper-stream',
          modelPath: '/models/model.bin',
          coreMlModelPath: '/models/model-encoder.mlmodelc'
        }))
      } as any,
      createClient: () => fakeClient
    })

    await adapter.start()
    fakeClient.emitStdout(JSON.stringify({
      type: 'final_segment',
      sequence: 7,
      text: 'hello world',
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    }))
    await Promise.resolve()

    expect(onFinalSegment).toHaveBeenCalledWith({
      sessionId: 'session-1',
      sequence: 7,
      text: 'hello world',
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    })
  })

  it('fails the session when the child exits unexpectedly during an active run', async () => {
    const fakeClient = new FakeChildProcessStreamClient()
    const onFailure = vi.fn()
    const adapter = new WhisperCppStreamingAdapter({
      sessionId: 'session-1',
      config: LOCAL_STREAMING_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure
      }
    }, {
      modelManager: {
        ensureRuntimeReady: vi.fn(() => ({
          binaryPath: '/runtime/whisper-stream',
          modelPath: '/models/model.bin',
          coreMlModelPath: '/models/model-encoder.mlmodelc'
        }))
      } as any,
      createClient: () => fakeClient
    })

    await adapter.start()
    fakeClient.emitStderr('segmentation fault')
    fakeClient.emitExit({ code: 9, signal: null })
    await Promise.resolve()

    expect(onFailure).toHaveBeenCalledWith({
      code: 'provider_exited',
      message: 'Whisper.cpp runtime exited unexpectedly (code 9). Last stderr: segmentation fault'
    })
  })

  it('suppresses unexpected-exit failures during a normal stop', async () => {
    const fakeClient = new FakeChildProcessStreamClient()
    const onFailure = vi.fn()
    const adapter = new WhisperCppStreamingAdapter({
      sessionId: 'session-1',
      config: LOCAL_STREAMING_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure
      }
    }, {
      modelManager: {
        ensureRuntimeReady: vi.fn(() => ({
          binaryPath: '/runtime/whisper-stream',
          modelPath: '/models/model.bin',
          coreMlModelPath: '/models/model-encoder.mlmodelc'
        }))
      } as any,
      createClient: () => fakeClient
    })

    await adapter.start()
    await adapter.stop('user_stop')

    expect(JSON.parse(fakeClient.writes.at(-1) ?? '{}')).toEqual({
      type: 'stop',
      reason: 'user_stop'
    })
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('surfaces missing runtime assets from the model manager during start', async () => {
    const adapter = new WhisperCppStreamingAdapter({
      sessionId: 'session-1',
      config: LOCAL_STREAMING_CONFIG,
      callbacks: {
        onFinalSegment: vi.fn(),
        onFailure: vi.fn()
      }
    }, {
      modelManager: {
        ensureRuntimeReady: vi.fn(() => {
          throw new Error('Missing whisper.cpp model file')
        })
      } as any,
      createClient: vi.fn()
    })

    await expect(adapter.start()).rejects.toThrow('Missing whisper.cpp model file')
  })
})
