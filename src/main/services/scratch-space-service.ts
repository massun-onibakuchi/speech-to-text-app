/**
 * Where: src/main/services/scratch-space-service.ts
 * What:  Scratch-space speech/transformation pipeline for the floating draft window.
 * Why:   The popup needs transcript-only speech capture plus forced transform-and-paste
 *        execution without reusing the normal capture output/history side effects.
 */

import { rmSync } from 'node:fs'
import type { SettingsService } from './settings-service'
import type { RecordingOrchestrator } from '../orchestrators/recording-orchestrator'
import type { SecretStore } from './secret-store'
import type { TranscriptionService } from './transcription-service'
import type { TransformationService } from './transformation-service'
import type { OutputService } from './output-service'
import type { LlmProviderReadinessService } from './llm-provider-readiness-service'
import type { ScratchSpaceDraftService } from './scratch-space-draft-service'
import type { ScratchSpaceWindowService } from './scratch-space-window-service'
import type { FrontmostAppFocusClient } from '../infrastructure/frontmost-app-focus-client'
import type { ScratchSpaceExecutionResult, ScratchSpaceTranscriptionResult } from '../../shared/ipc'
import { applyDictionaryReplacement } from './transcription/dictionary-replacement'
import { deriveSttHintsFromDictionary } from './transcription/dictionary-hint-deriver'
import { checkSttPreflight } from '../orchestrators/preflight-guard'
import { executeTransformation } from '../orchestrators/transformation-execution'
import { formatTransformOutputFailureMessage } from '../orchestrators/output-failure-formatting'
import type { Settings, TransformationPreset } from '../../shared/domain'

const TARGET_APP_FOCUS_DELAY_MS = 120

