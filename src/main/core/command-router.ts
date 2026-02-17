/**
 * Where: src/main/core/command-router.ts
 * What:  IPC-facing command router that validates processing mode and delegates
 *        to existing orchestrators.
 * Why:   Spec §3.4 / §12.4 requires a mode-aware orchestration entrypoint.
 *        This bridges between IPC handlers (which call runCommand, submitRecordedAudio,
 *        runCompositeFromClipboard) and the Phase 0 routing/ModeRouter (which validates
 *        processing mode). v1 only supports 'default' mode; streaming fails fast.
 *
 *        Phase 2 will replace direct orchestrator delegation with queue-based dispatch
 *        using CaptureQueue, TransformQueue, and SerialOutputCoordinator.
 */

import type { AudioInputSource, CompositeTransformResult, RecordingCommand, RecordingCommandDispatch } from '../../shared/ipc'
import type { CaptureResult } from '../services/capture-types'
import type { RecordingOrchestrator } from '../orchestrators/recording-orchestrator'
import type { TransformationOrchestrator } from '../orchestrators/transformation-orchestrator'
import { ModeRouter } from '../routing/mode-router'
import { LegacyProcessingModeSource } from '../routing/processing-mode-source'
import { createCaptureRequestSnapshot } from '../routing/capture-request-snapshot'
import type { SettingsService } from '../services/settings-service'

interface CommandRouterDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
  recordingOrchestrator: Pick<RecordingOrchestrator, 'runCommand' | 'submitRecordedAudio' | 'getAudioInputSources'>
  transformationOrchestrator: Pick<TransformationOrchestrator, 'runCompositeFromClipboard'>
}

export class CommandRouter {
  private readonly modeRouter: ModeRouter
  private readonly settingsService: Pick<SettingsService, 'getSettings'>
  private readonly recordingOrchestrator: Pick<RecordingOrchestrator, 'runCommand' | 'submitRecordedAudio' | 'getAudioInputSources'>
  private readonly transformationOrchestrator: Pick<TransformationOrchestrator, 'runCompositeFromClipboard'>

  constructor(dependencies: CommandRouterDependencies) {
    this.settingsService = dependencies.settingsService
    this.recordingOrchestrator = dependencies.recordingOrchestrator
    this.transformationOrchestrator = dependencies.transformationOrchestrator
    // Use Phase 0's ModeRouter with legacy mode source for mode validation.
    this.modeRouter = new ModeRouter({ modeSource: new LegacyProcessingModeSource() })
  }

  /** Dispatch a recording command. Validates mode via ModeRouter, then delegates. */
  runRecordingCommand(command: RecordingCommand): RecordingCommandDispatch {
    // Validate mode by routing a minimal snapshot through ModeRouter.
    // This ensures fail-fast on unsupported modes (spec §12.4).
    this.assertCaptureMode()
    return this.recordingOrchestrator.runCommand(command)
  }

  /** Submit captured audio for processing. Validates mode, then delegates. */
  submitRecordedAudio(payload: { data: Uint8Array; mimeType: string; capturedAt: string }): CaptureResult {
    this.assertCaptureMode()
    return this.recordingOrchestrator.submitRecordedAudio(payload)
  }

  /** List available audio input sources. Mode-agnostic — no mode check needed. */
  getAudioInputSources(): AudioInputSource[] {
    return this.recordingOrchestrator.getAudioInputSources()
  }

  /** Run clipboard-based transformation. Validates mode, then delegates. */
  async runCompositeFromClipboard(): Promise<CompositeTransformResult> {
    // Transformation shortcuts are always allowed regardless of capture mode.
    return this.transformationOrchestrator.runCompositeFromClipboard()
  }

  /**
   * Validate that capture operations are allowed in current mode.
   * Uses Phase 0's ModeRouter.routeCapture with a minimal snapshot probe.
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
      outputLanguage: settings.transcription.outputLanguage,
      temperature: settings.transcription.temperature,
      transformationProfile: null,
      output: settings.output
    })
    // If mode is unsupported, routeCapture throws — that's the fail-fast behavior.
    this.modeRouter.routeCapture(snapshot)
  }
}
