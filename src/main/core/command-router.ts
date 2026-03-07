/**
 * Where: src/main/core/command-router.ts
 * What:  IPC-facing command router that validates processing mode, builds
 *        immutable snapshots, and dispatches to queue-based pipelines.
 * Why:   Spec §3.4 / §12.4 requires a mode-aware orchestration entrypoint.
 *        Phase 2A wires CaptureQueue and TransformQueue into the production
 *        path. Snapshots are frozen at enqueue time so in-flight jobs are
 *        isolated from concurrent settings changes (spec §4.2).
 */

import { randomUUID } from 'node:crypto'
import {
  COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE,
  type AudioInputSource,
  type CompositeTransformResult,
  type RecordingCommand,
  type RecordingCommandDispatch
} from '../../shared/ipc'
import { type Settings, type TransformationPreset } from '../../shared/domain'
import { SELECTION_EMPTY_MESSAGE } from './transformation-error-messages'
import type { CaptureResult } from '../services/capture-types'
import type { RecordingOrchestrator } from '../orchestrators/recording-orchestrator'
import type { CaptureQueue } from '../queues/capture-queue'
import type { TransformQueue } from '../queues/transform-queue'
import type { ClipboardClient } from '../infrastructure/clipboard-client'
import { ModeRouter } from '../routing/mode-router'
import { SettingsBackedProcessingModeSource } from '../routing/processing-mode-source'
import { createCaptureRequestSnapshot, type TransformationProfileSnapshot } from '../routing/capture-request-snapshot'
import { createTransformationRequestSnapshot } from '../routing/transformation-request-snapshot'
import type { SettingsService } from '../services/settings-service'
import { deriveSttHintsFromDictionary } from '../services/transcription/dictionary-hint-deriver'
import { validateSafeUserPromptTemplate } from '../../shared/prompt-template-safety'
import type { StreamingSessionController } from '../services/streaming/streaming-session-controller'
import type { StreamingSessionStartConfig } from '../services/streaming/types'

export interface CommandRouterDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
  /** Handles recording commands and audio file persistence (no longer enqueues). */
  recordingOrchestrator: Pick<RecordingOrchestrator, 'runCommand' | 'submitRecordedAudio' | 'getAudioInputSources'>
  captureQueue: Pick<CaptureQueue, 'enqueue'>
  transformQueue: Pick<TransformQueue, 'enqueue'>
  clipboardClient: Pick<ClipboardClient, 'readText'>
  streamingSessionController: Pick<StreamingSessionController, 'start' | 'stop' | 'getState'>
}

export class CommandRouter {
  private readonly modeRouter: ModeRouter
  private readonly settingsService: Pick<SettingsService, 'getSettings'>
  private readonly recordingOrchestrator: Pick<RecordingOrchestrator, 'runCommand' | 'submitRecordedAudio' | 'getAudioInputSources'>
  private readonly captureQueue: Pick<CaptureQueue, 'enqueue'>
  private readonly transformQueue: Pick<TransformQueue, 'enqueue'>
  private readonly clipboardClient: Pick<ClipboardClient, 'readText'>
  private readonly streamingSessionController: Pick<StreamingSessionController, 'start' | 'stop' | 'getState'>

  constructor(dependencies: CommandRouterDependencies) {
    this.settingsService = dependencies.settingsService
    this.recordingOrchestrator = dependencies.recordingOrchestrator
    this.captureQueue = dependencies.captureQueue
    this.transformQueue = dependencies.transformQueue
    this.clipboardClient = dependencies.clipboardClient
    this.streamingSessionController = dependencies.streamingSessionController
    this.modeRouter = new ModeRouter({
      modeSource: new SettingsBackedProcessingModeSource(this.settingsService)
    })
  }

  /** Dispatch a recording command. Validates mode via ModeRouter, then delegates. */
  async runRecordingCommand(command: RecordingCommand): Promise<RecordingCommandDispatch | null> {
    const mode = this.modeRouter.resolveProcessingMode()
    if (mode === 'streaming') {
      return this.routeStreamingRecordingCommand(command)
    }

    this.assertCaptureMode()
    return this.recordingOrchestrator.runCommand(command)
  }

