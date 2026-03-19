import { describe, expect, it, vi } from 'vitest'
import { StreamingActivityPublisher } from './activity-publisher'

describe('StreamingActivityPublisher', () => {
  it('broadcasts session and segment updates over the local streaming activity channel', () => {
    const send = vi.fn()
    const publisher = new StreamingActivityPublisher({
      getWindows: () => [{ webContents: { send } } as any]
    })

    publisher.publishFinalizedSegment('session-1', 0, 'raw chunk')
    publisher.publishTransformedSegment('session-1', 0, 'fixed chunk')
    publisher.publishOutputCommitted('session-1', 0)
    publisher.publishSessionState({
      sessionId: 'session-1',
      status: 'ended',
      phase: 'stream_run',
      startedAt: '2026-03-19T00:00:00.000Z',
      modelId: 'voxtral-mini-4b-realtime-mlx',
      outputLanguage: 'en',
      outputMode: 'stream_raw_dictation',
      dictionaryTerms: [],
      lastSequence: 0,
      terminal: {
        status: 'completed',
        phase: 'stream_run',
        detail: null,
        modelId: 'voxtral-mini-4b-realtime-mlx'
      }
    })

    expect(send).toHaveBeenCalledTimes(4)
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      kind: 'segment',
      segment: {
        sessionId: 'session-1',
        sequence: 0,
        state: 'finalized',
        sourceText: 'raw chunk'
      }
    })
    expect(send.mock.calls[1]?.[1]).toMatchObject({
      kind: 'segment',
      segment: {
        sessionId: 'session-1',
        sequence: 0,
        state: 'transformed',
        sourceText: 'raw chunk',
        transformedText: 'fixed chunk'
      }
    })
    expect(send.mock.calls[2]?.[1]).toMatchObject({
      kind: 'segment',
      segment: {
        sessionId: 'session-1',
        sequence: 0,
        state: 'output_committed',
        sourceText: 'raw chunk'
      }
    })
    expect(send.mock.calls[3]?.[1]).toMatchObject({
      kind: 'session',
      session: {
        sessionId: 'session-1',
        terminal: {
          status: 'completed'
        }
      }
    })
  })

  it('drops retained segment snapshots when a session finishes', () => {
    const publisher = new StreamingActivityPublisher({
      getWindows: () => []
    })

    publisher.publishFinalizedSegment('session-1', 0, 'raw chunk')
    publisher.clearSession('session-1')

    expect(() => publisher.publishOutputCommitted('session-1', 0)).toThrow(
      'Missing local streaming segment session-1:0.'
    )
  })
})
