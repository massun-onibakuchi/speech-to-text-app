/**
 * Where: src/main/services/streaming/streaming-segment-router.test.ts
 * What:  Unit tests for raw/transformed streaming segment routing behavior.
 * Why:   PR-10 must lock ordered transformed commit and raw fallback semantics
 *        independently from the session lifecycle controller.
 */

import { describe, expect, it, vi } from 'vitest'
import * as errorLogging from '../../../shared/error-logging'
import { SerialOutputCoordinator } from '../../coordination/ordered-output-coordinator'
import { StreamingSegmentRouter } from './streaming-segment-router'

const TRANSFORMED_CONFIG = {
  provider: 'local_whispercpp_coreml' as const,
  transport: 'native_stream' as const,
  model: 'ggml-large-v3-turbo-q5_0',
  outputMode: 'stream_transformed' as const,
  maxInFlightTransforms: 2,
  apiKeyRef: null,
  baseUrlOverride: null,
  language: 'en' as const,
  delimiterPolicy: {
    mode: 'space' as const,
    value: null
  },
  transformationProfile: {
    profileId: 'default',
    provider: 'google' as const,
    model: 'gemini-2.5-flash' as const,
    baseUrlOverride: null,
    systemPrompt: 'system',
    userPrompt: '<input_text>{{text}}</input_text>'
  }
}

const createSegment = (sequence: number, sourceText: string) => ({
  sessionId: 'session-1',
  sequence,
  sourceText,
  delimiter: ' ',
  startedAt: `2026-03-07T00:00:0${sequence}.000Z`,
  endedAt: `2026-03-07T00:00:0${sequence + 1}.000Z`
})

