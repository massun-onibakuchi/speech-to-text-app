/**
 * Where: src/main/services/streaming/streaming-segment-router.ts
 * What:  Session-scoped router for raw versus transformed finalized-segment commits.
 * Why:   Keep PR-10 transform concurrency, context injection, ordered output, and
 *        raw fallback policy out of the lifecycle controller.
 */

import type { OrderedOutputCoordinator } from '../../coordination/ordered-output-coordinator'
import type { ClipboardStatePolicy } from '../../coordination/clipboard-state-policy'
import type { OutputApplyResult } from '../output-service'
import type { SecretStore } from '../secret-store'
import type { TransformationService } from '../transformation-service'
import type { TransformationContextSegment } from '../transformation/types'
import { checkLlmPreflight } from '../../orchestrators/preflight-guard'
import { ContextManager } from './context-manager'
import { SegmentTransformWorkerPool } from './segment-transform-worker-pool'
import { logStructured } from '../../../shared/error-logging'
import {
  createStreamingErrorEvent,
  createStreamingSegmentEvent,
  type CanonicalFinalSegment,
  type StreamingCommittedSegment,
  type StreamingSessionStartConfig,
  type StreamingTransformTask
} from './types'

const DEFAULT_CONTEXT_BUDGET = {
  maxTotalUtf8Bytes: 800,
  maxRollingSummaryUtf8Bytes: 200,
  maxWindowSegments: 2
} as const

const DEFAULT_SUMMARY_REFRESH_POLICY = {
  minSegmentsBeforeFirstSummary: 3,
  maxSegmentsSinceRefresh: 4,
  maxMillisecondsSinceRefresh: 60_000
} as const

export interface StreamingSegmentRouterDependencies {
  outputCoordinator: OrderedOutputCoordinator
  outputService: {
    applyStreamingSegmentWithDetail: (
      segment: StreamingCommittedSegment,
      clipboardPolicy: ClipboardStatePolicy
    ) => Promise<OutputApplyResult>
  }
  clipboardPolicy: ClipboardStatePolicy
  transformationService: Pick<TransformationService, 'transform'>
  secretStore: Pick<SecretStore, 'getApiKey'>
  publishError: (event: import('../../../shared/ipc').StreamingErrorEvent) => void
  publishSegment: (event: import('../../../shared/ipc').StreamingSegmentEvent) => void
}

export class StreamingSegmentRouter {
  private readonly contextManager: ContextManager | null
  private readonly transformWorkerPool: SegmentTransformWorkerPool | null
  private readonly finalizedContextSegments: TransformationContextSegment[] = []
  private closed = false

  constructor(
    private readonly sessionId: string,
    private readonly config: StreamingSessionStartConfig,
    private readonly dependencies: StreamingSegmentRouterDependencies
  ) {
    if (config.outputMode === 'stream_transformed') {
      if (!config.transformationProfile) {
        throw new Error('stream_transformed requires a resolved transformation profile.')
      }

      this.contextManager = new ContextManager({
        sessionId,
        language: config.language ?? 'auto',
        budget: DEFAULT_CONTEXT_BUDGET,
        summaryRefreshPolicy: DEFAULT_SUMMARY_REFRESH_POLICY
      })
      this.transformWorkerPool = new SegmentTransformWorkerPool({
        maxInFlight: config.maxInFlightTransforms,
        worker: async (task) => {
          const preflight = checkLlmPreflight(
            this.dependencies.secretStore,
            task.profile.provider,
            task.profile.model
          )
          if (!preflight.ok) {
            throw new Error(preflight.reason)
          }

          const result = await this.dependencies.transformationService.transform({
            text: task.segment.sourceText,
            apiKey: preflight.apiKey,
            model: task.profile.model,
            baseUrlOverride: task.profile.baseUrlOverride ?? null,
            prompt: {
              systemPrompt: task.profile.systemPrompt,
              userPrompt: task.profile.userPrompt
            },
            contextPayload: task.contextPayload
          })

          return {
            segment: task.segment,
            committedText: result.text.trim()
          }
        }
      })
      return
    }

    this.contextManager = null
    this.transformWorkerPool = null
  }

  async commitFinalizedSegment(segment: CanonicalFinalSegment): Promise<OutputApplyResult> {
    if (this.closed) {
      return { status: 'output_failed_partial', message: null }
    }

    if (this.config.outputMode === 'stream_raw_dictation') {
      return this.commitOrdered({
        ...segment,
        committedText: segment.sourceText,
        outputMode: 'stream_raw_dictation',
        usedFallback: false
      })
    }

    return this.commitTransformedSegment(segment)
  }

  dispose(): void {
    this.closed = true
    this.transformWorkerPool?.close()
  }

