// Where: Main process orchestration tests.
// What: Verifies Ticket 6 session ownership, cancel behavior across startup phases, and runtime event handling.
// Why: The local streaming controller is the single owner of session lifecycle rules and needs direct regression coverage.

import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  type LocalStreamingRuntimeEvent,
  type LocalStreamingSessionState,
  type Settings
} from '../../shared/domain'
import { LOCAL_STT_MODEL, LOCAL_STT_PROVIDER } from '../../shared/local-stt'
import { LOCAL_RUNTIME_MANIFEST, type LocalRuntimeStatusSnapshot } from '../../shared/local-runtime'
import type { LocalStreamingSessionStartPayload } from '../../shared/ipc'
import type { LocalRuntimeServiceConnection } from '../services/local-runtime-service-types'
import { LocalRuntimeServiceClientError, type LocalRuntimeServiceClientSession } from '../services/local-runtime-service-client'
import { LocalStreamingSessionController } from './local-streaming-session-controller'

const START_PAYLOAD: LocalStreamingSessionStartPayload = {
  startedAt: '2026-03-19T00:00:00.000Z',
  sampleRateHz: 48_000,
  channelCount: 1
}

const CONNECTION: LocalRuntimeServiceConnection = {
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
  pid: 101
}

const flushTasks = async (): Promise<void> => {
  for (let iteration = 0; iteration < 10; iteration += 1) {
    await Promise.resolve()
  }
}

const createSettings = (): Settings => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.transcription.provider = LOCAL_STT_PROVIDER
  settings.transcription.model = LOCAL_STT_MODEL
  settings.transcription.outputLanguage = 'en'
  settings.output.selectedTextSource = 'transformed'
  settings.correction.dictionary.entries = [
    { key: 'Codex', value: 'CODEX' },
    { key: 'Voxtral', value: 'Voxtral' }
  ]
  return settings
}

const createRuntimeSnapshot = (
  state: LocalRuntimeStatusSnapshot['state'],
  overrides: Partial<LocalRuntimeStatusSnapshot> = {}
): LocalRuntimeStatusSnapshot => ({
  state,
  manifest: LOCAL_RUNTIME_MANIFEST,
  runtimeRoot: '/tmp/dicta-runtime/current',
  installedVersion: state === 'ready' ? LOCAL_RUNTIME_MANIFEST.version : null,
  installedAt: state === 'ready' ? '2026-03-19T00:00:00.000Z' : null,
  summary: state === 'ready' ? 'Local runtime ready' : 'Installing local runtime',
  detail: state === 'ready' ? 'WhisperLiveKit is ready.' : 'Installing local runtime.',
  phase: state === 'installing' ? 'bootstrap' : null,
  failureCode: null,
  canRequestInstall: state !== 'installing',
  canCancel: state === 'installing',
  canUninstall: state === 'ready',
  requiresUpdate: false,
  ...overrides
})

