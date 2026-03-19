import { describe, expect, it } from 'vitest'
import { applyLocalStreamingActivityEvent } from './local-streaming-activity'

describe('applyLocalStreamingActivityEvent', () => {
  it('upserts the same chunk card as its state advances', () => {
    const finalized = applyLocalStreamingActivityEvent([], 0, {
      kind: 'segment',
      segment: {
        sessionId: 'session-1',
        sequence: 0,
        state: 'finalized',
        sourceText: 'raw chunk',
        transformedText: null,
        error: null
      }
    }, '09:15:00')

    const committed = applyLocalStreamingActivityEvent(finalized.activity, finalized.nextActivityId, {
      kind: 'segment',
      segment: {
        sessionId: 'session-1',
        sequence: 0,
        state: 'output_committed',
        sourceText: 'raw chunk',
        transformedText: null,
        error: null
      }
    }, '09:15:01')

    expect(committed.activity).toHaveLength(1)
    expect(committed.activity[0]).toMatchObject({
      message: 'Chunk 1: raw chunk',
      tone: 'success',
      stableKey: 'local-streaming:segment:session-1:0',
      createdAt: '09:15:01'
    })
  })

  it('appends the terminal session activity entry only when terminal state exists', () => {
    const nonTerminal = applyLocalStreamingActivityEvent([], 0, {
      kind: 'session',
      session: {
        sessionId: 'session-1',
        status: 'active',
        phase: 'stream_run',
        startedAt: '2026-03-19T00:00:00.000Z',
        modelId: 'voxtral-mini-4b-realtime-mlx',
        outputLanguage: 'en',
        outputMode: 'stream_raw_dictation',
        dictionaryTerms: [],
        lastSequence: 1,
        terminal: null
      }
    }, '09:15:02')

    const terminal = applyLocalStreamingActivityEvent(nonTerminal.activity, nonTerminal.nextActivityId, {
      kind: 'session',
      session: {
        sessionId: 'session-1',
        status: 'ended',
        phase: 'stream_run',
        startedAt: '2026-03-19T00:00:00.000Z',
        modelId: 'voxtral-mini-4b-realtime-mlx',
        outputLanguage: 'en',
        outputMode: 'stream_raw_dictation',
        dictionaryTerms: [],
        lastSequence: 1,
        terminal: {
          status: 'completed',
          phase: 'stream_run',
          detail: null,
          modelId: 'voxtral-mini-4b-realtime-mlx'
        }
      }
    }, '09:15:03')

    expect(nonTerminal.activity).toEqual([])
    expect(terminal.activity).toHaveLength(1)
    expect(terminal.activity[0]?.message).toBe('Local streaming session completed.')
    expect(terminal.activity[0]?.tone).toBe('success')
  })
})
