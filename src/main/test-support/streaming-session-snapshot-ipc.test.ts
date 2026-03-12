// Where: src/main/test-support/streaming-session-snapshot-ipc.test.ts
// What:  Integration-style coverage for the read-only streaming snapshot IPC route.
// Why:   Proves renderer boot hydration can read the same session truth that main
//        publishes over events without depending on a live Electron window.

import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc'
import { InMemoryStreamingSessionController } from '../services/streaming/streaming-session-controller'
import { IpcTestHarness } from './ipc-test-harness'

describe('streaming session snapshot IPC', () => {
  it('returns the controller snapshot across idle, active, and terminal states', async () => {
    const harness = new IpcTestHarness()
    const controller = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1'
    })

    harness.handle(IPC_CHANNELS.getStreamingSessionSnapshot, async () => controller.getSnapshot())

    await expect(harness.invoke(IPC_CHANNELS.getStreamingSessionSnapshot)).resolves.toEqual({
      sessionId: null,
      state: 'idle',
      provider: null,
      transport: null,
      model: null,
      reason: null
    })

    await controller.start({
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      outputMode: 'stream_raw_dictation',
      maxInFlightTransforms: 2,
      delimiterPolicy: {
        mode: 'space',
        value: null
      },
      transformationProfile: null
    })

    await expect(harness.invoke(IPC_CHANNELS.getStreamingSessionSnapshot)).resolves.toEqual({
      sessionId: 'session-1',
      state: 'active',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    })

    await controller.stop('user_stop')

    await expect(harness.invoke(IPC_CHANNELS.getStreamingSessionSnapshot)).resolves.toEqual({
      sessionId: 'session-1',
      state: 'ended',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'user_stop'
    })
  })
})
