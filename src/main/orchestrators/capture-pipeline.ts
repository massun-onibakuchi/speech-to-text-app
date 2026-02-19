// Where: src/main/orchestrators/capture-pipeline.ts
// What:  Factory that creates a CaptureProcessor for the CaptureQueue.
// Why:   Phase 2A pipeline with Phase 2B preflight guards and error classification.
//        Stages: Preflight → Transcription → optional Transformation → Ordered Output Commit → History.
//        On transformation failure, the original transcript is preserved (spec 6.2).
//        Pre-network vs post-network failures are typed via FailureCategory (spec 5.2).

import type { FailureCategory, TerminalJobStatus } from '../../shared/domain'
import type { CaptureRequestSnapshot } from '../routing/capture-request-snapshot'
import type { CaptureProcessor } from '../queues/capture-queue'
import type { OrderedOutputCoordinator } from '../coordination/ordered-output-coordinator'
import type { SecretStore } from '../services/secret-store'
import type { TranscriptionService } from '../services/transcription-service'
import type { TransformationService } from '../services/transformation-service'
import type { OutputService } from '../services/output-service'
import type { HistoryService } from '../services/history-service'
import type { NetworkCompatibilityService } from '../services/network-compatibility-service'
import type { SoundService } from '../services/sound-service'
import { checkSttPreflight, checkLlmPreflight, classifyAdapterError, NETWORK_SIGNATURE_PATTERN } from './preflight-guard'

export interface CapturePipelineDeps {
  secretStore: Pick<SecretStore, 'getApiKey'>
  transcriptionService: Pick<TranscriptionService, 'transcribe'>
  transformationService: Pick<TransformationService, 'transform'>
  outputService: Pick<OutputService, 'applyOutput'>
  historyService: Pick<HistoryService, 'appendRecord'>
  networkCompatibilityService: Pick<NetworkCompatibilityService, 'diagnoseGroqConnectivity'>
  outputCoordinator: OrderedOutputCoordinator
  soundService?: Pick<SoundService, 'play'>
}

/**
 * Creates a CaptureProcessor that runs the full capture pipeline:
 * 1. Transcribe audio via STT adapter (with preflight API key check)
 * 2. Optionally transform transcript via LLM adapter (with preflight API key check)
 * 3. Commit output in source order via OrderedOutputCoordinator
 * 4. Append result to history (including failureCategory for error distinction)
 */
