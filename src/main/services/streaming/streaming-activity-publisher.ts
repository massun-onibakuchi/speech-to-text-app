/**
 * Where: src/main/services/streaming/streaming-activity-publisher.ts
 * What:  In-memory publisher for streaming session, segment, and error events.
 * Why:   PR-3 needs renderer-observable lifecycle publication before provider
 *        audio ingress and segment assembly exist.
 */

import type {
  StreamingErrorEvent,
  StreamingSegmentEvent,
  StreamingSessionStateSnapshot
} from '../../../shared/ipc'

type Listener<T> = (event: T) => void

export class StreamingActivityPublisher {
  private readonly sessionStateListeners = new Set<Listener<StreamingSessionStateSnapshot>>()
  private readonly segmentListeners = new Set<Listener<StreamingSegmentEvent>>()
  private readonly errorListeners = new Set<Listener<StreamingErrorEvent>>()

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

  publishSessionState(event: StreamingSessionStateSnapshot): void {
    for (const listener of this.sessionStateListeners) {
      listener(event)
    }
  }

  publishSegment(event: StreamingSegmentEvent): void {
    for (const listener of this.segmentListeners) {
      listener(event)
    }
  }

  publishError(event: StreamingErrorEvent): void {
    for (const listener of this.errorListeners) {
      listener(event)
    }
  }
}
