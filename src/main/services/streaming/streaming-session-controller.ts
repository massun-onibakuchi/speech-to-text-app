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
import type { SecretStore } from '../secret-store'
import type { TransformationService } from '../transformation-service'
import { StreamingActivityPublisher } from './streaming-activity-publisher'
import { SegmentAssembler } from './segment-assembler'
import { StreamingSegmentRouter } from './streaming-segment-router'
import {
  createIdleStreamingSessionSnapshot,
  createStreamingErrorEvent,
  createStreamingSessionSnapshot,
  type CreateStreamingProviderRuntime,
  type ProviderFinalSegmentInput,
  type StreamingProviderRuntime,
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
  createProviderRuntime?: CreateStreamingProviderRuntime
  outputService?: {
    applyStreamingSegmentWithDetail: (
      segment: import('./types').StreamingCommittedSegment,
      clipboardPolicy: ClipboardStatePolicy
    ) => Promise<OutputApplyResult>
  }
  clipboardPolicy?: ClipboardStatePolicy
  transformationService?: Pick<TransformationService, 'transform'>
  secretStore?: Pick<SecretStore, 'getApiKey'>
}

export class InMemoryStreamingSessionController implements StreamingSessionController {
  private readonly activityPublisher: StreamingActivityPublisher
  private readonly createSessionId: () => string
  private readonly outputCoordinator: OrderedOutputCoordinator
  private readonly createProviderRuntime: CreateStreamingProviderRuntime | null
  private readonly outputService: NonNullable<StreamingSessionControllerDependencies['outputService']>
  private readonly clipboardPolicy: ClipboardStatePolicy
  private snapshot: StreamingSessionRuntimeSnapshot = createIdleStreamingSessionSnapshot()
  private currentConfig: StreamingSessionStartConfig | null = null
  private currentSegmentAssembler: SegmentAssembler | null = null
  private currentSegmentRouter: StreamingSegmentRouter | null = null
  private currentProviderRuntime: StreamingProviderRuntime | null = null
  private readonly transformationService: Pick<TransformationService, 'transform'>
  private readonly secretStore: Pick<SecretStore, 'getApiKey'>

