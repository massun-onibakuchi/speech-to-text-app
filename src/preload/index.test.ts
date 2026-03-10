/*
Where: src/preload/index.test.ts
What: Focused preload bridge tests for the renderer utterance IPC bridge.
Why: Prevent regressions in the Groq utterance transport contract exposed to the renderer.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke,
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    postMessage: vi.fn()
  }
}))

describe('preload speechToTextApi', () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockReset()
    invoke.mockReset()
    await import('./index')
  })

  it('forwards utterance chunks over invoke and resolves on success', async () => {
    const api = exposeInMainWorld.mock.calls.find(([name]) => name === 'speechToTextApi')?.[1]
    const chunk = {
      sessionId: 'session-1',
      sampleRateHz: 16_000,
      channels: 1,
      utteranceIndex: 3,
      wavBytes: new ArrayBuffer(8),
      wavFormat: 'wav_pcm_s16le_mono_16000' as const,
      startedAtEpochMs: 100,
      endedAtEpochMs: 240,
      hadCarryover: false,
      reason: 'speech_pause' as const,
      source: 'browser_vad' as const
    }

    invoke.mockResolvedValue(undefined)

    await expect(api.pushStreamingAudioUtteranceChunk(chunk)).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.pushStreamingAudioUtteranceChunk, chunk)
  })

  it('surfaces invoke rejections from utterance transport', async () => {
    const api = exposeInMainWorld.mock.calls.find(([name]) => name === 'speechToTextApi')?.[1]
    const chunk = {
      sessionId: 'session-1',
      sampleRateHz: 16_000,
      channels: 1,
      utteranceIndex: 0,
      wavBytes: new ArrayBuffer(4),
      wavFormat: 'wav_pcm_s16le_mono_16000' as const,
      startedAtEpochMs: 0,
      endedAtEpochMs: 32,
      hadCarryover: false,
      reason: 'session_stop' as const,
      source: 'browser_vad' as const
    }

    invoke.mockRejectedValue(new Error('Invalid streaming audio utterance chunk payload: expected an object.'))

    await expect(api.pushStreamingAudioUtteranceChunk(chunk)).rejects.toThrow(
      'Invalid streaming audio utterance chunk payload: expected an object.'
    )
  })
})
