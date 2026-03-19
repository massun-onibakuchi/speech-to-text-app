// Where: Main process orchestration layer.
// What: Owns the local streaming session state machine across install wait, runtime startup, websocket prepare, and run.
// Why: Ticket 6 requires one main-process owner for cancel/error/concurrency behavior instead of splitting it
//      across renderer capture, runtime install management, and the websocket transport.

import { randomUUID } from 'node:crypto'
import type {
  LocalStreamingOutputMode,
  LocalStreamingRuntimeEvent,
  LocalStreamingSessionPhase,
  LocalStreamingSessionState,
  LocalStreamingSessionTerminalState,
  LocalStreamingSessionTerminalStatus,
  RecordingSampleRateHz,
  Settings,
  SttModel
} from '../../shared/domain'
import { logStructured } from '../../shared/error-logging'
import { LOCAL_STT_MODEL, isLocalSttProvider } from '../../shared/local-stt'
import type {
  LocalStreamingAudioAppendPayload,
  LocalStreamingSessionControlPayload,
  LocalStreamingSessionStartPayload,
  LocalStreamingSessionStartResult
} from '../../shared/ipc'
import type { LocalRuntimeStatusSnapshot } from '../../shared/local-runtime'
import type { OrderedOutputCoordinator, OrderedStreamCommitResult } from '../coordination/ordered-output-coordinator'
import type { TransformationProfileSnapshot } from '../routing/capture-request-snapshot'
import { LocalRuntimeServiceStartupError } from '../services/local-runtime-service-supervisor'
import type { LocalRuntimeServiceConnection } from '../services/local-runtime-service-types'
import {
  DEFAULT_LOCAL_RUNTIME_SESSION_FINALIZATION_POLICY,
  LocalRuntimeServiceClient,
  LocalRuntimeServiceClientError,
  type LocalRuntimeServiceClientSession
} from '../services/local-runtime-service-client'
import { LocalStreamingTransformQueue, type LocalStreamingTransformQueueSnapshot } from '../services/local-streaming-transform-queue'
import type { OutputApplyResult, OutputService } from '../services/output-service'
import type { SecretStore } from '../services/secret-store'
import type { TransformationService } from '../services/transformation-service'
import { deriveSttHintsFromDictionary } from '../services/transcription/dictionary-hint-deriver'
import { executeTransformation } from './transformation-execution'

const LOCAL_STREAMING_INSTALL_WAIT_POLL_INTERVAL_MS = 150
const DEFAULT_LOCAL_STREAMING_TRANSFORM_MAX_CONCURRENT = 2
const DEFAULT_LOCAL_STREAMING_TRANSFORM_MAX_QUEUED = 8

type LocalStreamingSessionSettingsSource = {
  getSettings(): Settings
}

type LocalStreamingSessionSecretStore = Pick<SecretStore, 'getApiKey'>
type LocalStreamingSessionTransformationService = Pick<TransformationService, 'transform'>

type LocalStreamingSessionInstallManager = {
  getStatusSnapshot(): LocalRuntimeStatusSnapshot
  cancelInstall(): LocalRuntimeStatusSnapshot
}

type LocalStreamingSessionRuntimeSupervisor = {
  ensureRunning(options?: { signal?: AbortSignal }): Promise<LocalRuntimeServiceConnection>
}

type LocalStreamingSessionOutputCoordinator = Pick<
  OrderedOutputCoordinator,
  'submitStream' | 'releaseStream' | 'cancelStream' | 'sealStream' | 'clearStream'
>

type LocalStreamingSessionOutputService = Pick<OutputService, 'applyLocalStreamingOutput'>

type LocalStreamingSessionActivityPublisher = {
  publishFinalizedSegment(sessionId: string, sequence: number, sourceText: string): void
  publishTransformedSegment(sessionId: string, sequence: number, transformedText: string): void
  publishOutputCommitted(sessionId: string, sequence: number): void
  publishSegmentFailure(sessionId: string, sequence: number, error: string): void
  clearSession(sessionId: string): void
}

type ActiveSessionRecord = {
  state: LocalStreamingSessionState
  startupController: AbortController
  runtimeSession: LocalRuntimeServiceClientSession | null
  pendingAudioDrain: Promise<void>
  pendingSegmentTasks: Set<Promise<void>>
  bufferedAudio: Int16Array[]
  transformQueue: LocalStreamingTransformQueue | null
  finalizedSequences: Set<number>
  gateMarkedActive: boolean
  stopRequested: boolean
  stopDispatched: boolean
  cancelRequested: boolean
  terminalPromise: Promise<LocalStreamingSessionTerminalState>
  resolveTerminal: (terminal: LocalStreamingSessionTerminalState) => void
}