  constructor(dependencies: StreamingSessionControllerDependencies = {}) {
    this.activityPublisher = dependencies.activityPublisher ?? new StreamingActivityPublisher()
    this.createSessionId = dependencies.createSessionId ?? (() => randomUUID())
    this.outputCoordinator = dependencies.outputCoordinator ?? new SerialOutputCoordinator()
    this.createProviderRuntime = dependencies.createProviderRuntime ?? null
    this.outputService = dependencies.outputService ?? {
      applyStreamingSegmentWithDetail: async () => ({ status: 'succeeded', message: null })
    }
    this.clipboardPolicy = dependencies.clipboardPolicy ?? {
      canRead: () => false,
      canWrite: () => true,
      willWrite: () => {},
      didWrite: () => {}
    }
    this.transformationService = dependencies.transformationService ?? {
      transform: async () => ({ text: '', model: 'gemini-2.5-flash' })
    }
    this.secretStore = dependencies.secretStore ?? {
      getApiKey: () => null
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
    this.currentSegmentRouter = new StreamingSegmentRouter(sessionId, this.currentConfig, {
      outputCoordinator: this.outputCoordinator,
      outputService: this.outputService,
      clipboardPolicy: this.clipboardPolicy,
      transformationService: this.transformationService,
      secretStore: this.secretStore,
      publishError: (event) => {
        this.activityPublisher.publishError(event)
      },
      publishSegment: (event) => {
        this.activityPublisher.publishSegment(event)
      }
    })
    const providerRuntime = this.createProviderRuntime?.({
      sessionId,
      config: this.currentConfig,
      callbacks: this.createProviderRuntimeCallbacks(sessionId)
    }) ?? null
    this.publishState({
      sessionId,
      state: 'starting',
      config: this.currentConfig,
      reason: null
    })
    try {
      this.currentProviderRuntime = providerRuntime
      await providerRuntime?.start()
      this.publishState({
        sessionId,
        state: 'active',
        config: this.currentConfig,
        reason: null
      })
    } catch (error) {
      await this.failStartingSession(sessionId, error)
      throw error
    }
  }

  async stop(reason: StreamingSessionStopReason = 'user_stop'): Promise<void> {
    if (this.snapshot.state === 'idle' || this.snapshot.state === 'ended' || this.snapshot.state === 'failed') {
      return
    }

    if (this.snapshot.state === 'stopping') {
      return
    }

    const stoppingSessionId = this.snapshot.sessionId
    const stoppingConfig = this.currentConfig
    this.publishState({
      sessionId: stoppingSessionId,
      state: 'stopping',
      config: stoppingConfig,
      reason
    })
    const providerRuntime = this.currentProviderRuntime
    this.currentProviderRuntime = null
    try {
      await providerRuntime?.stop(reason)
    } catch (error) {
      await this.failCurrentSession(this.toStreamingFailure(error, 'provider_stop_failed'))
      return
    }

    if (this.snapshot.state !== 'stopping' || this.snapshot.sessionId !== stoppingSessionId) {
      return
    }

    this.publishState({
      sessionId: stoppingSessionId,
      state: 'ended',
      config: stoppingConfig,
      reason
    })
    this.currentSegmentRouter?.dispose()
    if (stoppingSessionId) {
      this.outputCoordinator.clearScope(stoppingSessionId)
    }
    this.clearCurrentSession()
  }

  async pushAudioFrameBatch(batch: StreamingAudioFrameBatch): Promise<void> {
    if (this.snapshot.state !== 'active') {
      throw new Error('Streaming audio frame batches require an active session.')
    }

    await this.currentProviderRuntime?.pushAudioFrameBatch(batch)
  }

  async commitFinalSegment(segment: ProviderFinalSegmentInput): Promise<OutputApplyResult | null> {
    if (
      !this.snapshot.sessionId ||
      !this.currentConfig ||
      !this.currentSegmentAssembler ||
      !this.currentSegmentRouter
    ) {
      throw new Error('Streaming final segments require an active session.')
    }
    if (segment.sessionId !== this.snapshot.sessionId) {
      throw new Error(`Streaming final segment session mismatch. Expected ${this.snapshot.sessionId}.`)
    }
    if (!this.canAcceptFinalSegmentsForSession(segment.sessionId)) {
      throw new Error('Streaming final segments require an active or drain-safe stopping session.')
    }

    const canonicalSegment = this.currentSegmentAssembler.finalize(segment)
    if (!canonicalSegment) {
      this.outputCoordinator.release(segment.sequence, this.snapshot.sessionId)
      return null
    }

    return this.currentSegmentRouter.commitFinalizedSegment(canonicalSegment)
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

    const providerRuntime = this.currentProviderRuntime
    this.currentProviderRuntime = null
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
    this.currentSegmentRouter?.dispose()
    if (this.snapshot.sessionId) {
      this.outputCoordinator.clearScope(this.snapshot.sessionId)
    }
    this.clearCurrentSession()
    try {
      await providerRuntime?.stop('fatal_error')
    } catch {
      // Swallow provider-stop failures here: the session is already terminal.
    }
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

  private createProviderRuntimeCallbacks(sessionId: string) {
    return {
      onFinalSegment: async (segment: ProviderFinalSegmentInput) => {
        if (!this.canAcceptFinalSegmentsForSession(sessionId)) {
          return
        }
        try {
          await this.commitFinalSegment({
            ...segment,
            sessionId
          })
        } catch (error) {
          await this.failCurrentSession(this.toStreamingFailure(error, 'provider_segment_commit_failed'))
        }
      },
      onFailure: async (failure: StreamingSessionFailure) => {
        if (this.snapshot.sessionId !== sessionId) {
          return
        }
        await this.failCurrentSession(failure)
      }
    }
  }

  private async failStartingSession(sessionId: string, error: unknown): Promise<void> {
    const providerRuntime = this.currentProviderRuntime
    this.currentProviderRuntime = null
    const failure = this.toStreamingFailure(error, 'provider_start_failed')
    this.activityPublisher.publishError(createStreamingErrorEvent({
      sessionId,
      failure
    }))
    this.publishState({
      sessionId,
      state: 'failed',
      config: this.currentConfig,
      reason: 'fatal_error'
    })
    this.currentSegmentRouter?.dispose()
    this.clearCurrentSession()
    try {
      await providerRuntime?.stop('fatal_error')
    } catch {
      // Swallow provider-stop failures here: startup is already failing.
    }
  }

  private clearCurrentSession(): void {
    this.currentConfig = null
    this.currentSegmentAssembler = null
    this.currentSegmentRouter = null
  }

  private toStreamingFailure(error: unknown, code: string): StreamingSessionFailure {
    return {
      code,
      message: error instanceof Error ? error.message : String(error)
    }
  }

  private canAcceptFinalSegmentsForSession(sessionId: string): boolean {
    if (this.snapshot.sessionId !== sessionId) {
      return false
    }

    return this.snapshot.state === 'active' || (this.snapshot.state === 'stopping' && this.snapshot.reason === 'user_stop')
  }
}
