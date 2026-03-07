/**
 * Where: src/main/services/streaming/streaming-session-controller.ts
 * What:  Streaming session controller interface and in-memory lifecycle runtime.
 * Why:   PR-3 establishes deterministic session state transitions and renderer
 *        event publication before audio ingress or provider adapters exist.
 */

import type {
  StreamingErrorEvent,
  StreamingSegmentEvent,
  StreamingSessionState,
  StreamingSessionStateSnapshot,
  StreamingSessionStopReason
} from '../../../shared/ipc'
import { StreamingActivityPublisher } from './streaming-activity-publisher'
import {
  createIdleStreamingSessionSnapshot,
  createStreamingErrorEvent,
  createStreamingSessionSnapshot,
  type StreamingSessionFailure,
  type StreamingSessionRuntimeSnapshot,
  type StreamingSessionStartConfig
} from './types'
import { randomUUID } from 'node:crypto'

export interface StreamingSessionController {
  start(config: StreamingSessionStartConfig): Promise<void>
  stop(reason?: StreamingSessionStopReason): Promise<void>
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
}

export class InMemoryStreamingSessionController implements StreamingSessionController {
  private readonly activityPublisher: StreamingActivityPublisher
  private readonly createSessionId: () => string
  private snapshot: StreamingSessionRuntimeSnapshot = createIdleStreamingSessionSnapshot()
  private currentConfig: StreamingSessionStartConfig | null = null

  constructor(dependencies: StreamingSessionControllerDependencies = {}) {
    this.activityPublisher = dependencies.activityPublisher ?? new StreamingActivityPublisher()
    this.createSessionId = dependencies.createSessionId ?? (() => randomUUID())
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
    this.currentConfig = null
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
    this.currentConfig = null
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