class LocalStreamingSessionStartupError extends Error {
  readonly status: LocalStreamingSessionTerminalStatus
  readonly phase: LocalStreamingSessionPhase | null

  constructor(
    status: LocalStreamingSessionTerminalStatus,
    phase: LocalStreamingSessionPhase | null,
    message: string
  ) {
    super(message)
    this.name = 'LocalStreamingSessionStartupError'
    this.status = status
    this.phase = phase
  }
}

const assertPositiveInteger = (value: number, field: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`)
  }
}

const cloneState = (state: LocalStreamingSessionState | null): LocalStreamingSessionState | null =>
  state ? structuredClone(state) : null

const resolveOutputMode = (settings: Settings): LocalStreamingOutputMode =>
  settings.output.selectedTextSource === 'transformed'
    ? 'stream_transformed'
    : 'stream_raw_dictation'

const normalizeDetail = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallback

const formatTransformationFailureMessage = (
  detail: string,
  failureCategory: 'preflight' | 'api_auth' | 'network' | 'unknown'
): string => {
  if (failureCategory === 'preflight') {
    return detail.startsWith('Unsafe user prompt template:')
      ? `Transformation blocked: ${detail}`
      : detail
  }

  return `Transformation failed: ${detail}`
}

const formatTransformBackpressureMessage = (snapshot: LocalStreamingTransformQueueSnapshot): string =>
  'Local transformed streaming backlog is full ' +
  `(${snapshot.activeCount} active, ${snapshot.queuedCount} queued, limit ${snapshot.maxConcurrent}+${snapshot.maxQueued}). ` +
  'This chunk was skipped. Switch output mode to Transcript if this repeats.'

export interface LocalStreamingSessionControllerOptions {
  settingsService: LocalStreamingSessionSettingsSource
  installManager: LocalStreamingSessionInstallManager
  runtimeSupervisor: LocalStreamingSessionRuntimeSupervisor
  runtimeClient?: Pick<LocalRuntimeServiceClient, 'openSession'>
  secretStore?: LocalStreamingSessionSecretStore
  transformationService?: LocalStreamingSessionTransformationService
  outputCoordinator?: LocalStreamingSessionOutputCoordinator
  outputService?: LocalStreamingSessionOutputService
  activityPublisher?: LocalStreamingSessionActivityPublisher
  installPollIntervalMs?: number
  transformQueueMaxConcurrent?: number
  transformQueueMaxQueued?: number
  waitForDelay?: (durationMs: number) => Promise<void>
  onStateChanged?: (state: LocalStreamingSessionState) => void
  onRuntimeEvent?: (sessionId: string, event: LocalStreamingRuntimeEvent) => void
  onSessionActivated?: () => void
  onSessionEnded?: () => void
}

export class LocalStreamingSessionController {
  private readonly settingsService: LocalStreamingSessionSettingsSource
  private readonly installManager: LocalStreamingSessionInstallManager
  private readonly runtimeSupervisor: LocalStreamingSessionRuntimeSupervisor
  private readonly runtimeClient: Pick<LocalRuntimeServiceClient, 'openSession'>
  private readonly secretStore?: LocalStreamingSessionSecretStore
  private readonly transformationService?: LocalStreamingSessionTransformationService
  private readonly outputCoordinator?: LocalStreamingSessionOutputCoordinator
  private readonly outputService?: LocalStreamingSessionOutputService
  private readonly activityPublisher?: LocalStreamingSessionActivityPublisher
  private readonly installPollIntervalMs: number
  private readonly transformQueueMaxConcurrent: number
  private readonly transformQueueMaxQueued: number
  private readonly waitForDelay: (durationMs: number) => Promise<void>
  private readonly onStateChanged?: (state: LocalStreamingSessionState) => void
  private readonly onRuntimeEvent?: (sessionId: string, event: LocalStreamingRuntimeEvent) => void
  private readonly onSessionActivated?: () => void
  private readonly onSessionEnded?: () => void
  private activeSession: ActiveSessionRecord | null = null

  constructor(options: LocalStreamingSessionControllerOptions) {
    this.settingsService = options.settingsService
    this.installManager = options.installManager
    this.runtimeSupervisor = options.runtimeSupervisor
    this.runtimeClient = options.runtimeClient ?? new LocalRuntimeServiceClient()
    this.secretStore = options.secretStore
    this.transformationService = options.transformationService
    this.outputCoordinator = options.outputCoordinator
    this.outputService = options.outputService
    this.activityPublisher = options.activityPublisher
    this.installPollIntervalMs = options.installPollIntervalMs ?? LOCAL_STREAMING_INSTALL_WAIT_POLL_INTERVAL_MS
    this.transformQueueMaxConcurrent =
      options.transformQueueMaxConcurrent ?? DEFAULT_LOCAL_STREAMING_TRANSFORM_MAX_CONCURRENT
    this.transformQueueMaxQueued =
      options.transformQueueMaxQueued ?? DEFAULT_LOCAL_STREAMING_TRANSFORM_MAX_QUEUED
    this.waitForDelay = options.waitForDelay ?? (async (durationMs: number) => {
      await new Promise((resolve) => {
        setTimeout(resolve, durationMs)
      })
    })
    this.onStateChanged = options.onStateChanged
    this.onRuntimeEvent = options.onRuntimeEvent
    this.onSessionActivated = options.onSessionActivated
    this.onSessionEnded = options.onSessionEnded
  }

  getSessionState(): LocalStreamingSessionState | null {
    return cloneState(this.activeSession?.state ?? null)
  }

  startSession(payload: LocalStreamingSessionStartPayload): LocalStreamingSessionStartResult {
    if (this.activeSession && this.activeSession.state.status !== 'ended') {
      throw new Error('A local streaming session is already active.')
    }

    assertPositiveInteger(payload.sampleRateHz, 'sampleRateHz')
    assertPositiveInteger(payload.channelCount, 'channelCount')

    const settings = this.settingsService.getSettings()
    const modelId = this.assertLocalStreamingSelection(settings)
    const outputMode = this.assertSupportedOutputMode(settings)
    this.assertRuntimeStartPreconditions(this.installManager.getStatusSnapshot())
    const dictionaryTerms = deriveSttHintsFromDictionary(
      settings.transcription.hints,
      settings.correction.dictionary.entries
    ).dictionaryTerms
    const sessionId = randomUUID()

    let resolveTerminal: (terminal: LocalStreamingSessionTerminalState) => void = () => {}
    const record: ActiveSessionRecord = {
      state: {
        sessionId,
        status: 'starting',
        phase: 'install',
        startedAt: payload.startedAt,
        modelId,
        outputLanguage: settings.transcription.outputLanguage,
        outputMode,
        dictionaryTerms,
        lastSequence: 0,
        terminal: null
      },
      startupController: new AbortController(),
      runtimeSession: null,
      pendingAudioDrain: Promise.resolve(),
      pendingSegmentTasks: new Set<Promise<void>>(),
      bufferedAudio: [],
      transformQueue: outputMode === 'stream_transformed'
        ? new LocalStreamingTransformQueue({
            maxConcurrent: this.transformQueueMaxConcurrent,
            maxQueued: this.transformQueueMaxQueued
          })
        : null,
      finalizedSequences: new Set<number>(),
      gateMarkedActive: false,
      stopRequested: false,
      stopDispatched: false,
      cancelRequested: false,
      terminalPromise: new Promise((resolve) => {
        resolveTerminal = resolve
      }),
      resolveTerminal
    }

    this.activeSession = record
    this.publishState(record)
    this.logSessionEvent('info', 'local_streaming.session_started', record, {
      startedAt: payload.startedAt,
      dictionaryTermCount: record.state.dictionaryTerms.length
    })
    void this.runStartup(record, payload.sampleRateHz as RecordingSampleRateHz, payload.channelCount)
    return { sessionId }
  }

  async appendAudio(payload: LocalStreamingAudioAppendPayload): Promise<void> {
    const record = this.requireMatchingSession(payload.sessionId)
    if (record.state.status === 'ended') {
      throw new Error('No local streaming session is active.')
    }
    if (payload.pcmFrames.length === 0) {
      throw new Error('pcmFrames must not be empty.')
    }
    if (record.state.status === 'stopping') {
      throw new Error(`Local streaming session ${payload.sessionId} is stopping.`)
    }

    const batch = new Int16Array(payload.pcmFrames)
    if (record.state.status === 'starting') {
      record.bufferedAudio.push(batch)
      return
    }

    await this.enqueueRuntimeAudio(record, batch)
  }

  async stopSession(payload: LocalStreamingSessionControlPayload): Promise<void> {
    const record = this.findSessionForControl(payload.sessionId)
    if (!record || record.state.status === 'ended') {
      return
    }

    record.stopRequested = true
    if (record.state.status !== 'stopping') {
      this.updateState(record, { status: 'stopping' })
    }

    if (record.state.status === 'starting' || record.runtimeSession === null) {
      await record.terminalPromise
      return
    }

    try {
      await this.dispatchRuntimeStop(record)
    } catch (error) {
      if (!record.cancelRequested) {
        await this.finishSession(record, {
          status: 'stream_interrupted',
          phase: 'stream_run',
          detail: normalizeDetail(error, 'Local runtime session stop failed unexpectedly.'),
          modelId: record.state.modelId
        })
      }
    }

    await record.terminalPromise
  }

  async cancelSession(payload: LocalStreamingSessionControlPayload): Promise<void> {
    const record = this.findSessionForControl(payload.sessionId)
    if (!record || record.state.status === 'ended') {
      return
    }

    record.cancelRequested = true
    record.startupController.abort()
    if (record.state.phase === 'install') {
      this.installManager.cancelInstall()
    }
    if (record.runtimeSession) {
      await record.runtimeSession.cancel()
    }
    record.transformQueue?.cancel()
    this.outputCoordinator?.cancelStream(record.state.sessionId)
    if (record.state.outputMode === 'stream_raw_dictation') {
      await this.waitForPendingSegmentTasks(record)
    }

    await this.finishSession(record, {
      status: 'cancelled',
      phase: record.state.phase,
      detail: null,
      modelId: record.state.modelId
    })
  }

  private async runStartup(
    record: ActiveSessionRecord,
    sampleRateHz: RecordingSampleRateHz,
    channelCount: number
  ): Promise<void> {
    void sampleRateHz
    void channelCount

    try {
      await this.waitForInstalledRuntime(record)
      if (!this.isCurrentLiveSession(record)) {
        return
      }

      this.updateState(record, { phase: 'service_start' })
      const connection = await this.runtimeSupervisor.ensureRunning({ signal: record.startupController.signal })
      if (!this.isCurrentLiveSession(record)) {
        return
      }

      this.updateState(record, { phase: 'service_connect' })
      const runtimeSession = await this.runtimeClient.openSession({
        connection,
        model: record.state.modelId,
        language: record.state.outputLanguage,
        dictionaryTerms: record.state.dictionaryTerms,
        finalization: DEFAULT_LOCAL_RUNTIME_SESSION_FINALIZATION_POLICY,
        signal: record.startupController.signal,
        onPhaseChange: (phase) => {
          if (this.isCurrentLiveSession(record)) {
            this.updateState(record, { phase })
          }
        },
        onEvent: (event) => {
          void this.handleRuntimeEvent(record, event)
        }
      })

      if (record.state.status === 'ended') {
        await runtimeSession.cancel()
        return
      }
      if (!this.isCurrentLiveSession(record) || record.cancelRequested) {
        await runtimeSession.cancel()
        return
      }

      record.runtimeSession = runtimeSession
      this.activateSession(record)
      await this.flushBufferedAudio(record)

      if (record.stopRequested || record.state.status === 'stopping') {
        await this.dispatchRuntimeStop(record)
      }
    } catch (error) {
      if (record.state.status === 'ended' || !this.isCurrentSession(record)) {
        return
      }
      if (record.cancelRequested || this.isAbortDuringStartup(record, error)) {
        await this.finishSession(record, {
          status: 'cancelled',
          phase: record.state.phase,
          detail: null,
          modelId: record.state.modelId
        })
        return
      }

      await this.finishSession(record, this.mapStartupError(record, error))
    }
  }

  private async waitForInstalledRuntime(record: ActiveSessionRecord): Promise<void> {
    while (true) {
      if (record.startupController.signal.aborted) {
        throw new LocalRuntimeServiceClientError('open_aborted', 'Local runtime session startup was aborted.')
      }

      const snapshot = this.installManager.getStatusSnapshot()
      if (snapshot.state === 'ready') {
        return
      }
      if (snapshot.state === 'installing') {
        await this.waitForDelay(this.installPollIntervalMs)
        continue
      }
      if (snapshot.state === 'failed') {
        throw new LocalStreamingSessionStartupError(
          'model_install_failed',
          'install',
          snapshot.detail ?? 'Local runtime install failed unexpectedly.'
        )
      }
      if (snapshot.state === 'awaiting_user_confirmation') {
        throw new LocalStreamingSessionStartupError(
          'session_start_failed',
          'install',
          'Local runtime install is awaiting user confirmation. Confirm it in Settings > Speech-to-Text before starting local streaming.'
        )
      }

      throw new LocalStreamingSessionStartupError(
        'session_start_failed',
        'install',
        snapshot.requiresUpdate
          ? 'Local runtime update required. Install the required WhisperLiveKit version in Settings > Speech-to-Text before starting local streaming.'
          : 'Local runtime is not installed. Install WhisperLiveKit in Settings > Speech-to-Text before starting local streaming.'
      )
    }
  }

  private async flushBufferedAudio(record: ActiveSessionRecord): Promise<void> {
    while (record.bufferedAudio.length > 0) {
      const batch = record.bufferedAudio.shift()
      if (!batch) {
        continue
      }
      await this.enqueueRuntimeAudio(record, batch)
      if (record.state.status === 'ended') {
        return
      }
    }
  }

  private async enqueueRuntimeAudio(record: ActiveSessionRecord, pcmFrames: Int16Array): Promise<void> {
    const session = record.runtimeSession
    if (!session) {
      throw new Error('Local runtime session is not active yet.')
    }

    const pendingSend = record.pendingAudioDrain.then(async () => {
      if (record.state.status === 'ended' || record.cancelRequested) {
        return
      }
      await session.appendAudio(pcmFrames)
    })
    record.pendingAudioDrain = pendingSend.catch(() => {})
    await pendingSend
  }

  private async dispatchRuntimeStop(record: ActiveSessionRecord): Promise<void> {
    const session = record.runtimeSession
    if (!session) {
      return
    }
    if (record.stopDispatched) {
      return
    }
    record.stopDispatched = true
    await record.pendingAudioDrain
    await session.stop()
  }

  private activateSession(record: ActiveSessionRecord): void {
    this.updateState(record, {
      status: record.stopRequested ? 'stopping' : 'active',
      phase: 'stream_run'
    })
    if (!record.gateMarkedActive) {
      record.gateMarkedActive = true
      this.onSessionActivated?.()
    }
  }

  private async handleRuntimeEvent(record: ActiveSessionRecord, event: LocalStreamingRuntimeEvent): Promise<void> {
    if (!this.isCurrentSession(record) || record.state.status === 'ended') {
      return
    }

    if (event.kind === 'final') {
      const pendingFinalTask = this.processRuntimeEvent(record, event)
      this.trackPendingSegmentTask(record, pendingFinalTask)
      await pendingFinalTask
      return
    }

    if (record.state.outputMode === 'stream_raw_dictation') {
      this.outputCoordinator?.sealStream(record.state.sessionId)
    } else {
      this.releaseMissingTransformSequences(record, event.sequence)
    }
    await this.waitForPendingSegmentTasks(record)
    await this.processRuntimeEvent(record, event)
  }

  private async processRuntimeEvent(record: ActiveSessionRecord, event: LocalStreamingRuntimeEvent): Promise<void> {
    if (!this.isCurrentSession(record) || record.state.status === 'ended') {
      return
    }

    this.updateState(record, { lastSequence: event.sequence })
    this.onRuntimeEvent?.(record.state.sessionId, event)

    if (event.kind === 'final') {
      await this.handleFinalizedRuntimeChunk(record, event)
      return
    }

    if (event.kind === 'end') {
      await this.finishSession(record, {
        status: 'completed',
        phase: 'stream_run',
        detail: null,
        modelId: record.state.modelId
      })
      return
    }

    await this.finishSession(record, {
      status: 'stream_interrupted',
      phase: event.phase,
      detail: event.detail,
      modelId: record.state.modelId
    })
  }

  private async handleFinalizedRuntimeChunk(
    record: ActiveSessionRecord,
    event: Extract<LocalStreamingRuntimeEvent, { kind: 'final' }>
  ): Promise<void> {
    record.finalizedSequences.add(event.sequence)
    this.logSessionEvent('info', 'local_streaming.segment_finalized', record, {
      sequence: event.sequence
    })
    this.activityPublisher?.publishFinalizedSegment(record.state.sessionId, event.sequence, event.text)

    if (record.state.outputMode === 'stream_transformed') {
      await this.enqueueTransformedChunk(record, event.sequence, event.text)
      return
    }

    const commitResult = await this.submitRawOutputCommit(record, event.sequence, event.text)
    if (!commitResult.committed || record.cancelRequested) {
      return
    }

    const outputResult = commitResult.value
    if (!outputResult) {
      return
    }

    if (outputResult.status === 'succeeded') {
      this.activityPublisher?.publishOutputCommitted(record.state.sessionId, event.sequence)
      this.logSessionEvent('info', 'local_streaming.segment_output_committed', record, {
        sequence: event.sequence
      })
      return
    }

    this.logSessionEvent('error', 'local_streaming.segment_output_failed', record, {
      sequence: event.sequence,
      detail: outputResult.message ?? 'Output application failed.'
    })
    this.activityPublisher?.publishSegmentFailure(
      record.state.sessionId,
      event.sequence,
      outputResult.message ?? 'Output application failed.'
    )
  }

  private async enqueueTransformedChunk(
    record: ActiveSessionRecord,
    sequence: number,
    sourceText: string
  ): Promise<void> {
    const transformQueue = record.transformQueue
    if (!transformQueue) {
      throw new Error('Local transformed streaming output is not configured.')
    }

    const boundProfile = this.resolveBoundTransformationProfile()
    if (!boundProfile) {
      this.logSessionEvent('error', 'local_streaming.segment_transformation_profile_missing', record, {
        sequence
      })
      this.activityPublisher?.publishSegmentFailure(
        record.state.sessionId,
        sequence,
        'No transformation preset configured.'
      )
      this.outputCoordinator?.releaseStream(record.state.sessionId, sequence)
      return
    }

    const enqueueResult = transformQueue.enqueue(async () => {
      await this.runTransformedChunk(record, sequence, sourceText, boundProfile)
    })

    if (!enqueueResult.accepted) {
      this.logSessionEvent('warn', 'local_streaming.segment_backpressure_skipped', record, {
        sequence,
        activeTransforms: enqueueResult.snapshot.activeCount,
        queuedTransforms: enqueueResult.snapshot.queuedCount,
        maxConcurrent: enqueueResult.snapshot.maxConcurrent,
        maxQueued: enqueueResult.snapshot.maxQueued
      })
      this.activityPublisher?.publishSegmentFailure(
        record.state.sessionId,
        sequence,
        formatTransformBackpressureMessage(enqueueResult.snapshot)
      )
      this.outputCoordinator?.releaseStream(record.state.sessionId, sequence)
      return
    }

    await enqueueResult.promise
  }

  private async runTransformedChunk(
    record: ActiveSessionRecord,
    sequence: number,
    sourceText: string,
    profile: TransformationProfileSnapshot
  ): Promise<void> {
    if (record.cancelRequested || !this.isCurrentSession(record)) {
      return
    }

    if (!this.secretStore || !this.transformationService) {
      throw new Error('Local transformed streaming output is not configured.')
    }

    const transformationResult = await executeTransformation({
      secretStore: this.secretStore,
      transformationService: this.transformationService,
      text: sourceText,
      provider: profile.provider,
      model: profile.model,
      baseUrlOverride: profile.baseUrlOverride,
      systemPrompt: profile.systemPrompt,
      userPrompt: profile.userPrompt,
      logEvent: 'local_streaming.transformation_failed',
      logContext: {
        sessionId: record.state.sessionId,
        sequence,
        profileId: profile.profileId,
        outputMode: record.state.outputMode
      },
      unknownFailureDetail: 'Unknown transformation error',
      trimErrorMessage: false
    })

    if (record.cancelRequested || !this.isCurrentSession(record) || record.state.status === 'ended') {
      return
    }

    if (!transformationResult.ok) {
      this.logSessionEvent('error', 'local_streaming.segment_transformation_failed', record, {
        sequence,
        profileId: profile.profileId,
        failureCategory: transformationResult.failureCategory,
        detail: transformationResult.failureDetail
      })
      this.activityPublisher?.publishSegmentFailure(
        record.state.sessionId,
        sequence,
        formatTransformationFailureMessage(
          transformationResult.failureDetail,
          transformationResult.failureCategory
        )
      )
      this.outputCoordinator?.releaseStream(record.state.sessionId, sequence)
      return
    }

    this.activityPublisher?.publishTransformedSegment(
      record.state.sessionId,
      sequence,
      transformationResult.text
    )
    this.logSessionEvent('info', 'local_streaming.segment_transformed', record, {
      sequence,
      profileId: profile.profileId
    })

    const commitResult = await this.submitTransformedOutputCommit(
      record,
      sequence,
      transformationResult.text
    )
    if (!commitResult.committed || record.cancelRequested) {
      return
    }

    const outputResult = commitResult.value
    if (!outputResult) {
      return
    }

    if (outputResult.status === 'succeeded') {
      this.activityPublisher?.publishOutputCommitted(record.state.sessionId, sequence)
      this.logSessionEvent('info', 'local_streaming.segment_output_committed', record, {
        sequence
      })
      return
    }

    this.logSessionEvent('error', 'local_streaming.segment_output_failed', record, {
      sequence,
      detail: outputResult.message ?? 'Output application failed.'
    })
    this.activityPublisher?.publishSegmentFailure(
      record.state.sessionId,
      sequence,
      outputResult.message ?? 'Output application failed.'
    )
  }

  private async submitRawOutputCommit(
    record: ActiveSessionRecord,
    sequence: number,
    text: string
  ): Promise<OrderedStreamCommitResult<OutputApplyResult>> {
    if (!this.outputCoordinator || !this.outputService) {
      throw new Error('Local raw streaming output is not configured.')
    }

    return this.outputCoordinator.submitStream(record.state.sessionId, sequence, async () => {
      try {
        return await this.outputService!.applyLocalStreamingOutput(text, {
          signal: record.startupController.signal
        })
      } catch (error) {
        return {
          status: 'output_failed_partial',
          message: normalizeDetail(error, 'Output application failed.')
        }
      }
    })
  }

  private async submitTransformedOutputCommit(
    record: ActiveSessionRecord,
    sequence: number,
    transformedText: string
  ): Promise<OrderedStreamCommitResult<OutputApplyResult>> {
    if (!this.outputCoordinator || !this.outputService) {
      throw new Error('Local transformed streaming output is not configured.')
    }

    return this.outputCoordinator.submitStream(record.state.sessionId, sequence, async () => {
      try {
        return await this.outputService!.applyLocalStreamingOutput(transformedText, {
          signal: record.startupController.signal
        })
      } catch (error) {
        return {
          status: 'output_failed_partial',
          message: normalizeDetail(error, 'Output application failed.')
        }
      }
    })
  }

  private async finishSession(record: ActiveSessionRecord, terminal: LocalStreamingSessionTerminalState): Promise<void> {
    if (!this.isCurrentSession(record) || record.state.status === 'ended') {
      return
    }

    this.logSessionEvent(
      terminal.status === 'completed' || terminal.status === 'cancelled' ? 'info' : 'error',
      'local_streaming.session_ended',
      record,
      {
        terminalStatus: terminal.status,
        terminalPhase: terminal.phase ?? record.state.phase,
        terminalDetail: terminal.detail ?? null,
        lastSequence: record.state.lastSequence
      }
    )
    this.updateState(record, {
      status: 'ended',
      terminal,
      phase: terminal.phase ?? record.state.phase
    })
    record.bufferedAudio.splice(0, record.bufferedAudio.length)
    if (record.gateMarkedActive) {
      record.gateMarkedActive = false
      this.onSessionEnded?.()
    }
    record.transformQueue?.cancel()
    this.outputCoordinator?.clearStream(record.state.sessionId)
    this.activityPublisher?.clearSession(record.state.sessionId)
    record.resolveTerminal(structuredClone(terminal))
  }

  private mapStartupError(
    record: ActiveSessionRecord,
    error: unknown
  ): LocalStreamingSessionTerminalState {
    if (error instanceof LocalStreamingSessionStartupError) {
      return {
        status: error.status,
        phase: error.phase,
        detail: error.message,
        modelId: record.state.modelId
      }
    }

    if (error instanceof LocalRuntimeServiceStartupError) {
      return {
        status: 'session_start_failed',
        phase: 'service_start',
        detail: error.message,
        modelId: record.state.modelId
      }
    }

    if (error instanceof LocalRuntimeServiceClientError) {
      switch (error.code) {
        case 'service_connect_failed':
          return {
            status: 'session_start_failed',
            phase: 'service_connect',
            detail: error.message,
            modelId: record.state.modelId
          }
        case 'prepare_failed':
          return {
            status: 'model_prepare_failed',
            phase: 'prepare',
            detail: error.message,
            modelId: record.state.modelId
          }
        case 'stream_interrupted':
          return {
            status: 'stream_interrupted',
            phase: 'stream_run',
            detail: error.message,
            modelId: record.state.modelId
          }
        case 'open_aborted':
          return {
            status: 'cancelled',
            phase: record.state.phase,
            detail: null,
            modelId: record.state.modelId
          }
      }
    }

    const phase = record.state.phase
    return {
      status: phase === 'prepare' ? 'model_prepare_failed' : phase === 'stream_run' ? 'stream_interrupted' : 'session_start_failed',
      phase,
      detail: normalizeDetail(error, 'Local streaming session failed unexpectedly.'),
      modelId: record.state.modelId
    }
  }

  private isAbortDuringStartup(record: ActiveSessionRecord, error: unknown): boolean {
    if (!record.startupController.signal.aborted) {
      return false
    }
    return error instanceof LocalRuntimeServiceClientError
      ? error.code === 'open_aborted'
      : true
  }

  private updateState(record: ActiveSessionRecord, patch: Partial<LocalStreamingSessionState>): void {
    record.state = {
      ...record.state,
      ...patch
    }
    this.publishState(record)
  }

  private publishState(record: ActiveSessionRecord): void {
    this.onStateChanged?.(structuredClone(record.state))
  }

  private trackPendingSegmentTask(record: ActiveSessionRecord, task: Promise<void>): void {
    let trackedTask: Promise<void> | null = null
    trackedTask = task.finally(() => {
      if (trackedTask) {
        record.pendingSegmentTasks.delete(trackedTask)
      }
    })
    record.pendingSegmentTasks.add(trackedTask)
  }

  private async waitForPendingSegmentTasks(record: ActiveSessionRecord): Promise<void> {
    if (record.pendingSegmentTasks.size === 0) {
      return
    }
    await Promise.allSettled([...record.pendingSegmentTasks])
  }

  private assertLocalStreamingSelection(settings: Settings): SttModel {
    if (!isLocalSttProvider(settings.transcription.provider)) {
      throw new Error(`STT provider ${settings.transcription.provider} is not supported for local streaming.`)
    }
    if (settings.transcription.model !== LOCAL_STT_MODEL) {
      throw new Error(`STT model ${settings.transcription.model} is not supported for local streaming.`)
    }
    return settings.transcription.model
  }

  private assertSupportedOutputMode(settings: Settings): LocalStreamingOutputMode {
    const outputMode = resolveOutputMode(settings)
    if (!this.outputCoordinator || !this.outputService) {
      throw new Error('Local raw streaming output is not configured.')
    }
    if (outputMode === 'stream_transformed' && (!this.secretStore || !this.transformationService)) {
      throw new Error('Local transformed streaming output is not configured.')
    }
    return outputMode
  }

  private resolveBoundTransformationProfile(): TransformationProfileSnapshot | null {
    const settings = this.settingsService.getSettings()
    const preset =
      settings.transformation.presets.find((candidate) => candidate.id === settings.transformation.defaultPresetId) ??
      settings.transformation.presets[0] ??
      null
    if (!preset) {
      return null
    }

    return {
      profileId: preset.id,
      provider: preset.provider,
      model: preset.model,
      baseUrlOverride: null,
      systemPrompt: preset.systemPrompt,
      userPrompt: preset.userPrompt
    }
  }

  private releaseMissingTransformSequences(record: ActiveSessionRecord, terminalSequenceExclusive: number): void {
    for (let sequence = 0; sequence < terminalSequenceExclusive; sequence += 1) {
      if (record.finalizedSequences.has(sequence)) {
        continue
      }
      this.outputCoordinator?.releaseStream(record.state.sessionId, sequence)
    }
  }

  private assertRuntimeStartPreconditions(snapshot: LocalRuntimeStatusSnapshot): void {
    if (snapshot.state === 'ready' || snapshot.state === 'installing') {
      return
    }
    if (snapshot.state === 'awaiting_user_confirmation') {
      throw new Error(
        'Local runtime install is awaiting user confirmation. Confirm it in Settings > Speech-to-Text before starting local streaming.'
      )
    }
    if (snapshot.state === 'failed') {
      throw new Error(snapshot.detail ?? 'Local runtime install failed unexpectedly.')
    }
    throw new Error(
      snapshot.requiresUpdate
        ? 'Local runtime update required. Install the required WhisperLiveKit version in Settings > Speech-to-Text before starting local streaming.'
        : 'Local runtime is not installed. Install WhisperLiveKit in Settings > Speech-to-Text before starting local streaming.'
    )
  }

  private requireMatchingSession(sessionId: string): ActiveSessionRecord {
    const record = this.findSessionForControl(sessionId)
    if (!record) {
      throw new Error('No local streaming session is active.')
    }
    return record
  }

  private findSessionForControl(sessionId: string): ActiveSessionRecord | null {
    if (!this.activeSession) {
      return null
    }
    if (this.activeSession.state.sessionId === sessionId) {
      return this.activeSession
    }
    if (this.activeSession.state.status === 'ended') {
      return null
    }
    throw new Error(`Local streaming session ${sessionId} is not active.`)
  }

  private isCurrentSession(record: ActiveSessionRecord): boolean {
    return this.activeSession === record
  }

  private isCurrentLiveSession(record: ActiveSessionRecord): boolean {
    return this.isCurrentSession(record) && record.state.status !== 'ended'
  }

  private logSessionEvent(
    level: 'error' | 'warn' | 'info',
    event: string,
    record: ActiveSessionRecord,
    context?: Record<string, unknown>
  ): void {
    const snapshot = this.installManager.getStatusSnapshot()
    logStructured({
      level,
      scope: 'main',
      event,
      context: {
        sessionId: record.state.sessionId,
        model: record.state.modelId,
        outputMode: record.state.outputMode,
        phase: record.state.phase,
        runtimeVersion: snapshot.installedVersion ?? snapshot.manifest.version,
        runtimeState: snapshot.state,
        ...context
      }
    })
  }
}