interface ScratchSpaceServiceDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
  recordingOrchestrator: Pick<RecordingOrchestrator, 'submitRecordedAudio'>
  secretStore: Pick<SecretStore, 'getApiKey'>
  transcriptionService: Pick<TranscriptionService, 'transcribe'>
  transformationService: Pick<TransformationService, 'transform'>
  llmProviderReadinessService?: Pick<LlmProviderReadinessService, 'getSnapshot'>
  outputService: Pick<OutputService, 'applyOutputWithDetail'>
  draftService: Pick<ScratchSpaceDraftService, 'clearDraft' | 'getDraft' | 'saveDraft'>
  windowService: Pick<ScratchSpaceWindowService, 'clearTargetBundleId' | 'getTargetBundleId' | 'hide' | 'show'>
  focusClient: Pick<FrontmostAppFocusClient, 'activateBundleId'>
  waitFn: (ms: number) => Promise<void>
}

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export class ScratchSpaceService {
  private readonly settingsService: Pick<SettingsService, 'getSettings'>
  private readonly recordingOrchestrator: Pick<RecordingOrchestrator, 'submitRecordedAudio'>
  private readonly secretStore: Pick<SecretStore, 'getApiKey'>
  private readonly transcriptionService: Pick<TranscriptionService, 'transcribe'>
  private readonly transformationService: Pick<TransformationService, 'transform'>
  private readonly llmProviderReadinessService?: Pick<LlmProviderReadinessService, 'getSnapshot'>
  private readonly outputService: Pick<OutputService, 'applyOutputWithDetail'>
  private readonly draftService: Pick<ScratchSpaceDraftService, 'clearDraft' | 'getDraft' | 'saveDraft'>
  private readonly windowService: Pick<ScratchSpaceWindowService, 'clearTargetBundleId' | 'getTargetBundleId' | 'hide' | 'show'>
  private readonly focusClient: Pick<FrontmostAppFocusClient, 'activateBundleId'>
  private readonly waitFn: (ms: number) => Promise<void>

  constructor(dependencies: ScratchSpaceServiceDependencies) {
    this.settingsService = dependencies.settingsService
    this.recordingOrchestrator = dependencies.recordingOrchestrator
    this.secretStore = dependencies.secretStore
    this.transcriptionService = dependencies.transcriptionService
    this.transformationService = dependencies.transformationService
    this.llmProviderReadinessService = dependencies.llmProviderReadinessService
    this.outputService = dependencies.outputService
    this.draftService = dependencies.draftService
    this.windowService = dependencies.windowService
    this.focusClient = dependencies.focusClient
    this.waitFn = dependencies.waitFn
  }

  getDraft(): string {
    return this.draftService.getDraft()
  }

  saveDraft(draft: string): void {
    this.draftService.saveDraft(draft)
  }

  async transcribeAudio(payload: {
    data: Uint8Array
    mimeType: string
    capturedAt: string
  }): Promise<ScratchSpaceTranscriptionResult> {
    const settings = this.settingsService.getSettings()
    const persistedAudio = this.recordingOrchestrator.submitRecordedAudio(payload)
    const preflight = checkSttPreflight(
      this.secretStore,
      settings.transcription.provider,
      settings.transcription.model
    )

    try {
      if (!preflight.ok) {
        return {
          status: 'error',
          message: preflight.reason,
          text: null
        }
      }

      const sttHints = deriveSttHintsFromDictionary(
        { contextText: settings.transcription.hints.contextText },
        settings.correction.dictionary.entries
      )
      const result = await this.transcriptionService.transcribe({
        provider: settings.transcription.provider,
        model: settings.transcription.model,
        apiKey: preflight.apiKey,
        baseUrlOverride: null,
        audioFilePath: persistedAudio.audioFilePath,
        language: settings.transcription.outputLanguage,
        temperature: settings.transcription.temperature,
        sttHints
      })
      const correctedText = applyDictionaryReplacement(result.text, settings.correction.dictionary.entries)

      return {
        status: 'ok',
        message: 'Speech captured.',
        text: correctedText
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Speech transcription failed.',
        text: null
      }
    } finally {
      try {
        rmSync(persistedAudio.audioFilePath)
      } catch {
        // Temporary scratch-space audio should not block the user flow if cleanup fails.
      }
    }
  }

  async runTransformation(payload: { text: string; presetId: string }): Promise<ScratchSpaceExecutionResult> {
    const sourceText = payload.text.trim()
    if (sourceText.length === 0) {
      return {
        status: 'error',
        message: 'Type or dictate some text before running scratch space.',
        text: null
      }
    }

    const settings = this.settingsService.getSettings()
    const preset = this.resolvePreset(settings, payload.presetId)
    if (!preset) {
      return {
        status: 'error',
        message: 'No transformation preset is available for scratch space.',
        text: null
      }
    }

    const targetBundleId = this.windowService.getTargetBundleId()
    if (!targetBundleId) {
      return {
        status: 'error',
        message: 'Unable to restore the target app. Re-open scratch space from the app you want to paste into.',
        text: null
      }
    }

    const transformationResult = await executeTransformation({
      secretStore: this.secretStore,
      transformationService: this.transformationService,
      llmProviderReadinessService: this.llmProviderReadinessService,
      text: sourceText,
      provider: preset.provider,
      model: preset.model,
      baseUrlOverride: null,
      systemPrompt: preset.systemPrompt,
      userPrompt: preset.userPrompt,
      logEvent: 'scratch_space.transformation_failed',
      unknownFailureDetail: 'Unknown scratch-space transformation error',
      trimErrorMessage: true
    })

    if (!transformationResult.ok) {
      return {
        status: 'error',
        message:
          transformationResult.failureCategory === 'preflight'
            ? transformationResult.failureDetail.startsWith('Unsafe user prompt template:')
              ? `Transformation blocked: ${transformationResult.failureDetail}`
              : transformationResult.failureDetail
            : `Transformation failed: ${transformationResult.failureDetail}`,
        text: null
      }
    }

    this.windowService.hide()

    try {
      await this.focusClient.activateBundleId(targetBundleId)
      await this.waitFn(TARGET_APP_FOCUS_DELAY_MS)
      const outputResult = await this.outputService.applyOutputWithDetail(transformationResult.text, {
        copyToClipboard: true,
        pasteAtCursor: true
      })
      if (outputResult.status === 'output_failed_partial') {
        await this.windowService.show({ captureTarget: false })
        return {
          status: 'error',
          message: formatTransformOutputFailureMessage(outputResult.message),
          text: null
        }
      }
    } catch (error) {
      await this.windowService.show({ captureTarget: false })
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Scratch-space paste failed.',
        text: null
      }
    }

    this.draftService.clearDraft()
    this.windowService.clearTargetBundleId()

    return {
      status: 'ok',
      message: 'Scratch space pasted.',
      text: transformationResult.text
    }
  }

  static create(dependencies: Omit<ScratchSpaceServiceDependencies, 'waitFn'> & { waitFn?: (ms: number) => Promise<void> }): ScratchSpaceService {
    return new ScratchSpaceService({
      ...dependencies,
      waitFn: dependencies.waitFn ?? wait
    })
  }

  private resolvePreset(settings: Settings, presetId: string): TransformationPreset | null {
    return (
      settings.transformation.presets.find((preset) => preset.id === presetId) ??
      settings.transformation.presets.find((preset) => preset.id === settings.transformation.defaultPresetId) ??
      settings.transformation.presets[0] ??
      null
    )
  }
}