export function createCaptureProcessor(deps: CapturePipelineDeps): CaptureProcessor {
  return async (snapshot: Readonly<CaptureRequestSnapshot>): Promise<TerminalJobStatus> => {
    // Acquire sequence number before processing so output order matches enqueue order.
    const seq = deps.outputCoordinator.nextSequence()

    let transcriptText: string | null = null
    let transformedText: string | null = null
    let failureDetail: string | null = null
    let failureCategory: FailureCategory | null = null
    let terminalStatus: TerminalJobStatus = 'succeeded'
    let attemptedTransformation = false

    // --- Stage 1: Transcription (preflight guard + network call) ---
    const sttPreflight = checkSttPreflight(deps.secretStore, snapshot.sttProvider, snapshot.sttModel)
    if (!sttPreflight.ok) {
      terminalStatus = 'transcription_failed'
      failureDetail = sttPreflight.reason
      failureCategory = 'preflight'
    } else {
      try {
        const result = await deps.transcriptionService.transcribe({
          provider: snapshot.sttProvider,
          model: snapshot.sttModel,
          apiKey: sttPreflight.apiKey,
          baseUrlOverride: snapshot.sttBaseUrlOverride,
          audioFilePath: snapshot.audioFilePath,
          language: snapshot.outputLanguage,
          temperature: snapshot.temperature
        })
        transcriptText = result.text
      } catch (error) {
        terminalStatus = 'transcription_failed'
        failureCategory = classifyAdapterError(error)
        failureDetail = await resolveTranscriptionFailureDetail(
          deps.networkCompatibilityService,
          snapshot.sttProvider,
          error
        )
      }
    }

    // --- Stage 2: Transformation (optional, only when profile is bound) ---
    // On failure, original transcript is preserved for output (spec 6.2).
    const profile = snapshot.transformationProfile
    if (terminalStatus === 'succeeded' && profile !== null && transcriptText !== null) {
      attemptedTransformation = true
      const llmPreflight = checkLlmPreflight(deps.secretStore, profile.provider, profile.model)
      if (!llmPreflight.ok) {
        terminalStatus = 'transformation_failed'
        failureDetail = llmPreflight.reason
        failureCategory = 'preflight'
      } else {
        try {
          const result = await deps.transformationService.transform({
            text: transcriptText,
            apiKey: llmPreflight.apiKey,
            model: profile.model,
            baseUrlOverride: profile.baseUrlOverride,
            prompt: {
              systemPrompt: profile.systemPrompt,
              userPrompt: profile.userPrompt
            }
          })
          transformedText = result.text
        } catch (error) {
          terminalStatus = 'transformation_failed'
          failureCategory = classifyAdapterError(error)
          failureDetail = error instanceof Error ? error.message : 'Unknown transformation error'
          // transcript stays available for output — no re-assignment of transcriptText
        }
      }
    }

    if (attemptedTransformation) {
      const transformationSoundEvent =
        terminalStatus === 'transformation_failed'
          ? 'transformation_failed'
          : terminalStatus === 'succeeded'
            ? 'transformation_succeeded'
            : null
      if (transformationSoundEvent !== null) {
        deps.soundService?.play(transformationSoundEvent)
      }
    }

    // --- Stage 3: Ordered Output Commit ---
    // When transformation fails but transcript exists, still output the transcript (spec 6.2).
    if (transcriptText !== null) {
      const preOutputStatus = terminalStatus
      const outputStatus = await deps.outputCoordinator.submit(seq, async () => {
        const transcriptStatus = await deps.outputService.applyOutput(
          transcriptText!,
          snapshot.output.transcript
        )
        // Only output transformed text when transformation succeeded
        const transformedStatus =
          transformedText === null
            ? ('succeeded' as TerminalJobStatus)
            : await deps.outputService.applyOutput(transformedText, snapshot.output.transformed)

        if (transcriptStatus === 'output_failed_partial' || transformedStatus === 'output_failed_partial') {
          return 'output_failed_partial'
        }
        return 'succeeded'
      })
      // Preserve the original failure status (e.g. transformation_failed) unless output also failed
      if (preOutputStatus !== 'succeeded') {
        terminalStatus = preOutputStatus
      } else {
        terminalStatus = outputStatus
      }
    } else {
      // Release sequence so subsequent jobs are not blocked.
      deps.outputCoordinator.release(seq)
    }

    // --- Stage 4: History ---
    deps.historyService.appendRecord({
      jobId: snapshot.snapshotId,
      capturedAt: snapshot.capturedAt,
      transcriptText,
      transformedText,
      terminalStatus,
      failureDetail,
      failureCategory,
      createdAt: new Date().toISOString()
    })

    return terminalStatus
  }
}

/**
 * Enriches transcription failure messages with Groq network diagnostics
 * when the error looks like a network issue and the provider is Groq.
 */
async function resolveTranscriptionFailureDetail(
  networkService: Pick<NetworkCompatibilityService, 'diagnoseGroqConnectivity'>,
  provider: string,
  error: unknown
): Promise<string> {
  const baseMessage = error instanceof Error ? error.message : 'Unknown transcription error'
  if (provider !== 'groq') {
    return baseMessage
  }

  if (!NETWORK_SIGNATURE_PATTERN.test(baseMessage)) {
    return baseMessage
  }

  try {
    const diagnostic = await networkService.diagnoseGroqConnectivity()
    if (!diagnostic.reachable && diagnostic.guidance) {
      return `${baseMessage} ${diagnostic.message} ${diagnostic.guidance}`.trim()
    }
  } catch {
    // Keep original failure detail when diagnostics fail.
  }

  return baseMessage
}
