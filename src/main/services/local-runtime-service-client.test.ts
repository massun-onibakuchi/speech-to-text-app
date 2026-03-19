// Where: Main process service tests.
// What: Verifies websocket URL/auth setup, finalized-line normalization, partial suppression, and runtime failure handling.
// Why: Ticket 6 depends on the client being a deterministic seam for the main session controller.

import { describe, expect, it } from 'vitest'
import type { LocalStreamingRuntimeEvent } from '../../shared/domain'
import type { LocalRuntimeServiceConnection } from './local-runtime-service-types'
import {
  DEFAULT_LOCAL_RUNTIME_SESSION_FINALIZATION_POLICY,
  LocalRuntimeServiceClient,
  LocalRuntimeServiceClientError,
  type LocalRuntimeServiceWebSocket
} from './local-runtime-service-client'

class FakeWebSocket {
  readyState = 0
  readonly sent: Array<string | ArrayBuffer | Blob | ArrayBufferView> = []
  private readonly listeners = {
    open: new Set<(event: Event) => void>(),
    message: new Set<(event: MessageEvent<unknown>) => void>(),
    close: new Set<(event: CloseEvent) => void>(),
    error: new Set<(event: Event) => void>()
  }

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
  }

  addEventListener<K extends keyof FakeWebSocket['listeners']>(
    type: K,
    listener: Parameters<FakeWebSocket['listeners'][K]['add']>[0]
  ): void {
    this.listeners[type].add(listener as never)
  }

  removeEventListener<K extends keyof FakeWebSocket['listeners']>(
    type: K,
    listener: Parameters<FakeWebSocket['listeners'][K]['delete']>[0]
  ): void {
    this.listeners[type].delete(listener as never)
  }

  emitOpen(): void {
    this.readyState = 1
    for (const listener of this.listeners.open) {
      listener(new Event('open'))
    }
  }

  emitMessage(payload: unknown): void {
    for (const listener of this.listeners.message) {
      listener({ data: JSON.stringify(payload) } as MessageEvent<unknown>)
    }
  }

  emitClose(code: number, reason: string = ''): void {
    this.readyState = 3
    for (const listener of this.listeners.close) {
      listener({ code, reason } as CloseEvent)
    }
  }

  emitError(): void {
    for (const listener of this.listeners.error) {
      listener(new Event('error'))
    }
  }
}

const createConnection = (): LocalRuntimeServiceConnection => ({
  endpoint: {
    host: '127.0.0.1',
    port: 9001,
    baseUrl: 'http://127.0.0.1:9001',
    healthUrl: 'http://127.0.0.1:9001/health',
    modelsUrl: 'http://127.0.0.1:9001/v1/models',
    wsUrl: 'ws://127.0.0.1:9001/asr'
  },
  credentials: {
    authHeaderName: 'x-dicta-service-token',
    authQueryParamName: 'service_token',
    authToken: 'service-secret',
    sessionToken: 'session-secret'
  },
  pid: 42
})

describe('LocalRuntimeServiceClient', () => {
  it('builds the websocket URL, suppresses partials, emits appended finals, and ends on ready_to_stop', async () => {
    const socket = new FakeWebSocket()
    let capturedUrl = ''
    const events: LocalStreamingRuntimeEvent[] = []
    const phases: string[] = []
    const client = new LocalRuntimeServiceClient({
      createWebSocket: (url) => {
        capturedUrl = url
        return socket as unknown as LocalRuntimeServiceWebSocket
      }
    })

    const openPromise = client.openSession({
      connection: createConnection(),
      model: 'voxtral-mini-4b-realtime-mlx',
      language: 'en',
      dictionaryTerms: ['Codex'],
      finalization: DEFAULT_LOCAL_RUNTIME_SESSION_FINALIZATION_POLICY,
      onEvent: (event) => {
        events.push(event)
      },
      onPhaseChange: (phase) => {
        phases.push(phase)
      }
    })

    socket.emitOpen()
    socket.emitMessage({ type: 'config', mode: 'full' })
    const session = await openPromise

    const url = new URL(capturedUrl)
    expect(url.searchParams.get('service_token')).toBe('service-secret')
    expect(url.searchParams.get('session_token')).toBe('session-secret')
    expect(url.searchParams.get('mode')).toBe('full')
    expect(url.searchParams.get('language')).toBe('en')
    expect(phases).toEqual(['prepare'])

    await session.appendAudio(new Int16Array([1, -1]))
    expect(socket.sent).toHaveLength(1)
    expect(socket.sent[0]).toBeInstanceOf(Uint8Array)
    expect((socket.sent[0] as Uint8Array).byteLength).toBe(4)

    socket.emitMessage({
      status: 'running',
      lines: [{ speaker: 1, text: 'Hello' }],
      buffer_transcription: 'Hel'
    })
    socket.emitMessage({
      status: 'running',
      lines: [
        { speaker: 1, text: 'Hello' },
        { speaker: -2, text: '' },
        { speaker: 1, text: 'World' }
      ],
      buffer_transcription: 'Wor'
    })

    const stopPromise = session.stop()
    expect(socket.sent).toHaveLength(2)
    expect((socket.sent[1] as Uint8Array).byteLength).toBe(0)
    socket.emitMessage({ type: 'ready_to_stop' })
    await stopPromise

    expect(events).toEqual([
      { kind: 'final', sequence: 0, text: 'Hello' },
      { kind: 'final', sequence: 1, text: 'World' },
      { kind: 'end', sequence: 2 }
    ])
  })

  it('emits a stream_interrupted error when the active websocket closes unexpectedly', async () => {
    const socket = new FakeWebSocket()
    const events: LocalStreamingRuntimeEvent[] = []
    const client = new LocalRuntimeServiceClient({
      createWebSocket: () => socket as unknown as LocalRuntimeServiceWebSocket
    })

    const openPromise = client.openSession({
      connection: createConnection(),
      model: 'voxtral-mini-4b-realtime-mlx',
      language: 'auto',
      dictionaryTerms: [],
      finalization: DEFAULT_LOCAL_RUNTIME_SESSION_FINALIZATION_POLICY,
      onEvent: (event) => {
        events.push(event)
      }
    })

    socket.emitOpen()
    socket.emitMessage({ type: 'config' })
    const session = await openPromise

    socket.emitClose(1011, 'backend died')

    expect(events).toEqual([
      {
        kind: 'error',
        sequence: 0,
        phase: 'stream_run',
        detail: 'Local runtime websocket closed unexpectedly (1011): backend died'
      }
    ])
    await expect(session.appendAudio(new Int16Array([1, 2]))).rejects.toMatchObject({
      name: 'LocalRuntimeServiceClientError',
      code: 'stream_interrupted'
    } satisfies Partial<LocalRuntimeServiceClientError>)
  })

  it('fails session startup with prepare_failed when the socket errors after transport open but before config', async () => {
    const socket = new FakeWebSocket()
    const client = new LocalRuntimeServiceClient({
      createWebSocket: () => socket as unknown as LocalRuntimeServiceWebSocket
    })

    const openPromise = client.openSession({
      connection: createConnection(),
      model: 'voxtral-mini-4b-realtime-mlx',
      language: 'en',
      dictionaryTerms: [],
      finalization: DEFAULT_LOCAL_RUNTIME_SESSION_FINALIZATION_POLICY
    })

    socket.emitOpen()
    socket.emitError()

    await expect(openPromise).rejects.toMatchObject({
      name: 'LocalRuntimeServiceClientError',
      code: 'prepare_failed'
    } satisfies Partial<LocalRuntimeServiceClientError>)
  })
})
