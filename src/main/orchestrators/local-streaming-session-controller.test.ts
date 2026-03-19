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
import { SerialOutputCoordinator, type OrderedStreamCommitResult } from '../coordination/ordered-output-coordinator'
import type { LocalRuntimeServiceConnection } from '../services/local-runtime-service-types'
import { LocalRuntimeServiceClientError, type LocalRuntimeServiceClientSession } from '../services/local-runtime-service-client'
import { OutputService } from '../services/output-service'
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
  settings.output.selectedTextSource = 'transcript'
  settings.correction.dictionary.entries = [
    { key: 'Codex', value: 'CODEX' },
    { key: 'Voxtral', value: 'Voxtral' }
  ]
  return settings
}

const createRawOutputDeps = () => ({
  outputCoordinator: {
    submitStream: async <T>(
      _sessionId: string,
      _sequence: number,
      commitFn: () => Promise<T>
    ): Promise<OrderedStreamCommitResult<T>> => ({
      committed: true,
      value: await commitFn()
    }),
    releaseStream: vi.fn(),
    cancelStream: vi.fn(),
    sealStream: vi.fn(),
    clearStream: vi.fn()
  },
  outputService: {
    applyLocalStreamingOutput: vi.fn(async () => ({
      status: 'succeeded' as const,
      message: null
    }))
  },
  activityPublisher: {
    publishFinalizedSegment: vi.fn(),
    publishTransformedSegment: vi.fn(),
    publishOutputCommitted: vi.fn(),
    publishSegmentFailure: vi.fn(),
    clearSession: vi.fn()
  }
})

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
      ...createRawOutputDeps(),
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
      outputMode: 'stream_raw_dictation'
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

  it('commits transformed finalized chunks in source order even when transform completion is out of order', async () => {
    const transformedSettings = createSettings()
    transformedSettings.output.selectedTextSource = 'transformed'
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const outputLog: string[] = []
    const activityPublisher = createRawOutputDeps().activityPublisher
    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => transformedSettings },
      secretStore: { getApiKey: vi.fn(() => 'google-key') },
      transformationService: {
        transform: vi.fn(async ({ text }: { text: string }) => {
          if (text === 'first chunk') {
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          return {
            text: text.toUpperCase(),
            model: 'gemini-2.5-flash' as const
          }
        })
      },
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyLocalStreamingOutput: vi.fn(async (text: string) => {
          outputLog.push(text)
          return { status: 'succeeded' as const, message: null }
        })
      },
      activityPublisher
    })

    controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    emitRuntimeEvent({ kind: 'end', sequence: 2 })
    await vi.waitFor(() => expect(outputLog).toEqual(['FIRST CHUNK', 'SECOND CHUNK']))

    expect(activityPublisher.publishTransformedSegment.mock.calls.map((call) => call[1]).sort()).toEqual([0, 1])
    expect(activityPublisher.publishOutputCommitted.mock.calls.map((call) => call[1]).sort()).toEqual([0, 1])
  })

  it('binds the default transformation preset per chunk enqueue', async () => {
    const transformedSettings = createSettings()
    transformedSettings.output.selectedTextSource = 'transformed'
    transformedSettings.transformation.defaultPresetId = 'preset-a'
    transformedSettings.transformation.presets = [
      {
        ...transformedSettings.transformation.presets[0],
        id: 'preset-a',
        name: 'Preset A',
        systemPrompt: 'system-a'
      },
      {
        ...transformedSettings.transformation.presets[0],
        id: 'preset-b',
        name: 'Preset B',
        systemPrompt: 'system-b'
      }
    ]

    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const transform = vi.fn(async ({ text, prompt }: { text: string; prompt: { systemPrompt: string } }) => ({
      text: `${prompt.systemPrompt}:${text}`,
      model: 'gemini-2.5-flash' as const
    }))

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => transformedSettings },
      secretStore: { getApiKey: vi.fn(() => 'google-key') },
      transformationService: { transform },
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyLocalStreamingOutput: vi.fn(async () => ({ status: 'succeeded' as const, message: null }))
      },
      activityPublisher: createRawOutputDeps().activityPublisher
    })

    controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    transformedSettings.transformation.defaultPresetId = 'preset-b'
    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    emitRuntimeEvent({ kind: 'end', sequence: 2 })

    await vi.waitFor(() => expect(transform).toHaveBeenCalledTimes(2))
    expect(transform.mock.calls[0]?.[0].prompt.systemPrompt).toBe('system-a')
    expect(transform.mock.calls[1]?.[0].prompt.systemPrompt).toBe('system-b')
  })

  it('continues later transformed chunks after one chunk transform fails', async () => {
    const transformedSettings = createSettings()
    transformedSettings.output.selectedTextSource = 'transformed'
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const outputLog: string[] = []
    const activityPublisher = createRawOutputDeps().activityPublisher

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => transformedSettings },
      secretStore: { getApiKey: vi.fn(() => 'google-key') },
      transformationService: {
        transform: vi.fn(async ({ text }: { text: string }) => {
          if (text === 'first chunk') {
            throw new Error('rate limited')
          }
          return {
            text: text.toUpperCase(),
            model: 'gemini-2.5-flash' as const
          }
        })
      },
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyLocalStreamingOutput: vi.fn(async (text: string) => {
          outputLog.push(text)
          return { status: 'succeeded' as const, message: null }
        })
      },
      activityPublisher
    })

    controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    emitRuntimeEvent({ kind: 'end', sequence: 2 })

    await vi.waitFor(() => expect(outputLog).toEqual(['SECOND CHUNK']))
    expect(activityPublisher.publishSegmentFailure).toHaveBeenCalledWith(
      expect.any(String),
      0,
      'Transformation failed: rate limited'
    )
    expect(activityPublisher.publishOutputCommitted).toHaveBeenCalledWith(expect.any(String), 1)
  })

  it('fails overflow chunks when the transformed backlog reaches the configured limit', async () => {
    const transformedSettings = createSettings()
    transformedSettings.output.selectedTextSource = 'transformed'
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    let releaseFirstTransform: (() => void) | null = null
    const outputLog: string[] = []
    const activityPublisher = createRawOutputDeps().activityPublisher

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => transformedSettings },
      secretStore: { getApiKey: vi.fn(() => 'google-key') },
      transformationService: {
        transform: vi.fn(async ({ text }: { text: string }) => {
          if (text === 'first chunk') {
            await new Promise<void>((resolve) => {
              releaseFirstTransform = resolve
            })
          }
          return {
            text: text.toUpperCase(),
            model: 'gemini-2.5-flash' as const
          }
        })
      },
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyLocalStreamingOutput: vi.fn(async (text: string) => {
          outputLog.push(text)
          return { status: 'succeeded' as const, message: null }
        })
      },
      activityPublisher,
      transformQueueMaxConcurrent: 1,
      transformQueueMaxQueued: 0
    })

    controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    await flushTasks()
    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    emitRuntimeEvent({ kind: 'end', sequence: 2 })

    await vi.waitFor(() =>
      expect(activityPublisher.publishSegmentFailure).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.stringContaining('backlog is full')
      )
    )
    if (!releaseFirstTransform) {
      throw new Error('Expected first transform to stay pending.')
    }
    const releaseTransform = releaseFirstTransform as unknown as () => void
    releaseTransform()

    await vi.waitFor(() => expect(outputLog).toEqual(['FIRST CHUNK']))
  })

  it('releases missing transformed sequence gaps when the runtime ends with an error', async () => {
    const transformedSettings = createSettings()
    transformedSettings.output.selectedTextSource = 'transformed'
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const outputLog: string[] = []

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => transformedSettings },
      secretStore: { getApiKey: vi.fn(() => 'google-key') },
      transformationService: {
        transform: vi.fn(async ({ text }: { text: string }) => ({
          text: text.toUpperCase(),
          model: 'gemini-2.5-flash' as const
        }))
      },
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyLocalStreamingOutput: vi.fn(async (text: string) => {
          outputLog.push(text)
          return { status: 'succeeded' as const, message: null }
        })
      },
      activityPublisher: createRawOutputDeps().activityPublisher
    })

    controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    emitRuntimeEvent({
      kind: 'error',
      sequence: 2,
      phase: 'stream_run',
      detail: 'Socket died'
    })

    await vi.waitFor(() => expect(outputLog).toEqual(['SECOND CHUNK']))
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      terminal: {
        status: 'stream_interrupted',
        detail: 'Socket died'
      }
    })
  })

  it('releases missing transformed sequence gaps when the runtime ends normally', async () => {
    const transformedSettings = createSettings()
    transformedSettings.output.selectedTextSource = 'transformed'
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const outputLog: string[] = []

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => transformedSettings },
      secretStore: { getApiKey: vi.fn(() => 'google-key') },
      transformationService: {
        transform: vi.fn(async ({ text }: { text: string }) => ({
          text: text.toUpperCase(),
          model: 'gemini-2.5-flash' as const
        }))
      },
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyLocalStreamingOutput: vi.fn(async (text: string) => {
          outputLog.push(text)
          return { status: 'succeeded' as const, message: null }
        })
      },
      activityPublisher: createRawOutputDeps().activityPublisher
    })

    controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    emitRuntimeEvent({ kind: 'end', sequence: 2 })

    await vi.waitFor(() => expect(outputLog).toEqual(['SECOND CHUNK']))
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      terminal: { status: 'completed', phase: 'stream_run' }
    })
  })

  it('abandons in-flight transformed chunks immediately on cancel without waiting for the transform to finish', async () => {
    const transformedSettings = createSettings()
    transformedSettings.output.selectedTextSource = 'transformed'
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    let releaseTransform: (() => void) | null = null
    const outputService = {
      applyLocalStreamingOutput: vi.fn(async (_text: string) => ({
        status: 'succeeded' as const,
        message: null
      }))
    }

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => transformedSettings },
      secretStore: { getApiKey: vi.fn(() => 'google-key') },
      transformationService: {
        transform: vi.fn(async () => {
          await new Promise<void>((resolve) => {
            releaseTransform = resolve
          })
          return {
            text: 'fixed chunk',
            model: 'gemini-2.5-flash' as const
          }
        })
      },
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService,
      activityPublisher: createRawOutputDeps().activityPublisher
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    await flushTasks()

    let cancelSettled = false
    const cancelPromise = controller.cancelSession({ sessionId: started.sessionId }).then(() => {
      cancelSettled = true
    })

    await vi.waitFor(() => expect(cancelSettled).toBe(true))
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      terminal: { status: 'cancelled', phase: 'stream_run' }
    })
    expect(outputService.applyLocalStreamingOutput).not.toHaveBeenCalled()

    if (!releaseTransform) {
      throw new Error('Expected transform to remain pending.')
    }
    const finishTransform = releaseTransform as unknown as () => void
    finishTransform()
    await cancelPromise
    await flushTasks()

    expect(outputService.applyLocalStreamingOutput).not.toHaveBeenCalled()
  })

  it('cancels transformed sessions with a queued chunk and a later parked commit without applying output', async () => {
    const transformedSettings = createSettings()
    transformedSettings.output.selectedTextSource = 'transformed'
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    let releaseFirstTransform: (() => void) | null = null
    const transformedTexts: string[] = []
    const outputService = {
      applyLocalStreamingOutput: vi.fn(async (_text: string) => ({
        status: 'succeeded' as const,
        message: null
      }))
    }

    const controller = new LocalStreamingSessionController({
      settingsService: { getSettings: () => transformedSettings },
      secretStore: { getApiKey: vi.fn(() => 'google-key') },
      transformationService: {
        transform: vi.fn(async ({ text }: { text: string }) => {
          transformedTexts.push(text)
          if (text === 'first chunk') {
            await new Promise<void>((resolve) => {
              releaseFirstTransform = resolve
            })
          }
          return {
            text: text.toUpperCase(),
            model: 'gemini-2.5-flash' as const
          }
        })
      },
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService,
      activityPublisher: createRawOutputDeps().activityPublisher,
      transformQueueMaxConcurrent: 2,
      transformQueueMaxQueued: 1
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    emitRuntimeEvent({ kind: 'final', sequence: 2, text: 'third chunk' })
    await flushTasks()

    expect(transformedTexts).toEqual(['first chunk', 'second chunk'])
    expect(outputService.applyLocalStreamingOutput).not.toHaveBeenCalled()

    let cancelSettled = false
    const cancelPromise = controller.cancelSession({ sessionId: started.sessionId }).then(() => {
      cancelSettled = true
    })

    await vi.waitFor(() => expect(cancelSettled).toBe(true))
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      terminal: { status: 'cancelled', phase: 'stream_run' }
    })
    expect(outputService.applyLocalStreamingOutput).not.toHaveBeenCalled()

    if (!releaseFirstTransform) {
      throw new Error('Expected first transform to remain pending.')
    }
    const finishFirstTransform = releaseFirstTransform as unknown as () => void
    finishFirstTransform()
    await cancelPromise
    await flushTasks()

    expect(transformedTexts).toEqual(['first chunk', 'second chunk'])
    expect(outputService.applyLocalStreamingOutput).not.toHaveBeenCalled()
  })

  it('commits raw finalized chunks in source order even if runtime events arrive out of order', async () => {
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const outputLog: string[] = []
    const activityPublisher = createRawOutputDeps().activityPublisher
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyLocalStreamingOutput: vi.fn(async (text: string) => {
          outputLog.push(text)
          return { status: 'succeeded' as const, message: null }
        })
      },
      activityPublisher
    })

    controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    emitRuntimeEvent({ kind: 'end', sequence: 2 })
    await flushTasks()

    expect(outputLog).toEqual(['first chunk', 'second chunk'])
    expect(activityPublisher.publishFinalizedSegment).toHaveBeenCalledWith(expect.any(String), 1, 'second chunk')
    expect(activityPublisher.publishOutputCommitted.mock.calls.map((call) => call[1]).sort()).toEqual([0, 1])
  })

  it('seals the raw output stream on end so a missing predecessor does not stall shutdown', async () => {
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const outputService = {
      applyLocalStreamingOutput: vi.fn(async (_text: string) => ({
        status: 'succeeded' as const,
        message: null
      }))
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService,
      activityPublisher: createRawOutputDeps().activityPublisher
    })

    controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    await flushTasks()
    emitRuntimeEvent({ kind: 'end', sequence: 2 })
    await flushTasks()

    expect(outputService.applyLocalStreamingOutput).not.toHaveBeenCalled()
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      terminal: { status: 'completed', phase: 'stream_run' }
    })
  })

  it('stops future raw chunk commits after active cancel without retracting already committed output', async () => {
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const outputService = {
      applyLocalStreamingOutput: vi.fn(async (_text: string) => ({
        status: 'succeeded' as const,
        message: null
      }))
    }
    const activityPublisher = createRawOutputDeps().activityPublisher
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
          return {
            appendAudio: vi.fn(async () => {}),
            stop: vi.fn(async () => {}),
            cancel: vi.fn(async () => {})
          }
        })
      },
      outputCoordinator: new SerialOutputCoordinator(),
      outputService,
      activityPublisher
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    await flushTasks()
    emitRuntimeEvent({ kind: 'final', sequence: 2, text: 'third chunk' })
    await flushTasks()

    await controller.cancelSession({ sessionId: started.sessionId })
    emitRuntimeEvent({ kind: 'final', sequence: 1, text: 'second chunk' })
    await flushTasks()

    expect(outputService.applyLocalStreamingOutput).toHaveBeenCalledTimes(1)
    expect(outputService.applyLocalStreamingOutput).toHaveBeenCalledWith(
      'first chunk',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(activityPublisher.publishFinalizedSegment).toHaveBeenCalledWith(started.sessionId, 2, 'third chunk')
    expect(activityPublisher.publishOutputCommitted).toHaveBeenCalledTimes(1)
    expect(activityPublisher.publishOutputCommitted).toHaveBeenCalledWith(started.sessionId, 0)
  })

  it('does not paste a raw chunk if cancel lands before the local output paste step runs', async () => {
    let runtimeEventSink: ((event: LocalStreamingRuntimeEvent) => void) | null = null
    const writeText = vi.fn()
    const pasteAtCursor = vi.fn(async () => undefined)
    const outputService = new OutputService({
      clipboardClient: { writeText } as any,
      permissionService: {
        getAccessibilityPermissionStatus: () => ({ granted: true, guidance: null })
      } as any,
      pasteAutomationClient: { pasteAtCursor } as any
    })
    const activityPublisher = createRawOutputDeps().activityPublisher
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
      outputCoordinator: new SerialOutputCoordinator(),
      outputService,
      activityPublisher
    })

    const started = controller.startSession(START_PAYLOAD)
    await flushTasks()
    if (!runtimeEventSink) {
      throw new Error('Expected runtime event sink to be captured.')
    }
    const emitRuntimeEvent = runtimeEventSink as unknown as (event: LocalStreamingRuntimeEvent) => void

    emitRuntimeEvent({ kind: 'final', sequence: 0, text: 'first chunk' })
    await controller.cancelSession({ sessionId: started.sessionId })
    await flushTasks()

    expect(runtimeSession.cancel).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('first chunk')
    expect(pasteAtCursor).not.toHaveBeenCalled()
    expect(activityPublisher.publishOutputCommitted).not.toHaveBeenCalled()
    expect(controller.getSessionState()).toMatchObject({
      status: 'ended',
      terminal: { status: 'cancelled', phase: 'stream_run' }
    })
  })

  it('rejects concurrent starts while another local session is still in progress', async () => {
    const controller = new LocalStreamingSessionController({
      ...createRawOutputDeps(),
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
      ...createRawOutputDeps(),
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
      ...createRawOutputDeps(),
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
      ...createRawOutputDeps(),
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
      ...createRawOutputDeps(),
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
      ...createRawOutputDeps(),
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
      ...createRawOutputDeps(),
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
      ...createRawOutputDeps(),
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
