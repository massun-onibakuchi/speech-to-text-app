import { describe, expect, it } from 'vitest'
import { LocalStreamingSessionBridge } from './local-streaming-session-bridge'

describe('LocalStreamingSessionBridge', () => {
  it('starts, accepts appended PCM batches, and stops one active session', () => {
    let startedCount = 0
    let endedCount = 0
    const gatedBridge = new LocalStreamingSessionBridge({
      onSessionStarted: () => {
        startedCount += 1
      },
      onSessionEnded: () => {
        endedCount += 1
      }
    })

    const started = gatedBridge.startSession({
      startedAt: '2026-03-19T00:00:00.000Z',
      sampleRateHz: 48_000,
      channelCount: 1
    })

    gatedBridge.appendAudio({
      sessionId: started.sessionId,
      pcmFrames: new Int16Array([1, 2, 3, 4])
    })
    gatedBridge.appendAudio({
      sessionId: started.sessionId,
      pcmFrames: new Int16Array([5, 6])
    })

    expect(gatedBridge.getActiveSession()).toMatchObject({
      sessionId: started.sessionId,
      sampleRateHz: 48_000,
      channelCount: 1,
      appendedBatchCount: 2,
      appendedSampleCount: 6
    })
    expect(startedCount).toBe(1)

    gatedBridge.stopSession({ sessionId: started.sessionId })
    expect(gatedBridge.getActiveSession()).toBeNull()
    expect(endedCount).toBe(1)
  })

  it('rejects concurrent local session starts', () => {
    const bridge = new LocalStreamingSessionBridge()
    bridge.startSession({
      startedAt: '2026-03-19T00:00:00.000Z',
      sampleRateHz: 16_000,
      channelCount: 1
    })

    expect(() =>
      bridge.startSession({
        startedAt: '2026-03-19T00:00:01.000Z',
        sampleRateHz: 16_000,
        channelCount: 1
      })
    ).toThrow(/already active/i)
  })

  it('rejects append calls for unknown session ids', () => {
    const bridge = new LocalStreamingSessionBridge()
    const started = bridge.startSession({
      startedAt: '2026-03-19T00:00:00.000Z',
      sampleRateHz: 16_000,
      channelCount: 1
    })

    expect(() =>
      bridge.appendAudio({
        sessionId: `${started.sessionId}-other`,
        pcmFrames: new Int16Array([1, 2])
      })
    ).toThrow(/is not active/i)
  })

  it('rejects append calls after the session has been stopped', () => {
    const bridge = new LocalStreamingSessionBridge()
    const started = bridge.startSession({
      startedAt: '2026-03-19T00:00:00.000Z',
      sampleRateHz: 16_000,
      channelCount: 1
    })

    bridge.stopSession({ sessionId: started.sessionId })

    expect(() =>
      bridge.appendAudio({
        sessionId: started.sessionId,
        pcmFrames: new Int16Array([1, 2])
      })
    ).toThrow(/no local streaming session is active/i)
  })

  it('treats duplicate stop as a no-op after the active session has already ended', () => {
    let endedCount = 0
    const bridge = new LocalStreamingSessionBridge({
      onSessionEnded: () => {
        endedCount += 1
      }
    })
    const started = bridge.startSession({
      startedAt: '2026-03-19T00:00:00.000Z',
      sampleRateHz: 16_000,
      channelCount: 1
    })

    bridge.stopSession({ sessionId: started.sessionId })

    expect(() => bridge.stopSession({ sessionId: started.sessionId })).not.toThrow()
    expect(bridge.getActiveSession()).toBeNull()
    expect(endedCount).toBe(1)
  })

  it('rejects stop calls for stale session ids while another session is active', () => {
    const bridge = new LocalStreamingSessionBridge()
    const started = bridge.startSession({
      startedAt: '2026-03-19T00:00:00.000Z',
      sampleRateHz: 16_000,
      channelCount: 1
    })

    expect(() =>
      bridge.stopSession({
        sessionId: `${started.sessionId}-stale`
      })
    ).toThrow(/is not active/i)
    expect(bridge.getActiveSession()).toMatchObject({ sessionId: started.sessionId })
  })
})