  /**
   * Submit captured audio for processing.
   * 1. Validates mode
   * 2. Persists audio file via RecordingOrchestrator
   * 3. Builds a CaptureRequestSnapshot from current settings
   * 4. Enqueues to CaptureQueue (fire-and-forget)
   */
  submitRecordedAudio(payload: { data: Uint8Array; mimeType: string; capturedAt: string }): CaptureResult {
    this.assertCaptureMode()
    const capture = this.recordingOrchestrator.submitRecordedAudio(payload)
    const snapshot = this.buildCaptureSnapshot(capture)
    this.captureQueue.enqueue(snapshot)
    return capture
  }

  /** List available audio input sources. Mode-agnostic — no mode check needed. */
  async getAudioInputSources(): Promise<AudioInputSource[]> {
    return this.recordingOrchestrator.getAudioInputSources()
  }

  async startStreamingSession(): Promise<void> {
    const settings = this.assertStreamingMode()
    await this.streamingSessionController.start(this.buildStreamingSessionConfig(settings))
  }

  async stopStreamingSession(): Promise<void> {
    this.assertStreamingMode()
    await this.streamingSessionController.stop('user_stop')
  }

  /**
   * Run clipboard transformation with a specific preset (one-time pick-and-run).
   * Does NOT change persisted settings — the picked preset is scoped to this request only.
   * Used by HotkeyService.runPickAndRunTransform (decision #85).
   */
  async runCompositeFromClipboardWithPreset(presetId: string): Promise<CompositeTransformResult> {
    const settings = this.settingsService.getSettings()
    const preset = settings.transformation.presets.find((p) => p.id === presetId) ?? null
    const clipboardText = this.readClipboardText()
    return this.enqueueTransformation({
      settings,
      preset,
      textSource: 'clipboard',
      sourceText: clipboardText,
      emptyTextMessage: 'Clipboard is empty.'
    })
  }

  /**
   * Run default-profile clipboard transformation.
   * Used by runDefaultTransformation hotkey semantics.
   * Kept async to preserve the existing Promise-based router surface.
   */
  async runDefaultCompositeFromClipboard(): Promise<CompositeTransformResult> {
    const settings = this.settingsService.getSettings()
    const preset = this.resolveDefaultPreset(settings)
    const clipboardText = this.readClipboardText()
    return this.enqueueTransformation({
      settings,
      preset,
      textSource: 'clipboard',
      sourceText: clipboardText,
      emptyTextMessage: 'Clipboard is empty.'
    })
  }

  /**
   * Run default-profile transformation against selected text.
   * Uses defaultPresetId: active profile concept is no longer user-facing (#127).
   * Kept async to preserve the existing Promise-based router surface.
   */
  async runCompositeFromSelection(selectionText: string): Promise<CompositeTransformResult> {
    const settings = this.settingsService.getSettings()
    const preset = this.resolveDefaultPreset(settings)
    return this.enqueueTransformation({
      settings,
      preset,
      textSource: 'selection',
      sourceText: selectionText,
      emptyTextMessage: SELECTION_EMPTY_MESSAGE
    })
  }

