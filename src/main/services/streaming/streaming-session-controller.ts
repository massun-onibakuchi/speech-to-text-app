/**
 * Where: src/main/services/streaming/streaming-session-controller.ts
 * What:  Streaming session controller interface and in-memory lifecycle runtime.
 * Why:   PR-3 establishes deterministic session state transitions and renderer
 *        event publication before audio ingress or provider adapters exist.
 */

import type {
  StreamingAudioFrameBatch,
  StreamingErrorEvent,
  StreamingSegmentEvent,
  StreamingSessionState,
  StreamingSessionStateSnapshot,
  StreamingSessionStopReason
} from '../../../shared/ipc'
import type { ClipboardStatePolicy } from '../../coordination/clipboard-state-policy'
import type { OrderedOutputCoordinator } from '../../coordination/ordered-output-coordinator'
import { SerialOutputCoordinator } from '../../coordination/ordered-output-coordinator'
import type { OutputApplyResult } from '../output-service'
import { StreamingActivityPublisher } from './streaming-activity-publisher'
import { SegmentAssembler } from './segment-assembler'
import {
  createStreamingSegmentEvent,
  createIdleStreamingSessionSnapshot,
  createStreamingErrorEvent,
  createStreamingSessionSnapshot,
  type ProviderFinalSegmentInput,
  type StreamingSessionFailure,
  type StreamingSessionRuntimeSnapshot,
  type StreamingSessionStartConfig
} from './types'
import { randomUUID } from 'node:crypto'

export interface StreamingSessionController {
  start(config: StreamingSessionStartConfig): Promise<void>
  stop(reason?: StreamingSessionStopReason): Promise<void>
  pushAudioFrameBatch(batch: StreamingAudioFrameBatch): Promise<void>
  commitFinalSegment(segment: ProviderFinalSegmentInput): Promise<OutputApplyResult | null>
  getState(): StreamingSessionState
  getSnapshot(): Readonly<StreamingSessionRuntimeSnapshot>
  failCurrentSession(failure: StreamingSessionFailure): Promise<void>
  onSessionState(listener: (event: StreamingSessionStateSnapshot) => void): () => void
  onSegment(listener: (event: StreamingSegmentEvent) => void): () => void
  onError(listener: (event: StreamingErrorEvent) => void): () => void
}

export interface StreamingSessionControllerDependencies {
  activityPublisher?: StreamingActivityPublisher
  createSessionId?: () => string
  outputCoordinator?: OrderedOutputCoordinator
  outputService?: {
    applyStreamingSegmentWithDetail: (
      segment: import('./types').CanonicalFinalSegment,
      clipboardPolicy: ClipboardStatePolicy
    ) => Promise<OutputApplyResult>
  }
  clipboardPolicy?: ClipboardStatePolicy
}

export class InMemoryStreamingSessionController implements StreamingSessionController {
  private readonly activityPublisher: StreamingActivityPublisher
  private readonly createSessionId: () => string
  private readonly outputCoordinator: OrderedOutputCoordinator
  private readonly outputService: NonNullable<StreamingSessionControllerDependencies['outputService']>
  private readonly clipboardPolicy: ClipboardStatePolicy
  private snapshot: StreamingSessionRuntimeSnapshot = createIdleStreamingSessionSnapshot()
  private currentConfig: StreamingSessionStartConfig | null = null
  private currentSegmentAssembler: SegmentAssembler | null = null

  constructor(dependencies: StreamingSessionControllerDependencies = {}) {
    this.activityPublisher = dependencies.activityPublisher ?? new StreamingActivityPublisher()
    this.createSessionId = dependencies.createSessionId ?? (() => randomUUID())
    this.outputCoordinator = dependencies.outputCoordinator ?? new SerialOutputCoordinator()
    this.outputService = dependencies.outputService ?? {
      applyStreamingSegmentWithDetail: async () => ({ status: 'succeeded', message: null })
    }
    this.clipboardPolicy = dependencies.clipboardPolicy ?? {
      canRead: () => false,
      canWrite: () => true,
      willWrite: () => {},
      didWrite: () => {}
    }
  }

  async start(config: StreamingSessionStartConfig): Promise<void> {
    if (this.snapshot.state === 'starting' || this.snapshot.state === 'active' || this.snapshot.state === 'stopping') {
      const failure = {
        code: 'duplicate_start',
        message: `Streaming session already ${this.snapshot.state}.`
      }
      this.activityPublisher.publishError(createStreamingErrorEvent({
        sessionId: this.snapshot.sessionId,
        failure
      }))
      throw new Error(failure.message)
    }

    this.currentConfig = structuredClone(config)
    this.currentSegmentAssembler = new SegmentAssembler(this.currentConfig.delimiterPolicy)
    const sessionId = this.createSessionId()
    this.publishState({
      sessionId,
      state: 'starting',
      config: this.currentConfig,
      reason: null
    })
    this.publishState({
      sessionId,
      state: 'active',
      config: this.currentConfig,
      reason: null
    })
  }

