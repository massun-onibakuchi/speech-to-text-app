/**
 * Where: src/main/services/streaming/streaming-activity-publisher.test.ts
 * What:  Tests for the streaming activity publisher.
 * Why:   Lock listener registration and event fan-out independently from the
 *        controller lifecycle state machine.
 */

import { describe, expect, it, vi } from 'vitest'
import { StreamingActivityPublisher } from './streaming-activity-publisher'

describe('StreamingActivityPublisher', () => {
  it('publishes session, segment, and error events to registered listeners', () => {
    const publisher = new StreamingActivityPublisher()
    const onSessionState = vi.fn()
    const onSegment = vi.fn()
    const onError = vi.fn()

    publisher.onSessionState(onSessionState)
    publisher.onSegment(onSegment)
    publisher.onError(onError)

    publisher.publishSessionState({
      sessionId: 'session-1',
      state: 'active',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    })
    publisher.publishSegment({
      sessionId: 'session-1',
      sequence: 1,
      text: 'hello',
      isFinal: true
    })
    publisher.publishError({
      sessionId: 'session-1',
      code: 'fatal_error',
      message: 'boom'
    })

    expect(onSessionState).toHaveBeenCalledWith(expect.objectContaining({ state: 'active' }))
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ sequence: 1 }))
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'fatal_error' }))
  })
})
