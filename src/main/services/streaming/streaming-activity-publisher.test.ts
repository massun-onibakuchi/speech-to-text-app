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
    const onDebug = vi.fn()

    publisher.onSessionState(onSessionState)
    publisher.onSegment(onSegment)
    publisher.onError(onError)
    publisher.onDebug(onDebug)

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
      delimiter: ' ',
      isFinal: true,
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    })
    publisher.publishError({
      sessionId: 'session-1',
      code: 'fatal_error',
      message: 'boom'
    })
    publisher.publishDebug({
      sessionId: 'session-1',
      level: 'warn',
      event: 'streaming.groq_upload.empty_transcript',
      message: 'Groq returned no usable transcript text for an utterance.',
      context: {
        utteranceIndex: 0
      }
    })

    expect(onSessionState).toHaveBeenCalledWith(expect.objectContaining({ state: 'active' }))
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ sequence: 1 }))
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'fatal_error' }))
    expect(onDebug).toHaveBeenCalledWith(expect.objectContaining({ event: 'streaming.groq_upload.empty_transcript' }))
  })
})
