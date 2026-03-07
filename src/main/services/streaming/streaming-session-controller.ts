/**
 * Where: src/main/services/streaming/streaming-session-controller.ts
 * What:  Streaming session controller contract and minimal no-op stub.
 * Why:   PR-2 needs a stable main-process control-plane boundary before the
 *        real session state machine and provider audio runtime land in PR-3+.
 */

import type {
  StreamingErrorEvent,
  StreamingSegmentEvent,
  StreamingSessionStateSnapshot,
  StreamingSessionStopReason
} from '../../../shared/ipc'

type Listener<T> = (event: T) => void

export interface StreamingSessionController {
  start(): Promise<void>
  stop(reason?: StreamingSessionStopReason): Promise<void>
  onSessionState(listener: Listener<StreamingSessionStateSnapshot>): () => void
  onSegment(listener: Listener<StreamingSegmentEvent>): () => void
  onError(listener: Listener<StreamingErrorEvent>): () => void
}

/**
 * Minimal PR-2 stub. It provides the controller shape and listener lifecycle
 * without implementing session state transitions or provider I/O yet.
 */
export class NoopStreamingSessionController implements StreamingSessionController {
  private readonly sessionStateListeners = new Set<Listener<StreamingSessionStateSnapshot>>()
  private readonly segmentListeners = new Set<Listener<StreamingSegmentEvent>>()
  private readonly errorListeners = new Set<Listener<StreamingErrorEvent>>()

  async start(): Promise<void> {}

  async stop(_reason?: StreamingSessionStopReason): Promise<void> {}

  onSessionState(listener: Listener<StreamingSessionStateSnapshot>): () => void {
    this.sessionStateListeners.add(listener)
    return () => {
      this.sessionStateListeners.delete(listener)
    }
  }

  onSegment(listener: Listener<StreamingSegmentEvent>): () => void {
    this.segmentListeners.add(listener)
    return () => {
      this.segmentListeners.delete(listener)
    }
  }

  onError(listener: Listener<StreamingErrorEvent>): () => void {
    this.errorListeners.add(listener)
    return () => {
      this.errorListeners.delete(listener)
    }
  }
}
