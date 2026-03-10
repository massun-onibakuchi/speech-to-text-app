/*
Where: src/preload/index.test.ts
What: Focused preload bridge tests for the one-shot streaming utterance transport.
Why: Prevent hangs in the renderer when the MessagePort handshake fails or never acks.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const postMessage = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    postMessage
  }
}))

class FakeMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  closed = false
  peer: FakeMessagePort | null = null

  postMessage(data: unknown): void {
    this.peer?.onmessage?.({ data } as MessageEvent)
  }

  start(): void {}

  close(): void {
    this.closed = true
  }
}

class FakeMessageChannel {
  readonly port1 = new FakeMessagePort()
  readonly port2 = new FakeMessagePort()

  constructor() {
    this.port1.peer = this.port2
    this.port2.peer = this.port1
  }
}

describe('preload speechToTextApi', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.useRealTimers()
    exposeInMainWorld.mockReset()
    postMessage.mockReset()
    vi.stubGlobal('MessageChannel', FakeMessageChannel as unknown as typeof MessageChannel)
    await import('./index')
  })

  it('sends utterance chunks over a one-shot message port and resolves on ack', async () => {
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

    postMessage.mockImplementation((_channel, _message, ports: FakeMessagePort[]) => {
      const replyPort = ports[0]
      replyPort.onmessage = async (event) => {
        expect(event.data).toMatchObject({
          sessionId: 'session-1',
          utteranceIndex: 3,
          reason: 'speech_pause'
        })
        replyPort.postMessage({ ok: true })
      }
    })

    await expect(api.pushStreamingAudioUtteranceChunk(chunk)).resolves.toBeUndefined()
  })

  it('rejects when the utterance ack never arrives', async () => {
    vi.useFakeTimers()
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

    postMessage.mockImplementation(() => {})

    const pending = expect(api.pushStreamingAudioUtteranceChunk(chunk)).rejects.toThrow(
      'Streaming audio utterance chunk acknowledgement timed out.'
    )
    await vi.advanceTimersByTimeAsync(5_000)

    await pending
  })
})