describe('LocalStreamingSessionController', () => {
  it('buffers startup PCM, activates once the runtime session opens, and completes stop cleanly', async () => {
    const runtimeEvents: LocalStreamingRuntimeEvent[] = []
    const states: LocalStreamingSessionState[] = []
    let activatedCount = 0
    let endedCount = 0
    let resolveRuntimeSession: ((session: LocalRuntimeServiceClientSession) => void) | null = null
    let capturedOpenOptions: {
      onEvent?: (event: LocalStreamingRuntimeEvent) => void
      model: string
      language: string
      dictionaryTerms: readonly string[]
      finalization: { strategy: 'runtime_default' }
    } | null = null

    const runtimeSession: LocalRuntimeServiceClientSession = {
      appendAudio: vi.fn(async () => {}),
      stop: vi.fn(async () => {
        capturedOpenOptions?.onEvent?.({ kind: 'end', sequence: 2 })
      }),
      cancel: vi.fn(async () => {})
    }

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => createRuntimeSnapshot('ready'),
        cancelInstall: vi.fn(() => createRuntimeSnapshot('ready'))
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(async () => CONNECTION)
      },
      runtimeClient: {
        openSession: vi.fn((options) => {
          capturedOpenOptions = options
          return new Promise<LocalRuntimeServiceClientSession>((resolve) => {
            resolveRuntimeSession = resolve
          })
        })
      },
      onStateChanged: (state) => {
        states.push(state)
      },
      onRuntimeEvent: (_sessionId, event) => {
        runtimeEvents.push(event)
      },
      onSessionActivated: () => {
        activatedCount += 1
      },
      onSessionEnded: () => {
        endedCount += 1
      }
    })

    const started = controller.startSession(START_PAYLOAD)
    await controller.appendAudio({
      sessionId: started.sessionId,
      pcmFrames: new Int16Array([1, 2, 3, 4])
    })
    await controller.appendAudio({
      sessionId: started.sessionId,
      pcmFrames: new Int16Array([5, 6])
    })

    if (!resolveRuntimeSession) {
      throw new Error('Expected runtime session resolver to be captured.')
    }
    const resolveRuntime = resolveRuntimeSession as unknown as (session: LocalRuntimeServiceClientSession) => void
    resolveRuntime(runtimeSession)
    await flushTasks()

    expect(capturedOpenOptions).toMatchObject({
      model: LOCAL_STT_MODEL,
      language: 'en',
      dictionaryTerms: ['Codex', 'Voxtral'],
      finalization: { strategy: 'runtime_default' }
    })
    expect(runtimeSession.appendAudio).toHaveBeenCalledTimes(2)
    expect(activatedCount).toBe(1)
    expect(controller.getSessionState()).toMatchObject({
      sessionId: started.sessionId,
      status: 'active',
      phase: 'stream_run',
      outputMode: 'stream_transformed'
    })

    await controller.stopSession({ sessionId: started.sessionId })

    expect(runtimeSession.stop).toHaveBeenCalledOnce()
    expect(runtimeEvents).toEqual([{ kind: 'end', sequence: 2 }])
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      lastSequence: 2,
      terminal: {
        status: 'completed',
        phase: 'stream_run',
        modelId: LOCAL_STT_MODEL
      }
    })
    expect(endedCount).toBe(1)
    expect(states.at(-1)).toMatchObject({
      status: 'ended',
      terminal: { status: 'completed' }
    })
  })

  it('rejects concurrent starts while another local session is still in progress', async () => {
    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => createRuntimeSnapshot('ready'),
        cancelInstall: vi.fn(() => createRuntimeSnapshot('ready'))
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(async () => CONNECTION)
      },
      runtimeClient: {
        openSession: vi.fn((options) => new Promise<LocalRuntimeServiceClientSession>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new LocalRuntimeServiceClientError('open_aborted', 'Local runtime session startup was aborted.'))
          }, { once: true })
        }))
      }
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()

    expect(() => controller.startSession(START_PAYLOAD)).toThrow(/already active/i)

    await controller.cancelSession({ sessionId: started.sessionId })
    await flushTasks()
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      terminal: { status: 'cancelled' }
    })
  })

  it('fails fast when the runtime is not installed or otherwise unavailable before startup begins', () => {
    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => createRuntimeSnapshot('not_installed'),
        cancelInstall: vi.fn(() => createRuntimeSnapshot('not_installed'))
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(async () => CONNECTION)
      },
      runtimeClient: {
        openSession: vi.fn()
      }
    })

    expect(() => controller.startSession(START_PAYLOAD)).toThrow(/not installed/i)
    expect(controller.getSessionState()).toBeNull()
  })

  it('treats stop during startup as a graceful drain-and-stop once the runtime becomes active', async () => {
    let resolveRuntimeSession: ((session: LocalRuntimeServiceClientSession) => void) | null = null
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const runtimeSession: LocalRuntimeServiceClientSession = {
      appendAudio: vi.fn(async () => {}),
      stop: vi.fn(async () => {
        const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void
        emitRuntimeEvent({ kind: 'end', sequence: 1 })
      }),
      cancel: vi.fn(async () => {})
    }

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => createRuntimeSnapshot('ready'),
        cancelInstall: vi.fn(() => createRuntimeSnapshot('ready'))
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(async () => CONNECTION)
      },
      runtimeClient: {
        openSession: vi.fn((options) => {
          runtimeEventSink = options.onEvent ?? null
          return new Promise<LocalRuntimeServiceClientSession>((resolve) => {
            resolveRuntimeSession = resolve
          })
        })
      }
    })

    const started = controller.startSession(START_PAYLOAD)
    await controller.appendAudio({
      sessionId: started.sessionId,
      pcmFrames: new Int16Array([1, 2, 3, 4])
    })

    const stopPromise = controller.stopSession({ sessionId: started.sessionId })
    await flushTasks()
    if (!resolveRuntimeSession) {
      throw new Error('Expected runtime session resolver to be captured.')
    }
    const resolveRuntime = resolveRuntimeSession as unknown as (session: LocalRuntimeServiceClientSession) => void
    resolveRuntime(runtimeSession)
    await stopPromise

    expect(runtimeSession.appendAudio).toHaveBeenCalledOnce()
    expect(runtimeSession.stop).toHaveBeenCalledOnce()
    expect(runtimeSession.cancel).not.toHaveBeenCalled()
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      terminal: { status: 'completed', phase: 'stream_run' }
    })
  })

  it('cancels cleanly while waiting for the install manager to finish', async () => {
    let installSnapshot = createRuntimeSnapshot('installing')
    let releaseInstallWait: (() => void) | null = null
    const cancelInstall = vi.fn(() => {
      installSnapshot = createRuntimeSnapshot('not_installed')
      return installSnapshot
    })

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => installSnapshot,
        cancelInstall
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(async () => CONNECTION)
      },
      runtimeClient: {
        openSession: vi.fn()
      },
      waitForDelay: () => new Promise<void>((resolve) => {
        releaseInstallWait = resolve
      })
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    await controller.cancelSession({ sessionId: started.sessionId })
    if (!releaseInstallWait) {
      throw new Error('Expected install wait promise to be captured.')
    }
    const releaseWait = releaseInstallWait as unknown as () => void
    releaseWait()
    await flushTasks()

    expect(cancelInstall).toHaveBeenCalledOnce()
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      phase: 'install',
      terminal: { status: 'cancelled', phase: 'install' }
    })
  })

  it('cancels cleanly while the localhost service is starting', async () => {
    let observedSignal: AbortSignal | null = null
    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => createRuntimeSnapshot('ready'),
        cancelInstall: vi.fn(() => createRuntimeSnapshot('ready'))
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(({ signal }) => new Promise<LocalRuntimeServiceConnection>((_resolve, reject) => {
          observedSignal = signal ?? null
          signal?.addEventListener('abort', () => {
            reject(new Error('service start aborted'))
          }, { once: true })
        }))
      },
      runtimeClient: {
        openSession: vi.fn()
      }
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    await controller.cancelSession({ sessionId: started.sessionId })
    await flushTasks()

    if (!observedSignal) {
      throw new Error('Expected startup abort signal to be captured.')
    }
    const serviceStartSignal = observedSignal as unknown as AbortSignal
    expect(serviceStartSignal.aborted).toBe(true)
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      phase: 'service_start',
      terminal: { status: 'cancelled', phase: 'service_start' }
    })
  })

  it('cancels cleanly while websocket prepare is still in progress', async () => {
    let openSignal: AbortSignal | null = null
    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => createRuntimeSnapshot('ready'),
        cancelInstall: vi.fn(() => createRuntimeSnapshot('ready'))
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(async () => CONNECTION)
      },
      runtimeClient: {
        openSession: vi.fn((options) => {
          openSignal = options.signal ?? null
          options.onPhaseChange?.('prepare')
          return new Promise<LocalRuntimeServiceClientSession>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
              reject(new LocalRuntimeServiceClientError('open_aborted', 'Local runtime session startup was aborted.'))
            }, { once: true })
          })
        })
      }
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    expect(controller.getSessionState()).toMatchObject({ phase: 'prepare' })

    await controller.cancelSession({ sessionId: started.sessionId })
    await flushTasks()

    if (!openSignal) {
      throw new Error('Expected websocket abort signal to be captured.')
    }
    const prepareSignal = openSignal as unknown as AbortSignal
    expect(prepareSignal.aborted).toBe(true)
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      phase: 'prepare',
      terminal: { status: 'cancelled', phase: 'prepare' }
    })
  })

  it('cancels an active session and marks the gate ended once', async () => {
    let activatedCount = 0
    let endedCount = 0
    const runtimeSession: LocalRuntimeServiceClientSession = {
      appendAudio: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      cancel: vi.fn(async () => {})
    }

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => createRuntimeSnapshot('ready'),
        cancelInstall: vi.fn(() => createRuntimeSnapshot('ready'))
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(async () => CONNECTION)
      },
      runtimeClient: {
        openSession: vi.fn(async () => runtimeSession)
      },
      onSessionActivated: () => {
        activatedCount += 1
      },
      onSessionEnded: () => {
        endedCount += 1
      }
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    await controller.cancelSession({ sessionId: started.sessionId })

    expect(runtimeSession.cancel).toHaveBeenCalledOnce()
    expect(activatedCount).toBe(1)
    expect(endedCount).toBe(1)
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      phase: 'stream_run',
      terminal: { status: 'cancelled', phase: 'stream_run' }
    })
  })

  it('transitions an active session to stream_interrupted when the runtime emits an error event', async () => {
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    let endedCount = 0
    const runtimeSession: LocalRuntimeServiceClientSession = {
      appendAudio: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      cancel: vi.fn(async () => {})
    }

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => createSettings() },
      installManager: {
        getStatusSnapshot: () => createRuntimeSnapshot('ready'),
        cancelInstall: vi.fn(() => createRuntimeSnapshot('ready'))
      },
      runtimeSupervisor: {
        ensureRunning: vi.fn(async () => CONNECTION)
      },
      runtimeClient: {
        openSession: vi.fn(async (options) => {
          runtimeEventSink = options.onEvent ?? null
          return runtimeSession
        })
      },
      onSessionEnded: () => {
        endedCount += 1
      }
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void
    emitRuntimeEvent({
      kind: 'error',
      sequence: 3,
      phase: 'stream_run',
      detail: 'Socket died'
    })
    await flushTasks()

    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      lastSequence: 3,
      terminal: {
        status: 'stream_interrupted',
        phase: 'stream_run',
        detail: 'Socket died'
      }
    })
    expect(endedCount).toBe(1)
    await expect(controller.appendAudio({
      sessionId: started.sessionId,
      pcmFrames: new Int16Array([1, 2])
    })).rejects.toThrow(/no local streaming session is active/i)
  })
})
