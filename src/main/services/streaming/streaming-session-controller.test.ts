/**
 * Where: src/main/services/streaming/streaming-session-controller.test.ts
 * What:  Contract tests for the PR-2 streaming session controller stub.
 * Why:   Lock the listener lifecycle and ensure the no-op controller is safe
 *        to wire into the main-process composition root before PR-3 runtime work.
 */

import { describe, expect, it, vi } from 'vitest'
import { NoopStreamingSessionController } from './streaming-session-controller'

describe('NoopStreamingSessionController', () => {
  it('allows start and stop without throwing', async () => {
    const controller = new NoopStreamingSessionController()

    await expect(controller.start()).resolves.toBeUndefined()
    await expect(controller.stop('user_stop')).resolves.toBeUndefined()
  })

  it('returns unsubscribe functions for all listener registrations', () => {
    const controller = new NoopStreamingSessionController()
    const onSessionState = vi.fn()
    const onSegment = vi.fn()
    const onError = vi.fn()

    const unlistenSessionState = controller.onSessionState(onSessionState)
    const unlistenSegment = controller.onSegment(onSegment)
    const unlistenError = controller.onError(onError)

    expect(typeof unlistenSessionState).toBe('function')
    expect(typeof unlistenSegment).toBe('function')
    expect(typeof unlistenError).toBe('function')

    unlistenSessionState()
    unlistenSegment()
    unlistenError()
  })
})