describe('StreamingSegmentRouter', () => {
  it('preserves source order when segment transforms finish out of order', async () => {
    const logSpy = vi.spyOn(errorLogging, 'logStructured')
    let releaseFirst: (() => void) | null = null
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: segment.committedText
    }))
    const publishSegment = vi.fn()
    const router = new StreamingSegmentRouter('session-1', TRANSFORMED_CONFIG, {
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: { applyStreamingSegmentWithDetail },
      clipboardPolicy: {
        canRead: () => false,
        canWrite: () => true,
        willWrite: () => {},
        didWrite: () => {}
      },
      transformationService: {
        transform: async (input) => {
          if (input.text === 'alpha') {
            await new Promise<void>((resolve) => {
              releaseFirst = resolve
            })
          }
          return {
            text: input.text.toUpperCase(),
            model: 'gemini-2.5-flash'
          }
        }
      },
      secretStore: {
        getApiKey: () => 'google-key'
      },
      publishError: vi.fn(),
      publishSegment
    })

    const firstCommit = router.commitFinalizedSegment(createSegment(0, 'alpha'))
    const secondCommit = router.commitFinalizedSegment(createSegment(1, 'beta'))

    await Promise.resolve()
    expect(applyStreamingSegmentWithDetail).not.toHaveBeenCalled()

    const release = releaseFirst as (() => void) | null
    if (release) {
      release()
    }

    await expect(firstCommit).resolves.toEqual({ status: 'succeeded', message: 'ALPHA' })
    await expect(secondCommit).resolves.toEqual({ status: 'succeeded', message: 'BETA' })
    expect(applyStreamingSegmentWithDetail.mock.calls.map(([segment]) => [segment.sequence, segment.committedText])).toEqual([
      [0, 'ALPHA'],
      [1, 'BETA']
    ])
    expect(publishSegment.mock.calls.map(([event]) => [event.sequence, event.text])).toEqual([
      [0, 'ALPHA'],
      [1, 'BETA']
    ])
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: 'streaming.segment_router.output_complete',
      context: expect.objectContaining({
        sessionId: 'session-1',
        sequence: 1,
        status: 'succeeded'
      })
    }))
  })

  it('falls back to raw text for one segment and continues the session', async () => {
    const applyStreamingSegmentWithDetail = vi.fn(async (segment: any) => ({
      status: 'succeeded' as const,
      message: segment.committedText
    }))
    const publishError = vi.fn()
    const router = new StreamingSegmentRouter('session-1', TRANSFORMED_CONFIG, {
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: { applyStreamingSegmentWithDetail },
      clipboardPolicy: {
        canRead: () => false,
        canWrite: () => true,
        willWrite: () => {},
        didWrite: () => {}
      },
      transformationService: {
        transform: async (input) => {
          if (input.text === 'alpha') {
            throw new Error('provider offline')
          }
          return {
            text: `${input.text.toUpperCase()}!`,
            model: 'gemini-2.5-flash'
          }
        }
      },
      secretStore: {
        getApiKey: () => 'google-key'
      },
      publishError,
      publishSegment: vi.fn()
    })

    await expect(router.commitFinalizedSegment(createSegment(0, 'alpha'))).resolves.toEqual({
      status: 'succeeded',
      message: 'alpha'
    })
    await expect(router.commitFinalizedSegment(createSegment(1, 'beta'))).resolves.toEqual({
      status: 'succeeded',
      message: 'BETA!'
    })

    expect(applyStreamingSegmentWithDetail.mock.calls.map(([segment]) => [segment.sequence, segment.committedText, segment.usedFallback])).toEqual([
      [0, 'alpha', true],
      [1, 'BETA!', false]
    ])
    expect(publishError).toHaveBeenCalledWith({
      sessionId: 'session-1',
      code: 'streaming_transform_fallback',
      message: 'Transformation failed for streamed segment 0. Falling back to raw dictation. provider offline'
    })
  })

  it('does not emit fallback errors for queued transform work after normal disposal', async () => {
    let releaseFirst: (() => void) | null = null
    const publishError = vi.fn()
    const router = new StreamingSegmentRouter('session-1', {
      ...TRANSFORMED_CONFIG,
      maxInFlightTransforms: 1
    }, {
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyStreamingSegmentWithDetail: vi.fn(async (segment: any) => ({
          status: 'succeeded' as const,
          message: segment.committedText
        }))
      },
      clipboardPolicy: {
        canRead: () => false,
        canWrite: () => true,
        willWrite: () => {},
        didWrite: () => {}
      },
      transformationService: {
        transform: async (input) => {
          if (input.text === 'alpha') {
            await new Promise<void>((resolve) => {
              releaseFirst = resolve
            })
          }
          return {
            text: input.text.toUpperCase(),
            model: 'gemini-2.5-flash'
          }
        }
      },
      secretStore: {
        getApiKey: () => 'google-key'
      },
      publishError,
      publishSegment: vi.fn()
    })

    const firstCommit = router.commitFinalizedSegment(createSegment(0, 'alpha'))
    const secondCommit = router.commitFinalizedSegment(createSegment(1, 'beta'))

    router.dispose()
    ;(releaseFirst as (() => void) | null)?.()

    await expect(firstCommit).resolves.toEqual({
      status: 'output_failed_partial',
      message: null
    })
    await expect(secondCommit).resolves.toEqual({
      status: 'output_failed_partial',
      message: null
    })
    expect(publishError).not.toHaveBeenCalled()
  })

  it('publishes committed raw text before reporting partial output failure', async () => {
    const publishSegment = vi.fn()
    const publishError = vi.fn()
    const router = new StreamingSegmentRouter('session-1', {
      ...TRANSFORMED_CONFIG,
      outputMode: 'stream_raw_dictation',
      transformationProfile: null
    }, {
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyStreamingSegmentWithDetail: vi.fn(async () => ({
          status: 'output_failed_partial' as const,
          message: 'Paste-at-cursor is only supported on macOS.'
        }))
      },
      clipboardPolicy: {
        canRead: () => false,
        canWrite: () => true,
        willWrite: () => {},
        didWrite: () => {}
      },
      transformationService: {
        transform: async () => ({
          text: 'unused',
          model: 'gemini-2.5-flash'
        })
      },
      secretStore: {
        getApiKey: () => 'google-key'
      },
      publishError,
      publishSegment
    })

    await expect(router.commitFinalizedSegment(createSegment(0, 'alpha'))).resolves.toEqual({
      status: 'output_failed_partial',
      message: 'Paste-at-cursor is only supported on macOS.'
    })

    expect(publishSegment).toHaveBeenCalledWith(expect.objectContaining({
      sequence: 0,
      text: 'alpha'
    }))
    expect(publishError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'streaming_output_failed_partial',
      message: 'Paste-at-cursor is only supported on macOS.'
    }))
  })

  it('refreshes rolling summary context so older segments are not dropped forever', async () => {
    const contextPayloads: string[] = []
    const router = new StreamingSegmentRouter('session-1', TRANSFORMED_CONFIG, {
      outputCoordinator: new SerialOutputCoordinator(),
      outputService: {
        applyStreamingSegmentWithDetail: vi.fn(async (segment: any) => ({
          status: 'succeeded' as const,
          message: segment.committedText
        }))
      },
      clipboardPolicy: {
        canRead: () => false,
        canWrite: () => true,
        willWrite: () => {},
        didWrite: () => {}
      },
      transformationService: {
        transform: async (input) => {
          contextPayloads.push(input.contextPayload?.rollingSummary.text ?? '')
          return {
            text: input.text.toUpperCase(),
            model: 'gemini-2.5-flash'
          }
        }
      },
      secretStore: {
        getApiKey: () => 'google-key'
      },
      publishError: vi.fn(),
      publishSegment: vi.fn()
    })

    await router.commitFinalizedSegment(createSegment(0, 'alpha'))
    await router.commitFinalizedSegment(createSegment(1, 'beta'))
    await router.commitFinalizedSegment(createSegment(2, 'gamma'))
    await router.commitFinalizedSegment(createSegment(3, 'delta'))

    expect(contextPayloads).toEqual(['', '', '', 'alpha'])
  })
})
