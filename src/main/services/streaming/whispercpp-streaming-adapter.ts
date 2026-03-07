/**
 * Where: src/main/services/streaming/whispercpp-streaming-adapter.ts
 * What:  Local streaming runtime adapter for a packaged whisper.cpp wrapper.
 * Why:   The app already owns renderer PCM capture and main-process session
 *        ordering, so the provider boundary needs one explicit child-process
 *        protocol instead of leaking those concerns into the controller.
 */

import { Buffer } from 'node:buffer'
import type { StreamingAudioFrameBatch, StreamingSessionStopReason } from '../../../shared/ipc'
import {
  ChildProcessStreamClient,
  type ChildProcessStreamClientOptions
} from '../../infrastructure/child-process-stream-client'
import { WhisperCppModelManager, type WhisperCppRuntimePaths } from './whispercpp-model-manager'
import type {
  ProviderFinalSegmentInput,
  StreamingProviderRuntime,
  StreamingProviderRuntimeCallbacks,
  StreamingSessionFailure,
  StreamingSessionStartConfig
} from './types'

type ChildProcessStreamClientLike = Pick<
  ChildProcessStreamClient,
  'start' | 'writeLine' | 'stop' | 'onStdoutLine' | 'onStderrLine' | 'onExit'
>

export interface WhisperCppStreamingAdapterParams {
  sessionId: string
  config: StreamingSessionStartConfig
  callbacks: StreamingProviderRuntimeCallbacks
}

export interface WhisperCppStreamingAdapterDependencies {
  modelManager?: Pick<WhisperCppModelManager, 'ensureRuntimeReady'>
  createClient?: (options: ChildProcessStreamClientOptions) => ChildProcessStreamClientLike
}

type WhisperCppJsonlEvent =
  | { type: 'ready' }
  | {
    type: 'final_segment'
    sequence: number
    text: string
    startedAt: string
    endedAt: string
  }
  | {
    type: 'error'
    code: string
    message: string
  }

const PROTOCOL_VERSION = 'speech-to-text-jsonl-v1'

export class WhisperCppStreamingAdapter implements StreamingProviderRuntime {
  private readonly modelManager: Pick<WhisperCppModelManager, 'ensureRuntimeReady'>
  private readonly createClient: (options: ChildProcessStreamClientOptions) => ChildProcessStreamClientLike
  private client: ChildProcessStreamClientLike | null = null
  private expectedStop = false
  private lastStderrLine: string | null = null

  constructor(
    private readonly params: WhisperCppStreamingAdapterParams,
    dependencies: WhisperCppStreamingAdapterDependencies = {}
  ) {
    this.modelManager = dependencies.modelManager ?? new WhisperCppModelManager()
    this.createClient = dependencies.createClient ?? ((options) => new ChildProcessStreamClient(options))
  }

  async start(): Promise<void> {
    if (this.client) {
      throw new Error('Whisper.cpp streaming runtime is already active.')
    }

    const runtime = this.modelManager.ensureRuntimeReady(this.params.config.model)
    const client = this.createClient({
      command: runtime.binaryPath,
      args: this.buildCommandArgs(runtime)
    })
    this.expectedStop = false
    this.lastStderrLine = null
    this.client = client

    client.onStdoutLine((line) => {
      void this.handleStdoutLine(line)
    })
    client.onStderrLine((line) => {
      this.lastStderrLine = line
    })
    client.onExit(({ code, signal }) => {
      if (this.expectedStop) {
        return
      }
      void this.params.callbacks.onFailure({
        code: 'provider_exited',
        message: this.buildUnexpectedExitMessage(code, signal)
      })
    })

    client.start()
  }

  async stop(reason: StreamingSessionStopReason): Promise<void> {
    if (!this.client) {
      return
    }

    const client = this.client
    this.expectedStop = true
    this.client = null

    try {
      client.writeLine(JSON.stringify({
        type: 'stop',
        reason
      }))
    } catch {
      // Ignore stop-line failures: the process may already be exiting.
    }
    await client.stop()
  }

  async pushAudioFrameBatch(batch: StreamingAudioFrameBatch): Promise<void> {
    if (!this.client) {
      throw new Error('Whisper.cpp streaming runtime is not active.')
    }

    this.client.writeLine(JSON.stringify({
      type: 'push_audio_batch',
      sampleRateHz: batch.sampleRateHz,
      channels: batch.channels,
      frames: batch.frames.map((frame) => ({
        timestampMs: frame.timestampMs,
        pcm16Base64: encodeFloat32ToPcm16Base64(frame.samples)
      }))
    }))
  }

  private buildCommandArgs(runtime: WhisperCppRuntimePaths): string[] {
    return [
      '--protocol',
      PROTOCOL_VERSION,
      '--session-id',
      this.params.sessionId,
      '--model-path',
      runtime.modelPath,
      '--coreml-model-path',
      runtime.coreMlModelPath
    ]
  }

  private async handleStdoutLine(line: string): Promise<void> {
    const parsed = this.parseJsonlEvent(line)
    if (!parsed) {
      await this.params.callbacks.onFailure({
        code: 'provider_protocol_error',
        message: `Whisper.cpp runtime emitted a non-JSONL stdout line: ${line}`
      })
      return
    }

    if (parsed.type === 'ready') {
      return
    }

    if (parsed.type === 'error') {
      await this.params.callbacks.onFailure({
        code: parsed.code,
        message: parsed.message
      })
      return
    }

    await this.params.callbacks.onFinalSegment({
      sessionId: this.params.sessionId,
      sequence: parsed.sequence,
      text: parsed.text,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt
    })
  }

  private parseJsonlEvent(line: string): WhisperCppJsonlEvent | null {
    try {
      const parsed = JSON.parse(line) as Partial<WhisperCppJsonlEvent>
      if (parsed.type === 'ready') {
        return { type: 'ready' }
      }
      if (
        parsed.type === 'final_segment' &&
        typeof parsed.sequence === 'number' &&
        typeof parsed.text === 'string' &&
        typeof parsed.startedAt === 'string' &&
        typeof parsed.endedAt === 'string'
      ) {
        return {
          type: 'final_segment',
          sequence: parsed.sequence,
          text: parsed.text,
          startedAt: parsed.startedAt,
          endedAt: parsed.endedAt
        }
      }
      if (
        parsed.type === 'error' &&
        typeof parsed.code === 'string' &&
        typeof parsed.message === 'string'
      ) {
        return {
          type: 'error',
          code: parsed.code,
          message: parsed.message
        }
      }
      return null
    } catch {
      return null
    }
  }

  private buildUnexpectedExitMessage(code: number | null, signal: NodeJS.Signals | null): string {
    const exitDetail =
      code !== null
        ? `code ${code}`
        : signal !== null
          ? `signal ${signal}`
          : 'unknown reason'

    if (this.lastStderrLine) {
      return `Whisper.cpp runtime exited unexpectedly (${exitDetail}). Last stderr: ${this.lastStderrLine}`
    }

    return `Whisper.cpp runtime exited unexpectedly (${exitDetail}).`
  }
}

const encodeFloat32ToPcm16Base64 = (samples: Float32Array): string => {
  const bytes = Buffer.alloc(samples.length * 2)
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0))
    const sample = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
    bytes.writeInt16LE(sample, index * 2)
  }
  return bytes.toString('base64')
}