  async stop(reason: StreamingSessionStopReason = 'user_stop'): Promise<void> {
    if (this.snapshot.state === 'idle' || this.snapshot.state === 'ended' || this.snapshot.state === 'failed') {
      return
    }

    if (this.snapshot.state === 'stopping') {
      return
    }

    this.publishState({
      sessionId: this.snapshot.sessionId,
      state: 'stopping',
      config: this.currentConfig,
      reason
    })
    this.publishState({
      sessionId: this.snapshot.sessionId,
      state: 'ended',
      config: this.currentConfig,
      reason
    })
    if (this.snapshot.sessionId) {
      this.outputCoordinator.clearScope(this.snapshot.sessionId)
    }
    this.currentConfig = null
    this.currentSegmentAssembler = null
  }

  async pushAudioFrameBatch(_batch: StreamingAudioFrameBatch): Promise<void> {
    if (this.snapshot.state !== 'active') {
      throw new Error('Streaming audio frame batches require an active session.')
    }

    // TODO(PR-5): Route accepted frame batches into the provider runtime instead
    // of dropping them in the in-memory controller stub.
  }

  async commitFinalSegment(segment: ProviderFinalSegmentInput): Promise<OutputApplyResult | null> {
    if (this.snapshot.state !== 'active' || !this.snapshot.sessionId || !this.currentConfig || !this.currentSegmentAssembler) {
      throw new Error('Streaming final segments require an active session.')
    }
    if (segment.sessionId !== this.snapshot.sessionId) {
      throw new Error(`Streaming final segment session mismatch. Expected ${this.snapshot.sessionId}.`)
    }
    if (this.currentConfig.outputMode !== 'stream_raw_dictation') {
      throw new Error(`Streaming output mode ${this.currentConfig.outputMode} is not supported yet.`)
    }

    const canonicalSegment = this.currentSegmentAssembler.finalize(segment)
    if (!canonicalSegment) {
      this.outputCoordinator.release(segment.sequence, this.snapshot.sessionId)
      return null
    }

    let outputResult: OutputApplyResult = {
      status: 'succeeded',
      message: null
    }

    const orderedStatus = await this.outputCoordinator.submit(
      canonicalSegment.sequence,
      async () => {
        outputResult = await this.outputService.applyStreamingSegmentWithDetail(canonicalSegment, this.clipboardPolicy)
        return outputResult.status
      },
      this.snapshot.sessionId
    )

    if (outputResult.status === 'succeeded' && orderedStatus !== 'succeeded') {
      outputResult = {
        status: orderedStatus,
        message: null
      }
    }

    if (outputResult.status === 'succeeded' && this.snapshot.state === 'active' && this.snapshot.sessionId === canonicalSegment.sessionId) {
      this.activityPublisher.publishSegment(createStreamingSegmentEvent(canonicalSegment))
    }
    return outputResult
  }

  getState(): StreamingSessionState {
    return this.snapshot.state
  }

  getSnapshot(): Readonly<StreamingSessionRuntimeSnapshot> {
    return structuredClone(this.snapshot)
  }

  async failCurrentSession(failure: StreamingSessionFailure): Promise<void> {
    if (this.snapshot.state === 'idle' || this.snapshot.state === 'ended' || this.snapshot.state === 'failed') {
      return
    }

    this.activityPublisher.publishError(createStreamingErrorEvent({
      sessionId: this.snapshot.sessionId,
      failure
    }))
    this.publishState({
      sessionId: this.snapshot.sessionId,
      state: 'failed',
      config: this.currentConfig,
      reason: 'fatal_error'
    })
    if (this.snapshot.sessionId) {
      this.outputCoordinator.clearScope(this.snapshot.sessionId)
    }
    this.currentConfig = null
    this.currentSegmentAssembler = null
  }

  onSessionState(listener: (event: StreamingSessionStateSnapshot) => void): () => void {
    return this.activityPublisher.onSessionState(listener)
  }

  onSegment(listener: (event: StreamingSegmentEvent) => void): () => void {
    return this.activityPublisher.onSegment(listener)
  }

  onError(listener: (event: StreamingErrorEvent) => void): () => void {
    return this.activityPublisher.onError(listener)
  }

  private publishState(params: {
    sessionId: string | null
    state: StreamingSessionState
    config: StreamingSessionStartConfig | null
    reason: StreamingSessionStopReason | null
  }): void {
    this.snapshot = createStreamingSessionSnapshot(params)
    this.activityPublisher.publishSessionState(this.snapshot)
  }
}
