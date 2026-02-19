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
import type { AudioInputSource, CompositeTransformResult, RecordingCommand, RecordingCommandDispatch } from '../../shared/ipc'
import type { Settings, TransformationPreset } from '../../shared/domain'
import type { CaptureResult } from '../services/capture-types'
import type { RecordingOrchestrator } from '../orchestrators/recording-orchestrator'
import type { CaptureQueue } from '../queues/capture-queue'
import type { TransformQueue } from '../queues/transform-queue'
import type { ClipboardClient } from '../infrastructure/clipboard-client'
import { ModeRouter } from '../routing/mode-router'
import { LegacyProcessingModeSource } from '../routing/processing-mode-source'
import { createCaptureRequestSnapshot, type TransformationProfileSnapshot } from '../routing/capture-request-snapshot'
import { createTransformationRequestSnapshot } from '../routing/transformation-request-snapshot'
import type { SettingsService } from '../services/settings-service'

export interface CommandRouterDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
  /** Handles recording commands and audio file persistence (no longer enqueues). */
  recordingOrchestrator: Pick<RecordingOrchestrator, 'runCommand' | 'submitRecordedAudio' | 'getAudioInputSources'>
  captureQueue: Pick<CaptureQueue, 'enqueue'>
  transformQueue: Pick<TransformQueue, 'enqueue'>
  clipboardClient: Pick<ClipboardClient, 'readText'>
}

export class CommandRouter {
  private readonly modeRouter: ModeRouter
  private readonly settingsService: Pick<SettingsService, 'getSettings'>
  private readonly recordingOrchestrator: Pick<RecordingOrchestrator, 'runCommand' | 'submitRecordedAudio' | 'getAudioInputSources'>
  private readonly captureQueue: Pick<CaptureQueue, 'enqueue'>
  private readonly transformQueue: Pick<TransformQueue, 'enqueue'>
  private readonly clipboardClient: Pick<ClipboardClient, 'readText'>

  constructor(dependencies: CommandRouterDependencies) {
    this.settingsService = dependencies.settingsService
    this.recordingOrchestrator = dependencies.recordingOrchestrator
    this.captureQueue = dependencies.captureQueue
    this.transformQueue = dependencies.transformQueue
    this.clipboardClient = dependencies.clipboardClient
    this.modeRouter = new ModeRouter({ modeSource: new LegacyProcessingModeSource() })
  }

  /** Dispatch a recording command. Validates mode via ModeRouter, then delegates. */
  runRecordingCommand(command: RecordingCommand): RecordingCommandDispatch {
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

  /**
   * Run active-profile clipboard transformation.
   * Used by existing IPC handler.
   * Kept async to preserve the existing Promise-based router surface.
   */
  async runCompositeFromClipboard(): Promise<CompositeTransformResult> {
    const settings = this.settingsService.getSettings()
    const preset = this.resolveActivePreset(settings)
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
   * Run active-profile transformation against selected text.
   * Used by runTransformationOnSelection hotkey semantics.
   * Kept async to preserve the existing Promise-based router surface.
   */
  async runCompositeFromSelection(selectionText: string): Promise<CompositeTransformResult> {
    const settings = this.settingsService.getSettings()
    const preset = this.resolveActivePreset(settings)
    return this.enqueueTransformation({
      settings,
      preset,
      textSource: 'selection',
      sourceText: selectionText,
      emptyTextMessage: 'No text selected. Highlight text in the target app and try again.'
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
    if (!settings.transformation.enabled) {
      return { status: 'error', message: 'Transformation is disabled in Settings.' }
    }

    if (!preset) {
      return { status: 'error', message: 'No transformation preset configured.' }
    }

    if (!normalizedText) {
      // Selection shortcuts are also guarded in HotkeyService so users get
      // immediate feedback before routing; keep this as defense-in-depth.
      return { status: 'error', message: emptyTextMessage }
    }

    const snapshot = createTransformationRequestSnapshot({
      snapshotId: randomUUID(),
      requestedAt: new Date().toISOString(),
      textSource,
      sourceText: normalizedText,
      profileId: preset.id,
      provider: preset.provider,
      model: preset.model,
      baseUrlOverride: settings.transformation.baseUrlOverride,
      systemPrompt: preset.systemPrompt,
      userPrompt: preset.userPrompt,
      outputRule: settings.output.transformed
    })

    this.transformQueue.enqueue(snapshot)
    return { status: 'ok', message: 'Transformation enqueued.' }
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

    return createCaptureRequestSnapshot({
      snapshotId: capture.jobId,
      capturedAt: capture.capturedAt,
      audioFilePath: capture.audioFilePath,
      sttProvider: settings.transcription.provider,
      sttModel: settings.transcription.model,
      sttBaseUrlOverride: settings.transcription.baseUrlOverride,
      outputLanguage: settings.transcription.outputLanguage,
      temperature: settings.transcription.temperature,
      transformationProfile: profile,
      output: settings.output
    })
  }

  /**
   * Resolve transformation profile for capture snapshot.
   * Returns null when transformation is disabled, meaning the pipeline skips LLM.
   */
  private resolveTransformationProfile(settings: Settings): TransformationProfileSnapshot | null {
    if (!settings.transformation.enabled) {
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
      baseUrlOverride: settings.transformation.baseUrlOverride,
      systemPrompt: preset.systemPrompt,
      userPrompt: preset.userPrompt
    }
  }

  /** Resolve the active preset for transformation shortcuts. */
  private resolveActivePreset(settings: Settings): TransformationPreset | null {
    return (
      settings.transformation.presets.find((p) => p.id === settings.transformation.activePresetId) ??
      settings.transformation.presets[0] ??
      null
    )
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

  /**
   * Validate that capture operations are allowed in current mode.
   * Uses ModeRouter.routeCapture with a minimal snapshot probe.
   * Throws if mode is unsupported (e.g. streaming in v1).
   */
  private assertCaptureMode(): void {
    const settings = this.settingsService.getSettings()
    const snapshot = createCaptureRequestSnapshot({
      snapshotId: '__mode_check__',
      capturedAt: new Date().toISOString(),
      audioFilePath: '',
      sttProvider: settings.transcription.provider,
      sttModel: settings.transcription.model,
      sttBaseUrlOverride: settings.transcription.baseUrlOverride,
      outputLanguage: settings.transcription.outputLanguage,
      temperature: settings.transcription.temperature,
      transformationProfile: null,
      output: settings.output
    })
    this.modeRouter.routeCapture(snapshot)
  }
}