  private enqueueTransformation(options: {
    settings: Settings
    preset: TransformationPreset | null
    textSource: 'clipboard' | 'selection'
    sourceText: string
    emptyTextMessage: string
  }): CompositeTransformResult {
    const normalizedText = options.sourceText.trim()

    const { settings, preset, textSource, emptyTextMessage } = options
    if (!preset) {
      return { status: 'error', message: 'No transformation preset configured.' }
    }

    if (!normalizedText) {
      // Selection shortcuts are also guarded in HotkeyService so users get
      // immediate feedback before routing; keep this as defense-in-depth.
      return { status: 'error', message: emptyTextMessage }
    }
    const promptSafetyError = validateSafeUserPromptTemplate(preset.userPrompt)
    if (promptSafetyError) {
      return {
        status: 'error',
        message: `Transformation blocked: Unsafe user prompt template: ${promptSafetyError}`
      }
    }

    const snapshot = createTransformationRequestSnapshot({
      snapshotId: randomUUID(),
      requestedAt: new Date().toISOString(),
      textSource,
      sourceText: normalizedText,
      profileId: preset.id,
      provider: preset.provider,
      model: preset.model,
      baseUrlOverride: null,
      systemPrompt: preset.systemPrompt,
      userPrompt: preset.userPrompt,
      outputRule: settings.output.transformed
    })

    this.transformQueue.enqueue(snapshot)
    return { status: 'ok', message: COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a CaptureRequestSnapshot from the current settings and a CaptureResult.
   * The snapshot is frozen at this point — later settings changes won't affect it.
   */
  private buildCaptureSnapshot(capture: CaptureResult): Readonly<import('../routing/capture-request-snapshot').CaptureRequestSnapshot> {
    const settings = this.settingsService.getSettings()
    const profile = this.resolveTransformationProfile(settings)
    const sttHints = this.deriveCaptureSttHints(settings)

    return createCaptureRequestSnapshot({
      snapshotId: capture.jobId,
      capturedAt: capture.capturedAt,
      audioFilePath: capture.audioFilePath,
      sttProvider: settings.transcription.provider,
      sttModel: settings.transcription.model,
      sttBaseUrlOverride: null,
      outputLanguage: settings.transcription.outputLanguage,
      temperature: settings.transcription.temperature,
      sttHints,
      correctionDictionaryEntries: settings.correction.dictionary.entries,
      transformationProfile: profile,
      output: settings.output
    })
  }

  /**
   * Resolve transformation profile for capture snapshot.
   * Returns null when selected output source is transcript,
   * meaning the capture pipeline skips LLM transformation.
   */
  private resolveTransformationProfile(settings: Settings): TransformationProfileSnapshot | null {
    if (settings.output.selectedTextSource !== 'transformed') {
      return null
    }

    const preset =
      settings.transformation.presets.find((p) => p.id === settings.transformation.defaultPresetId) ??
      settings.transformation.presets[0]

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

  /** Resolve the default preset for run-default transformation shortcuts. */
  private resolveDefaultPreset(settings: Settings): TransformationPreset | null {
    return (
      settings.transformation.presets.find((p) => p.id === settings.transformation.defaultPresetId) ??
      settings.transformation.presets[0] ??
      null
    )
  }

  /** Read the full clipboard text content. Normalization is done in enqueueTransformation. */
  private readClipboardText(): string {
    return this.clipboardClient.readText()
  }

  private async routeStreamingRecordingCommand(command: RecordingCommand): Promise<RecordingCommandDispatch> {
    const settings = this.assertStreamingMode()
    if (command === 'toggleRecording') {
      const state = this.streamingSessionController.getState()
      if (state === 'idle' || state === 'ended' || state === 'failed') {
        await this.streamingSessionController.start(this.buildStreamingSessionConfig(settings))
        return { command }
      }

      await this.streamingSessionController.stop('user_stop')
      return { command }
    }

    await this.streamingSessionController.stop('user_cancel')
    return { command }
  }

  /**
   * Validate that capture operations are allowed in current mode.
   * Uses ModeRouter.routeCapture with a minimal snapshot probe.
   * Throws if mode is unsupported (e.g. streaming in v1).
   */
  private assertCaptureMode(): void {
    const settings = this.settingsService.getSettings()
    const sttHints = this.deriveCaptureSttHints(settings)
    const snapshot = createCaptureRequestSnapshot({
      snapshotId: '__mode_check__',
      capturedAt: new Date().toISOString(),
      audioFilePath: '',
      sttProvider: settings.transcription.provider,
      sttModel: settings.transcription.model,
      sttBaseUrlOverride: null,
      outputLanguage: settings.transcription.outputLanguage,
      temperature: settings.transcription.temperature,
      sttHints,
      correctionDictionaryEntries: settings.correction.dictionary.entries,
      transformationProfile: null,
      output: settings.output
    })
    this.modeRouter.routeCapture(snapshot)
  }

  private assertStreamingMode(): Settings {
    const settings = this.settingsService.getSettings()
    const mode = this.modeRouter.resolveProcessingMode()
    if (mode !== 'streaming') {
      throw new Error(`Streaming session commands require processing.mode=streaming. Received ${mode}.`)
    }
    return settings
  }

  private buildStreamingSessionConfig(settings: Settings): StreamingSessionStartConfig {
    const provider = settings.processing.streaming.provider
    const transport = settings.processing.streaming.transport
    const model = settings.processing.streaming.model
    const outputMode = settings.processing.streaming.outputMode

    if (provider === null || transport === null || model === null || outputMode === null) {
      throw new Error('Streaming session requires provider, transport, and model in settings.processing.streaming.')
    }

    return {
      provider,
      transport,
      model,
      outputMode,
      delimiterPolicy: settings.processing.streaming.delimiterPolicy
    }
  }

  private deriveCaptureSttHints(settings: Settings): Settings['transcription']['hints'] {
    return deriveSttHintsFromDictionary(settings.transcription.hints, settings.correction.dictionary.entries)
  }
}