  private async commitTransformedSegment(segment: CanonicalFinalSegment): Promise<OutputApplyResult> {
    const contextManager = this.contextManager
    const transformWorkerPool = this.transformWorkerPool
    const profile = this.config.transformationProfile

    if (!contextManager || !transformWorkerPool || !profile) {
      throw new Error('Transformed streaming segment router is not initialized.')
    }

    const contextSegment = this.toContextSegment(segment)
    contextManager.appendFinalizedSegment(contextSegment)
    this.finalizedContextSegments.push(contextSegment)
    this.refreshRollingSummaryIfNeeded()
    const task: StreamingTransformTask = {
      segment,
      profile,
      contextPayload: contextManager.buildPayloadForSequence(segment.sequence)
    }

    try {
      const result = await transformWorkerPool.submit(task)
      if (this.closed) {
        return { status: 'output_failed_partial', message: null }
      }
      if (result.committedText.length === 0) {
        this.publishTransformFallbackError(
          segment,
          'Transformation returned empty text. Falling back to raw dictation for this segment.'
        )
        return this.commitOrdered({
          ...segment,
          committedText: segment.sourceText,
          outputMode: 'stream_transformed',
          usedFallback: true
        })
      }

      return this.commitOrdered({
        ...segment,
        committedText: result.committedText,
        outputMode: 'stream_transformed',
        usedFallback: false
      })
    } catch (error) {
      if (this.closed) {
        return { status: 'output_failed_partial', message: null }
      }
      const detail = error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : 'Unknown transformation error.'
      this.publishTransformFallbackError(
        segment,
        `Transformation failed for streamed segment ${segment.sequence}. Falling back to raw dictation. ${detail}`
      )
      return this.commitOrdered({
        ...segment,
        committedText: segment.sourceText,
        outputMode: 'stream_transformed',
        usedFallback: true
      })
    }
  }

  private async commitOrdered(segment: StreamingCommittedSegment): Promise<OutputApplyResult> {
    if (this.closed) {
      return { status: 'output_failed_partial', message: null }
    }

    logStructured({
      level: 'info',
      scope: 'main',
      event: 'streaming.segment_router.commit_begin',
      message: 'Starting ordered streaming segment commit.',
      context: {
        sessionId: segment.sessionId,
        sequence: segment.sequence,
        outputMode: segment.outputMode,
        textLength: segment.committedText.length
      }
    })
    let outputResult: OutputApplyResult = {
      status: 'succeeded',
      message: null
    }

    const orderedStatus = await this.dependencies.outputCoordinator.submit(
      segment.sequence,
      async () => {
        if (this.closed) {
          return 'output_failed_partial'
        }
        logStructured({
          level: 'info',
          scope: 'main',
          event: 'streaming.segment_router.output_begin',
          message: 'Applying streaming segment output.',
          context: {
            sessionId: segment.sessionId,
            sequence: segment.sequence,
            outputMode: segment.outputMode
          }
        })
        outputResult = await this.dependencies.outputService.applyStreamingSegmentWithDetail(
          segment,
          this.dependencies.clipboardPolicy
        )
        logStructured({
          level: 'info',
          scope: 'main',
          event: 'streaming.segment_router.output_complete',
          message: 'Completed streaming segment output application.',
          context: {
            sessionId: segment.sessionId,
            sequence: segment.sequence,
            status: outputResult.status
          }
        })
        return outputResult.status
      },
      this.sessionId
    )

    if (outputResult.status === 'succeeded' && orderedStatus !== 'succeeded') {
      outputResult = {
        status: orderedStatus,
        message: null
      }
    }

    if (outputResult.status !== 'succeeded' && outputResult.message !== null) {
      this.dependencies.publishError(createStreamingErrorEvent({
        sessionId: segment.sessionId,
        failure: {
          code: 'streaming_output_failed_partial',
          message: outputResult.message
        }
      }))
    }

    if (!this.closed) {
      this.dependencies.publishSegment(createStreamingSegmentEvent(segment))
      logStructured({
        level: 'info',
        scope: 'main',
        event: 'streaming.segment_router.segment_published',
        message: 'Published committed streaming segment to renderer activity.',
        context: {
          sessionId: segment.sessionId,
          sequence: segment.sequence,
          textLength: segment.committedText.length
        }
      })
    }

    return outputResult
  }

  private publishTransformFallbackError(segment: CanonicalFinalSegment, message: string): void {
    this.dependencies.publishError(createStreamingErrorEvent({
      sessionId: segment.sessionId,
      failure: {
        code: 'streaming_transform_fallback',
        message
      }
    }))
  }

  private toContextSegment(segment: CanonicalFinalSegment): TransformationContextSegment {
    return {
      sequence: segment.sequence,
      text: segment.sourceText,
      startedAt: segment.startedAt,
      endedAt: segment.endedAt
    }
  }

  private refreshRollingSummaryIfNeeded(): void {
    const contextManager = this.contextManager
    if (!contextManager) {
      return
    }

    const nowIso = new Date().toISOString()
    if (!contextManager.shouldRefreshSummary(nowIso)) {
      return
    }

    const summarySourceSegments = this.finalizedContextSegments.slice(
      0,
      Math.max(0, this.finalizedContextSegments.length - 1 - DEFAULT_CONTEXT_BUDGET.maxWindowSegments)
    )

    contextManager.replaceRollingSummary({
      text: summarySourceSegments.map((segment) => segment.text).join('\n'),
      refreshedAt: nowIso,
      sourceThroughSequence: summarySourceSegments.at(-1)?.sequence ?? null
    })
  }
}
